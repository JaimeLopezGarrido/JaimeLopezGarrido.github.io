// ═══════════════════════════════════════════════════════════════════════════════
// DEMO PÚBLICA de la web app de HAY AUTOS: reemplaza todo el backend en el navegador.
// - window.HA_DEMO.supabase: cliente falso compatible con lo que usan panel.js y panel_oportunidades.js
//   (auth con sesión demo, from() con query builder en memoria, storage, rpc y functions.invoke).
// - fetch: los pedidos a la función `cliente` y a los webhooks de automatización se responden acá (simulados).
// - Datos ficticios (nombres, DNI, CUIL, teléfonos y patentes de ejemplo). Se guardan en sessionStorage:
//   se borran al cerrar la pestaña. Las fotos que sube un visitante NUNCA salen del navegador.
// Se carga después de config.js y ANTES de los scripts de la app.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const SRC = (document.currentScript && document.currentScript.src) || location.href;
  const ROOT = new URL('../', SRC).href;                 // raíz de la demo (…/demos/hayautos/)
  const AG = 'hay_autos';
  const KEY_DB = 'hayautos_demo_db_v1', KEY_BLOBS = 'hayautos_demo_blobs_v1';
  const PORTFOLIO = 'https://jaimelopezgarrido.github.io/';
  const USUARIO = { id: 'demo-user', email: 'demo@hayautos.example', nombre: 'Demo · Administrador' };

  // ── Utilidades ──
  const ahora = () => new Date().toISOString();
  const dias = (n, h = 11, m = 0) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const horas = (n) => new Date(Date.now() - n * 36e5).toISOString();
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(16).slice(2) + Date.now().toString(16));
  const clon = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const foto = (k) => ROOT + 'img/autos/auto-' + k + '.webp';
  // CUIL / CUIT válidos (módulo 11) a partir de un DNI de ejemplo
  function verificador(base) { const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < 10; i++) s += Number(base[i]) * w[i]; let dv = 11 - (s % 11); if (dv === 11) dv = 0; return dv; }
  function cuil(pref, dni) { let p = pref, d = String(dni).padStart(8, '0'), dv = verificador(p + d); if (dv === 10) { p = '23'; dv = verificador(p + d); } return `${p}-${d}-${dv}`; }
  function cuit(base8) { for (const p of ['30', '33', '34']) { const dv = verificador(p + base8); if (dv !== 10) return `${p}-${base8}-${dv}`; } return null; }

  // Documento de ejemplo (HTML imprimible) con los datos de la operación en la URL: no hay Google Docs en la demo
  function urlDocumento(d, pdf) { return ROOT + 'documento.html#' + (pdf ? 'pdf&' : '') + 'd=' + encodeURIComponent(JSON.stringify(d)); }

  // Fotos de documentos de ejemplo (SVG) para las cargas semilla
  function svgDoc(tipo, x) {
    const t = (s) => String(s || '').replace(/[&<>]/g, '');
    const fondo = tipo === 'cedula' ? '#dff0e3' : '#e8eef6', borde = tipo === 'cedula' ? '#3f8f5a' : '#5577aa';
    const titulo = { dni_frente: 'DOCUMENTO NACIONAL DE IDENTIDAD', dni_dorso: 'DNI · DORSO', cedula: 'CÉDULA DE IDENTIFICACIÓN DEL AUTOMOTOR' }[tipo];
    const filas = tipo === 'dni_frente' ? [['Apellido y nombre', x.nombre], ['Documento', x.dni], ['Nacimiento', x.nac || '—']]
      : tipo === 'dni_dorso' ? [['Domicilio', x.domicilio || '—'], ['CUIL', x.cuil || '—']]
      : [['Dominio', x.dominio], ['Marca / modelo', x.auto], ['Titular', x.nombre]];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" rx="22" fill="${fondo}" stroke="${borde}" stroke-width="6"/>`
      + `<text x="32" y="56" font-family="Arial" font-size="20" font-weight="bold" fill="${borde}">${titulo}</text>`
      + (tipo === 'dni_frente' ? `<rect x="32" y="90" width="150" height="190" rx="10" fill="#c5d0de"/><circle cx="107" cy="160" r="38" fill="#a7b4c6"/><rect x="62" y="205" width="90" height="60" rx="30" fill="#a7b4c6"/>` : '')
      + filas.map(([k, v], i) => `<text x="${tipo === 'dni_frente' ? 210 : 32}" y="${120 + i * 62}" font-family="Arial" font-size="15" fill="#555">${t(k)}</text><text x="${tipo === 'dni_frente' ? 210 : 32}" y="${145 + i * 62}" font-family="Arial" font-size="22" font-weight="bold" fill="#222">${t(v)}</text>`).join('')
      + `<text x="320" y="365" text-anchor="middle" font-family="Arial" font-size="26" font-weight="bold" fill="#c0392b" opacity=".75">DOCUMENTO DE EJEMPLO · SIN VALIDEZ</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ═══ Datos semilla (todo ficticio) ═══════════════════════════════════════════
  function semilla() {
    const P = (id, x) => ({ id, agencia_id: AG, tipo: 'fisica', estado: 'verificada', sexo: null, nacimiento: null, cuit: null, conyuge: null, representante: null, relacion: null, email: null, ...x });
    const personas = [
      P('per-01', { nombre: 'Martín Ezequiel Sosa', dni: '30111222', cuil: cuil('20', '30111222'), sexo: 'M', nacimiento: '1983-03-14', domicilio: 'Calle Ejemplo 1234, Vicente López, Buenos Aires', telefono: '11 5555-0101', email: 'martin.sosa@ejemplo.com', estado_civil: 'Casado/a', conyuge: { nombre: 'Laura Inés Gómez', dni: '31222333' }, creado: dias(12, 10) }),
      P('per-02', { nombre: 'Carolina Belén Ruiz', dni: '32444555', cuil: cuil('27', '32444555'), sexo: 'F', nacimiento: '1987-08-02', domicilio: 'Pasaje Ficticio 456, San Isidro, Buenos Aires', telefono: '11 5555-0102', email: 'caro.ruiz@ejemplo.com', estado_civil: 'Soltero/a', creado: dias(34, 16) }),
      P('per-03', { tipo: 'juridica', nombre: 'Distribuidora Andes Sur S.R.L.', dni: null, cuit: cuit('71234567'), domicilio: 'Av. Modelo 2500, Tigre, Buenos Aires', telefono: '11 5555-0103', email: 'administracion@andessur.example', representante: { nombre: 'Ricardo Daniel Paz', dni: '25666777', cuil: cuil('20', '25666777'), cargo: 'Socio gerente' }, creado: dias(41, 12) }),
      P('per-04', { nombre: 'Lucía Fernández', dni: '35777888', cuil: cuil('27', '35777888'), sexo: 'F', nacimiento: '1991-11-23', domicilio: 'Calle de Prueba 789, Martínez, Buenos Aires', telefono: '11 5555-0104', email: 'lucia.f@ejemplo.com', estado_civil: 'Soltero/a', creado: dias(3, 15) }),
      P('per-05', { nombre: 'Diego Alvarez', dni: '28999000', cuil: cuil('20', '28999000'), sexo: 'M', nacimiento: '1981-01-30', domicilio: 'Av. Demo 3100, Olivos, Buenos Aires', telefono: '11 5555-0105', estado_civil: 'Divorciado/a', creado: dias(9, 11) }),
      P('per-06', { nombre: 'Sofía Méndez', dni: null, cuil: null, domicilio: null, telefono: '11 5555-0106', estado: 'pendiente', estado_civil: null, creado: dias(5, 9) }),
      P('per-07', { nombre: 'Tomás Benítez', dni: '33123123', cuil: cuil('20', '33123123'), sexo: 'M', nacimiento: '1988-05-09', domicilio: 'Calle Inventada 55, Florida, Buenos Aires', telefono: '11 5555-0107', email: 'tomas.b@ejemplo.com', estado_civil: 'Casado/a', conyuge: { nombre: 'Micaela Ortiz', dni: '34321321' }, creado: dias(20, 17) }),
      P('per-08', { nombre: 'Valeria Castro', dni: '36456456', cuil: cuil('27', '36456456'), sexo: 'F', nacimiento: '1992-07-17', domicilio: 'Calle Muestra 900, Béccar, Buenos Aires', telefono: '11 5555-0108', estado_civil: 'Unión convivencial', conyuge: { nombre: 'Julián Pérez', dni: '35654654' }, creado: dias(9, 18) }),
      P('per-09', { nombre: 'Andrés Villalba', dni: '29333444', cuil: cuil('20', '29333444'), sexo: 'M', domicilio: 'Calle Ejemplo 77, Munro, Buenos Aires', telefono: '11 5555-0109', estado_civil: 'Soltero/a', creado: dias(70, 10) }),
    ];
    const A = (id, x) => ({ id, agencia_id: AG, moneda: 'USD', estado: 'disponible', vendedor_id: null, chasis: null, motor: null, foto_url: null, actualizado: ahora(), ...x });
    const autos = [
      A('auto-101', { id_unidad: 'HA-101', marca: 'Peugeot', modelo: '208', version: 'Allure 1.6', anio: 2021, km: 38000, precio: 17500, transmision: 'Manual', potencia: '115 CV', color: 'Gris', dominio: 'AE123BC', chasis: '8AD2DEMO0MG000101', motor: '10DEMO0101', foto_url: foto('208'), vendedor_id: 'per-01', creado: dias(12), extra: { tipo: 'hatchback', combustible: 'Nafta', traccion: '4x2', ingreso: dias(12), carpeta_fotos: 'demo', ig_link: '#ig-demo' } }),
      A('auto-102', { id_unidad: 'HA-102', marca: 'Jeep', modelo: 'Grand Cherokee', version: 'Limited 3.6', anio: 2017, km: 92000, precio: 28900, transmision: 'Automática', potencia: '286 CV', color: 'Negro', dominio: 'AB456CD', chasis: '1C4RDEMO0HC000102', motor: 'ERBDEMO102', foto_url: foto('cherokee'), vendedor_id: 'per-02', creado: dias(34), extra: { tipo: 'suv', combustible: 'Nafta', traccion: '4x4', ingreso: dias(34), carpeta_fotos: 'demo', ig_link: '#ig-demo' } }),
      A('auto-103', { id_unidad: 'HA-103', marca: 'Honda', modelo: 'Civic', version: 'EXL 2.0 CVT', anio: 2019, km: 61000, precio: 19800, transmision: 'Automática', potencia: '154 CV', color: 'Blanco', estado: 'reservado', dominio: 'AD789EF', chasis: '93HFDEMO0KZ000103', motor: 'R20DEMO103', foto_url: foto('civic'), vendedor_id: 'per-07', creado: dias(20), extra: { tipo: 'sedan', combustible: 'Nafta', traccion: '4x2', ingreso: dias(20), carpeta_fotos: 'demo', ig_link: '#ig-demo' } }),
      A('auto-104', { id_unidad: 'HA-104', marca: 'DS', modelo: 'DS4', version: 'So Chic THP 165', anio: 2016, km: 84000, precio: 14200, transmision: 'Automática', potencia: '165 CV', color: 'Gris oscuro', dominio: 'PLM482', foto_url: foto('ds4'), creado: dias(74), extra: { tipo: 'hatchback', combustible: 'Nafta', traccion: '4x2', ingreso: dias(74), carpeta_fotos: 'demo' } }),
      A('auto-105', { id_unidad: 'HA-105', marca: 'Fiat', modelo: '500', version: 'Lounge 1.4', anio: 2015, km: 70500, precio: 9900, transmision: 'Manual', potencia: '100 CV', color: 'Celeste', dominio: 'OFK815', foto_url: foto('fiat500'), creado: dias(96), extra: { tipo: 'hatchback', combustible: 'Nafta', traccion: '4x2', ingreso: dias(96), carpeta_fotos: 'demo' } }),
      A('auto-106', { id_unidad: 'HA-106', marca: 'Ford', modelo: 'Mondeo', version: 'Titanium 2.0 Ecoboost', anio: 2018, km: 77000, precio: 18500, transmision: 'Automática', potencia: '240 CV', color: 'Gris', dominio: 'AC321GH', chasis: 'WF0EDEMO0JB000106', motor: 'R9CDEMO106', foto_url: foto('mondeo'), vendedor_id: 'per-03', creado: dias(41), extra: { tipo: 'sedan', combustible: 'Nafta', traccion: '4x2', ingreso: dias(41), carpeta_fotos: 'demo', ig_link: '#ig-demo' } }),
      A('auto-107', { id_unidad: 'HA-107', marca: 'Toyota', modelo: 'Hilux', version: 'SRV 2.8 4x4', anio: 2020, km: 88000, precio: 34000, transmision: 'Manual', potencia: '177 CV', color: 'Plata', dominio: 'AE654JK', vendedor_id: 'per-06', creado: dias(5), extra: { tipo: 'pickup', combustible: 'Diésel', traccion: '4x4', ingreso: dias(5) } }),
      A('auto-108', { id_unidad: 'HA-108', marca: 'Peugeot', modelo: '208', version: 'Active 1.2', anio: 2022, km: 21000, precio: 16900, transmision: 'Manual', potencia: '82 CV', color: 'Blanco', dominio: 'AF987LM', foto_url: foto('208'), creado: dias(2), extra: { tipo: 'hatchback', combustible: 'Nafta', traccion: '4x2', ingreso: dias(2), carpeta_fotos: 'demo' } }),
      // Vendidos (alimentan el gráfico de ventas del Inicio)
      A('auto-095', { id_unidad: 'HA-095', marca: 'Honda', modelo: 'Civic', version: 'LXS 1.8', anio: 2016, km: 98000, precio: 13500, transmision: 'Manual', color: 'Gris', estado: 'vendido', dominio: 'AA111NP', foto_url: foto('civic'), vendedor_id: 'per-09', creado: dias(60), extra: { tipo: 'sedan', ingreso: dias(60), vendido_en: dias(3, 12) } }),
      A('auto-096', { id_unidad: 'HA-096', marca: 'Fiat', modelo: '500', version: 'Cult 1.4', anio: 2014, km: 88000, precio: 8700, transmision: 'Manual', color: 'Rojo', estado: 'vendido', dominio: 'NHQ204', foto_url: foto('fiat500'), creado: dias(80), extra: { tipo: 'hatchback', ingreso: dias(80), vendido_en: dias(9, 16) } }),
      A('auto-092', { id_unidad: 'HA-092', marca: 'Ford', modelo: 'Mondeo', version: 'SE 2.0', anio: 2015, km: 110000, precio: 12900, transmision: 'Automática', color: 'Azul', estado: 'vendido', dominio: 'OWE719', foto_url: foto('mondeo'), creado: dias(120), extra: { tipo: 'sedan', ingreso: dias(120), vendido_en: dias(30, 11) } }),
      A('auto-090', { id_unidad: 'HA-090', marca: 'Jeep', modelo: 'Cherokee', version: 'Sport 2.4', anio: 2015, km: 105000, precio: 19900, transmision: 'Automática', color: 'Blanco', estado: 'vendido', dominio: 'OPR552', foto_url: foto('cherokee'), creado: dias(150), extra: { tipo: 'suv', ingreso: dias(150), vendido_en: dias(55, 15) } }),
      A('auto-089', { id_unidad: 'HA-089', marca: 'DS', modelo: 'DS4', version: 'Sport Chic', anio: 2015, km: 99000, precio: 12500, transmision: 'Manual', color: 'Negro', estado: 'vendido', dominio: 'OKL331', foto_url: foto('ds4'), creado: dias(160), extra: { tipo: 'hatchback', ingreso: dias(160), vendido_en: dias(64, 12) } }),
      A('auto-086', { id_unidad: 'HA-086', marca: 'Peugeot', modelo: '208', version: 'Feline 1.6', anio: 2017, km: 67000, precio: 11900, transmision: 'Manual', color: 'Rojo', estado: 'vendido', dominio: 'AB222QR', foto_url: foto('208'), creado: dias(170), extra: { tipo: 'hatchback', ingreso: dias(170), vendido_en: dias(92, 10) } }),
    ];
    const porA = Object.fromEntries(autos.map((a) => [a.id, a])), porP = Object.fromEntries(personas.map((p) => [p.id, p]));

    // Pendientes (cargas confirmadas por clientes, estado nueva)
    const fotosDe = (id, x, conCedula) => { const r = { dni_frente: `${AG}/cargas/${id}/dni_frente.jpg`, dni_dorso: `${AG}/cargas/${id}/dni_dorso.jpg` }; if (conCedula) r.cedula = `${AG}/cargas/${id}/cedula.jpg`; return r; };
    const blobs = {};
    const guardarFotos = (id, x, conCedula) => { const f = fotosDe(id, x, conCedula); Object.entries(f).forEach(([k, ruta]) => { blobs[ruta] = svgDoc(k, x); }); return f; };
    const C = (id, x) => ({ id, agencia_id: AG, estado: 'nueva', token_hash: null, persona_id: null, auto_id: null, vinculo: null, leido_cedula: null, ...x });
    const d1 = { nombre: 'Gustavo Adrián Pereyra', dni: '27888999', cuil: cuil('20', '27888999'), nacimiento: '1979-09-12', domicilio: 'Calle Ejemplo 450, Boulogne, Buenos Aires', telefono: '11 5555-0111', email: 'gustavo.p@ejemplo.com', estado_civil: 'Soltero/a', patente: 'PLM 482', anio: '2016', marca_modelo: 'DS DS4', tipo_persona: 'fisica', relacion: '' };
    const d2 = { nombre: 'Natalia Soledad Vega', dni: '34555666', cuil: '', nacimiento: '1989-02-27', domicilio: 'Pasaje Ficticio 12, Villa Adelina, Buenos Aires', telefono: '11 5555-0112', email: '', estado_civil: 'Casado/a', conyuge_nombre: 'Sergio Luis Rey', conyuge_dni: '33777111', patente: 'AC 555 TT', anio: '2017', marca_modelo: 'Volkswagen Gol Trend', tipo_persona: 'fisica', relacion: '' };
    const d3 = { nombre: 'Federico Iván Molina', dni: '37222111', cuil: cuil('20', '37222111'), nacimiento: '1993-12-05', domicilio: 'Av. Demo 1550 4° B, Vicente López, Buenos Aires', telefono: '11 5555-0113', email: 'fede.molina@ejemplo.com', estado_civil: 'Casado/a', conyuge_nombre: 'Agustina Lara', conyuge_dni: '38111222', tipo_persona: 'fisica', relacion: '' };
    const d4 = { nombre: 'Paula Ortiz', dni: '31999888', cuil: cuil('27', '31999888'), domicilio: 'Calle de Prueba 300, Pilar, Buenos Aires', telefono: '11 5555-0114', email: 'compras@logisticadelvalle.example', razon_social: 'Logística del Valle S.A.', cuit: cuit('70111222'), cargo: 'Presidente', domicilio_empresa: 'Ruta Ejemplo km 40, Pilar, Buenos Aires', tipo_persona: 'juridica', relacion: '' };
    const cargas = [
      C('carga-01', { rol: 'vendedor', datos: d1, fotos: guardarFotos('carga-01', { ...d1, dni: '27.888.999', dominio: 'PLM 482', auto: 'DS DS4 2016', cuil: d1.cuil, nac: '12/09/1979' }, true),
        leido_dni: { nombre: d1.nombre, dni: d1.dni, sexo: 'M', fecha_nacimiento: d1.nacimiento, domicilio: d1.domicilio, cuil: d1.cuil, legible: true },
        leido_cedula: { dominio: 'PLM482', marca: 'DS', modelo: 'DS4', anio: '2016', titular: d1.nombre, titular_documento: d1.dni, legible: true, chasis: 'VF7NDEMO0GY000104', motor: '5FVDEMO104' },
        auto_id: 'auto-104', vinculo: { por: 'patente', coincide: ['patente', 'marca', 'modelo', 'año'], texto: 'Coinciden patente, marca, modelo y año con el auto del stock.' },
        avisos: [{ tipo: 'ok', texto: 'CUIL válido' }, { tipo: 'ok', texto: 'Titular de la cédula = DNI' }], creado: horas(2.2), confirmado: horas(2) }),
      C('carga-02', { rol: 'vendedor', datos: d2, fotos: guardarFotos('carga-02', { ...d2, dni: '34.555.666', dominio: 'AC 555 TT', auto: 'Volkswagen Gol Trend 2017', nac: '27/02/1989' }, true),
        leido_dni: { nombre: d2.nombre, dni: d2.dni, sexo: 'F', fecha_nacimiento: d2.nacimiento, domicilio: d2.domicilio, legible: true },
        leido_cedula: { dominio: 'AC555TT', marca: 'Volkswagen', modelo: 'Gol Trend', anio: '2017', titular: d2.nombre, titular_documento: d2.dni, legible: true },
        vinculo: { por: null, coincide: [], texto: 'Ningún auto cargado coincide con esta patente ni con marca, modelo y año.' },
        avisos: [{ tipo: 'aviso', texto: 'Sin CUIL' }, { tipo: 'ok', texto: 'Titular de la cédula = DNI' }], creado: horas(5.5), confirmado: horas(5.3) }),
      C('carga-03', { rol: 'comprador', datos: d3, fotos: guardarFotos('carga-03', { ...d3, dni: '37.222.111', cuil: d3.cuil, nac: '05/12/1993' }, false),
        leido_dni: { nombre: d3.nombre, dni: d3.dni, sexo: 'M', fecha_nacimiento: d3.nacimiento, domicilio: 'Av. Demo 1550, Vicente López, Buenos Aires', cuil: d3.cuil, legible: true },
        avisos: [{ tipo: 'ok', texto: 'CUIL válido' }, { tipo: 'aviso', texto: 'Corrigió el domicilio que leímos del DNI' }], creado: dias(1, 18, 40), confirmado: dias(1, 18, 45) }),
      C('carga-04', { rol: 'comprador', datos: d4, fotos: guardarFotos('carga-04', { ...d4, dni: '31.999.888', cuil: d4.cuil }, false),
        leido_dni: { nombre: d4.nombre, dni: d4.dni, sexo: 'F', domicilio: d4.domicilio, cuil: d4.cuil, legible: true },
        avisos: [{ tipo: 'ok', texto: 'CUIL válido' }, { tipo: 'ok', texto: 'CUIT de la empresa válido' }], creado: dias(2, 10, 5), confirmado: dias(2, 10, 12) }),
    ];

    // Radar: quienes buscan, autos de particulares y estado de algunos matches
    const B = (id, x) => ({ id, agencia_id: AG, persona_id: null, marca: null, modelo: null, version: null, flexibilidad: 'similares', categoria: null, anio_min: null, anio_max: null, km_max: null, presupuesto: null, moneda: 'USD', transmision: null, combustible: null, traccion: null, puertas: null, colores: null, notas: null, origen: 'panel', estado: 'activa', demo: true, ...x });
    const busquedas = [
      B('bus-01', { nombre: 'Javier Torres', telefono: '11 5555-0201', marca: 'Toyota', modelo: 'Hilux', anio_min: 2018, presupuesto: 36000, combustible: 'diesel', notas: 'Para el campo', creado: dias(6, 12), renovada: dias(6, 12) }),
      B('bus-02', { nombre: 'Valeria Castro', telefono: '11 5555-0108', flexibilidad: 'categoria', categoria: 'suv', anio_min: 2015, presupuesto: 30000, creado: dias(15, 17), renovada: dias(15, 17) }),
      B('bus-03', { nombre: 'Nicolás Herrera', telefono: '11 5555-0203', marca: 'Honda', modelo: 'Civic', anio_min: 2017, transmision: 'automatica', presupuesto: 23000, origen: 'link', creado: dias(1, 9, 30), renovada: dias(1, 9, 30) }),
      B('bus-04', { nombre: 'Agustina Romero', telefono: '11 5555-0204', marca: 'Fiat', modelo: '500', km_max: 90000, presupuesto: 11000, colores: ['celeste', 'blanco'], creado: dias(22, 11), renovada: dias(22, 11) }),
      B('bus-05', { nombre: 'Marcos Giménez', telefono: '11 5555-0205', marca: 'Volkswagen', modelo: 'Amarok', flexibilidad: 'exacto', anio_min: 2018, origen: 'link', creado: dias(4, 20), renovada: dias(4, 20) }),
      B('bus-06', { nombre: 'Paula Ledesma', telefono: '11 5555-0206', flexibilidad: 'categoria', categoria: 'utilitario', presupuesto: 14000, notas: 'Para reparto', creado: dias(84, 10), renovada: dias(84, 10) }),
      B('bus-07', { nombre: 'Esteban Ríos', telefono: '11 5555-0207', marca: 'Ford', modelo: 'Ranger', estado: 'cerrada', creado: dias(40, 10), renovada: dias(40, 10) }),
    ];
    const O = (id, x) => ({ id, agencia_id: AG, persona_id: null, version: null, categoria: null, color: null, transmision: null, combustible: null, traccion: null, puertas: null, moneda: 'USD', puede_dejarlo: 'charlar', fotos: [], notas: null, origen: 'panel', estado: 'activa', id_unidad: null, demo: true, ...x });
    const ofertas = [
      O('ofe-01', { nombre: 'Pablo Ortega', telefono: '11 5555-0301', marca: 'Volkswagen', modelo: 'Amarok', version: 'Highline 2.0 4x4', categoria: 'pickup', anio: 2019, km: 98000, color: 'Gris', transmision: 'automatica', combustible: 'diesel', traccion: '4x4', puertas: 4, precio: 31500, puede_dejarlo: 'no', notas: 'Service oficial al día', creado: dias(8, 13), renovada: dias(8, 13) }),
      O('ofe-02', { nombre: 'Romina Acosta', telefono: '11 5555-0302', marca: 'Renault', modelo: 'Kangoo', version: 'Express 1.6', categoria: 'utilitario', anio: 2018, km: 120000, color: 'Blanco', transmision: 'manual', combustible: 'nafta', puertas: 5, precio: 12000, origen: 'link', creado: dias(11, 19), renovada: dias(11, 19) }),
      O('ofe-03', { nombre: 'Gabriel Suárez', telefono: '11 5555-0303', marca: 'Toyota', modelo: 'Corolla', version: 'XEI 2.0 CVT', categoria: 'sedan', anio: 2020, km: 60000, color: 'Gris', transmision: 'automatica', combustible: 'nafta', puertas: 4, precio: 22000, puede_dejarlo: 'si', creado: dias(3, 16), renovada: dias(3, 16) }),
      O('ofe-04', { nombre: 'Sofía Méndez', telefono: '11 5555-0106', persona_id: 'per-06', marca: 'Toyota', modelo: 'Hilux', version: 'SRV 2.8 4x4', categoria: 'pickup', anio: 2020, km: 88000, precio: 34000, estado: 'en_stock', id_unidad: 'HA-107', creado: dias(18, 10), renovada: dias(18, 10) }),
    ];
    const match_estados = [{ id: 'me-01', agencia_id: AG, clave: 'bus-02|stock|auto-102', estado: 'contactado', actualizado: dias(2, 12) }];

    // Operaciones y documentos generados (reserva del Civic + boletos de los vendidos)
    const operaciones = [], documentos = [], eventos = [];
    let n = 40;
    const doc = (op, tipo, creado) => { n++; const a = porA[op.auto_id], c = porP[op.comprador_id], v = porP[op.vendedor_id];
      const d = datosDocumento({ tipo, n, op, auto: a, comprador: c, vendedor: v });
      const titulo = (tipo === 'boleto' ? 'Boleto' : 'Reserva') + ' N° ' + String(n).padStart(4, '0');
      documentos.push({ id: 'doc-' + n, agencia_id: AG, operacion_id: op.id, tipo, estado: 'listo', doc_url: urlDocumento(d), pdf_url: urlDocumento(d, true), error: null, creado });
      return { titulo, doc_url: urlDocumento(d), pdf_url: urlDocumento(d, true) }; };
    const op = (id, x) => { const o = { id, agencia_id: AG, moneda: 'USD', moneda_sena: 'ARS', plazo_dias: 10, forma_pago: 'Dólares, billetes de cien cara grande', tipo_mandato: null, creado_por: USUARIO.email, ...x }; operaciones.push(o); return o; };
    const ev = (x) => eventos.push({ id: 'ev-' + (eventos.length + 1), agencia_id: AG, datos: {}, quien: USUARIO.email, ...x });

    const oRes = op('op-01', { auto_id: 'auto-103', vendedor_id: 'per-07', comprador_id: 'per-04', precio: 19800, sena: 500000, fecha: dias(2).slice(0, 10), estado: 'reservada', creado: dias(2, 15) });
    ev({ auto_id: 'auto-103', tipo: 'reserva', detalle: 'Reserva de Lucía Fernández · seña $ 500.000', creado: dias(2, 15, 5), datos: { documentos: [doc(oRes, 'reserva', dias(2, 15, 4))] } });
    const vendidos = [['auto-095', 'per-09', 'per-05', 3], ['auto-096', null, 'per-08', 9], ['auto-092', 'per-02', 'per-01', 30], ['auto-090', null, 'per-05', 55], ['auto-089', 'per-09', 'per-04', 64], ['auto-086', null, 'per-08', 92]];
    vendidos.forEach(([auto, ven, comp, d], k) => {
      const a = porA[auto], o = op('op-v' + k, { auto_id: auto, vendedor_id: ven, comprador_id: comp, precio: a.precio, sena: null, fecha: dias(d).slice(0, 10), estado: 'vendida', creado: dias(d, 11) });
      ev({ auto_id: auto, tipo: 'venta', detalle: `Vendido a ${porP[comp].nombre} · U$S ${a.precio.toLocaleString('es-AR')}`, creado: dias(d, 12), datos: { documentos: [doc(o, 'boleto', dias(d, 11, 30))] } });
    });
    ev({ auto_id: 'auto-108', tipo: 'carga', detalle: 'Auto cargado al stock: Peugeot 208 Active 1.2 2022 (HA-108)', creado: dias(2, 10) });
    ev({ auto_id: 'auto-107', tipo: 'carga', detalle: 'Auto de particular pasado al stock: Toyota Hilux SRV 2.8 4x4 (HA-107)', creado: dias(5, 9, 30) });
    ev({ auto_id: 'auto-101', tipo: 'instagram', detalle: 'Publicado en Instagram: Peugeot 208 Allure 1.6 2021', creado: dias(11, 18) });
    ev({ auto_id: 'auto-101', tipo: 'carga', detalle: 'Vendedor aprobado: Martín Ezequiel Sosa', creado: dias(12, 10, 20) });
    ev({ auto_id: 'auto-106', tipo: 'instagram', detalle: 'Publicado en Instagram: Ford Mondeo Titanium 2.0 Ecoboost 2018', creado: dias(40, 19) });
    ev({ auto_id: null, tipo: 'carga', detalle: 'Comprador aprobado: Lucía Fernández', creado: dias(3, 15, 30) });

    const accesos = [
      { id: 'acc-01', agencia_id: AG, email: USUARIO.email, nombre: USUARIO.nombre, rol: 'admin', activo: true, ultimo_ingreso: ahora(), creado: dias(60) },
      { id: 'acc-02', agencia_id: AG, email: 'ventas@hayautos.example', nombre: 'Vendedor de ejemplo', rol: 'usuario', activo: true, ultimo_ingreso: dias(1, 19, 10), creado: dias(45) },
      { id: 'acc-03', agencia_id: AG, email: 'administracion@hayautos.example', nombre: 'Administración (ejemplo)', rol: 'usuario', activo: true, ultimo_ingreso: dias(6, 9, 40), creado: dias(30) },
    ];
    return { db: { autos, personas, cargas, busquedas, ofertas_externas: ofertas, match_estados, operaciones, documentos, eventos, accesos, agencias: [{ id: AG, nombre: 'HAY AUTOS', creado: dias(60) }] }, blobs };
  }

  // Datos para el documento de ejemplo (los muestra documento.html)
  function datosDocumento({ tipo, n, op, auto, comprador, vendedor }) {
    const a = auto || {}, c = comprador || {}, v = vendedor || {};
    const pers = (p) => (p && p.nombre ? { nombre: p.nombre, tipo: p.tipo, dni: p.dni, cuil: p.cuil, cuit: p.cuit, domicilio: p.domicilio, estado_civil: p.estado_civil, representante: p.representante } : null);
    return { tipo, n, fecha: op.fecha, precio: op.precio, moneda: op.moneda || 'USD', sena: op.sena, moneda_sena: op.moneda_sena, plazo_dias: op.plazo_dias, forma_pago: op.forma_pago,
      auto: { id_unidad: a.id_unidad, marca: a.marca, modelo: a.modelo, version: a.version, anio: a.anio, km: a.km, dominio: a.dominio, chasis: a.chasis, motor: a.motor, color: a.color },
      comprador: pers(c), vendedor: pers(v) };
  }

  // ═══ Base en memoria (sessionStorage: se borra al cerrar la pestaña) ═══════════
  let DB, BLOBS = {};
  function cargar() {
    try { const t = sessionStorage.getItem(KEY_DB); if (t) DB = JSON.parse(t); } catch (_) { DB = null; }
    try { const t = sessionStorage.getItem(KEY_BLOBS); if (t) BLOBS = JSON.parse(t) || {}; } catch (_) { BLOBS = {}; }
    if (!DB) { const s = semilla(); DB = s.db; BLOBS = Object.assign(s.blobs, BLOBS); guardar(); guardarBlobs(); }
  }
  function guardar() { try { sessionStorage.setItem(KEY_DB, JSON.stringify(DB)); } catch (_) { /* sin almacenamiento: queda en memoria */ } }
  function guardarBlobs() { try { sessionStorage.setItem(KEY_BLOBS, JSON.stringify(BLOBS)); } catch (_) { /* fotos grandes: quedan solo en memoria */ } }
  function reiniciar() { try { sessionStorage.removeItem(KEY_DB); sessionStorage.removeItem(KEY_BLOBS); } catch (_) { /* nada */ } location.reload(); }
  cargar();
  const tabla = (t) => (DB[t] || (DB[t] = []));

  const DEFAULTS = {
    autos: () => ({ moneda: 'USD', estado: 'disponible', extra: {}, creado: ahora(), actualizado: ahora() }),
    personas: () => ({ tipo: 'fisica', estado: 'verificada', creado: ahora() }),
    cargas: () => ({ estado: 'leida', fotos: {}, avisos: [], creado: ahora() }),
    operaciones: () => ({ estado: 'borrador', moneda: 'USD', moneda_sena: 'ARS', plazo_dias: 10, creado_por: USUARIO.email, creado: ahora() }),
    documentos: () => ({ estado: 'pedido', creado: ahora() }),
    eventos: () => ({ datos: {}, quien: USUARIO.email, creado: ahora() }),
    busquedas: () => ({ flexibilidad: 'similares', moneda: 'USD', origen: 'panel', estado: 'activa', renovada: ahora(), creado: ahora(), demo: true }),
    ofertas_externas: () => ({ moneda: 'USD', puede_dejarlo: 'charlar', fotos: [], origen: 'panel', estado: 'activa', renovada: ahora(), creado: ahora(), demo: true }),
    match_estados: () => ({ actualizado: ahora() }),
    accesos: () => ({ rol: 'usuario', activo: true, creado: ahora() }),
  };
  const UNICOS = { personas: [['agencia_id', 'dni']], accesos: [['agencia_id', 'email']], match_estados: [['agencia_id', 'clave']], autos: [['agencia_id', 'id_unidad']] };

  // ── Query builder (subset de PostgREST que usa la app) ──
  function dividir(s) { const out = []; let prof = 0, cur = ''; for (const ch of s) { if (ch === '(') prof++; if (ch === ')') prof--; if (ch === ',' && !prof) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; }
  function proyectar(fila, cols) {
    const partes = dividir(cols || '*');
    const todo = partes.includes('*');
    const out = todo ? clon(fila) : {};
    for (const p of partes) {
      if (p === '*') continue;
      const m = p.match(/^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/);
      if (m) { // relación embebida: alias:tabla!fk(cols) → fk = <alias>_id
        const alias = m[1] || m[2], t = m[2], fk = alias + '_id';
        const rel = tabla(t).find((r) => r.id === fila[fk]);
        out[alias] = rel ? proyectar(rel, m[3]) : null;
      } else if (!todo) out[p.trim()] = fila[p.trim()] === undefined ? null : clon(fila[p.trim()]);
    }
    return out;
  }
  const igual = (a, b) => a != null && b != null && String(a) === String(b);
  function comoRegex(pat) { return new RegExp('^' + String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i'); }
  function filtroOr(expr) { // "col.eq.x,col2.ilike.%y%"
    const conds = dividir(expr).map((c) => { const [col, op, ...r] = c.split('.'); return { col, op, val: r.join('.') }; });
    return (f) => conds.some(({ col, op, val }) => (OPS[op] ? OPS[op](f[col], op === 'in' ? val.replace(/^\(|\)$/g, '').split(',') : val) : false));
  }
  const OPS = {
    eq: (v, x) => igual(v, x), neq: (v, x) => v != null && !igual(v, x), gt: (v, x) => v != null && v > x, gte: (v, x) => v != null && v >= x,
    lt: (v, x) => v != null && v < x, lte: (v, x) => v != null && v <= x, in: (v, x) => (x || []).some((y) => igual(v, y)),
    is: (v, x) => (x === null || x === 'null' ? v == null : v === x), like: (v, x) => v != null && comoRegex(x).test(String(v)), ilike: (v, x) => v != null && comoRegex(x).test(String(v)),
  };
  class Consulta {
    constructor(t) { this.t = t; this.op = 'select'; this.cols = '*'; this.filtros = []; this.orden = []; this.lim = null; this.rango = null; this.uno = null; this.devolver = false; this.opts = {}; }
    select(cols, opts) { if (this.op === 'select') { this.cols = cols || '*'; this.opts = opts || {}; } else { this.devolver = true; this.cols = cols || '*'; } return this; }
    insert(filas) { this.op = 'insert'; this.filas = filas; return this; }
    upsert(filas, o) { this.op = 'upsert'; this.filas = filas; this.conflicto = o && o.onConflict; return this; }
    update(c) { this.op = 'update'; this.cambios = c; return this; }
    delete() { this.op = 'delete'; return this; }
    _f(fn) { this.filtros.push(fn); return this; }
    eq(c, v) { return this._f((f) => OPS.eq(f[c], v)); } neq(c, v) { return this._f((f) => OPS.neq(f[c], v)); }
    gt(c, v) { return this._f((f) => OPS.gt(f[c], v)); } gte(c, v) { return this._f((f) => OPS.gte(f[c], v)); }
    lt(c, v) { return this._f((f) => OPS.lt(f[c], v)); } lte(c, v) { return this._f((f) => OPS.lte(f[c], v)); }
    in(c, v) { return this._f((f) => OPS.in(f[c], v)); } is(c, v) { return this._f((f) => OPS.is(f[c], v)); }
    like(c, v) { return this._f((f) => OPS.like(f[c], v)); } ilike(c, v) { return this._f((f) => OPS.ilike(f[c], v)); }
    match(o) { Object.entries(o || {}).forEach(([c, v]) => this.eq(c, v)); return this; }
    not(c, op, v) { return this._f((f) => !(OPS[op] ? OPS[op](f[c], v) : false)); }
    or(expr) { return this._f(filtroOr(expr)); }
    filter(c, op, v) { return this._f((f) => (OPS[op] ? OPS[op](f[c], v) : true)); }
    order(c, o) { this.orden.push({ c, asc: !o || o.ascending !== false }); return this; }
    limit(n) { this.lim = n; return this; }
    range(a, b) { this.rango = [a, b]; return this; }
    single() { this.uno = 'single'; return this; }
    maybeSingle() { this.uno = 'maybe'; return this; }
    then(ok, mal) { return Promise.resolve().then(() => this._ejecutar()).then(ok, mal); }
    catch(mal) { return this.then(null, mal); }
    _filas() { return tabla(this.t).filter((f) => this.filtros.every((fn) => fn(f))); }
    _ejecutar() {
      try {
        let filas;
        if (this.op === 'select') {
          filas = this._filas();
          if (this.orden.length) filas = filas.slice().sort((a, b) => { for (const { c, asc } of this.orden) { const x = a[c], y = b[c]; if (x === y) continue; if (x == null) return 1; if (y == null) return -1; const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true }); if (r) return asc ? r : -r; } return 0; });
          const total = filas.length;
          if (this.rango) filas = filas.slice(this.rango[0], this.rango[1] + 1);
          if (this.lim != null) filas = filas.slice(0, this.lim);
          if (this.opts.head) return { data: null, count: total, error: null, status: 200 };
          return this._fin(filas.map((f) => proyectar(f, this.cols)), this.opts.count ? total : null);
        }
        if (this.op === 'insert' || this.op === 'upsert') {
          const lista = Array.isArray(this.filas) ? this.filas : [this.filas], out = [];
          for (const x of lista) {
            const claves = this.conflicto ? [this.conflicto.split(',').map((s) => s.trim())] : (UNICOS[this.t] || []);
            const previo = claves.map((ks) => tabla(this.t).find((f) => ks.every((k) => x[k] != null && igual(f[k], x[k])))).find(Boolean);
            if (previo && this.op === 'upsert') { Object.assign(previo, clon(x)); out.push(previo); continue; }
            if (previo) return { data: null, error: { message: `duplicate key value violates unique constraint "${this.t}_unique"`, code: '23505' }, status: 409 };
            const fila = Object.assign({ id: uid(), agencia_id: AG }, (DEFAULTS[this.t] || (() => ({})))(), clon(x));
            tabla(this.t).push(fila); out.push(fila);
          }
          guardar(); return this.devolver ? this._fin(out.map((f) => proyectar(f, this.cols))) : { data: null, error: null, status: 201 };
        }
        if (this.op === 'update') {
          const filas2 = this._filas(); filas2.forEach((f) => Object.assign(f, clon(this.cambios)));
          guardar(); return this.devolver ? this._fin(filas2.map((f) => proyectar(f, this.cols))) : { data: null, error: null, status: 204 };
        }
        if (this.op === 'delete') {
          const borrar = new Set(this._filas()); DB[this.t] = tabla(this.t).filter((f) => !borrar.has(f));
          guardar(); return this.devolver ? this._fin([...borrar]) : { data: null, error: null, status: 204 };
        }
      } catch (e) { console.warn('[demo]', e); return { data: null, error: { message: e.message } }; }
      return { data: null, error: null };
    }
    _fin(filas, count) {
      if (this.uno) {
        if (filas.length === 1) return { data: filas[0], error: null, status: 200 };
        if (!filas.length && this.uno === 'maybe') return { data: null, error: null, status: 200 };
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, status: 406 };
      }
      return { data: filas, count: count == null ? null : count, error: null, status: 200 };
    }
  }

  // ── RPC (las funciones de la base) ──
  const RPC = {
    registrar_ingreso() {
      const a = tabla('accesos').find((x) => x.email === USUARIO.email); if (a) { a.ultimo_ingreso = ahora(); guardar(); }
      return [{ agencia_id: AG, agencia: 'HAY AUTOS', rol: 'admin', nombre: USUARIO.nombre }];
    },
    aprobar_carga({ p_carga, p_auto }) { // misma lógica que aprobar_carga() de schema.sql
      const c = tabla('cargas').find((x) => x.id === p_carga); if (!c) throw new Error('carga inexistente');
      const d = c.datos || {}, dni = String(d.dni || '').replace(/\D/g, '') || null, juridica = d.tipo_persona === 'juridica';
      let p;
      if (juridica) {
        p = tabla('personas').find((x) => x.tipo === 'juridica' && x.cuit && x.cuit === d.cuit);
        const rep = { nombre: d.nombre, dni, cuil: d.cuil || null, cargo: d.cargo || null };
        if (!p) { p = { id: uid(), agencia_id: AG, tipo: 'juridica', nombre: d.razon_social || d.nombre, cuit: d.cuit || null, domicilio: d.domicilio_empresa || d.domicilio, telefono: d.telefono, email: d.email || null, representante: rep, estado: 'verificada', creado: ahora() }; tabla('personas').push(p); }
        else Object.assign(p, { nombre: d.razon_social || p.nombre, representante: rep, estado: 'verificada' });
      } else {
        p = dni && tabla('personas').find((x) => x.dni === dni);
        const fila = { tipo: 'fisica', nombre: d.nombre, dni, cuil: d.cuil || (p && p.cuil) || null, sexo: (c.leido_dni && c.leido_dni.sexo) || null, nacimiento: d.nacimiento || null, domicilio: d.domicilio || (p && p.domicilio), telefono: d.telefono || (p && p.telefono), email: d.email || (p && p.email) || null,
          estado_civil: d.estado_civil || (p && p.estado_civil) || null, conyuge: d.conyuge_nombre ? { nombre: d.conyuge_nombre, dni: String(d.conyuge_dni || '').replace(/\D/g, '') } : (p && p.conyuge) || null,
          relacion: c.rol === 'otro' ? { tipo: d.relacion, titular_nombre: d.titular_nombre, titular_dni: d.titular_dni } : (p && p.relacion) || null, estado: 'verificada' };
        if (p) Object.assign(p, fila); else { p = { id: uid(), agencia_id: AG, creado: ahora(), ...fila }; tabla('personas').push(p); }
      }
      const autoId = p_auto || c.auto_id;
      Object.assign(c, { estado: 'aprobada', persona_id: p.id, auto_id: autoId || null });
      if (c.rol === 'vendedor' && autoId) {
        const a = tabla('autos').find((x) => x.id === autoId), ced = c.leido_cedula || {};
        if (a) Object.assign(a, { vendedor_id: p.id, dominio: a.dominio || ced.dominio || null, chasis: a.chasis || ced.chasis || null, motor: a.motor || ced.motor || null });
      }
      tabla('eventos').push({ id: uid(), agencia_id: AG, auto_id: autoId || null, tipo: 'carga', detalle: `${c.rol[0].toUpperCase() + c.rol.slice(1)} aprobado: ${d.razon_social || d.nombre || ''}`, datos: {}, quien: USUARIO.email, creado: ahora() });
      guardar(); return p.id;
    },
  };

  // ── Sesión demo ──
  const sesion = { access_token: 'demo-token', token_type: 'bearer', expires_in: 3600, user: { id: USUARIO.id, email: USUARIO.email, user_metadata: { full_name: USUARIO.nombre, name: USUARIO.nombre } } };
  const oyentes = [];
  const auth = {
    getSession: async () => ({ data: { session: clon(sesion) }, error: null }),
    getUser: async () => ({ data: { user: clon(sesion.user) }, error: null }),
    onAuthStateChange(cb) { oyentes.push(cb); setTimeout(() => cb('SIGNED_IN', clon(sesion)), 0); return { data: { subscription: { unsubscribe() { const i = oyentes.indexOf(cb); if (i >= 0) oyentes.splice(i, 1); } } } }; },
    signInWithOAuth: async () => { setTimeout(() => location.reload(), 50); return { data: {}, error: null }; },
    signOut: async () => { aviso('Modo demo: no hay cuentas reales. Volvés a entrar como usuario demo.'); return { error: null }; },
    refreshSession: async () => ({ data: { session: clon(sesion) }, error: null }),
  };

  // ── Storage (todo queda en el navegador) ──
  function urlBlob(ruta) {
    if (BLOBS[ruta]) return BLOBS[ruta];
    const tipo = /dni_dorso/.test(ruta) ? 'dni_dorso' : /cedula/.test(ruta) ? 'cedula' : 'dni_frente';
    return svgDoc(tipo, { nombre: 'Persona de ejemplo', dni: '00.000.000', dominio: 'AA 000 AA', auto: 'Auto de ejemplo' });
  }
  const storage = {
    from: () => ({
      upload: async (ruta, archivo) => { try { BLOBS[ruta] = typeof archivo === 'string' ? archivo : await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(archivo); }); guardarBlobs(); } catch (_) { /* nada */ } return { data: { path: ruta }, error: null }; },
      createSignedUrl: async (ruta) => ({ data: { signedUrl: urlBlob(ruta) }, error: null }),
      createSignedUrls: async (rutas) => ({ data: (rutas || []).map((r) => ({ path: r, signedUrl: urlBlob(r), error: null })), error: null }),
      getPublicUrl: (ruta) => ({ data: { publicUrl: urlBlob(ruta) } }),
      remove: async (rutas) => { (rutas || []).forEach((r) => delete BLOBS[r]); guardarBlobs(); return { data: [], error: null }; },
      list: async () => ({ data: [], error: null }),
    }),
  };

  // ═══ "Backend" simulado: función `cliente` y webhooks de automatización ═══════
  const LECTURA_CLIENTE = { nombre: 'Mariano Andrés Peralta', dni: '31222333', sexo: 'M', fecha_nacimiento: '1985-06-21', domicilio: 'Calle Ejemplo 1234, Olivos, Buenos Aires', cuil: cuil('20', '31222333'), legible: true };
  const LECTURA_PANEL = { nombre: 'Florencia Paz Ibarra', dni: '38444555', sexo: 'F', fecha_nacimiento: '1994-10-08', domicilio: 'Pasaje Ficticio 321, Martínez, Buenos Aires', cuil: cuil('27', '38444555'), legible: true };
  async function backend(ruta, b) {
    const accion = b.accion || '';
    if (/leer/.test(ruta) || accion === 'leer') {
      await espera(1500);                       // "la IA está leyendo"
      if (b.modo === 'panel') return { ok: true, dni: { ...LECTURA_PANEL } };
      if (b.modo === 'manual') {                // "Cargar los datos a mano": carga vacía, sin fotos ni lectura
        const id = uid(), token = uid();
        tabla('cargas').push({ id, agencia_id: AG, rol: b.rol, estado: 'leida', token_hash: token, fotos: {}, leido_dni: null, leido_cedula: b.rol === 'vendedor' ? { legible: true, a_mano: true } : null, datos: null, avisos: [], creado: ahora() });
        guardar();
        return { ok: true, carga_id: id, token, dni: {}, cedula: null, manual: true };
      }
      // Las fotos quedan en este navegador (memoria/sessionStorage): no se suben a ningún lado
      const id = uid(), token = uid(), fotos = {};
      Object.entries(b.fotos || {}).forEach(([k, v]) => { if (v) { const r = `${AG}/cargas/${id}/${k}.jpg`; BLOBS[r] = v; fotos[k] = r; } });
      guardarBlobs();
      const fiat = tabla('autos').find((a) => a.id === 'auto-105') || {};
      const cedula = b.rol === 'vendedor' ? { dominio: formatoPat(fiat.dominio || 'OFK815'), marca: fiat.marca || 'Fiat', modelo: fiat.modelo || '500', anio: String(fiat.anio || 2015), titular: LECTURA_CLIENTE.nombre, titular_documento: LECTURA_CLIENTE.dni, chasis: 'ZFADEMO0FJ000105', motor: '312DEMO105', legible: true } : null;
      tabla('cargas').push({ id, agencia_id: AG, rol: b.rol, estado: 'leida', token_hash: token, fotos, leido_dni: { ...LECTURA_CLIENTE }, leido_cedula: cedula, datos: null, avisos: [], creado: ahora() });
      guardar();
      return { ok: true, carga_id: id, token, dni: { ...LECTURA_CLIENTE }, cedula };
    }
    if (accion === 'confirmar') {
      await espera(700);
      const c = tabla('cargas').find((x) => x.id === b.carga_id && x.token_hash === b.token);
      if (!c) return { ok: false, error: 'No encontramos tu carga. Volvé a subir las fotos.' };
      const datos = b.datos || {};
      const ced = c.leido_cedula;
      let avisos = [];
      try { avisos = avisosCarga({ rol: c.rol, dni: c.leido_dni, cedula: ced, datos, fotos: c.fotos }).concat(avisosCargaExtra({ rol: c.rol, datos })); } catch (_) { /* sin avisos */ }
      let auto_id = null, vinculo = null;
      if (c.rol === 'vendedor') {
        try {
          const cedConf = { ...(ced || {}), dominio: datos.patente || (ced && ced.dominio), anio: datos.anio || (ced && ced.anio) };
          const v = vincularAuto(cedConf, tabla('autos').filter((a) => a.estado !== 'vendido' && a.estado !== 'baja'));
          auto_id = v.auto ? v.auto.id : null; vinculo = { por: v.por, coincide: v.coincide, texto: textoVinculo(v), candidatos: (v.candidatos || []).map((a) => a.id) };
        } catch (_) { vinculo = { por: null, coincide: [], texto: 'Elegilo a mano.' }; }
      }
      Object.assign(c, { datos, estado: 'nueva', confirmado: ahora(), avisos, auto_id, vinculo });
      guardar(); return { ok: true };
    }
    if (accion === 'busqueda') {
      await espera(600);
      const x = b.datos || {}; if (x.web) return { ok: true };
      const n = (v) => { const s = String(v || '').replace(/\D/g, ''); return s ? Number(s) : null; };
      tabla('busquedas').push({ ...DEFAULTS.busquedas(), id: uid(), agencia_id: AG, origen: 'link', nombre: x.nombre, telefono: x.telefono, marca: x.marca || null, modelo: x.modelo || null, version: x.version || null,
        flexibilidad: x.flexibilidad || 'similares', categoria: x.categoria || null, anio_min: n(x.anio_min), anio_max: n(x.anio_max), km_max: n(x.km_max), presupuesto: n(x.presupuesto), moneda: x.moneda || 'USD',
        transmision: x.transmision || null, combustible: x.combustible || null, traccion: x.traccion || null, puertas: n(x.puertas), colores: (x.colores || []).length ? x.colores : null, notas: x.notas || null });
      guardar(); return { ok: true };
    }
    if (accion === 'oferta') {
      await espera(600);
      const x = b.datos || {}; if (x.web) return { ok: true };
      const n = (v) => { const s = String(v || '').replace(/\D/g, ''); return s ? Number(s) : null; };
      const id = uid(), fotos = (b.fotos || []).map((f, k) => { const r = `${AG}/ofertas/${id}/${k + 1}.jpg`; BLOBS[r] = f; return r; }); guardarBlobs();
      tabla('ofertas_externas').push({ ...DEFAULTS.ofertas_externas(), id, agencia_id: AG, origen: 'link', nombre: x.nombre, telefono: x.telefono, marca: x.marca, modelo: x.modelo, version: x.version || null, anio: n(x.anio), km: n(x.km),
        color: x.color || null, categoria: x.categoria || null, transmision: x.transmision || null, combustible: x.combustible || null, puertas: n(x.puertas), precio: n(x.precio), moneda: x.moneda || 'USD', puede_dejarlo: x.puede_dejarlo || 'charlar', notas: x.notas || null, fotos });
      guardar(); return { ok: true };
    }
    if (/documentos/.test(ruta)) return generarDocumentos(b);
    if (/publicar/.test(ruta)) {
      await espera(900);
      const a = tabla('autos').find((x) => x.id_unidad === b.id_unidad);
      if (a) tabla('eventos').push({ id: uid(), agencia_id: AG, auto_id: a.id, tipo: 'instagram', detalle: `Publicación pedida (demo): ${[a.marca, a.modelo, a.version, a.anio].filter(Boolean).join(' ')}`, datos: {}, quien: USUARIO.email, creado: ahora() });
      guardar(); aviso('Modo demo: no se publica nada en Instagram. En la versión real, la IA ordena las fotos y arma el texto.');
      return { ok: true };
    }
    if (/cargar-auto/.test(ruta)) {
      await espera(900);
      const x = b.auto || {}, nums = tabla('autos').map((a) => Number(String(a.id_unidad).replace(/\D/g, '')) || 0);
      const id_unidad = 'HA-' + String(Math.max(100, ...nums) + 1).padStart(3, '0'), id = uid();
      tabla('autos').push({ ...DEFAULTS.autos(), id, agencia_id: AG, id_unidad, marca: x.marca, modelo: x.modelo, version: x.version || null, anio: x.anio, km: x.km, precio: x.precio, moneda: x.moneda || 'USD',
        transmision: x.transmision ? (x.transmision === 'automatica' ? 'Automática' : 'Manual') : null, potencia: x.potencia ? x.potencia + ' CV' : null, color: x.color || null, dominio: x.dominio || null, vendedor_id: b.vendedor_id || null, foto_url: null,
        extra: { tipo: x.categoria || null, combustible: x.combustible || null, ingreso: ahora(), carpeta_fotos: x.carpeta_fotos ? 'demo' : null } });
      if (b.oferta_id) { const o = tabla('ofertas_externas').find((y) => y.id === b.oferta_id); if (o) Object.assign(o, { estado: 'en_stock', id_unidad }); }
      tabla('eventos').push({ id: uid(), agencia_id: AG, auto_id: id, tipo: 'carga', detalle: `Auto cargado al stock: ${[x.marca, x.modelo, x.version, x.anio].filter(Boolean).join(' ')} (${id_unidad})`, datos: {}, quien: USUARIO.email, creado: ahora() });
      guardar(); return { ok: true, id_unidad };
    }
    return { ok: false, error: 'Acción no disponible en la demo.' };
  }
  function formatoPat(p) { try { return formatoPatente(p); } catch (_) { return p; } }

  // Generar documentos: en la versión real los arma n8n en Google Docs; acá se abre un documento de ejemplo (HTML imprimible)
  async function generarDocumentos(b) {
    await espera(1400);
    const op = tabla('operaciones').find((o) => o.id === b.operacion_id);
    if (!op) return { ok: false, error: 'No encontramos la operación.' };
    const auto = tabla('autos').find((a) => a.id === op.auto_id), comprador = tabla('personas').find((p) => p.id === op.comprador_id), vendedor = tabla('personas').find((p) => p.id === op.vendedor_id);
    const pedidos = tabla('documentos').filter((d) => d.operacion_id === op.id && d.estado === 'pedido');
    let n = tabla('documentos').filter((d) => d.estado === 'listo').length + 40;
    const nombres = { reserva: 'Reserva', boleto: 'Boleto', precarga_08: 'Precarga 08' };
    const out = pedidos.map((d) => {
      n++; const datos = datosDocumento({ tipo: d.tipo, n, op, auto, comprador, vendedor });
      Object.assign(d, { estado: 'listo', doc_url: urlDocumento(datos), pdf_url: urlDocumento(datos, true) });
      return { titulo: `${nombres[d.tipo] || d.tipo} N° ${String(n).padStart(4, '0')} (ejemplo)`, doc_url: d.doc_url, pdf_url: d.pdf_url };
    });
    if (auto && pedidos.some((d) => d.tipo === 'reserva') && auto.estado === 'disponible') auto.estado = 'reservado';
    tabla('eventos').push({ id: uid(), agencia_id: AG, auto_id: op.auto_id, tipo: pedidos.some((d) => d.tipo === 'reserva') ? 'reserva' : 'documento',
      detalle: `Documentos generados (demo) para ${comprador ? comprador.nombre : 'la operación'}: ${pedidos.map((d) => nombres[d.tipo] || d.tipo).join(', ')}`, datos: { documentos: out }, quien: USUARIO.email, creado: ahora() });
    guardar();
    return { ok: true, documentos: out, carpeta_url: null };
  }

  // ── fetch: lo que iría al backend se responde acá; el resto (catálogo, fuentes) sigue normal ──
  const fetchReal = window.fetch.bind(window);
  const esBackend = (u) => { const C = window.HA_CONFIG || {}; return (C.supabaseUrl && u.startsWith(C.supabaseUrl)) || (C.n8nUrl && u.startsWith(C.n8nUrl)) || /supabase\.co|ngrok|\/webhook\/|\/functions\/v1\//.test(u); };
  window.fetch = async function (input, init) {
    const u = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (!esBackend(u)) return fetchReal(input, init);
    let cuerpo = {};
    try { cuerpo = JSON.parse((init && init.body) || '{}'); } catch (_) { cuerpo = {}; }
    let r;
    try { r = await backend(u, cuerpo); } catch (e) { console.warn('[demo]', e); r = { ok: false, error: 'La demo no pudo simular esta acción.' }; }
    return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const supabase = {
    auth, storage,
    from: (t) => new Consulta(t),
    rpc: async (nombre, args) => { try { if (!RPC[nombre]) throw new Error('Función no disponible en la demo: ' + nombre); return { data: RPC[nombre](args || {}), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
    functions: { invoke: async (nombre, o) => { const r = await backend(nombre, (o && o.body) || {}); return r.ok === false ? { data: null, error: { message: r.error } } : { data: r, error: null }; } },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel() {},
  };
  window.HA_DEMO = { supabase, createClient: () => supabase, reiniciar, db: () => DB };
  window.supabase = window.supabase || { createClient: () => supabase };

  // ═══ Cartel "Modo demo" y acciones que en la demo no salen del navegador ═════════
  function aviso(texto) {
    const e = document.createElement('div'); e.className = 'demo-aviso'; e.setAttribute('role', 'status'); e.textContent = texto;
    document.body.appendChild(e); setTimeout(() => e.remove(), 4200);
  }
  window.HA_DEMO.aviso = aviso;
  function cartel() {
    const enPanel = /\/panel\/?(index\.html)?$/.test(location.pathname);
    const b = document.createElement('div'); b.className = 'demo-cartel'; b.setAttribute('role', 'note');
    b.innerHTML = `<span><b>Modo demo:</b> datos de ejemplo, nada se guarda.</span>
      <span class="demo-links"><a href="${enPanel ? ROOT : ROOT + 'panel/'}">${enPanel ? 'Ver la página del cliente' : 'Ver el panel de la agencia'}</a>
      <button type="button" data-demo-reiniciar>Reiniciar</button><a href="${PORTFOLIO}">Volver al portfolio</a></span>`;
    document.body.prepend(b); document.body.classList.add('con-demo');
    b.querySelector('[data-demo-reiniciar]').addEventListener('click', () => { if (confirm('¿Volver a los datos de ejemplo del principio?')) reiniciar(); });
  }
  if (document.body) cartel(); else document.addEventListener('DOMContentLoaded', cartel);

  // WhatsApp, Instagram y Drive no se abren en la demo (los números y links son ficticios)
  const abrirReal = window.open.bind(window);
  window.open = function (url, ...r) {
    const u = String(url || '');
    if (/wa\.me|whatsapp/.test(u)) { const t = new URL(u).searchParams.get('text'); aviso('Modo demo: en la versión real se abre WhatsApp con este mensaje listo' + (t ? ': "' + t.slice(0, 140) + (t.length > 140 ? '…' : '') + '"' : '.')); return null; }
    if (/instagram\.com|drive\.google|docs\.google/.test(u)) { aviso('Modo demo: este link no se abre.'); return null; }
    return abrirReal(url, ...r);
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const h = a.getAttribute('href') || '';
    if (/wa\.me/.test(h)) { e.preventDefault(); e.stopPropagation(); aviso('Modo demo: en la versión real se abre el chat de WhatsApp con ' + a.textContent.trim() + ' (número ficticio).'); }
    else if (/ig-demo|instagram\.com/.test(h)) { e.preventDefault(); e.stopPropagation(); aviso('Modo demo: en la versión real se abre la publicación del auto en Instagram.'); }
  }, true);
  // Portapapeles: en algunos navegadores falla sin permiso; que no rompa
  try { if (navigator.clipboard && navigator.clipboard.writeText) { const w = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = (t) => w(t).catch(() => undefined); } } catch (_) { /* nada */ }
})();

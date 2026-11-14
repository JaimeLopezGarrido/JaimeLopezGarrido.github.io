// ═══════════════════════════════════════════════════════════════════════════════
// WEB APP (sin IA) — v0.1 (D-065..D-070, agencia piloto: Hay Autos)
// Lógica pura que comparten la página del cliente, el panel y la función de Supabase. Se apoya en documentos_core.js
// (normalizarPatente, cuilInfo, formatoDni, miles, montoTexto) — cargar ese archivo ANTES que este.
//   patenteCanonica(t)                      → "NKP482" corrigiendo confusiones de lectura por posición (0/O, 1/I, 8/B…)
//   formatoPatente(t)                       → "NKP 482" · "AE 215 KT"
//   vincularAuto(cedula, autos)             → { auto, por, coincide, candidatos } (patente → patente aproximada → chasis → similitud)
//   avisosCarga({ rol, dni, cedula, datos }) → [{ tipo: ok|aviso|error, texto }] para la bandeja Pendientes
//   documentosDisponibles({ auto, vendedor, comprador, op }) → [{ tipo, nombre, listo, falta }]
// ═══════════════════════════════════════════════════════════════════════════════

// Lo que lee la IA de la cédula, con el titular (para comparar con el DNI del vendedor)
const PROMPT_CEDULA_WEB = 'Te paso fotos de la cédula de identificación de un automotor argentino (cédula verde o azul) o del título. Copiá EXACTAMENTE lo que se lee, sin inventar ni completar. Si algo no se lee, dejalo vacío. '
  + 'Respondé SOLO con JSON: {"dominio":"","marca":"","modelo":"","tipo":"","anio":"","motor_marca":"","motor_numero":"","chasis_marca":"","chasis_numero":"","titular":"","titular_documento":"","legible":true}';

const _A_LETRA = { 0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 8: 'B' };
const _A_NUM = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', A: '4', S: '5', G: '6', T: '7', B: '8' };
// Patente vieja LLLDDD o Mercosur LLDDDLL: cada posición tiene que ser letra o número; se corrigen las confusiones típicas de la lectura
function patenteCanonica(t) {
  const s = String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const molde = s.length === 6 ? 'LLLDDD' : s.length === 7 ? 'LLDDDLL' : null;
  if (!molde) return normalizarPatente(s);
  const c = s.split('').map((ch, i) => (molde[i] === 'L' ? (/[A-Z]/.test(ch) ? ch : _A_LETRA[ch] || ch) : (/\d/.test(ch) ? ch : _A_NUM[ch] || ch))).join('');
  return normalizarPatente(c);
}
function formatoPatente(t) {
  const p = normalizarPatente(t) || patenteCanonica(t);
  if (!p) return '';
  return p.length === 6 ? `${p.slice(0, 3)} ${p.slice(3)}` : `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5)}`;
}
function _sinTildesW(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function _palabrasW(t) { return _sinTildesW(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 2); }
function _distancia1(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false; return d === 1; }
function _soloAlnum(t) { return String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

// Qué tiene en común la cédula con un auto del stock
function _coincidencias(c, a) {
  const out = [];
  const pc = patenteCanonica(c.dominio), pa = normalizarPatente(a.dominio);
  if (pc && pa && pc === pa) out.push('patente');
  const mc = _sinTildesW(c.marca), ma = _sinTildesW(a.marca);
  if (mc && ma && (mc.includes(ma) || ma.includes(mc))) out.push('marca');
  const wc = new Set(_palabrasW(c.modelo)), wa = _palabrasW([a.modelo, a.version].filter(Boolean).join(' '));
  if (wc.size && wa.some((w) => wc.has(w))) out.push('modelo');
  const ac = String(c.anio || '').replace(/\D/g, ''), aa = String(a.anio || a['año'] || '').replace(/\D/g, '');
  if (ac && aa && ac === aa) out.push('año');
  const ch = _soloAlnum(c.chasis), cha = _soloAlnum(a.chasis);
  if (ch.length >= 6 && cha.length >= 6 && ch.slice(-6) === cha.slice(-6)) out.push('chasis');
  const mo = _soloAlnum(c.motor), moa = _soloAlnum(a.motor);
  if (mo.length >= 6 && moa.length >= 6 && mo.slice(-6) === moa.slice(-6)) out.push('motor');
  return out;
}
// Vendedor → auto del stock. Nunca adivina entre dos: si hay más de un candidato, no vincula y los devuelve para elegir.
function vincularAuto(cedula, autos) {
  const c = cedula || {}, lista = (autos || []).filter((a) => a && !['vendido', 'baja'].includes(String(a.estado || '').toLowerCase().trim()));
  const nada = (candidatos) => ({ auto: null, por: null, coincide: [], candidatos: candidatos || [] });
  if (!lista.length) return nada();
  const con = lista.map((a) => ({ a, co: _coincidencias(c, a) }));
  const res = (x, por) => ({ auto: x.a, por, coincide: x.co, candidatos: [] });
  // 1) patente exacta (después de corregir confusiones de lectura)
  const exacta = con.filter((x) => x.co.includes('patente'));
  if (exacta.length === 1) return res(exacta[0], 'patente');
  // 2) patente a un carácter de distancia + misma marca (la IA leyó mal un carácter)
  const pc = patenteCanonica(c.dominio) || _soloAlnum(c.dominio);
  if (pc) {
    const aprox = con.filter((x) => { const pa = normalizarPatente(x.a.dominio); return pa && _distancia1(pc, pa) && x.co.includes('marca'); });
    if (aprox.length === 1) return res(aprox[0], 'patente_aproximada');
  }
  // 3) chasis o motor (últimos 6)
  const fierro = con.filter((x) => x.co.includes('chasis') || x.co.includes('motor'));
  if (fierro.length === 1) return res(fierro[0], 'chasis');
  // 4) similitud: marca + modelo + año, y que sea uno solo
  const sim = con.filter((x) => ['marca', 'modelo', 'año'].every((k) => x.co.includes(k)));
  if (sim.length === 1 && !normalizarPatente(sim[0].a.dominio)) return res(sim[0], 'similitud');
  if (sim.length === 1) return { auto: null, por: null, coincide: [], candidatos: [sim[0].a] }; // tiene otra patente cargada: que lo confirme una persona
  return nada(sim.map((x) => x.a));
}
function textoVinculo(v) {
  if (!v || !v.auto) return v && v.candidatos && v.candidatos.length ? 'Puede ser uno de estos autos: elegilo a mano.' : 'Ningún auto cargado coincide con esta patente ni con marca, modelo y año.';
  const n = { patente: 'patente', marca: 'marca', modelo: 'modelo', 'año': 'año', chasis: 'chasis', motor: 'motor' };
  const lista = v.coincide.map((k) => n[k]);
  const t = lista.length > 1 ? lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1] : lista[0];
  return v.por === 'patente_aproximada' ? `La patente leída difiere en un carácter; coinciden ${t}. Revisalo.` : `Coinciden ${t} con el auto del stock.`;
}

// Avisos de una carga del cliente (no frenan; los ve el responsable). dni/cedula = lo que leyó la IA; datos = lo que confirmó el cliente.
function avisosCarga({ rol, dni, cedula, datos, fotos }) {
  const out = [], d = datos || {}, f = fotos || {};
  const ok = (t) => out.push({ tipo: 'ok', texto: t }), av = (t) => out.push({ tipo: 'aviso', texto: t }), er = (t) => out.push({ tipo: 'error', texto: t });
  if (!f.dni_frente) er('Falta el frente del DNI');
  if (!f.dni_dorso) er('Falta el dorso del DNI');
  if (rol === 'vendedor' && !f.cedula) er('Falta la cédula del auto');
  const ci = cuilInfo(d.cuil, d.dni);
  if (d.cuil) (ci.ok ? ok('CUIL válido') : er(ci.motivo.replace(/: revisá.*$/, '').replace(/\.$/, '')));
  else av('Sin CUIL');
  if (dni && !dni.legible) av('La foto del DNI no se pudo leer bien');
  if (dni && dni.legible) {
    const norm = (k, x) => (k === 'dni' ? String(x).replace(/\D/g, '') : _palabrasW(x).join(' '));
    const corr = [['nombre', 'el nombre'], ['dni', 'el DNI'], ['domicilio', 'el domicilio']].filter(([k]) => dni[k] && d[k] && norm(k, dni[k]) !== norm(k, d[k]));
    corr.forEach(([, t]) => av(`Corrigió ${t} que leímos del DNI`));
  }
  if (rol === 'vendedor' && cedula && cedula.legible) {
    const tit = _palabrasW(cedula.titular), nom = new Set(_palabrasW(d.nombre));
    const docT = String(cedula.titular_documento || '').replace(/\D/g, ''), dniD = String(d.dni || '').replace(/\D/g, '');
    if ((docT && dniD && docT.endsWith(dniD)) || (tit.length && tit.filter((w) => nom.has(w)).length >= 2)) ok('Titular de la cédula = DNI');
    else if (tit.length || docT) av('El titular de la cédula no coincide con el DNI');
  }
  if (rol === 'vendedor' && cedula && !cedula.legible) av('La cédula no se pudo leer bien');
  if (!d.telefono) av('Sin celular');
  return out;
}

// Qué documentos se pueden generar con lo que hay, y qué falta en cada uno
function documentosDisponibles({ auto, vendedor, comprador, op }) {
  const a = auto || {}, v = vendedor || {}, c = comprador || {}, o = op || {};
  const falta = (pares) => pares.filter(([ok]) => !ok).map(([, t]) => t);
  const num = (x) => Number(String(x == null ? '' : x).replace(/[^\d]/g, '')) > 0;
  const docs = [
    { tipo: 'reserva', nombre: 'Reserva', falta: falta([[a.id, 'el auto'], [c.nombre && c.dni, 'el comprador'], [num(o.precio), 'el precio'], [num(o.sena), 'la seña']]) },
    { tipo: 'boleto', nombre: 'Boleto de compraventa', falta: falta([[a.id, 'el auto'], [v.nombre && v.dni, 'el vendedor'], [c.nombre && c.dni, 'el comprador'], [c.domicilio, 'el domicilio del comprador'], [num(o.precio), 'el precio'], [o.forma_pago, 'la forma de pago']]) },
    { tipo: 'mandato', nombre: 'Mandato de venta', falta: falta([[a.id, 'el auto'], [v.nombre && v.dni, 'el vendedor'], [['fijo', 'diferencia', 'porcentaje'].includes(o.tipo_mandato), 'el tipo']]) },
    { tipo: 'precarga_08', nombre: 'Precarga del 08', falta: falta([[normalizarPatente(a.dominio), 'la patente'], [a.chasis, 'el chasis']]).concat(faltaPara08(v, 'vendedor', false), faltaPara08(c, 'comprador', true)) },
  ];
  return docs.map((d) => ({ ...d, listo: !d.falta.length }));
}
function textoFalta(doc) { return doc.listo ? 'Listo' : 'Falta ' + (doc.falta.length > 1 ? doc.falta.slice(0, -1).join(', ') + ' y ' + doc.falta[doc.falta.length - 1] : doc.falta[0]); }

// CUIL probable a partir del DNI y el sexo (regla de AFIP: 20 varón / 27 mujer; si el dígito da 10 → 23 con 9 o 4)
function cuilSugerido(dni, sexo) {
  const d = String(dni || '').replace(/\D/g, '');
  const s = String(sexo || '').toUpperCase().slice(0, 1);
  if (d.length < 7 || d.length > 8 || !['M', 'F'].includes(s)) return '';
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2], cuerpo = d.padStart(8, '0');
  const dv = (pre) => { const c = pre + cuerpo; let t = 0; for (let i = 0; i < 10; i++) t += Number(c[i]) * w[i]; const r = 11 - (t % 11); return r === 11 ? 0 : r; };
  let pre = s === 'M' ? '20' : '27', v = dv(pre);
  if (v === 10) { pre = '23'; v = s === 'M' ? 9 : 4; }
  return `${pre}-${cuerpo}-${v}`;
}

// ── Stock: planilla → web (D-067). La planilla manda; la web guarda lo que solo ella sabe (patente/chasis/motor de la cédula, foto). ──
// valores = respuesta de Sheets (values: primera fila = encabezados) · actuales = filas de `autos` en Supabase de esta agencia
// → { autos: [...] (todas con las mismas claves, para el upsert), bajas: [id_unidad], planilla: [{range, values}], fotos: [{id_unidad, carpeta_id, portada_id, fuente}] }
const ESTADOS_STOCK = { disponible: 'disponible', reservado: 'reservado', 'señado': 'reservado', senado: 'reservado', vendido: 'vendido', entregado: 'vendido', oculto: 'baja', baja: 'baja' }; // oculto: no se muestra en la web
function _numero(v) { if (typeof v === 'number') return v; const s = String(v == null ? '' : v).replace(/[^\d]/g, ''); return s ? Number(s) : null; }
function _letraCol(i) { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function carpetaDeLink(t) {
  const s = String(t || '').trim();
  const m = s.match(/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || s.match(/^([A-Za-z0-9_-]{20,})$/);
  return m ? m[1] : '';
}
// Fecha de una celda de la planilla: número de serie de Sheets (UNFORMATTED_VALUE), dd/mm/aaaa o ISO → ISO; vacío o raro → null
function _fechaPlanilla(v) {
  const x = String(v == null ? '' : v).trim(); if (!x) return null;
  if (/^\d{4,5}(\.\d+)?$/.test(x)) return new Date(Date.UTC(1899, 11, 30) + Number(x) * 864e5).toISOString();
  const m = x.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1]), 12)).toISOString(); }
  const t = Date.parse(x); return isNaN(t) ? null : new Date(t).toISOString();
}
// Vendido: la fecha de la planilla (fecha_venta) si está; si no, el momento en que la copia lo ve pasar a vendido (D-079)
function stockAWeb(valores, agencia, actuales, maxFotos) {
  const filas = (valores || []), enc = (filas[0] || []).map((h) => String(h || '').trim());
  const col = (n) => enc.indexOf(n);
  const act = Object.fromEntries((actuales || []).filter((a) => a && a.id_unidad).map((a) => [String(a.id_unidad), a]));
  const autos = [], planilla = [], fotos = [], vistos = new Set();
  const t = (r, n) => { const i = col(n); return i < 0 ? '' : String(r[i] == null ? '' : r[i]).trim(); };
  filas.slice(1).forEach((r, i) => {
    const fila = i + 2; // número de fila en la planilla (la 1 son los encabezados)
    const id = t(r, 'id_unidad'); if (!id || vistos.has(id)) return;
    vistos.add(id);
    const a = act[id] || {}, extraAnt = a.extra || {};
    const estado = ESTADOS_STOCK[t(r, 'estado').toLowerCase()] || (t(r, 'estado').toLowerCase() || 'disponible');
    // patente/chasis/motor: lo de la planilla; si está vacío, lo que ya tenía la web (de una cédula aprobada) y se devuelve a la planilla
    const propio = { dominio: [t(r, 'dominio'), a.dominio], chasis: [t(r, 'nro_chasis'), a.chasis], motor: [t(r, 'nro_motor'), a.motor] };
    const cols = { dominio: 'dominio', chasis: 'nro_chasis', motor: 'nro_motor' };
    const fijo = {};
    for (const [campo, [enPlanilla, enWeb]] of Object.entries(propio)) {
      fijo[campo] = (campo === 'dominio' ? normalizarPatente(enPlanilla) || enPlanilla : enPlanilla) || enWeb || null;
      if (!enPlanilla && enWeb && col(cols[campo]) >= 0) planilla.push({ range: `inventario!${_letraCol(col(cols[campo]))}${fila}`, values: [[enWeb]] });
    }
    const carpeta = carpetaDeLink(t(r, 'carpeta_fotos')), portada = t(r, 'fotos_orden').split(',')[0].trim();
    const fuente = carpeta ? `v2|${carpeta}|${portada}` : ''; // v2: la portada sin publicar la elige la IA (antes: la primera por nombre)
    autos.push({ agencia_id: agencia, id_unidad: id, marca: t(r, 'marca') || null, modelo: t(r, 'modelo') || null, version: t(r, 'version') || null,
      anio: _numero(t(r, 'año')), km: _numero(t(r, 'km')), precio: _numero(t(r, 'precio')), moneda: (t(r, 'moneda') || 'USD').toUpperCase(),
      transmision: t(r, 'transmision') || null, potencia: t(r, 'potencia') ? t(r, 'potencia').replace(/\s*hp$/i, '') + ' HP' : null, color: t(r, 'color') || null,
      estado, dominio: fijo.dominio, chasis: fijo.chasis, motor: fijo.motor,
      extra: Object.assign({}, extraAnt, { ingreso: _fechaPlanilla(t(r, 'fecha_ingreso')) || extraAnt.ingreso || null, vendido_en: estado !== 'vendido' ? null : _fechaPlanilla(t(r, 'fecha_venta')) || extraAnt.vendido_en || (a.estado && a.estado !== 'vendido' && a.estado !== 'baja' ? new Date().toISOString() : null), tipo: t(r, 'tipo') || extraAnt.tipo || null, combustible: t(r, 'combustible') || extraAnt.combustible || null, traccion: t(r, 'traccion') || extraAnt.traccion || null, carpeta_fotos: carpeta || null, ig_link: t(r, 'ig_link') || null, publicado_ig: t(r, 'publicado_ig') || null, fila }),
      actualizado: new Date().toISOString() });
    if (fuente && fuente !== extraAnt.foto_fuente && fotos.length < (maxFotos || 10)) fotos.push({ id_unidad: id, carpeta_id: carpeta, portada_id: portada, fuente });
  });
  const bajas = Object.values(act).filter((a) => !vistos.has(String(a.id_unidad)) && a.estado !== 'baja').map((a) => String(a.id_unidad));
  return { autos, bajas, planilla, fotos, encabezados_ok: col('id_unidad') >= 0 };
}
// Cargar un auto desde el panel (D-078): fila nueva para la planilla (en el orden de SUS encabezados) + la misma fila para la web al instante.
// valores: la pestaña completa (fila 1 = encabezados). Número siguiente: el más alto con el prefijo + 1 (HA-012 → HA-013).
function autoAPlanilla(valores, auto, prefijo, agencia) {
  const filas = valores || [], enc = (filas[0] || []).map((h) => String(h || '').trim()), a = auto || {}, pre = prefijo || 'AU-';
  if (enc.indexOf('id_unidad') < 0) return { error: 'La planilla no tiene la columna id_unidad.' };
  const faltan = ['marca', 'modelo', 'anio'].filter((k) => !String(a[k] == null ? '' : a[k]).trim());
  if (faltan.length) return { error: 'Faltan datos: ' + faltan.join(', ').replace('anio', 'año') + '.' };
  const iId = enc.indexOf('id_unidad'), re = new RegExp('^' + pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$', 'i');
  let max = 0;
  for (const r of filas.slice(1)) { const m = String((r || [])[iId] || '').trim().match(re); if (m) max = Math.max(max, Number(m[1])); }
  const id = pre + String(max + 1).padStart(3, '0');
  const t = (v) => String(v == null ? '' : v).trim();
  const dominio = normalizarPatente(t(a.dominio)) || '', carpeta = carpetaDeLink(t(a.carpeta_fotos));
  const val = { id_unidad: id, marca: t(a.marca), modelo: t(a.modelo), version: t(a.version), 'año': _numero(a.anio) || '', km: _numero(a.km) == null ? '' : _numero(a.km),
    precio: _numero(a.precio) || '', moneda: (t(a.moneda) || 'USD').toUpperCase(), transmision: t(a.transmision), combustible: t(a.combustible),
    potencia: _numero(a.potencia) || '', color: t(a.color), estado: 'disponible', dominio, carpeta_fotos: t(a.carpeta_fotos), tipo: t(a.categoria), fuente: 'panel' };
  const fila = enc.map((h) => (Object.prototype.hasOwnProperty.call(val, h) ? val[h] : ''));
  const web = { agencia_id: agencia, id_unidad: id, marca: val.marca, modelo: val.modelo, version: val.version || null, anio: _numero(a.anio), km: val.km === '' ? null : val.km,
    precio: val.precio || null, moneda: val.moneda, transmision: val.transmision || null, potencia: val.potencia ? val.potencia + ' HP' : null, color: val.color || null,
    estado: 'disponible', dominio: dominio || null, extra: { carpeta_fotos: carpeta || null, tipo: val.tipo || null, combustible: val.combustible || null, fila: filas.length + 1, cargado: 'panel' },
    actualizado: new Date().toISOString() };
  return { id_unidad: id, fila, web };
}
// De la lista de imágenes de la carpeta: la portada elegida al publicar (fotos_orden) si sigue ahí; si no, la primera por nombre
function elegirPortada(archivos, portadaId) {
  const imgs = (archivos || []).filter((f) => f && f.id);
  return (portadaId && imgs.find((f) => f.id === portadaId)) || imgs[0] || null;
}
// Qué portadas se resuelven sin IA y cuál necesita que la IA ordene las fotos (UNA por vuelta, para no gastar):
//   publicado (fotos_orden) → su primera foto · carpeta con una sola foto → esa · si no → la IA ordena como para publicar y va la primera
function planPortada(pedidos, listados) {
  const directos = []; let ia = null;
  (pedidos || []).forEach((p, k) => {
    const imgs = (((listados || [])[k] || {}).files || []).filter((f) => f && f.id);
    if (!imgs.length) return;
    const pub = p.portada_id && imgs.find((f) => f.id === p.portada_id);
    if (pub || imgs.length === 1) { directos.push({ ...p, archivo_id: (pub || imgs[0]).id, metodo: pub ? 'publicacion' : 'unica' }); return; }
    if (!ia) ia = { ...p, fotos: imgs.slice(0, 20).map((f) => ({ id: f.id, name: f.name, time: (f.imageMediaMetadata || {}).time || null, createdTime: f.createdTime || null })) };
  });
  return { directos, ia };
}

// ── Documentos desde el panel (D-073): operación de Supabase → mismas "respuestas" del formulario → armarDocumento (documentos_core) ──
// Así el texto legal, los montos en letras y las validaciones son EXACTAMENTE los ya probados con los documentos reales.
const DOC_CON_PLANTILLA = ['reserva', 'boleto'];
const DOCS_GENERABLES = ['reserva', 'boleto', 'precarga_08']; // el 08 no usa plantilla: se arma un documento nuevo con sus datos
// Empresa en reserva/boleto: firma su representante "en representación de <razón social> (CUIT …)"
function firmanteDe(p) {
  const x = p || {};
  if (x.tipo !== 'juridica') return { tratamiento: tratamientoDe(x), nombre: x.nombre, dni: x.dni, domicilio: x.domicilio, cuil: x.cuil };
  const r = x.representante || {}, cuit = cuitInfo(x.cuit).formateado || x.cuit || '';
  return { tratamiento: tratamientoDe(r), nombre: [r.nombre, 'en representación de ' + x.nombre + (cuit ? ' (CUIT ' + cuit + ')' : '')].filter(Boolean).join(', '), dni: r.dni, domicilio: x.domicilio, cuil: r.cuil };
}
function tratamientoDe(p) {
  const s = String((p && p.sexo) || '').toUpperCase(), c = String((p && p.cuil) || '').replace(/\D/g, '').slice(0, 2);
  return s === 'F' || c === '27' ? 'Sra.' : 'Sr.';
}
function _autoDoc(a) {
  return { id_unidad: a.id_unidad, marca: a.marca, modelo: a.modelo, version: a.version, 'año': a.anio, km: a.km, precio: a.precio, moneda: a.moneda || 'USD',
    dominio: a.dominio, estado: ['disponible', 'reservado'].includes(a.estado) ? a.estado : 'disponible' };
}
// → { docs: [{ tipo, ok, errores, titulo, nombre, n, requests, resumen }], carpeta } · nBase = último N° usado en la pestaña operaciones
function documentosWeb({ op, auto, comprador, vendedor, tipos, cfg, nBase }) {
  const o = op || {}, a = auto || {}, c = comprador || {}, vdef = ((cfg && cfg.documentos) || {}).vendedor_por_defecto || {};
  const v = vendedor && vendedor.nombre ? firmanteDe(vendedor) : vdef;
  const comp = firmanteDe(c);
  const pago = String(o.forma_pago || '');
  const r = {
    [L.auto]: etiquetaAuto(_autoDoc(a)), [L.fecha]: String(o.fecha || '').slice(0, 10), [L.patente]: '', [L.precio]: o.precio != null ? String(o.precio) : '', [L.moneda]: o.moneda || a.moneda || 'USD',
    [L.comprador]: c.nombre ? etiquetaComprador(comp) : '',
    [L.reserva]: o.sena != null ? String(o.sena) : '', [L.monedaReserva]: o.moneda_sena || 'ARS',
    [L.pago]: !pago || /billetes de cien/i.test(pago) ? PAGO_SIEMPRE : PAGO_OTRA, [L.pagoOtra]: /billetes de cien/i.test(pago) ? '' : pago,
    [L.vTrat]: v.tratamiento || 'Sr.', [L.vNombre]: v.nombre || '', [L.vDni]: v.dni || '', [L.vDom]: v.domicilio || '',
    [L.hora]: o.hora_entrega != null ? String(o.hora_entrega) : '13', [L.pagoBoleto]: o.forma_pago_boleto || 'de contado efectivo',
  };
  let n = Number(nBase) || 0;
  const docs = (tipos || []).filter((t) => DOCS_GENERABLES.includes(t)).map((tipo) => {
    if (tipo === 'precarga_08') {
      const p8 = precarga08({ op: o, auto: a, vendedor, comprador: c, agencia: (cfg && cfg.agencia) || 'HAY AUTOS' });
      const num = String(++n).padStart(4, '0');
      return { tipo, ok: p8.ok, errores: p8.faltan.map((x) => 'Falta ' + x + '.'), titulo: 'Precarga 08 N° ' + num,
        nombre: [num, String(o.fecha || '').slice(0, 10), 'Precarga 08', formatoPatente(a.dominio), c.nombre].filter(Boolean).join(' - '), n, requests: p8.requests, sin_plantilla_doc: true,
        resumen: { tipo, id_unidad: a.id_unidad, dominio: normalizarPatente(a.dominio) || '', comprador: c.nombre, dni: c.dni || c.cuit || '', cuil: c.cuil || '', precio: o.precio, moneda: o.moneda || 'USD', fecha: String(o.fecha || '').slice(0, 10), vendedor: v.nombre || '' } };
    }
    const d = armarDocumento(tipo, r, [_autoDoc(a)], c.nombre ? [comp] : [], cfg);
    if (!c.nombre) d.errores.unshift('Falta elegir el comprador.');
    const num = String(++n).padStart(4, '0');
    const titulo = (tipo === 'boleto' ? 'Boleto' : 'Reserva') + ' N° ' + num;
    const nombre = [num, d.resumen.fecha, tipo === 'boleto' ? 'Boleto' : 'Reserva', d.resumen.dominio, d.resumen.comprador].filter(Boolean).join(' - ');
    const requests = Object.entries(d.reemplazos).map(([k, val]) => ({ replaceAllText: { containsText: { text: '{{' + k + '}}', matchCase: true }, replaceText: String(val == null ? '' : val) } }));
    return { tipo, ok: !d.errores.length, errores: d.errores, titulo, nombre, n: n, requests, resumen: d.resumen };
  });
  const carpeta = [docs.length ? String(docs[0].n).padStart(4, '0') : '', String(o.fecha || '').slice(0, 10), formatoPatente(a.dominio), c.nombre].filter(Boolean).join(' - ');
  return { docs, carpeta, sin_plantilla: (tipos || []).filter((t) => !DOCS_GENERABLES.includes(t)) };
}

// ── Personas jurídicas, estado civil, cónyuge y precarga del 08 (pedido interno 23/10) ──────────────
// Persona (fila de `personas`): { tipo: 'fisica'|'juridica', nombre, dni, cuil, cuit, domicilio, estado_civil, conyuge: {nombre, dni}, representante: {nombre, dni, cuil, cargo}, relacion }
const ESTADOS_CIVILES = ['Soltero/a', 'Casado/a', 'Divorciado/a', 'Viudo/a', 'Unión convivencial'];
const CARGOS_EMPRESA = ['Presidente', 'Socio gerente', 'Apoderado', 'Director', 'Otro'];
const conConyuge = (ec) => /casad|convivencial/i.test(String(ec || ''));
// CUIT de empresa: 30, 33 o 34 + 8 dígitos + verificador (módulo 11)
function cuitInfo(cuit) {
  const c = String(cuit || '').replace(/\D/g, '');
  if (c.length !== 11) return { ok: false, motivo: 'El CUIT tiene que tener 11 números.' };
  if (!['30', '33', '34'].includes(c.slice(0, 2))) return { ok: false, motivo: 'El CUIT de una empresa empieza con 30, 33 o 34.' };
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let s = 0; for (let i = 0; i < 10; i++) s += Number(c[i]) * w[i];
  let dv = 11 - (s % 11); if (dv === 11) dv = 0;
  if (dv === 10 || dv !== Number(c[10])) return { ok: false, motivo: 'El CUIT no es válido (no da el dígito verificador): revisá los números.' };
  return { ok: true, formateado: `${c.slice(0, 2)}-${c.slice(2, 10)}-${c[10]}` };
}
// Avisos extra de la carga (se suman a avisosCarga): empresa, estado civil, cónyuge, relación con el titular
function avisosCargaExtra({ rol, datos }) {
  const out = [], d = datos || {};
  const ok = (t) => out.push({ tipo: 'ok', texto: t }), av = (t) => out.push({ tipo: 'aviso', texto: t }), er = (t) => out.push({ tipo: 'error', texto: t });
  if (d.tipo_persona === 'juridica') {
    const c = cuitInfo(d.cuit);
    if (!d.razon_social) er('Falta la razón social');
    if (!d.cuit) er('Falta el CUIT de la empresa'); else (c.ok ? ok('CUIT de la empresa válido') : er('CUIT de la empresa inválido'));
    if (!d.cargo) av('Falta el cargo del representante');
  } else if (rol !== 'otro') {
    if (!d.estado_civil) av('Falta el estado civil');
    else if (conyuge(d) === 'falta') av('Casado/a: faltan los datos del cónyuge');
  }
  if (rol === 'otro' && !d.titular_nombre) av('No dijo de quién es ' + (d.relacion || 'cónyuge/cotitular/apoderado'));
  return out;
}
function conyuge(d) { return !conConyuge(d.estado_civil) ? 'no' : (d.conyuge_nombre && String(d.conyuge_dni || '').replace(/\D/g, '').length >= 7 ? 'ok' : 'falta'); }
// Qué le falta a una persona para el 08 (vendedor o comprador)
function faltaPara08(p, quien, conDomicilio) {
  const x = p || {}, f = [];
  if (!x.nombre) return ['el ' + quien];
  if (x.tipo === 'juridica') {
    if (!cuitInfo(x.cuit).ok) f.push('el CUIT del ' + quien);
    if (!(x.representante && x.representante.nombre)) f.push('el representante del ' + quien);
  } else {
    if (!formatoDni(x.dni)) f.push('el DNI del ' + quien);
    if (!x.cuil) f.push('el CUIL del ' + quien);
    if (!x.estado_civil) f.push('el estado civil del ' + quien);
    else if (conConyuge(x.estado_civil) && !(x.conyuge && x.conyuge.nombre && x.conyuge.dni)) f.push('los datos del cónyuge del ' + quien);
  }
  if (conDomicilio && !x.domicilio) f.push('el domicilio del ' + quien);
  return f;
}
// Precarga del 08: los datos que pide el formulario, ordenados como el trámite → requests de Google Docs (documento nuevo, sin plantilla)
function precarga08({ op, auto, vendedor, comprador, agencia }) {
  const a = auto || {}, v = vendedor || {}, c = comprador || {};
  const faltan = [];
  if (!normalizarPatente(a.dominio)) faltan.push('la patente');
  if (!a.chasis) faltan.push('el número de chasis (de la cédula aprobada)');
  faltan.push(...faltaPara08(v, 'vendedor', false), ...faltaPara08(c, 'comprador', true));
  const persona = (p) => (p.tipo === 'juridica'
    ? [['Razón social', p.nombre], ['CUIT', (cuitInfo(p.cuit).formateado || p.cuit || '')], ['Representante', [p.representante && p.representante.nombre, p.representante && p.representante.cargo].filter(Boolean).join(' · ')],
      ['DNI del representante', formatoDni(p.representante && p.representante.dni) || '']]
    : [['Nombre y apellido', p.nombre], ['Documento', 'DNI ' + (formatoDni(p.dni) || '')], ['CUIL', p.cuil || ''], ['Estado civil', p.estado_civil || ''],
      ...(conConyuge(p.estado_civil) ? [['Cónyuge', [p.conyuge && p.conyuge.nombre, p.conyuge && p.conyuge.dni ? 'DNI ' + (formatoDni(p.conyuge.dni) || p.conyuge.dni) : ''].filter(Boolean).join(' · ')]] : [])]);
  const chasis = String(a.chasis || '').replace(/\s+/g, ' ').trim();
  const bloques = [
    ['1. Datos del vehículo', [['Patente (dominio)', formatoPatente(a.dominio)], ['Número de chasis', chasis], ['Últimos 7 del chasis', chasis.replace(/[^A-Z0-9]/gi, '').slice(-7).toUpperCase()],
      ['Marca y modelo', [a.marca, a.modelo, a.version].filter(Boolean).join(' ')], ['Año', a.anio ? String(a.anio) : '']]],
    ['2. Vendedor' + (v.tipo === 'juridica' ? ' (persona jurídica)' : ' (persona física)'), persona(v)],
    ['3. Comprador' + (c.tipo === 'juridica' ? ' (persona jurídica)' : ' (persona física)'), [...persona(c), ['Domicilio actual', c.domicilio || '']]],
  ];
  if (v.relacion && v.relacion.tipo === 'apoderado') bloques.push(['Apoderado del vendedor', [['Nombre', v.relacion.nombre || ''], ['DNI', formatoDni(v.relacion.dni) || '']]]);
  // Texto + estilos: título, subtítulos en negrita y "Campo: valor"
  let texto = '', estilos = [];
  const linea = (t, estilo) => { const ini = texto.length; texto += t + '\n'; if (estilo) estilos.push({ ini, fin: ini + t.length, estilo }); };
  linea('Precarga del formulario 08 — ' + (agencia || 'HAY AUTOS'), 'titulo');
  linea('Operación del ' + (fechaPartes(op && op.fecha) || {}).corta + '. Datos para cargar en el 08 digital (DNRPA). Revisar contra la documentación original.', null);
  linea('', null);
  for (const [tit, filas] of bloques) {
    linea(tit, 'subtitulo');
    for (const [k, val] of filas) { const ini = texto.length; linea(k + ': ' + (val || '— FALTA —'), null); estilos.push({ ini, fin: ini + k.length + 1, estilo: 'negrita' }); }
    linea('', null);
  }
  // Índices de Google Docs: el texto empieza en 1 y cuentan unidades UTF-16 (como .length de JS)
  const requests = [{ insertText: { location: { index: 1 }, text: texto } }].concat(estilos.map((e) => (e.estilo === 'negrita'
    ? { updateTextStyle: { range: { startIndex: 1 + e.ini, endIndex: 1 + e.fin }, textStyle: { bold: true }, fields: 'bold' } }
    : { updateParagraphStyle: { range: { startIndex: 1 + e.ini, endIndex: 1 + e.fin }, paragraphStyle: { namedStyleType: e.estilo === 'titulo' ? 'HEADING_1' : 'HEADING_2' }, fields: 'namedStyleType' } })));
  return { ok: !faltan.length, faltan, texto, requests };
}

// ── Lectura de documentos en n8n (D-077): un solo pedido a la IA para DNI y cédula, y token de confirmación ──
const PROMPT_DOCS = 'Te paso fotos de documentos argentinos: las dos primeras son el DNI (frente y dorso) y, si hay una tercera, es la cédula del auto (verde o azul) o el título. '
  + 'Copiá EXACTAMENTE lo que se lee, sin inventar ni completar. Si algo no se lee, dejalo vacío. Respondé SOLO con JSON: '
  + '{"dni":{"apellido":"","nombres":"","dni":"","sexo":"","fecha_nacimiento":"AAAA-MM-DD","domicilio":"","cuil":"","legible":true},'
  + '"cedula":{"dominio":"","marca":"","modelo":"","tipo":"","anio":"","motor_marca":"","motor_numero":"","chasis_marca":"","chasis_numero":"","titular":"","titular_documento":"","legible":true}}';
// Respuesta combinada de la IA → { dni, cedula } con las mismas reglas de leerDNI/leerCedula (patente corregida por posición)
function leerDocumentos(texto, hayCedula) {
  const j = _json(texto) || {};
  const dni = (j.dni && leerDNI(JSON.stringify(j.dni))) || { legible: false };
  let cedula = null;
  if (hayCedula) {
    const c = j.cedula || {};
    cedula = Object.assign(leerCedula(JSON.stringify(c)) || { legible: false }, { titular: String(c.titular || '').trim(), titular_documento: String(c.titular_documento || '').trim() });
    if (!cedula.dominio && c.dominio) { cedula.dominio = patenteCanonica(c.dominio) || ''; if (cedula.dominio) cedula.legible = true; }
  }
  return { dni, cedula };
}
// SHA-256 en JavaScript puro (el token del cliente se guarda solo como hash; igual que crypto.subtle de la función de Supabase)
function sha256Hex(texto) {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
    0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const b = unescape(encodeURIComponent(String(texto))), bytes = [];
  for (let i = 0; i < b.length; i++) bytes.push(b.charCodeAt(i));
  const l = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (l >>> (i * 8)) & 0xff);
  let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const r = (x, n) => (x >>> n) | (x << (32 - n)), w = new Array(64);
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = (bytes[i + 4 * t] << 24) | (bytes[i + 4 * t + 1] << 16) | (bytes[i + 4 * t + 2] << 8) | bytes[i + 4 * t + 3];
    for (let t = 16; t < 64; t++) { const s0 = r(w[t - 15], 7) ^ r(w[t - 15], 18) ^ (w[t - 15] >>> 3), s1 = r(w[t - 2], 17) ^ r(w[t - 2], 19) ^ (w[t - 2] >>> 10); w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0; }
    let [a, bb, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    h = h.map((x, k) => (x + [a, bb, c, d, e, f, g, hh][k]) | 0);
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

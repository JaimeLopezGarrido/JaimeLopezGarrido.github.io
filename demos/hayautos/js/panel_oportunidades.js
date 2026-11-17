// Panel: Inicio (tablero), Radar (buscan · autos de particulares · matches), interesados, cargar auto / persona (D-078, D-079).
// La lógica de puntaje vive en matches_core.js (probada con jsc). Acá solo pantallas y guardado (Supabase con la sesión; n8n para la planilla).
export function crearOportunidades(ctx) {
  const { sb, yo, CFG, $, esc, toast, fallo, encabezado, icono, nombreAuto, precio, fechaCorta } = ctx;
  let catalogo = null;
  const cat = async () => catalogo || (catalogo = catalogoMatches(await (await fetch('../js/catalogo.json')).json()));
  const CAT = CATEGORIAS, FLEX = FLEXIBILIDADES;
  const opt = (lista, sel, vacio) => (vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : '') + lista.map(([v, t]) => `<option value="${esc(v)}"${String(sel) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const TRANS = [['manual', 'Manual'], ['automatica', 'Automática']], COMB = [['nafta', 'Nafta'], ['diesel', 'Diésel'], ['gnc', 'GNC'], ['hibrido', 'Híbrido'], ['electrico', 'Eléctrico']];
  const TRAC = [['4x2', '4x2'], ['4x4', '4x4']], PUERTAS = [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], MON = [['USD', 'USD'], ['ARS', 'ARS']];
  const num = (v) => { const s = String(v == null ? '' : v).replace(/[^\d]/g, ''); return s ? Number(s) : null; };
  const val = (f, k) => ((f.elements[k] && f.elements[k].value) || '').trim();
  const sesion = async () => (await sb.auth.getSession()).data.session;

  // ── Ventana (modal) reutilizable ──
  function ventana(titulo, cuerpoHtml, { onSubmit, boton = 'Guardar', ancho = 640 } = {}) {
    const d = document.createElement('dialog');
    d.style.cssText = `width: min(${ancho}px, 94vw); max-height: 92vh; border: none; border-radius: 12px; padding: 0; box-shadow: var(--shadow-card);`;
    d.innerHTML = `<form method="dialog" class="stack" style="gap: 16px; padding: 20px; font-family: var(--font);">
      <div class="row" style="justify-content: space-between;"><h2>${esc(titulo)}</h2><button type="button" class="btn btn-ghost" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="stack" style="gap: 14px;">${cuerpoHtml}</div>
      <div class="aviso-caja aviso-error" data-error hidden></div>
      ${onSubmit ? `<div class="row" style="justify-content: flex-end;"><button type="button" class="btn btn-ghost" data-cerrar>Cancelar</button><button class="btn btn-primary" data-ok>${esc(boton)}</button></div>` : ''}</form>`;
    document.body.appendChild(d);
    const f = d.querySelector('form'), err = d.querySelector('[data-error]');
    d.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => d.close()));
    d.addEventListener('close', () => d.remove());
    if (onSubmit) f.addEventListener('submit', async (e) => {
      e.preventDefault(); err.hidden = true; const b = d.querySelector('[data-ok]'); b.disabled = true; const t = b.textContent; b.innerHTML = '<span class="cargando" aria-hidden="true"></span>';
      try { const r = await onSubmit(f); if (r !== false) d.close(); } catch (x) { err.textContent = x.message || String(x); err.hidden = false; }
      b.disabled = false; b.textContent = t;
    });
    d.showModal();
    return { d, f };
  }
  // WhatsApp con el mensaje editable antes de mandar; al mandar puede marcar el match como contactado
  function whatsapp(tel, texto, alMandar) {
    const { d, f } = ventana('Mensaje por WhatsApp', `<label class="campo"><span class="label">Para ${esc(tel || 'sin número')}</span>
      <textarea class="input" name="t" rows="6" style="padding: 12px; min-height: 140px; resize: vertical;">${esc(texto)}</textarea></label>
      <p class="caption">Revisalo y cambiá lo que quieras. Se abre WhatsApp con el mensaje listo para mandar.</p>`, { boton: 'Abrir WhatsApp', onSubmit: async (form) => {
      const url = linkWhatsApp(tel, val(form, 't'));
      if (!url) throw new Error('Ese número no parece un celular argentino: revisalo en la ficha.');
      window.open(url, '_blank', 'noopener'); if (alMandar) await alMandar();
    } });
    return { d, f };
  }

  // ── Datos ──
  // Los datos del stock que no son columnas de `autos` (tipo, combustible, tracción) vienen de la planilla en `extra`
  const deStock = (x) => { const e = x.extra || {}; return { ...x, tipo: e.tipo, combustible: e.combustible, traccion: e.traccion }; };
  // Una sola lectura por pantalla (el contador del menú y la vista la comparten); ruta() la olvida al cambiar
  let memo = null;
  const olvidar = () => { memo = null; };
  function cargarTodo() { return memo || (memo = leerTodo().catch((x) => { memo = null; throw x; })); }
  async function leerTodo() {
    const [b, o, a, e, p] = await Promise.all([
      sb.from('busquedas').select('*').eq('agencia_id', yo.agencia).order('creado', { ascending: false }),
      sb.from('ofertas_externas').select('*').eq('agencia_id', yo.agencia).order('creado', { ascending: false }),
      sb.from('autos').select('*').eq('agencia_id', yo.agencia).in('estado', ['disponible', 'reservado']),
      sb.from('match_estados').select('clave,estado').eq('agencia_id', yo.agencia),
      sb.from('personas').select('id,nombre,telefono').eq('agencia_id', yo.agencia),
    ]);
    for (const r of [b, o, a, e]) if (r.error) throw r.error;
    const C = await cat();
    const vehiculos = (a.data || []).map((x) => vehiculoDe(deStock(x), 'stock', C))
      .concat((o.data || []).filter((x) => x.estado === 'activa').map((x) => vehiculoDe({ ...x, tipo: x.categoria }, 'afuera', C)));
    const estados = Object.fromEntries((e.data || []).map((x) => [x.clave, x]));
    const activas = (b.data || []).filter((x) => x.estado === 'activa');
    return { C, busquedas: b.data || [], ofertas: o.data || [], autos: a.data || [], personas: p.data || [], vehiculos, estados, matches: matchesDe(activas, vehiculos, C, estados) };
  }
  async function contarMatchesNuevos() { try { return (await cargarTodo()).matches.filter((m) => m.estado === 'nuevo').length; } catch (_) { return 0; } }
  async function marcarMatch(clave, estado) {
    const { error } = await sb.from('match_estados').upsert({ agencia_id: yo.agencia, clave, estado, actualizado: new Date().toISOString() }, { onConflict: 'agencia_id,clave' });
    if (error) throw error;
  }

  // ── Formularios de búsqueda y de auto de afuera (los mismos campos que el link de clientes) ──
  const campoSel = (label, name, lista, sel, vacio = 'Me da igual') => `<label class="campo"><span class="label">${label}</span><select class="input" name="${name}">${opt(lista, sel ?? '', vacio)}</select></label>`;
  const campo = (label, name, v, extra = '') => `<label class="campo"><span class="label">${label}</span><input class="input" name="${name}" value="${esc(v ?? '')}" ${extra}></label>`;
  function formBusqueda(b = {}) {
    return `<div class="grid2">${campo('Nombre', 'nombre', b.nombre)}${campo('WhatsApp', 'telefono', b.telefono, 'type="tel" placeholder="11 1234-5678"')}</div>
      <p class="caption">Completá solo lo que le importa: lo que quede vacío, le da igual.</p>
      <div class="grid2">${campo('Marca', 'marca', b.marca, 'placeholder="Ej. Toyota"')}${campo('Modelo', 'modelo', b.modelo, 'placeholder="Ej. Hilux"')}</div>
      <div class="grid2">${campoSel('Flexibilidad', 'flexibilidad', FLEX, b.flexibilidad || 'similares', undefined)}${campoSel('Tipo de auto', 'categoria', CAT, b.categoria, 'Sin elegir')}</div>
      <div class="grid2">${campo('Versión', 'version', b.version, 'placeholder="Ej. GTI, SRV"')}${campo('Color (uno o varios, con coma)', 'colores', (b.colores || []).join(', '), 'placeholder="Ej. gris, negro"')}</div>
      <div class="grid2">${campo('Año desde', 'anio_min', b.anio_min, 'inputmode="numeric"')}${campo('Año hasta', 'anio_max', b.anio_max, 'inputmode="numeric"')}</div>
      <div class="grid2">${campo('Km máximo', 'km_max', b.km_max, 'inputmode="numeric"')}<label class="campo"><span class="label">Presupuesto máximo</span><span class="row" style="flex-wrap: nowrap; gap: 6px;"><select class="input" name="moneda" style="width: 84px;">${opt(MON, b.moneda || 'USD')}</select><input class="input" name="presupuesto" inputmode="numeric" value="${esc(b.presupuesto ?? '')}"></span></label></div>
      <div class="grid2">${campoSel('Transmisión', 'transmision', TRANS, b.transmision)}${campoSel('Combustible', 'combustible', COMB, b.combustible)}</div>
      <div class="grid2">${campoSel('Tracción', 'traccion', TRAC, b.traccion)}${campoSel('Puertas', 'puertas', PUERTAS, b.puertas)}</div>
      ${campo('Notas', 'notas', b.notas, 'placeholder="Ej. alemán sí o sí, para trabajar"')}`;
  }
  function filaBusqueda(f) {
    const r = { nombre: val(f, 'nombre'), telefono: val(f, 'telefono'), marca: val(f, 'marca') || null, modelo: val(f, 'modelo') || null, version: val(f, 'version') || null,
      flexibilidad: val(f, 'flexibilidad') || 'similares', categoria: val(f, 'categoria') || null, anio_min: num(val(f, 'anio_min')), anio_max: num(val(f, 'anio_max')),
      km_max: num(val(f, 'km_max')), presupuesto: num(val(f, 'presupuesto')), moneda: val(f, 'moneda') || 'USD', transmision: val(f, 'transmision') || null,
      combustible: val(f, 'combustible') || null, traccion: val(f, 'traccion') || null, puertas: num(val(f, 'puertas')),
      colores: val(f, 'colores') ? val(f, 'colores').split(/[,/]| y /).map((c) => c.trim()).filter(Boolean) : null, notas: val(f, 'notas') || null };
    if (!r.nombre) throw new Error('Falta el nombre.');
    if (!r.marca && !r.modelo && !r.categoria) throw new Error('Poné un modelo o un tipo de auto.');
    if (r.flexibilidad === 'categoria' && !r.categoria) throw new Error('Elegí el tipo de auto (o cambiá la flexibilidad).');
    return r;
  }
  function formOferta(o = {}) {
    return `<div class="grid2">${campo('Dueño', 'nombre', o.nombre)}${campo('WhatsApp', 'telefono', o.telefono, 'type="tel" placeholder="11 1234-5678"')}</div>
      <div class="grid2">${campo('Marca', 'marca', o.marca)}${campo('Modelo', 'modelo', o.modelo)}</div>
      <div class="grid2">${campo('Versión', 'version', o.version)}${campoSel('Tipo de auto', 'categoria', CAT, o.categoria, 'Sin elegir')}</div>
      <div class="grid2">${campo('Año', 'anio', o.anio, 'inputmode="numeric"')}${campo('Km', 'km', o.km, 'inputmode="numeric"')}</div>
      <div class="grid2">${campo('Color', 'color', o.color)}<label class="campo"><span class="label">Precio que pide</span><span class="row" style="flex-wrap: nowrap; gap: 6px;"><select class="input" name="moneda" style="width: 84px;">${opt(MON, o.moneda || 'USD')}</select><input class="input" name="precio" inputmode="numeric" value="${esc(o.precio ?? '')}"></span></label></div>
      <div class="grid2">${campoSel('Transmisión', 'transmision', TRANS, o.transmision, 'Sin dato')}${campoSel('Combustible', 'combustible', COMB, o.combustible, 'Sin dato')}</div>
      <div class="grid2">${campoSel('Tracción', 'traccion', TRAC, o.traccion, 'Sin dato')}${campoSel('Puertas', 'puertas', PUERTAS, o.puertas, 'Sin dato')}</div>
      ${campoSel('¿Puede dejarlo en la agencia?', 'puede_dejarlo', [['charlar', 'A charlar'], ['si', 'Sí'], ['no', 'No, lo tiene que usar']], o.puede_dejarlo || 'charlar', undefined)}
      ${campo('Notas', 'notas', o.notas)}`;
  }
  function filaOferta(f) {
    const r = { nombre: val(f, 'nombre'), telefono: val(f, 'telefono'), marca: val(f, 'marca'), modelo: val(f, 'modelo'), version: val(f, 'version') || null, categoria: val(f, 'categoria') || null,
      anio: num(val(f, 'anio')), km: num(val(f, 'km')), color: val(f, 'color') || null, precio: num(val(f, 'precio')), moneda: val(f, 'moneda') || 'USD',
      transmision: val(f, 'transmision') || null, combustible: val(f, 'combustible') || null, traccion: val(f, 'traccion') || null, puertas: num(val(f, 'puertas')),
      puede_dejarlo: val(f, 'puede_dejarlo') || 'charlar', notas: val(f, 'notas') || null };
    if (!r.nombre || !r.marca || !r.modelo) throw new Error('Faltan el dueño, la marca o el modelo.');
    return r;
  }
  function abrirBusqueda(b, alGuardar) {
    ventana(b ? 'Editar búsqueda' : 'Sumar persona que busca', formBusqueda(b || {}), { onSubmit: async (f) => {
      const fila = filaBusqueda(f);
      const { error } = b ? await sb.from('busquedas').update(fila).eq('id', b.id) : await sb.from('busquedas').insert({ ...fila, agencia_id: yo.agencia, origen: 'panel' });
      if (error) throw error; toast(b ? 'Búsqueda actualizada' : 'Sumada al Radar'); alGuardar && alGuardar();
    } });
  }
  function abrirOferta(o, alGuardar) {
    ventana(o ? 'Editar auto de particular' : 'Sumar auto de particular', formOferta(o || {}), { onSubmit: async (f) => {
      const fila = filaOferta(f);
      const { error } = o ? await sb.from('ofertas_externas').update(fila).eq('id', o.id) : await sb.from('ofertas_externas').insert({ ...fila, agencia_id: yo.agencia, origen: 'panel' });
      if (error) throw error; toast(o ? 'Datos actualizados' : 'Auto de particular sumado al Radar'); alGuardar && alGuardar();
    } });
  }

  // ── Cargar auto al stock (se escribe en la planilla con n8n; aparece al instante en la web) ──
  function abrirAuto(previo = {}, { oferta, alGuardar } = {}) {
    const p = previo;
    ventana(oferta ? 'Pasar al stock de la agencia' : 'Cargar auto al stock', `
      <div class="grid2">${campo('Marca', 'marca', p.marca)}${campo('Modelo', 'modelo', p.modelo)}</div>
      <div class="grid2">${campo('Versión', 'version', p.version)}${campoSel('Tipo de auto', 'categoria', CAT, p.categoria, 'Sin elegir')}</div>
      <div class="grid2">${campo('Año', 'anio', p.anio, 'inputmode="numeric"')}${campo('Km', 'km', p.km, 'inputmode="numeric"')}</div>
      <div class="grid2">${campo('Color', 'color', p.color)}<label class="campo"><span class="label">Precio de venta</span><span class="row" style="flex-wrap: nowrap; gap: 6px;"><select class="input" name="moneda" style="width: 84px;">${opt(MON, p.moneda || 'USD')}</select><input class="input" name="precio" inputmode="numeric" value="${esc(p.precio ?? '')}"></span></label></div>
      <div class="grid2">${campoSel('Transmisión', 'transmision', TRANS, p.transmision, 'Sin dato')}${campoSel('Combustible', 'combustible', COMB, p.combustible, 'Sin dato')}</div>
      <div class="grid2">${campo('Potencia (HP)', 'potencia', p.potencia, 'inputmode="numeric"')}${campo('Patente', 'dominio', p.dominio, 'style="text-transform: uppercase;"')}</div>
      ${campo('Link de la carpeta de fotos en Drive (opcional)', 'carpeta_fotos', '', 'placeholder="https://drive.google.com/drive/folders/…"')}
      <p class="caption">Se agrega a la planilla de stock como disponible (con el próximo número HA-…) y aparece en la web al instante. Para publicarlo en Instagram, después cargá las fotos y tocá Publicar.</p>`,
    { boton: oferta ? 'Pasar al stock' : 'Cargar auto', onSubmit: async (f) => {
      const auto = { marca: val(f, 'marca'), modelo: val(f, 'modelo'), version: val(f, 'version'), categoria: val(f, 'categoria'), anio: num(val(f, 'anio')), km: num(val(f, 'km')),
        color: val(f, 'color'), precio: num(val(f, 'precio')), moneda: val(f, 'moneda') || 'USD', transmision: val(f, 'transmision'), combustible: val(f, 'combustible'),
        potencia: num(val(f, 'potencia')), dominio: normalizarPatente(val(f, 'dominio')) || '', carpeta_fotos: val(f, 'carpeta_fotos') };
      if (!auto.marca || !auto.modelo || !auto.anio) throw new Error('Faltan la marca, el modelo o el año.');
      // El dueño de un auto de afuera pasa a ser el vendedor (persona) si todavía no está cargado
      let vendedor_id = (oferta && oferta.persona_id) || null;
      if (oferta && !vendedor_id) {
        const { data: per, error: ep } = await sb.from('personas').insert({ agencia_id: yo.agencia, tipo: 'fisica', nombre: oferta.nombre, telefono: oferta.telefono, estado: 'pendiente' }).select('id').single();
        if (ep) throw ep; vendedor_id = per.id;
      }
      const s = await sesion();
      const r = await fetch(CFG.n8nUrl + '/webhook/' + CFG.rutaCargarAuto, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ token: s.access_token, auto, vendedor_id, oferta_id: oferta ? oferta.id : null }) });
      let j = null; try { j = await r.json(); } catch (_) { /* sin respuesta */ }
      if (!j || !j.ok) throw new Error((j && j.error) || 'No se pudo cargar: ¿está prendido n8n?');
      toast(`Cargado como ${j.id_unidad}`); alGuardar && alGuardar();
    } });
  }

  // ── Cargar persona a mano (foto del DNI opcional: la lee la IA en n8n) ──
  function abrirPersona(alGuardar) {
    const CIV = ESTADOS_CIVILES.map((e) => [e, e]);
    const { f } = ventana('Cargar cliente', `
      <div class="grid2">${campoSel('Rol', 'rol', [['comprador', 'Comprador'], ['vendedor', 'Vendedor'], ['otro', 'Otro (cónyuge, cotitular, apoderado)']], 'comprador', undefined)}
        ${campoSel('A nombre de', 'tipo', [['fisica', 'Una persona'], ['juridica', 'Una empresa']], 'fisica', undefined)}</div>
      <div class="opcion" style="cursor: default; flex-wrap: wrap;"><span class="grow stack" style="gap: 2px;"><b>¿Tenés el DNI a mano?</b><span class="caption">Sacale foto (frente y dorso): la IA completa los datos.</span></span>
        <label class="btn btn-secondary">Frente<input type="file" accept="image/*" name="f1" hidden></label><label class="btn btn-secondary">Dorso<input type="file" accept="image/*" name="f2" hidden></label>
        <button type="button" class="btn btn-primary" data-leer disabled>Leer</button></div>
      <div class="grid2">${campo('Nombre y apellido', 'nombre', '')}${campo('DNI', 'dni', '', 'inputmode="numeric"')}</div>
      <div class="grid2">${campo('CUIL', 'cuil', '', 'inputmode="numeric"')}${campo('Nacimiento', 'nacimiento', '', 'type="date"')}</div>
      <div class="grid2">${campo('Domicilio real', 'domicilio', '')}${campo('Domicilio legal (el del DNI)', 'domicilio_legal', '')}</div>
      <div class="row" style="gap: 8px;"><button type="button" class="btn btn-ghost" data-copiar-dom="real">← Real = mismo que el legal</button><button type="button" class="btn btn-ghost" data-copiar-dom="legal">Legal = mismo que el real →</button></div>
      <div class="grid2">${campo('Celular', 'telefono', '', 'type="tel"')}${campo('Email', 'email', '', 'type="email"')}</div>
      <div class="stack" style="gap: 14px;" data-civil><div class="grid2">${campoSel('Estado civil', 'estado_civil', CIV, '', 'Elegí')}<span></span></div>
        <div class="grid2" data-cony hidden>${campo('Cónyuge: nombre', 'conyuge_nombre', '')}${campo('Cónyuge: DNI', 'conyuge_dni', '', 'inputmode="numeric"')}</div></div>
      <div class="stack" style="gap: 14px;" data-emp hidden><div class="grid2">${campo('Razón social', 'razon_social', '')}${campo('CUIT de la empresa', 'cuit', '', 'inputmode="numeric"')}</div>
        <div class="grid2">${campoSel('Cargo de quien firma', 'cargo', CARGOS_EMPRESA.map((c) => [c, c]), '', 'Elegí')}${campo('Domicilio de la empresa', 'domicilio_empresa', '')}</div></div>
      <div class="stack" style="gap: 14px;" data-otro hidden><div class="grid2">${campoSel('Es', 'relacion', [['conyuge', 'Cónyuge'], ['cotitular', 'Cotitular'], ['apoderado', 'Apoderado']], 'conyuge', undefined)}${campo('De quién (titular)', 'titular_nombre', '')}</div></div>`,
    { onSubmit: async (form) => {
      const g = (k) => val(form, k), tipo = g('tipo'), rol = g('rol');
      const dni = g('dni').replace(/\D/g, ''), ci = cuilInfo(g('cuil'), dni);
      if (!g('nombre') || !formatoDni(dni)) throw new Error('Completá nombre y un DNI válido.');
      if (g('cuil') && !ci.ok) throw new Error(ci.motivo);
      let fila;
      if (tipo === 'juridica') {
        const cu = cuitInfo(g('cuit'));
        if (!g('razon_social') || !cu.ok) throw new Error('Completá la razón social y un CUIT de empresa válido.');
        fila = { tipo, nombre: g('razon_social'), cuit: cu.formateado, domicilio: g('domicilio_empresa') || g('domicilio'), telefono: g('telefono'), email: g('email') || null,
          representante: { nombre: g('nombre'), dni, cuil: ci.ok ? ci.formateado : null, cargo: g('cargo') || null } };
      } else {
        if (rol !== 'otro' && !g('estado_civil')) throw new Error('Elegí el estado civil (lo pide el 08).');
        fila = { tipo, nombre: g('nombre'), dni, cuil: ci.ok ? ci.formateado : null, nacimiento: g('nacimiento') || null, domicilio: g('domicilio'), domicilio_legal: g('domicilio_legal') || null, telefono: g('telefono'), email: g('email') || null,
          estado_civil: g('estado_civil') || null, conyuge: g('conyuge_nombre') ? { nombre: g('conyuge_nombre'), dni: g('conyuge_dni').replace(/\D/g, '') } : null,
          relacion: rol === 'otro' ? { tipo: g('relacion'), titular_nombre: g('titular_nombre') } : null };
      }
      const { error } = await sb.from('personas').insert({ ...fila, agencia_id: yo.agencia, estado: 'verificada' });
      if (error) throw new Error(/duplicate/.test(error.message) ? 'Ya hay una persona con ese DNI.' : error.message);
      await sb.from('eventos').insert({ agencia_id: yo.agencia, tipo: 'carga', detalle: `${rol[0].toUpperCase() + rol.slice(1)} cargado a mano: ${fila.nombre}` });
      toast('Cliente cargado'); alGuardar && alGuardar();
    } });
    const ver = () => { const emp = f.elements.tipo.value === 'juridica', otro = f.elements.rol.value === 'otro';
      f.querySelector('[data-emp]').hidden = !emp; f.querySelector('[data-otro]').hidden = !otro; f.querySelector('[data-civil]').hidden = emp || otro; };
    f.elements.tipo.addEventListener('change', ver); f.elements.rol.addEventListener('change', ver);
    f.elements.estado_civil.addEventListener('change', () => { f.querySelector('[data-cony]').hidden = !/casad|convivencial/i.test(f.elements.estado_civil.value); });
    const fotos = {};
    const achicar = (archivo) => new Promise((ok, mal) => { const img = new Image(), u = URL.createObjectURL(archivo); img.onload = () => { const r = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', 0.8)); }; img.onerror = mal; img.src = u; });
    for (const [k, nombre] of [['f1', 'dni_frente'], ['f2', 'dni_dorso']]) f.elements[k].addEventListener('change', async (e) => {
      const a = e.target.files && e.target.files[0]; if (!a) return; fotos[nombre] = await achicar(a); e.target.parentElement.textContent = '✓ ' + (k === 'f1' ? 'Frente' : 'Dorso');
      f.querySelector('[data-leer]').disabled = !(fotos.dni_frente && fotos.dni_dorso);
    });
    f.querySelector('[data-leer]').addEventListener('click', async (e) => {
      const b = e.target; b.disabled = true; b.innerHTML = '<span class="cargando" aria-hidden="true"></span>';
      try {
        const r = await fetch(CFG.n8nUrl + '/webhook/' + CFG.rutaLeer, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ agencia: CFG.agencia, accion: 'leer', modo: 'panel', rol: 'comprador', fotos }) });
        const j = await r.json(); const d = (j && j.dni) || {};
        if (!d.legible) toast('No se pudo leer bien: completalo a mano');
        if (d.nombre) f.elements.nombre.value = d.nombre;
        if (d.dni) f.elements.dni.value = formatoDni(d.dni) || d.dni;
        if (/^\d{4}-\d\d-\d\d$/.test(d.fecha_nacimiento || '')) f.elements.nacimiento.value = d.fecha_nacimiento;
        if (d.domicilio) f.elements.domicilio_legal.value = d.domicilio;   // el DNI trae el domicilio legal
        const c = cuilInfo(d.cuil, d.dni); f.elements.cuil.value = c.ok ? c.formateado : cuilSugerido(d.dni, d.sexo);
      } catch (_) { toast('No se pudo leer: completalo a mano'); }
      b.textContent = 'Leer'; b.disabled = false;
    });
  }

  // ── Tarjetas ──
  const chipR = (x) => `<span class="chip chip-${x.tipo === 'ok' ? 'ok' : x.tipo === 'aviso' ? 'info' : 'gris'}">${x.tipo === 'ok' ? '✓' : x.tipo === 'aviso' ? '~' : '?'} ${esc(x.texto)}</span>`;
  const puntos = (p) => `<span class="chip" style="background: ${p >= 80 ? 'var(--success-tint)' : p >= 60 ? 'var(--brand-tint)' : 'var(--surface)'}; color: ${p >= 80 ? 'var(--success)' : p >= 60 ? 'var(--brand-strong)' : 'var(--ink)'}; font-size: 15px;">${p} pts</span>`;
  const vence = (x) => { const v = vigencia(x, Date.now()); return v.estado === 'vencida' ? '<span class="chip chip-aviso">Vencida: ¿sigue?</span>' : v.estado === 'por_vencer' ? `<span class="chip chip-aviso">Vence en ${v.quedan} días</span>` : ''; };
  const fichaVehiculo = (v) => `${v.foto_url ? `<img src="${esc(v.foto_url)}" alt="" style="width: 96px; height: 76px; object-fit: cover; border-radius: 6px; background: var(--graphite);">` : `<div class="docfoto" style="width: 96px; height: 76px; cursor: default;">${v.origen === 'afuera' ? 'PARTICULAR' : 'SIN FOTO'}</div>`}
    <span class="stack" style="gap: 2px;"><span class="label">${v.origen === 'afuera' ? 'Auto de particular · ' + esc(v.nombre) : 'Stock de la agencia'}</span><b>${esc(v.titulo)}</b>
    <span class="caption">${esc([v.km != null ? miles(v.km) + ' km' : '', v.precio ? (v.moneda === 'ARS' ? '$ ' : 'U$S ') + miles(v.precio) : '', v.color].filter(Boolean).join(' · '))}</span></span>`;

  // ── Radar (D-079): Buscan · Autos de particulares · Matches, en una sola pestaña ──
  const PEST = [['buscan', 'Buscan'], ['particulares', 'Autos de particulares'], ['matches', 'Matches']];
  const irRadar = (q) => '#radar?' + q;
  async function vistaRadar(c, p) {
    const D = await cargarTodo(), tab = PEST.some(([k]) => k === p.get('tab')) ? p.get('tab') : 'buscan';
    const nB = D.busquedas.filter((x) => x.estado === 'activa').length, nO = D.ofertas.filter((x) => x.estado === 'activa').length, nM = D.matches.filter((m) => m.estado === 'nuevo').length;
    const cuenta = { buscan: [nB, 'activas'], particulares: [nO, 'a la venta'], matches: [nM, nM === 1 ? 'nuevo' : 'nuevos'] };
    c.innerHTML = encabezado('Radar', 'La gente que busca un auto, los autos de particulares y los cruces entre los dos.')
      + `<nav class="radar-tabs" aria-label="Partes del Radar">${PEST.map(([k, t]) => `<a href="${irRadar('tab=' + k)}" class="radar-tab${k === tab ? ' activo' : ''}"${k === tab ? ' aria-current="page"' : ''}>
          <span class="radar-num">${cuenta[k][0]}</span><span class="radar-nom">${t}</span><span class="caption">${cuenta[k][1]}</span></a>`).join('')}</nav>
        <div id="radar-cuerpo" class="stack" style="gap: 16px;"></div>`;
    const cu = c.querySelector('#radar-cuerpo');
    if (tab === 'matches') return pintarMatches(cu, p, D);
    return pintarLista(cu, p, D, tab === 'buscan' ? 'buscan' : 'venden');
  }

  function pintarMatches(c, p, D) {
    const filtro = p.get('origen') || 'todos', est = p.get('estado') || 'nuevo', solo = p.get('b') || p.get('v') || '';
    // ?b=<búsqueda> o ?v=<auto de particular>: solo los de esa búsqueda / ese auto
    const de1 = (m) => (!p.get('b') || m.busqueda.id === p.get('b')) && (!p.get('v') || m.vehiculo.id === p.get('v'));
    const todos = D.matches.filter(de1);
    const lista = todos.filter((m) => (filtro === 'todos' || m.vehiculo.origen === filtro) && (est === 'todos' || m.estado === est));
    const n = (o, e) => todos.filter((m) => (o === 'todos' || m.vehiculo.origen === o) && (e === 'todos' || m.estado === e)).length;
    const link = (o, e, t) => `<a class="filtro${o === filtro && e === est ? ' activo' : ''}" style="display: inline-flex; align-items: center; text-decoration: none;" href="${irRadar(`tab=matches&origen=${o}&estado=${e}${solo ? (p.get('b') ? '&b=' : '&v=') + solo : ''}`)}">${t}</a>`;
    c.innerHTML = (solo ? `<div class="aviso-caja aviso-info row" style="justify-content: space-between;"><span>Mostrando solo los de ${esc(p.get('b') ? (D.busquedas.find((x) => x.id === solo) || {}).nombre || 'esta búsqueda' : 'este auto')}.</span><a href="${irRadar('tab=matches')}">Ver todos</a></div>` : '')
      + `<p class="caption">Cada persona que busca, cruzada con los autos del stock y de particulares. Ordenados por puntaje: ✓ cumple · ~ parecido · ? a confirmar.</p>
         <div class="filtros">${link('todos', est, 'Todos · ' + n('todos', est))}${link('stock', est, 'Stock · ' + n('stock', est))}${link('afuera', est, 'Particulares · ' + n('afuera', est))}</div>
         <div class="filtros">${[['nuevo', 'Nuevos'], ['contactado', 'Contactados'], ['descartado', 'Descartados'], ['todos', 'Todos']].map(([e, t]) => link(filtro, e, t + ' · ' + n(filtro, e))).join('')}</div>
         <div class="lista">${lista.map((m) => `<article class="card stack" style="gap: 12px;">
           <div class="row" style="gap: 12px;">${puntos(m.puntaje)}<b class="grow">${esc(m.busqueda.nombre)} busca ${esc(textoBusqueda(m.busqueda))}</b>${m.estado !== 'nuevo' ? `<span class="chip chip-gris">${m.estado === 'contactado' ? 'Contactado' : 'Descartado'}</span>` : ''}</div>
           <div class="row" style="gap: 14px; align-items: center;">${fichaVehiculo(m.vehiculo)}</div>
           <div class="row" style="gap: 6px;">${m.razones.map(chipR).join('')}</div>
           <div class="row" style="justify-content: flex-end;">
             ${m.estado === 'nuevo' ? `<button type="button" class="btn btn-ghost" data-mestado="${esc(m.clave)}" data-v="descartado">Descartar</button>` : ''}
             ${m.vehiculo.origen === 'afuera' ? `<button type="button" class="btn btn-secondary" data-wa-dueno="${esc(m.clave)}">WhatsApp al dueño</button>` : ''}
             <button type="button" class="btn btn-primary" data-wa="${esc(m.clave)}">WhatsApp a ${esc(String(m.busqueda.nombre).split(' ')[0])}</button></div>
         </article>`).join('') || '<div class="card vacio">No hay matches con este filtro. Cuando entre un auto o se sume una búsqueda que coincida, aparece acá.</div>'}</div>`;
    const de = (clave) => D.matches.find((m) => m.clave === clave);
    c.querySelectorAll('[data-wa]').forEach((b) => b.addEventListener('click', () => { const m = de(b.dataset.wa);
      whatsapp(m.busqueda.telefono, mensajeMatch({ busqueda: m.busqueda, vehiculo: m.vehiculo }), async () => { await marcarMatch(m.clave, 'contactado'); ctx.ruta(); }); }));
    c.querySelectorAll('[data-wa-dueno]').forEach((b) => b.addEventListener('click', () => { const m = de(b.dataset.waDueno);
      whatsapp(m.vehiculo.telefono, mensajeMatch({ busqueda: m.busqueda, vehiculo: m.vehiculo, para: 'dueno' }), async () => { await marcarMatch(m.clave, 'contactado'); ctx.ruta(); }); }));
    c.querySelectorAll('[data-mestado]').forEach((b) => b.addEventListener('click', async () => { try { await marcarMatch(b.dataset.mestado, b.dataset.v); toast('Descartado'); ctx.ruta(); } catch (e) { fallo(e); } }));
  }

  function pintarLista(c, p, D, tab) {
    const verCerradas = p.get('cerradas') === '1', esB = tab === 'buscan';
    const nMatch = (id) => D.matches.filter((m) => (esB ? m.busqueda.id === id : m.vehiculo.origen === 'afuera' && m.vehiculo.id === id)).length;
    const items = (esB ? D.busquedas : D.ofertas).filter((x) => verCerradas || x.estado === 'activa');
    const cerradas = (esB ? D.busquedas : D.ofertas).filter((x) => x.estado !== 'activa').length;
    const autoTxt = (x) => [x.marca, x.modelo, x.version, x.anio].filter(Boolean).join(' ');
    const tarjeta = (x) => { const nm = nMatch(x.id), buscar = [x.nombre, x.telefono, esB ? textoBusqueda(x) : autoTxt(x), x.notas].join(' ').toLowerCase();
      return esB
      ? `<article class="card stack" style="gap: 10px;" data-buscar="${esc(buscar)}"><div class="row" style="gap: 10px;"><b class="grow">${esc(x.nombre)} <span class="caption">· ${esc(x.telefono || 'sin WhatsApp')}</span></b>${x.estado !== 'activa' ? '<span class="chip chip-gris">Cerrada</span>' : vence(x)}<span class="caption">${x.origen === 'link' ? 'Desde el link · ' : ''}${fechaCorta(x.creado)}</span></div>
          <span>Busca <b>${esc(textoBusqueda(x))}</b>${x.notas ? ` <span class="caption">· ${esc(x.notas)}</span>` : ''}</span>
          <div class="row" style="justify-content: flex-end;">${nm ? `<a class="btn btn-secondary" href="${irRadar('tab=matches&estado=todos&b=' + x.id)}">${nm} match${nm > 1 ? 'es' : ''}</a>` : '<span class="caption grow">Sin matches por ahora</span>'}
            <button type="button" class="btn btn-ghost" data-editar="${x.id}">Editar</button>${x.estado === 'activa' ? `<button type="button" class="btn btn-ghost" data-cerrar-b="${x.id}">Cerrar</button><button type="button" class="btn btn-ghost" data-renovar="${x.id}">Renovar</button>` : `<button type="button" class="btn btn-ghost" data-reabrir="${x.id}">Reabrir</button>`}
            <button type="button" class="btn btn-secondary" data-sigue="${x.id}">¿Sigue buscando?</button></div></article>`
      : `<article class="card stack" style="gap: 10px;" data-buscar="${esc(buscar)}"><div class="row" style="gap: 10px;"><b class="grow">${esc(autoTxt(x))}</b>${x.estado === 'en_stock' ? `<span class="chip chip-ok">En el stock (${esc(x.id_unidad || '')})</span>` : x.estado !== 'activa' ? '<span class="chip chip-gris">Cerrada</span>' : vence(x)}<span class="caption">${x.origen === 'link' ? 'Desde el link · ' : ''}${fechaCorta(x.creado)}</span></div>
          <span class="caption" style="color: var(--ink);">${esc([x.km != null ? miles(x.km) + ' km' : '', x.precio ? (x.moneda === 'ARS' ? '$ ' : 'U$S ') + miles(x.precio) : 'sin precio', x.color, { si: 'puede dejarlo en la agencia', no: 'lo tiene que usar', charlar: 'dejarlo: a charlar' }[x.puede_dejarlo]].filter(Boolean).join(' · '))}</span>
          <span>Dueño: <b>${esc(x.nombre)}</b> · ${esc(x.telefono || 'sin WhatsApp')}${x.notas ? ` <span class="caption">· ${esc(x.notas)}</span>` : ''}</span>
          <div class="row" style="justify-content: flex-end;">${nm ? `<a class="btn btn-secondary" href="${irRadar('tab=matches&origen=afuera&estado=todos&v=' + x.id)}">${nm} interesado${nm > 1 ? 's' : ''}</a>` : '<span class="caption grow">Nadie lo busca por ahora</span>'}
            <button type="button" class="btn btn-ghost" data-editar="${x.id}">Editar</button>${x.estado === 'activa' ? `<button type="button" class="btn btn-ghost" data-cerrar-b="${x.id}">Cerrar</button><button type="button" class="btn btn-ghost" data-renovar="${x.id}">Renovar</button><button type="button" class="btn btn-secondary" data-sigue="${x.id}">¿Sigue vendiendo?</button><button type="button" class="btn btn-primary" data-stock="${x.id}">Pasar al stock</button>` : ''}</div></article>`; };
    c.innerHTML = `<div class="row" style="gap: 10px;">
        <button type="button" class="btn btn-primary" data-cargar style="min-height: 48px; font-size: 16px;">+ ${esB ? 'Sumar persona que busca' : 'Sumar auto de particular'}</button>
        <input class="input grow" data-filtrar placeholder="${esB ? 'Buscar por nombre, modelo o tipo' : 'Buscar por modelo o dueño'}" aria-label="Buscar en la lista" style="min-width: 200px; max-width: 360px;">
        ${cerradas ? `<a class="filtro" style="display: inline-flex; align-items: center; text-decoration: none;" href="${irRadar('tab=' + (esB ? 'buscan' : 'particulares') + (verCerradas ? '' : '&cerradas=1'))}">${verCerradas ? 'Ocultar cerradas' : 'Ver cerradas · ' + cerradas}</a>` : ''}</div>
      <p class="caption">${esB ? 'Gente que busca un auto que hoy no está en el stock. Lo que completan del link de clientes también cae acá. Vencen a los 90 días.' : 'Autos que sus dueños venden por su cuenta y no pueden dejar en la agencia. Si alguien busca algo así, aparece en Matches.'}</p>
      <div class="lista">${items.map(tarjeta).join('') || `<div class="card vacio">${esB ? 'Todavía no hay nadie. Sumá una persona con el botón de arriba o compartí el link para clientes.' : 'Todavía no hay autos de particulares. Sumá uno con el botón de arriba.'}</div>`}</div>`;
    const tabla = esB ? 'busquedas' : 'ofertas_externas', de = (id) => items.find((x) => x.id === id);
    c.querySelector('[data-cargar]').addEventListener('click', () => (esB ? abrirBusqueda(null, ctx.ruta) : abrirOferta(null, ctx.ruta)));
    c.querySelector('[data-filtrar]').addEventListener('input', (e) => { const q = e.target.value.trim().toLowerCase();
      c.querySelectorAll('[data-buscar]').forEach((a) => { a.hidden = !!q && !a.dataset.buscar.includes(q); }); });
    c.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => (esB ? abrirBusqueda(de(b.dataset.editar), ctx.ruta) : abrirOferta(de(b.dataset.editar), ctx.ruta))));
    const cambiar = async (id, cambios, msj) => { const { error } = await sb.from(tabla).update(cambios).eq('id', id); if (error) return fallo(error); toast(msj); ctx.ruta(); };
    c.querySelectorAll('[data-cerrar-b]').forEach((b) => b.addEventListener('click', () => confirm('¿Cerrarla? No se borra: queda para ver con "Ver cerradas".') && cambiar(b.dataset.cerrarB, { estado: 'cerrada' }, 'Cerrada')));
    c.querySelectorAll('[data-renovar]').forEach((b) => b.addEventListener('click', () => cambiar(b.dataset.renovar, { renovada: new Date().toISOString() }, 'Renovada por 90 días')));
    c.querySelectorAll('[data-reabrir]').forEach((b) => b.addEventListener('click', () => cambiar(b.dataset.reabrir, { estado: 'activa', renovada: new Date().toISOString() }, 'Reabierta')));
    c.querySelectorAll('[data-sigue]').forEach((b) => b.addEventListener('click', () => { const x = de(b.dataset.sigue); whatsapp(x.telefono, mensajeSigueBuscando(x, !esB)); }));
    c.querySelectorAll('[data-stock]').forEach((b) => b.addEventListener('click', () => { const x = de(b.dataset.stock); abrirAuto(x, { oferta: x, alGuardar: ctx.ruta }); }));
  }

  // ── Inicio: tablero de la agencia (D-079; cuentas en tablero_core.js) ──
  async function vistaInicio(c) {
    const ahora = Date.now(), mes1 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const [D, todos, pend, docsMes, boletos, ev] = await Promise.all([cargarTodo(),
      sb.from('autos').select('id,id_unidad,marca,modelo,version,anio,precio,moneda,estado,foto_url,extra,creado').eq('agencia_id', yo.agencia).neq('estado', 'baja'),
      sb.from('cargas').select('id', { count: 'exact', head: true }).eq('agencia_id', yo.agencia).eq('estado', 'nueva'),
      sb.from('documentos').select('id', { count: 'exact', head: true }).eq('agencia_id', yo.agencia).eq('estado', 'listo').gte('creado', mes1),
      sb.from('documentos').select('creado, operacion:operaciones(auto_id)').eq('agencia_id', yo.agencia).eq('tipo', 'boleto').eq('estado', 'listo'),
      sb.from('eventos').select('tipo,detalle,creado').eq('agencia_id', yo.agencia).order('creado', { ascending: false }).limit(6)]);
    if (todos.error) throw todos.error;
    const autos = todos.data || [], S = resumenStock(autos, ahora);
    const V = ventasPorMes(autos, (boletos.data || []).map((b) => ({ auto_id: b.operacion && b.operacion.auto_id, fecha: b.creado })), ahora, 6);
    const stockVeh = D.autos.map((a) => vehiculoDe(deStock(a), 'stock', D.C)), DEM = demandaVsStock(D.busquedas, stockVeh, D.C);
    const nuevos = D.matches.filter((m) => m.estado === 'nuevo').length;
    const porVencer = D.busquedas.concat(D.ofertas).filter((x) => x.estado === 'activa' && vigencia(x, ahora).estado !== 'vigente').length;
    const mesAnt = V.meses.length > 1 ? V.meses[V.meses.length - 2].etiqueta : '';
    const usd = (n) => 'U$S ' + miles(n);
    const kpi = (titulo, valor, sub, href) => `<a href="${href}" class="card stack tablero-kpi"><span class="label">${titulo}</span><span class="tablero-num">${valor}</span><span class="caption">${sub}</span></a>`;
    const dif = V.diferencia > 0 ? `<span style="color: var(--success); font-weight: 600;">▲ ${V.diferencia} más</span> que ${mesAnt}` : V.diferencia < 0 ? `<span style="color: var(--warning); font-weight: 600;">▼ ${-V.diferencia} menos</span> que ${mesAnt}` : `igual que ${mesAnt} (${V.mes_anterior})`;
    const max = Math.max(1, ...V.meses.map((m) => m.n));
    const barras = `<svg viewBox="0 0 360 170" role="img" aria-label="Autos vendidos por mes" style="width: 100%; height: auto;">${V.meses.map((m, k) => { const h = Math.round((m.n / max) * 110), x = 14 + k * 58, y = 135 - h, ult = k === V.meses.length - 1;
      return `<rect x="${x}" y="${y}" width="36" height="${Math.max(h, 2)}" rx="4" fill="${ult ? 'var(--brand-strong)' : 'var(--brand)'}" opacity="${ult ? 1 : 0.55}"/><text x="${x + 18}" y="${y - 6}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--ink)">${m.n}</text><text x="${x + 18}" y="156" text-anchor="middle" font-size="12" fill="var(--ink-muted)">${m.etiqueta}</text>`; }).join('')}</svg>`;
    const tareas = [[pend.count || 0, 'datos de clientes para revisar', '#pendientes'], [nuevos, nuevos === 1 ? 'match nuevo para contactar' : 'matches nuevos para contactar', irRadar('tab=matches')],
      [porVencer, 'búsquedas o autos de particulares por vencer', irRadar('tab=buscan')], [S.sin_publicar, 'autos disponibles sin publicar en Instagram', '#autos?estado=disponible'], [S.sin_foto, 'autos sin foto', '#autos']].filter(([n]) => n);
    c.innerHTML = encabezado('Hola ' + esc(String(yo.nombre).split(' ')[0]), 'Cómo viene HAY AUTOS hoy.',
      `<div class="row" style="gap: 8px;"><button type="button" class="btn btn-secondary" data-na>Cargar auto</button><button type="button" class="btn btn-primary" data-nb>+ Sumar al Radar</button></div>`)
      + `<div class="tablero-kpis">
          ${kpi('Autos en stock', S.disponibles + S.reservados, `${S.disponibles} disponibles · ${S.reservados} reservado${S.reservados === 1 ? '' : 's'}`, '#autos')}
          ${kpi('Valor del stock', usd(S.valor.USD), (S.precio_promedio ? 'Precio promedio ' + usd(S.precio_promedio) : '') + (S.valor.ARS ? ` · más $ ${miles(S.valor.ARS)} en pesos` : ''), '#autos')}
          ${kpi('Vendidos este mes', V.este_mes, dif, '#autos?estado=vendido')}
          ${kpi('Días promedio en stock', S.dias_promedio == null ? '—' : S.dias_promedio, S.viejos.length ? `${S.viejos.length} con más de 60 días` : 'Ninguno con más de 60 días', '#autos')}
        </div>
        <div class="tablero-grilla">
          <section class="card stack" style="gap: 8px;"><h2>Ventas de los últimos 6 meses</h2>${barras}
            <p class="caption">${V.sin_fecha ? `${V.sin_fecha} auto${V.sin_fecha > 1 ? 's' : ''} vendido${V.sin_fecha > 1 ? 's' : ''} antes de empezar a registrar la fecha no se cuenta${V.sin_fecha > 1 ? 'n' : ''}. ` : ''}Cuenta cuando un auto pasa a "vendido" en la planilla o se hace su boleto.</p></section>
          <section class="card stack" style="gap: 10px;"><h2>Lo que buscan vs. lo que tenés</h2>
            ${DEM.length ? `<table class="tablero-tabla"><thead><tr><th>Tipo</th><th>Buscan</th><th>En stock</th><th></th></tr></thead><tbody>${DEM.slice(0, 7).map((f) => `<tr><td>${esc(f.etiqueta)}</td><td class="num">${f.buscan}</td><td class="num">${f.stock}</td><td>${f.falta ? '<span class="chip chip-aviso">Conviene sumar</span>' : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="vacio">Sin datos todavía.</p>'}
            <p class="caption">Búsquedas activas del Radar contra los autos disponibles y reservados.</p></section>
          <section class="card stack" style="gap: 10px;"><h2>Para hacer hoy</h2>
            ${tareas.map(([n, t, h]) => `<a href="${h}" class="opcion" style="text-decoration: none;"><span class="tablero-tarea">${n}</span><span class="grow">${t}</span><span aria-hidden="true">›</span></a>`).join('') || '<p class="vacio">Todo al día.</p>'}</section>
          <section class="card stack" style="gap: 10px;"><h2>Más de 60 días en stock</h2>
            ${S.viejos.slice(0, 5).map((x) => `<a href="#autos?q=${encodeURIComponent(x.auto.id_unidad || '')}" class="opcion" style="text-decoration: none;"><span class="grow"><b>${esc([x.auto.marca, x.auto.modelo, x.auto.anio].filter(Boolean).join(' '))}</b> <span class="caption">${esc(x.auto.id_unidad || '')}${x.auto.precio ? ' · ' + (x.auto.moneda === 'ARS' ? '$ ' : 'U$S ') + miles(x.auto.precio) : ''}</span></span><span class="chip chip-aviso">${x.dias} días</span></a>`).join('') || '<p class="vacio">Ninguno. Los días se cuentan desde que cada auto entró al sistema (o desde la columna fecha_ingreso de la planilla, si la completan).</p>'}</section>
        </div>
        <section class="card stack" style="gap: 6px;"><div class="row" style="justify-content: space-between;"><h2>Últimos movimientos</h2><a href="#historial">Ver historial</a></div>
          ${(ev.data || []).map((e) => `<div class="row" style="gap: 12px; padding: 6px 0; border-top: 1px solid var(--line);"><span class="caption" style="min-width: 110px;">${fechaCorta(e.creado)}</span><span class="grow">${esc(e.detalle || e.tipo)}</span></div>`).join('') || '<p class="vacio">Sin movimientos todavía.</p>'}</section>`;
    c.querySelector('[data-nb]').addEventListener('click', () => {
      const { d } = ventana('Sumar al Radar', `<button type="button" class="opcion" data-x="b"><b>Una persona que busca un auto</b></button><button type="button" class="opcion" data-x="o"><b>Un auto de un particular</b></button>`);
      d.querySelector('[data-x="b"]').addEventListener('click', () => { d.close(); abrirBusqueda(null, ctx.ruta); });
      d.querySelector('[data-x="o"]').addEventListener('click', () => { d.close(); abrirOferta(null, ctx.ruta); });
    });
    c.querySelector('[data-na]').addEventListener('click', () => abrirAuto({}, { alGuardar: ctx.ruta }));
  }

  // Para Personas: quienes buscan o venden por su cuenta (no hace falta que sean clientes)
  async function contactos() { const D = await cargarTodo(); return { busquedas: D.busquedas, ofertas: D.ofertas }; }

  // ── Interesados en un auto del stock (botón en la tarjeta de Autos) ──
  async function interesados(autoId) {
    const D = await cargarTodo(), a = D.autos.find((x) => x.id === autoId); if (!a) return [];
    return interesadosEn(vehiculoDe(deStock(a), 'stock', D.C), D.busquedas, D.C).map((r) => ({ ...r, vehiculo: vehiculoDe(deStock(a), 'stock', D.C) }));
  }
  async function contarInteresados() {
    const D = await cargarTodo(), out = {};
    for (const m of D.matches) if (m.vehiculo.origen === 'stock') out[m.vehiculo.id] = (out[m.vehiculo.id] || 0) + 1;
    return out;
  }
  function verInteresados(lista) {
    const { d } = ventana('Interesados en este auto', lista.map((r, k) => `<div class="opcion" style="cursor: default; flex-wrap: wrap;">${puntos(r.puntaje)}<span class="grow stack" style="gap: 2px;"><b>${esc(r.busqueda.nombre)}</b><span class="caption">Busca ${esc(textoBusqueda(r.busqueda))}</span></span>
      <button type="button" class="btn btn-primary" data-i="${k}">WhatsApp</button></div>`).join('') || '<p class="vacio">Nadie busca algo así por ahora.</p>');
    d.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { const r = lista[Number(b.dataset.i)]; d.close();
      whatsapp(r.busqueda.telefono, mensajeMatch({ busqueda: r.busqueda, vehiculo: r.vehiculo }), async () => { await marcarMatch(`${r.busqueda.id}|stock|${r.vehiculo.id}`, 'contactado'); }); }));
  }

  return { olvidar, vistaInicio, vistaRadar, contactos, contarMatchesNuevos, contarInteresados, interesados, verInteresados, abrirAuto, abrirPersona };
}

// "Cargar persona": botones para copiar el domicilio real en el legal y al revés
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copiar-dom]'); if (!b || !b.form && !b.closest('form')) return;
  const f = b.closest('form'); if (!f || !f.elements.domicilio_legal) return;
  const [destino, origen] = b.dataset.copiarDom === 'real' ? [f.elements.domicilio, f.elements.domicilio_legal] : [f.elements.domicilio_legal, f.elements.domicilio];
  if (origen.value.trim()) destino.value = origen.value;
});

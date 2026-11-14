// Panel de la agencia (cuentas de Google autorizadas). Lee y escribe Supabase con la sesión del usuario: la seguridad la pone
// la base (RLS: solo miembros de la agencia). Usa documentos_core.js y webapp_core.js (cargados antes, globales).
import { createClient } from './demo_supabase.js'; // DEMO: cliente falso en memoria (js/demo.js), sin red
import { crearOportunidades } from './panel_oportunidades.js';

const CFG = window.HA_CONFIG;
const sb = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const yo = { email: '', nombre: '', rol: '', agencia: CFG.agencia };
const ICONOS = {
  inicio: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  pendientes: '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5.5 5h13L20 13v6H4v-6z"/>',
  autos: '<path d="M5 17h14M6 17l1.5-5h9L18 17M8 12l1.2-3.5h5.6L16 12"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/>',
  personas: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c1.8.8 3 2.9 3 5.5"/>',
  operacion: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  historial: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  accesos: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
};
const SECCIONES = [['inicio', 'Inicio'], ['pendientes', 'Pendientes'], ['radar', 'Radar'], ['autos', 'Autos'], ['personas', 'Personas'], ['operacion', 'Nueva operación'], ['historial', 'Historial'], ['accesos', 'Accesos']];
const TABS = [['inicio', 'Inicio'], ['pendientes', 'Pendientes'], ['radar', 'Radar'], ['autos', 'Autos'], ['personas', 'Personas']];
const icono = (k, n = 20) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[k]}</svg>`;
const fechaCorta = (iso) => { const d = new Date(iso), h = new Date(); const dias = Math.floor((h - d) / 864e5);
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (h - d < 36e5) return `Hace ${Math.max(1, Math.round((h - d) / 6e4))} minutos`;
  if (d.toDateString() === h.toDateString()) return `Hoy, ${hora}`;
  if (dias < 1 || new Date(h - 864e5).toDateString() === d.toDateString()) return `Ayer, ${hora}`;
  return d.toLocaleDateString('es-AR'); };
const precio = (a) => (a.precio ? `${a.moneda === 'ARS' ? '$' : 'U$S'} ${miles(a.precio)}` : 'Sin precio');
const nombreAuto = (a) => (a ? [a.marca, a.modelo, a.version, a.anio].filter(Boolean).join(' ') : '');
const chipAviso = (x) => `<span class="chip chip-${x.tipo === 'ok' ? 'ok' : x.tipo === 'error' ? 'error' : 'aviso'}">${x.tipo === 'ok' ? '✓' : x.tipo === 'error' ? '✕' : '!'} ${esc(x.texto)}</span>`;
function toast(t) { const e = document.createElement('div'); e.className = 'toast'; e.setAttribute('role', 'status'); e.textContent = t; document.body.appendChild(e); setTimeout(() => e.remove(), 3200); }
function fallo(e) { console.error(e); toast('Algo falló: ' + (e && e.message ? e.message : 'probá de nuevo')); }

// ── Ingreso ──────────────────────────────────────────────────────────────────
$('#entrar').addEventListener('click', async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } });
  if (error) { $('#login-error').textContent = error.message; $('#login-error').hidden = false; }
});
document.querySelectorAll('[data-salir]').forEach((b) => b.addEventListener('click', async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); }));

async function iniciar() {
  // Si Google/Supabase devolvieron un error (?error_description=…), mostrarlo en vez de volver callado al ingreso
  const err = new URLSearchParams(location.search).get('error_description') || new URLSearchParams(location.hash.slice(1)).get('error_description');
  if (err) {
    history.replaceState(null, '', location.pathname);
    $('#login-error').textContent = 'No se pudo entrar con Google: ' + err + (/exchange external code/i.test(err) ? ' (revisá el Client ID y el Client Secret de Google en Supabase).' : '');
    $('#login-error').hidden = false;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { $('#vista-login').hidden = false; return; }
  const { data, error } = await sb.rpc('registrar_ingreso');
  const fila = (data || []).find((r) => r.agencia_id === CFG.agencia);
  if (error || !fila) {
    await sb.auth.signOut();
    $('#vista-login').hidden = false;
    $('#login-error').textContent = `La cuenta ${session.user.email} no tiene acceso. Pedile a un administrador de HAY AUTOS que la autorice.`;
    $('#login-error').hidden = false; return;
  }
  Object.assign(yo, { email: session.user.email, nombre: fila.nombre || session.user.email, rol: fila.rol });
  $('#yo-nombre').textContent = yo.nombre;
  $('#yo-inicial').textContent = $('#yo-inicial-celu').textContent = yo.nombre.slice(0, 1).toUpperCase();
  $('#vista-panel').hidden = false;
  window.addEventListener('hashchange', ruta);
  ruta();
}

// ── Menú y rutas (#pendientes, #autos, #operacion?auto=<id> …) ───────────────
let pendientes = 0, matchesNuevos = 0;
function menu(activa) {
  const badge = (k) => (k === 'pendientes' && pendientes ? `<span class="badge">${pendientes}</span>` : k === 'radar' && matchesNuevos ? `<span class="badge">${matchesNuevos}</span>` : '');
  $('#menu').innerHTML = SECCIONES.filter(([k]) => k !== 'accesos' || yo.rol === 'admin').map(([k, t]) =>
    `<a class="nav${k === activa ? ' activo' : ''}" href="#${k}"${k === activa ? ' aria-current="page"' : ''}>${icono(k)}<span>${t}</span>${badge(k)}</a>`).join('');
  $('#tabs').innerHTML = TABS.map(([k, t]) => `<a class="tab${k === activa ? ' activo' : ''}" href="#${k}"${k === activa ? ' aria-current="page"' : ''}>${icono(k, 22)}${t}${badge(k)}</a>`).join('');
}
async function contarPendientes() {
  const { count } = await sb.from('cargas').select('id', { count: 'exact', head: true }).eq('agencia_id', yo.agencia).eq('estado', 'nueva');
  pendientes = count || 0;
  matchesNuevos = await OP.contarMatchesNuevos();
}
async function ruta() {
  OP.olvidar();
  const [k0, q0] = (location.hash.slice(1) || 'inicio').split('?');
  // direcciones viejas (26/10) → Radar
  const k = k0 === 'matches' || k0 === 'busquedas' ? 'radar' : k0;
  const q = k0 === 'matches' ? 'tab=matches&' + (q0 || '') : k0 === 'busquedas' ? (/tab=venden/.test(q0 || '') ? 'tab=particulares' : 'tab=buscan') : q0;
  const params = new URLSearchParams(q || '');
  const vista = VISTAS[k] ? k : 'inicio';
  await contarPendientes(); menu(vista);
  const c = $('#contenido');
  c.innerHTML = '<div class="vacio"><span class="cargando" aria-hidden="true"></span></div>';
  try { await VISTAS[vista](c, params); } catch (e) { fallo(e); c.innerHTML = '<div class="vacio">No se pudo cargar esta sección.</div>'; }
  c.focus({ preventScroll: true });
}
const encabezado = (titulo, sub, derecha = '') => `<div class="encabezado"><div class="stack" style="gap: 6px;"><h1>${titulo}</h1><p class="muted">${sub}</p></div>${derecha}</div>`;
// Búsquedas, ofertas de afuera, matches y cargas a mano (D-078)
const OP = crearOportunidades({ sb, yo, CFG, $, esc, toast, fallo, encabezado, icono, nombreAuto, precio, fechaCorta, ruta: () => ruta() });

// ── Pendientes ───────────────────────────────────────────────────────────────
async function vistaPendientes(c) {
  const [{ data: cargas, error }, { data: autos }] = await Promise.all([
    sb.from('cargas').select('*').eq('agencia_id', yo.agencia).eq('estado', 'nueva').order('creado', { ascending: false }),
    sb.from('autos').select('id,id_unidad,marca,modelo,version,anio,dominio,foto_url,estado').eq('agencia_id', yo.agencia).neq('estado', 'baja').order('id_unidad'),
  ]);
  if (error) throw error;
  const porId = Object.fromEntries((autos || []).map((a) => [a.id, a]));
  const rutas = (cargas || []).flatMap((x) => Object.values(x.fotos || {}));
  const firmadas = {};
  if (rutas.length) { const { data } = await sb.storage.from('documentos').createSignedUrls(rutas, 3600); (data || []).forEach((f) => { firmadas[f.path] = f.signedUrl; }); }
  const linkCliente = new URL('../', location.href).href;
  const opcionesAuto = (sel) => '<option value="">Elegí el auto…</option>' + (autos || []).filter((a) => a.estado !== 'vendido')
    .map((a) => `<option value="${a.id}"${a.id === sel ? ' selected' : ''}>${esc(a.id_unidad)} · ${esc(nombreAuto(a))}${a.dominio ? ' · ' + esc(formatoPatente(a.dominio)) : ''}</option>`).join('');

  const tarjeta = (x) => {
    const d = x.datos || {}, auto = porId[x.auto_id], v = x.vinculo || {};
    const fotos = Object.entries(x.fotos || {}).map(([k, r]) => `<button type="button" class="docfoto" data-ver="${esc(firmadas[r] || '')}" aria-label="Ver ${k.replace('_', ' ')}">${firmadas[r] ? `<img src="${esc(firmadas[r])}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">` : k}</button>`).join('');
    const dato = (t, val) => (val ? `<div><dt class="label">${t}</dt><dd>${esc(val)}</dd></div>` : '');
    const vinculo = x.rol !== 'vendedor' ? '' : auto
      ? `<div class="vinculo si">${auto.foto_url ? `<img src="${esc(auto.foto_url)}" alt="">` : ''}<div class="grow stack" style="gap: 2px; flex: 1 1 260px;"><span class="label" style="color: var(--success);">Auto vinculado automáticamente</span><b>${esc(nombreAuto(auto))}</b><span class="caption">${esc(v.texto || '')}</span></div>
         <select class="input" style="max-width: 280px;" data-cambiar-auto="${x.id}" aria-label="Cambiar auto">${opcionesAuto(auto.id)}</select></div>`
      : `<div class="vinculo no"><div class="grow stack" style="gap: 2px; flex: 1 1 260px;"><span class="label" style="color: var(--warning);">Auto no encontrado en el stock</span><span class="caption">${esc(v.texto || 'Elegilo a mano.')} Si es un auto nuevo, cargalo en la planilla y aparece acá en unos minutos.</span></div>
         <select class="input" style="max-width: 280px;" data-cambiar-auto="${x.id}" aria-label="Vincular a mano">${opcionesAuto('')}</select></div>`;
    return `<article class="card stack">
      <div class="row" style="gap: 12px;"><span class="chip chip-info">${esc(x.rol.toUpperCase())}</span>${d.tipo_persona === 'juridica' ? '<span class="chip chip-gris">EMPRESA</span>' : ''}${x.rol === 'otro' && d.relacion ? `<span class="chip chip-gris">${esc(d.relacion.toUpperCase())}</span>` : ''}<h2 class="grow">${esc(d.tipo_persona === 'juridica' ? (d.razon_social || 'Empresa sin nombre') : (d.nombre || 'Sin nombre'))}</h2><span class="caption">${fechaCorta(x.confirmado || x.creado)}</span></div>
      <div class="row" style="gap: 24px; align-items: flex-start;"><div class="row" style="gap: 8px;">${fotos}</div>
        <dl class="dl grow" style="flex: 1 1 380px;">${d.tipo_persona === 'juridica' ? dato('CUIT', d.cuit) + dato('Representante', [d.nombre, d.cargo].filter(Boolean).join(' · ')) + dato('Domicilio de la empresa', d.domicilio_empresa) : ''}${dato('DNI', formatoDni(d.dni))}${dato('CUIL', d.cuil)}${dato('Estado civil', d.estado_civil)}${d.conyuge_nombre ? dato('Cónyuge', d.conyuge_nombre + (d.conyuge_dni ? ' · DNI ' + (formatoDni(d.conyuge_dni) || d.conyuge_dni) : '')) : ''}${x.rol === 'otro' ? dato('Titular', [d.titular_nombre, d.titular_dni ? 'DNI ' + (formatoDni(d.titular_dni) || d.titular_dni) : ''].filter(Boolean).join(' · ')) : ''}${dato('Celular', d.telefono)}${dato('Email', d.email)}${dato('Domicilio', d.domicilio)}${x.rol === 'vendedor' ? dato('Patente', d.patente) + dato('Auto (cédula)', [d.marca_modelo, d.anio].filter(Boolean).join(' ')) : ''}</dl></div>
      ${vinculo}
      <div class="row">${(x.avisos || []).map(chipAviso).join('')}<span class="grow"></span>
        <button type="button" class="btn btn-ghost" data-descartar="${x.id}">Descartar</button>
        <button type="button" class="btn btn-primary" data-aprobar="${x.id}">Aprobar</button></div>
    </article>`;
  };
  c.innerHTML = encabezado('Pendientes', 'Datos que cargaron los clientes. Revisalos antes de usarlos en un documento.',
    `<button type="button" class="btn btn-secondary" data-copiar="${esc(linkCliente)}">${icono('accesos', 18).replace(ICONOS.accesos, '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>')}Copiar link para clientes</button>`)
    + `<div class="lista">${(cargas || []).map(tarjeta).join('') || '<div class="card vacio">No hay datos nuevos para revisar.</div>'}</div>`;
}

// ── Autos ────────────────────────────────────────────────────────────────────
async function vistaAutos(c, p) {
  const { data: autos, error } = await sb.from('autos').select('*, vendedor:personas!autos_vendedor_fk(nombre)').eq('agencia_id', yo.agencia).neq('estado', 'baja').order('estado').order('id_unidad');
  if (error) throw error;
  const nInt = await OP.contarInteresados().catch(() => ({}));
  const filtro = p.get('estado') || 'todos', busca = (p.get('q') || '').toLowerCase();
  const cuenta = (e) => (autos || []).filter((a) => e === 'todos' || (a.estado || 'disponible') === e).length;
  const lista = (autos || []).filter((a) => (filtro === 'todos' || (a.estado || 'disponible') === filtro)
    && (!busca || [a.id_unidad, nombreAuto(a), a.dominio].join(' ').toLowerCase().includes(busca)));
  const estados = { disponible: ['DISPONIBLE', 'chip-ok'], reservado: ['RESERVADO', 'chip-info'], vendido: ['VENDIDO', 'chip-gris'] };
  const tarjeta = (a) => { const [t, cl] = estados[a.estado] || estados.disponible, vendido = a.estado === 'vendido';
    return `<article class="auto"><div class="foto-auto">${a.foto_url ? `<img src="${esc(a.foto_url)}" alt="${esc(nombreAuto(a))}" loading="lazy" style="${vendido ? 'opacity: .6;' : ''}">` : ''}<span class="chip ${cl}">${t}</span></div>
      <div class="cuerpo"><div class="stack" style="gap: 2px;"><h2 style="font-size: 17px;">${esc([a.marca, a.modelo, a.version].filter(Boolean).join(' '))}</h2>
        <span class="caption">${esc([a.anio, a.km != null ? miles(a.km) + ' km' : '', a.transmision, a.potencia].filter(Boolean).join(' · '))}</span></div>
        <div class="row" style="justify-content: space-between;"><span class="num" style="font-size: 20px; font-weight: 600;">${precio(a)}</span>${a.dominio ? `<span class="patente">${esc(formatoPatente(a.dominio))}</span>` : ''}</div>
        ${!vendido && nInt[a.id] ? `<button type="button" class="btn btn-ghost" style="justify-content: flex-start; padding-left: 0; color: var(--brand-strong);" data-interesados="${a.id}">${nInt[a.id]} interesado${nInt[a.id] > 1 ? 's' : ''} en algo así</button>` : ''}
        <div class="row caption"><span class="label">Vendedor</span><span style="color: ${a.vendedor ? 'var(--ink)' : 'var(--warning)'};">${esc(a.vendedor ? a.vendedor.nombre : 'Falta la cédula')}</span></div>
        ${vendido ? '' : `<div class="row" style="flex-wrap: nowrap;"><a class="btn btn-primary grow" href="#operacion?auto=${a.id}">Nueva operación</a>${(a.extra || {}).ig_link
          ? `<a class="btn btn-secondary" href="${esc(a.extra.ig_link)}" target="_blank" rel="noopener">Ver en IG</a>`
          : `<button type="button" class="btn btn-secondary" data-publicar="${esc(a.id_unidad)}"${(a.extra || {}).carpeta_fotos ? '' : ' disabled title="Falta el link de la carpeta de fotos en la planilla"'}>Publicar</button>`}</div>`}
      </div></article>`; };
  c.innerHTML = encabezado('Autos', 'El stock de la planilla: se actualiza solo cada 5 minutos.',
    `<div class="row" style="gap: 8px;"><button type="button" class="btn btn-primary" id="cargar-auto">Cargar auto</button><label class="row input" style="min-width: 240px; max-width: 320px; gap: 8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5a6472" stroke-width="1.5" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg><input id="buscar-auto" value="${esc(p.get('q') || '')}" placeholder="Buscar por modelo o patente" aria-label="Buscar autos" style="border: none; outline: none; font: inherit; flex-grow: 1; background: transparent;"></label></div>`)
    + `<div class="filtros" role="group" aria-label="Filtrar por estado">${[['todos', 'Todos'], ['disponible', 'Disponibles'], ['reservado', 'Reservados'], ['vendido', 'Vendidos']]
      .map(([k, t]) => `<a class="filtro${k === filtro ? ' activo' : ''}" style="display: inline-flex; align-items: center; text-decoration: none;" href="#autos?estado=${k}">${t} · ${cuenta(k)}</a>`).join('')}</div>`
    + `<div class="autos">${lista.map(tarjeta).join('') || '<div class="card vacio">No hay autos para mostrar. El stock se copia de la planilla cada pocos minutos.</div>'}</div>`;
  $('#cargar-auto').addEventListener('click', () => OP.abrirAuto({}, { alGuardar: ruta }));
  c.querySelectorAll('[data-interesados]').forEach((b) => b.addEventListener('click', async () => OP.verInteresados(await OP.interesados(b.dataset.interesados))));
  $('#buscar-auto').addEventListener('change', (e) => { location.hash = `autos?estado=${filtro}&q=${encodeURIComponent(e.target.value)}`; });
}

// ── Personas ─────────────────────────────────────────────────────────────────
async function vistaPersonas(c, p) {
  // Todas las personas (D-079): clientes + quienes buscan + dueños de autos de particulares (Radar), unidos por celular (unirPersonas)
  const [{ data, error }, ct] = await Promise.all([sb.from('personas').select('*').eq('agencia_id', yo.agencia).order('creado', { ascending: false }), OP.contactos()]);
  if (error) throw error;
  const filas = unirPersonas(data || [], ct.busquedas, ct.ofertas);
  const FILTROS = [['todas', 'Todas'], ['cliente', 'Clientes'], ['busca', 'Buscan'], ['vende', 'Autos de particulares']];
  const filtro = FILTROS.some(([k]) => k === p.get('f')) ? p.get('f') : 'todas';
  const n = (k) => filas.filter((f) => k === 'todas' || f.etiquetas.includes(k)).length;
  const ETQ = { cliente: ['Cliente', 'chip-ok'], busca: ['Busca auto', 'chip-info'], vende: ['Vende su auto', 'chip-aviso'] };
  c.innerHTML = encabezado('Personas', 'Clientes con sus datos de documentos, y la gente del Radar: los que buscan un auto y los particulares que venden el suyo.',
    `<div class="row" style="gap: 8px;"><button type="button" class="btn btn-primary" id="cargar-persona">Cargar cliente</button><input class="input" id="buscar-persona" placeholder="Buscar por nombre, DNI o celular" aria-label="Buscar personas" style="max-width: 300px;"></div>`)
    + `<div class="filtros" role="group" aria-label="Filtrar personas">${FILTROS.map(([k, t]) => `<a class="filtro${k === filtro ? ' activo' : ''}" style="display: inline-flex; align-items: center; text-decoration: none;" href="#personas?f=${k}">${t} · ${n(k)}</a>`).join('')}</div>`
    + `<div class="tabla-caja"><table><thead><tr><th>Nombre</th><th>Tipo</th><th>Documento</th><th>CUIL</th><th>Estado civil</th><th>Celular</th><th>Domicilio</th><th>Estado</th></tr></thead><tbody id="filas-personas"></tbody></table></div>`;
  const autoTxt = (o) => [o.marca, o.modelo, o.anio].filter(Boolean).join(' ');
  const pintar = (q) => { const qq = q.toLowerCase().replace(/[.\-\s]/g, '');
    $('#filas-personas').innerHTML = filas.filter((f) => (filtro === 'todas' || f.etiquetas.includes(filtro))
      && (!qq || [f.nombre, f.telefono, f.persona && f.persona.dni, f.persona && f.persona.cuit].join(' ').toLowerCase().replace(/[.\-\s]/g, '').includes(qq)))
    .map((f) => { const x = f.persona || {}, cli = !!f.persona;
      const radar = f.busquedas.map((b) => `<a class="caption" href="#radar?tab=buscan">Busca ${esc(textoBusqueda(b))}${b.estado !== 'activa' ? ' (cerrada)' : ''}</a>`)
        .concat(f.ofertas.map((o) => `<a class="caption" href="#radar?tab=particulares">Vende ${esc(autoTxt(o))}${o.estado === 'en_stock' ? ' (pasó al stock)' : o.estado !== 'activa' ? ' (cerrada)' : ''}</a>`)).join('<br>');
      return `<tr><td style="font-weight: 600; white-space: normal; min-width: 220px;">${esc(f.nombre)}${cli && x.tipo === 'juridica' && x.representante ? `<br><span class="caption">${esc([x.representante.nombre, x.representante.cargo].filter(Boolean).join(' · '))}</span>` : ''}
        <div class="etiquetas">${f.etiquetas.map((e) => `<span class="chip ${ETQ[e][1]}" style="font-size: 11px; padding: 0 8px; line-height: 20px;">${ETQ[e][0]}</span>`).join('')}</div>${radar ? `<div style="font-weight: 400;">${radar}</div>` : ''}</td>
      <td>${!cli ? 'Contacto' : x.tipo === 'juridica' ? 'Empresa' : x.relacion && x.relacion.tipo ? esc(x.relacion.tipo[0].toUpperCase() + x.relacion.tipo.slice(1)) : 'Persona'}</td>
      <td class="num">${!cli ? '' : esc(x.tipo === 'juridica' ? 'CUIT ' + (x.cuit || '') : x.dni ? 'DNI ' + (formatoDni(x.dni) || x.dni) : '')}</td><td class="num">${esc(x.cuil || '')}</td>
      <td>${esc(x.estado_civil || '')}${x.conyuge && x.conyuge.nombre ? `<br><span class="caption">${esc(x.conyuge.nombre)}</span>` : ''}</td>
      <td>${f.telefono && linkWhatsApp(f.telefono) ? `<a href="${esc(linkWhatsApp(f.telefono))}" target="_blank" rel="noopener">${esc(f.telefono)}</a>` : esc(f.telefono || '')}</td><td>${esc(x.domicilio || '')}</td>
      <td>${cli ? `<span class="chip ${x.estado === 'verificada' ? 'chip-ok' : 'chip-aviso'}">${x.estado === 'verificada' ? 'Verificada' : 'Pendiente'}</span>` : '<span class="caption">Sin documentos</span>'}</td></tr>`; }).join('')
    || '<tr><td colspan="8" class="vacio">No hay personas con este filtro. Los clientes aparecen al aprobar una carga de Pendientes o al cargarlos a mano; los del Radar, al sumar una búsqueda o un auto de particular.</td></tr>'; };
  $('#cargar-persona').addEventListener('click', () => OP.abrirPersona(ruta));
  pintar(''); $('#buscar-persona').addEventListener('input', (e) => pintar(e.target.value));
}

// ── Nueva operación ──────────────────────────────────────────────────────────
async function vistaOperacion(c, p) {
  const [{ data: autos }, { data: personas }] = await Promise.all([
    sb.from('autos').select('*').eq('agencia_id', yo.agencia).in('estado', ['disponible', 'reservado']).order('id_unidad'),
    sb.from('personas').select('*').eq('agencia_id', yo.agencia).order('nombre'),
  ]);
  const st = { auto: (autos || []).find((a) => a.id === p.get('auto')) || null, comprador: null, docs: new Set(['reserva', 'boleto']),
    op: { precio: '', sena: '', fecha: new Date().toISOString().slice(0, 10), plazo_dias: 10, forma_pago: PAGO_SIEMPRE.replace(' (como siempre)', ''), tipo_mandato: '', moneda_sena: 'ARS' } };
  if (st.auto && st.auto.precio) st.op.precio = String(st.auto.precio);
  const porId = Object.fromEntries((personas || []).map((x) => [x.id, x]));
  const vendedor = () => (st.auto && st.auto.vendedor_id ? porId[st.auto.vendedor_id] : null);
  const letras = (v, mon) => (Number(String(v).replace(/\D/g, '')) ? montoTexto(Number(String(v).replace(/\D/g, '')), mon || 'USD', 'reserva').replace(/ \(.*$/, '').toLowerCase().replace(/^./, (x) => x.toUpperCase()) : '');

  function pintar() {
    // Boleto sin vendedor aprobado: lo firma la agencia como siempre (vendedor por defecto, lo completa n8n)
    const v = vendedor(), docs = documentosDisponibles({ auto: st.auto, vendedor: v || { nombre: 'HAY AUTOS', dni: '-' }, comprador: st.comprador, op: st.op })
      .map((d) => (d.tipo === 'precarga_08' && !v ? { ...d, listo: false, falta: ['aprobar la cédula del vendedor (el 08 lo firma el titular)'] } : d))
      .map((d) => (DOCS_GENERABLES.includes(d.tipo) ? d : { ...d, listo: false, sinPlantilla: true }));
    const elegidos = docs.filter((d) => st.docs.has(d.tipo));
    const listos = elegidos.filter((d) => d.listo).length;
    c.innerHTML = encabezado('Nueva operación', 'Elegí el auto y el comprador. El vendedor sale de la cédula aprobada.')
      + `<div class="row" style="gap: 24px; align-items: flex-start;"><div class="stack" style="flex: 1 1 480px; min-width: 0; gap: 24px;">
        <section class="card stack"><div class="row" style="gap: 12px;"><span class="paso">1</span><h2>Auto</h2></div>
          <select class="input" id="op-auto" aria-label="Auto"><option value="">Elegí el auto…</option>${(autos || []).map((a) => `<option value="${a.id}"${st.auto && st.auto.id === a.id ? ' selected' : ''}>${esc(a.id_unidad)} · ${esc(nombreAuto(a))} · ${precio(a)}</option>`).join('')}</select>
          ${st.auto ? `<div class="opcion elegida" style="cursor: default;">${st.auto.foto_url ? `<img src="${esc(st.auto.foto_url)}" alt="" style="width: 96px; height: 76px; object-fit: cover; border-radius: 6px;">` : ''}<span class="stack" style="gap: 2px;"><b>${esc(nombreAuto(st.auto))}</b>
            <span class="caption" style="color: var(--ink);">${esc([formatoPatente(st.auto.dominio), st.auto.km != null ? miles(st.auto.km) + ' km' : '', precio(st.auto)].filter(Boolean).join(' · '))}</span>
            <span class="caption"><span class="label">Vendedor</span> ${v ? esc(v.nombre + ' · DNI ' + (formatoDni(v.dni) || '')) : '<span>El de siempre (HAY AUTOS) · <span style="color: var(--warning);">sin cédula aprobada</span></span>'}</span></span></div>` : ''}
        </section>
        <section class="card stack"><div class="row" style="gap: 12px;"><span class="paso">2</span><h2>Comprador</h2></div>
          <select class="input" id="op-comprador" aria-label="Comprador"><option value="">Elegí la persona…</option>${(personas || []).filter((x) => !v || x.id !== v.id).map((x) => `<option value="${x.id}"${st.comprador && st.comprador.id === x.id ? ' selected' : ''}>${esc(x.nombre)} · ${esc(x.tipo === 'juridica' ? 'Empresa · CUIT ' + (x.cuit || '') : 'DNI ' + (formatoDni(x.dni) || ''))}</option>`).join('')}</select>
          <span class="caption">¿No está? Mandale el link para clientes (en Pendientes) y aprobalo cuando cargue sus datos.</span>
        </section>
        <section class="card stack"><div class="row" style="gap: 12px;"><span class="paso">3</span><h2>Datos de la operación</h2></div>
          <div class="grid2">
            <label class="campo"><span class="label">Precio (U$S)</span><input class="input num" data-op="precio" inputmode="numeric" value="${esc(st.op.precio ? miles(st.op.precio) : '')}"><span class="caption" data-letras="precio">${esc(letras(st.op.precio))}</span></label>
            <label class="campo"><span class="label">Seña</span><span class="row" style="flex-wrap: nowrap; gap: 6px;"><select class="input" data-op="moneda_sena" aria-label="Moneda de la seña" style="width: 92px; flex-shrink: 0;">${['ARS', 'USD'].map((m) => `<option${st.op.moneda_sena === m ? ' selected' : ''}>${m}</option>`).join('')}</select><input class="input num" data-op="sena" inputmode="numeric" value="${esc(st.op.sena ? miles(st.op.sena) : '')}"></span><span class="caption" data-letras="sena">${esc(letras(st.op.sena, st.op.moneda_sena))}</span></label>
            <label class="campo"><span class="label">Fecha</span><input class="input" type="date" data-op="fecha" value="${esc(st.op.fecha)}"></label>
            <label class="campo"><span class="label">Plazo para el saldo (días)</span><input class="input num" data-op="plazo_dias" inputmode="numeric" value="${esc(st.op.plazo_dias)}"></label>
            <label class="campo" style="grid-column: 1 / -1;"><span class="label">Forma de pago del saldo</span><input class="input" data-op="forma_pago" value="${esc(st.op.forma_pago)}"></label>
          </div>
        </section></div>
        <section class="card stack" style="flex: 1 1 340px; min-width: 0;"><div class="row" style="gap: 12px;"><span class="paso">4</span><h2>Documentos</h2></div>
          ${docs.map((d) => `<label class="docu${st.docs.has(d.tipo) && !d.sinPlantilla ? ' on' : ''}"${d.sinPlantilla ? ' style="opacity: .6; cursor: default;"' : ''}><input type="checkbox" data-doc="${d.tipo}"${st.docs.has(d.tipo) && !d.sinPlantilla ? ' checked' : ''}${d.sinPlantilla ? ' disabled' : ''}>
            <span class="grow stack" style="gap: 8px;"><b>${d.nombre}</b></span>
            <span class="chip ${d.sinPlantilla ? 'chip-gris' : d.listo ? 'chip-ok' : 'chip-aviso'}">${d.sinPlantilla ? 'Falta la plantilla' : esc(textoFalta(d))}</span></label>`).join('')}
          <button type="button" class="btn btn-primary btn-big" id="op-generar"${listos && listos === elegidos.length ? '' : ' disabled'}>${elegidos.length ? `Generar ${elegidos.length} documento${elegidos.length > 1 ? 's' : ''}` : 'Elegí los documentos'}</button>
          <div id="op-resultado" class="stack" style="gap: 10px;"></div>
          <span class="caption" style="text-align: center;">Quedan en Drive (carpeta de la operación) y en el Historial.</span>
        </section></div>`;
    $('#op-auto').addEventListener('change', (e) => { st.auto = (autos || []).find((a) => a.id === e.target.value) || null; if (st.auto && st.auto.precio) st.op.precio = String(st.auto.precio); pintar(); });
    $('#op-comprador').addEventListener('change', (e) => { st.comprador = porId[e.target.value] || null; pintar(); });
    c.querySelectorAll('[data-op]').forEach((i) => i.addEventListener('change', () => { st.op[i.dataset.op] = ['precio', 'sena', 'plazo_dias'].includes(i.dataset.op) ? i.value.replace(/\D/g, '') : i.value; pintar(); }));
    c.querySelectorAll('[data-op="precio"], [data-op="sena"]').forEach((i) => i.addEventListener('input', () => { const t = c.querySelector(`[data-letras="${i.dataset.op}"]`); if (t) t.textContent = letras(i.value, i.dataset.op === 'sena' ? st.op.moneda_sena : 'USD'); }));
    c.querySelectorAll('[data-doc]').forEach((i) => i.addEventListener('change', () => { if (i.checked) st.docs.add(i.dataset.doc); else st.docs.delete(i.dataset.doc); pintar(); }));
    $('#op-generar').addEventListener('click', guardar);
  }
  async function guardar() {
    const b = $('#op-generar'), out = $('#op-resultado');
    const elegidos = [...st.docs].filter((t) => DOCS_GENERABLES.includes(t));
    b.disabled = true; b.innerHTML = '<span class="cargando" aria-hidden="true"></span> Generando… (unos segundos)'; out.innerHTML = '';
    try {
      const v = vendedor();
      const { data: op, error } = await sb.from('operaciones').insert({ agencia_id: yo.agencia, auto_id: st.auto.id, vendedor_id: v ? v.id : null, comprador_id: st.comprador ? st.comprador.id : null,
        precio: Number(st.op.precio) || null, sena: Number(st.op.sena) || null, moneda_sena: st.op.moneda_sena, fecha: st.op.fecha, plazo_dias: Number(st.op.plazo_dias) || 10, forma_pago: st.op.forma_pago,
        estado: elegidos.includes('reserva') ? 'reservada' : 'borrador' }).select().single();
      if (error) throw error;
      const { error: e2 } = await sb.from('documentos').insert(elegidos.map((tipo) => ({ agencia_id: yo.agencia, operacion_id: op.id, tipo })));
      if (e2) throw e2;
      const { data: { session } } = await sb.auth.getSession();
      // Texto plano: el navegador no hace la consulta previa de CORS (más rápido y sin problemas con el túnel)
      const r = await fetch(CFG.n8nUrl + '/webhook/' + CFG.rutaDocumentos, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ token: session.access_token, operacion_id: op.id }) });
      let j = null; try { j = await r.json(); } catch (_) { /* sin respuesta */ }
      if (!j || !j.ok) {
        const lista = (j && j.errores) || [];
        out.innerHTML = `<div class="aviso-caja aviso-error" style="flex-direction: column;"><b>${esc((j && j.error) || 'No se pudo generar: ¿está prendido n8n?')}</b>${lista.map((x) => `<span>• ${esc(x)}</span>`).join('')}</div>`;
        b.disabled = false; b.textContent = 'Probar de nuevo'; return;
      }
      out.innerHTML = j.documentos.map((d) => `<div class="opcion" style="cursor: default;"><span class="grow stack" style="gap: 2px;"><b>${esc(d.titulo)}</b><span class="caption">Listo</span></span>
        <a class="btn btn-secondary" href="${esc(d.doc_url)}" target="_blank" rel="noopener">Ver documento</a><a class="btn btn-primary" href="${esc(d.pdf_url)}" target="_blank" rel="noopener">PDF</a></div>`).join('')
        + (j.carpeta_url ? `<a href="${esc(j.carpeta_url)}" target="_blank" rel="noopener" style="text-align: center; font-weight: 500;">Abrir la carpeta de la operación</a>` : '');
      b.textContent = '✓ Generados'; toast('Documentos listos');
    } catch (e) { fallo(e); b.disabled = false; b.textContent = 'Probar de nuevo'; }
  }
  pintar();
}

// ── Historial ────────────────────────────────────────────────────────────────
async function vistaHistorial(c) {
  const { data, error } = await sb.from('eventos').select('*, auto:autos(marca,modelo,version,anio,foto_url)').eq('agencia_id', yo.agencia).order('creado', { ascending: false }).limit(100);
  if (error) throw error;
  const chips = { reserva: 'chip-info', venta: 'chip-gris', instagram: 'chip-gris', carga: 'chip-ok', operacion: 'chip-info', documento: 'chip-info' };
  c.innerHTML = encabezado('Historial', 'Todo lo que pasó con cada auto: operaciones, documentos y publicaciones.')
    + `<ol class="lista" style="list-style: none; margin: 0; padding: 0;">${(data || []).map((e) => `<li class="card row" style="gap: 16px; padding: 16px;">
      ${e.auto && e.auto.foto_url ? `<img src="${esc(e.auto.foto_url)}" alt="" style="width: 96px; height: 76px; object-fit: cover; border-radius: 6px;">` : ''}
      <div class="stack grow" style="gap: 4px; flex: 1 1 260px;"><div class="row" style="gap: 10px;"><span class="chip ${chips[e.tipo] || 'chip-gris'}">${esc(e.tipo.toUpperCase())}</span><span class="caption">${fechaCorta(e.creado)}</span></div>
        <b>${esc(e.auto ? nombreAuto(e.auto) : '')}</b><span class="muted" style="font-size: 14px;">${esc(e.detalle || '')}</span></div>
      ${((e.datos || {}).documentos || []).filter((d) => d && d.pdf_url).map((d) => `<a class="btn btn-secondary" href="${esc(d.pdf_url)}" target="_blank" rel="noopener">${esc(d.titulo || 'PDF')}</a>`).join('')}</li>`).join('')
      || '<li class="card vacio">Todavía no hay movimientos.</li>'}</ol>`;
}

// ── Accesos (solo administradores) ───────────────────────────────────────────
async function vistaAccesos(c) {
  if (yo.rol !== 'admin') { c.innerHTML = '<div class="card vacio">Solo los administradores pueden ver esta sección.</div>'; return; }
  const { data, error } = await sb.from('accesos').select('*').eq('agencia_id', yo.agencia).order('creado');
  if (error) throw error;
  c.innerHTML = encabezado('Accesos', 'Quién puede entrar al panel. Solo los administradores pueden sumar o quitar cuentas.')
    + `<form class="card stack" id="form-acceso"><h2>Dar acceso a una cuenta</h2>
      <div class="row" style="gap: 12px; align-items: flex-end;">
        <label class="campo" style="flex: 1 1 260px;"><span class="label">Email de Google</span><input class="input" type="email" name="email" required placeholder="nombre@gmail.com"></label>
        <label class="campo" style="flex: 1 1 180px;"><span class="label">Nombre</span><input class="input" name="nombre" placeholder="Cómo se llama"></label>
        <label class="campo" style="flex: 0 1 200px;"><span class="label">Permiso</span><select class="input" name="rol"><option value="usuario">Usuario</option><option value="admin">Administrador</option></select></label>
        <button class="btn btn-primary" style="min-height: 48px;">Dar acceso</button></div>
      <p class="caption">Usuario: ve y carga todo, genera documentos. Administrador: además maneja esta pantalla.</p></form>
    <div class="tabla-caja"><table><thead><tr><th>Persona</th><th>Cuenta</th><th>Permiso</th><th>Último ingreso</th><th><span hidden>Acciones</span></th></tr></thead><tbody>
    ${(data || []).filter((a) => a.activo).map((a) => `<tr><td style="font-weight: 600;">${esc(a.nombre || '')}</td><td>${esc(a.email)}</td>
      <td><span class="chip ${a.rol === 'admin' ? 'chip-info' : 'chip-gris'}">${a.rol === 'admin' ? 'Administrador' : 'Usuario'}</span></td>
      <td>${a.ultimo_ingreso ? fechaCorta(a.ultimo_ingreso) : 'Nunca'}</td>
      <td style="text-align: right;">${a.email === yo.email.toLowerCase() ? '<span class="caption">Vos</span>' : `<button type="button" class="btn btn-ghost" data-permiso="${a.id}" data-rol="${a.rol === 'admin' ? 'usuario' : 'admin'}">${a.rol === 'admin' ? 'Pasar a usuario' : 'Hacer administrador'}</button><button type="button" class="btn btn-danger" data-quitar="${a.id}">Quitar acceso</button>`}</td></tr>`).join('')}
    </tbody></table></div>`;
  $('#form-acceso').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    const { error: er } = await sb.from('accesos').upsert({ agencia_id: yo.agencia, email: f.email.value.trim().toLowerCase(), nombre: f.nombre.value.trim() || null, rol: f.rol.value, activo: true }, { onConflict: 'agencia_id,email' });
    if (er) return fallo(er); toast('Acceso dado'); ruta();
  });
}

const VISTAS = { inicio: (c) => OP.vistaInicio(c), radar: (c, p) => OP.vistaRadar(c, p), pendientes: vistaPendientes, autos: vistaAutos, personas: vistaPersonas, operacion: vistaOperacion, historial: vistaHistorial, accesos: vistaAccesos };

// ── Acciones con un clic (delegadas) ─────────────────────────────────────────
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-aprobar],[data-descartar],[data-copiar],[data-ver],[data-quitar],[data-permiso],[data-publicar]');
  if (!t) return;
  try {
    if (t.dataset.aprobar) { t.disabled = true; const { error } = await sb.rpc('aprobar_carga', { p_carga: t.dataset.aprobar }); if (error) throw error; toast('Aprobado: ya está en Personas'); ruta(); }
    else if (t.dataset.descartar) { if (!confirm('¿Descartar esta carga? No se borra, pero sale de Pendientes.')) return; const { error } = await sb.from('cargas').update({ estado: 'descartada' }).eq('id', t.dataset.descartar); if (error) throw error; toast('Descartada'); ruta(); }
    else if (t.dataset.copiar) { await navigator.clipboard.writeText(t.dataset.copiar); toast('Link copiado: ' + t.dataset.copiar); }
    else if (t.dataset.ver) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<img src="${esc(t.dataset.ver)}" alt="Foto del documento">`; m.addEventListener('click', () => m.remove()); document.body.appendChild(m); }
    else if (t.dataset.quitar) { if (!confirm('¿Quitarle el acceso a esta cuenta?')) return; const { error } = await sb.from('accesos').update({ activo: false }).eq('id', t.dataset.quitar); if (error) throw error; toast('Acceso quitado'); ruta(); }
    else if (t.dataset.publicar) {
      if (!confirm('¿Publicar este auto en Instagram? La IA ordena las fotos y arma el texto; sale en los próximos minutos.')) return;
      t.disabled = true; t.innerHTML = '<span class="cargando" aria-hidden="true"></span>';
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch(CFG.n8nUrl + '/webhook/' + CFG.rutaPublicar, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ token: session.access_token, id_unidad: t.dataset.publicar }) });
      let j = null; try { j = await r.json(); } catch (_) { /* sin respuesta */ }
      if (!j || !j.ok) throw new Error((j && j.error) || '¿está prendido n8n?');
      t.textContent = 'En camino'; toast('Listo: se publica en los próximos minutos');
    }
    else if (t.dataset.permiso) { const { error } = await sb.from('accesos').update({ rol: t.dataset.rol }).eq('id', t.dataset.permiso); if (error) throw error; toast('Permiso cambiado'); ruta(); }
  } catch (er) { fallo(er); t.disabled = false; }
});
document.addEventListener('change', async (e) => {
  const s = e.target.closest('[data-cambiar-auto]'); if (!s || !s.value) return;
  const { error } = await sb.from('cargas').update({ auto_id: s.value, vinculo: { por: 'manual', coincide: [], texto: 'Vinculado a mano.' } }).eq('id', s.dataset.cambiarAuto);
  if (error) return fallo(error); toast('Auto vinculado'); ruta();
});

iniciar();

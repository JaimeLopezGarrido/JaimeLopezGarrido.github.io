// ═══════════════════════════════════════════════════════════════════════════════
// MATCHES (sin IA) — v0.1 (D-078, agencia piloto: HAY AUTOS)
// Búsquedas ("busco un auto que no tienen") × autos (stock de la agencia + autos a la venta afuera) → puntaje 0-100 con el porqué.
// Regla del responsable: CADA CAMPO COMPLETADO ES REQUISITO; vacío = "me da igual". Un dato que el auto no tiene cargado → "a confirmar"
// (no descarta, baja el puntaje). Presupuesto: hasta 15% arriba se acepta como "un poco arriba".
// Catálogo: data/catalog/vehicle_dict.json (959 modelos, 16 segmentos: Hilux ↔ S10 ↔ Ranger = pickup_mediana). Archivo independiente:
// se puede cargar junto a documentos_core.js y webapp_core.js (todos los nombres internos empiezan con _mc).
//   catalogoMatches(dict) → C        vehiculoDe(fila, origen, C) → vehículo normalizado
//   puntuar(busqueda, vehiculo, C) → { match, puntaje, razones: [{tipo: ok|aviso|duda, texto}], descarte }
//   matchesDe(busquedas, vehiculos, C, estados) · interesadosEn(vehiculo, busquedas, C) · vigencia(fila, ahoraMs)
//   textoBusqueda(b) · mensajeMatch(...) · mensajeSigueBuscando(b) · linkWhatsApp(tel, texto)
// ═══════════════════════════════════════════════════════════════════════════════

const _mcNorm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ\s.\-/]/g, ' ').replace(/\s+/g, ' ').trim();
const _mcEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const _mcNum = (v) => { const s = String(v == null ? '' : v).replace(/[^\d]/g, ''); return s ? Number(s) : null; };
function _mcDam(a, b) {
  const al = a.length, bl = b.length; if (Math.abs(al - bl) > 1) return 2;
  const d = []; for (let i = 0; i <= al; i++) d[i] = [i]; for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) for (let j = 1; j <= bl; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[al][bl];
}

// Categorías que ve el responsable (tipo del catálogo) y sus etiquetas
const CATEGORIAS = [['pickup', 'Pickup'], ['suv', 'SUV'], ['sedan', 'Sedán'], ['hatchback', 'Hatchback / auto chico'], ['utilitario', 'Utilitario'], ['deportivo', 'Deportivo'], ['monovolumen', 'Monovolumen']];
const FLEXIBILIDADES = [['exacto', 'Solo este modelo'], ['similares', 'Este modelo o similares'], ['categoria', 'Cualquiera de esta categoría']];

function catalogoMatches(dict) {
  const d = dict || { models: [], brands: {}, segments: {} };
  const cands = [], marcas = [];
  for (const m of d.models || []) for (const a of m.aliases || []) if (a) cands.push({ a, m });
  cands.sort((x, y) => y.a.length - x.a.length);
  for (const [k, b] of Object.entries(d.brands || {})) for (const a of b.aliases || []) if (a) marcas.push({ a, k });
  marcas.sort((x, y) => y.a.length - x.a.length);
  const tiene = (t, a) => new RegExp(`(^|[^a-z0-9])${_mcEsc(a)}([^a-z0-9]|$)`).test(t);
  function marca(texto) { const t = _mcNorm(texto); for (const { a, k } of marcas) if (tiene(t, a)) return k; return null; }
  function modelo(texto, marcaK) {
    const t = _mcNorm(texto), bk = marcaK || marca(t);
    for (const { a, m } of cands) {
      if ((/^\d+$/.test(a) || m.needs_brand) && m.brand !== bk) continue;
      if (bk && m.brand !== bk) continue;
      if (tiene(t, a)) return m;
    }
    if (bk) for (const w of t.split(/[^a-z0-9]+/).filter((x) => x.length >= 4 && /[a-z]/.test(x))) {
      const hits = [...new Set(cands.filter(({ a, m }) => m.brand === bk && !a.includes(' ') && a.length >= 4 && _mcDam(w, a) === 1).map((h) => h.m))];
      if (hits.length === 1) return hits[0];
    }
    return null;
  }
  const tipoDeSegmento = (s) => (s && d.segments && d.segments[s] ? d.segments[s].type : null);
  const etiquetaSegmento = (s) => (s && d.segments && d.segments[s] ? d.segments[s].label : '');
  const tipoDeTexto = (t) => { const x = _mcNorm(t); if (!x) return null; const inv = (d.inventoryTypeMap || {})[x]; if (inv) return inv;
    for (const [tipo, al] of Object.entries(d.typeAliases || {})) if (al.some((a) => tiene(x, _mcNorm(a)))) return tipo === 'camioneta' ? 'pickup' : tipo; return null; };
  return { marca, modelo, tipoDeSegmento, etiquetaSegmento, tipoDeTexto, marcaLabel: (k) => (k && d.brands && d.brands[k] ? d.brands[k].label : null) };
}

// Valores normalizados para comparar
const _mcTrans = (t) => { const x = _mcNorm(t); if (!x) return ''; if (/manual|mecanic/.test(x)) return 'manual'; if (/auto|cvt|\bat\b|dsg|tiptronic/.test(x)) return 'automatica'; return x; };
const _mcComb = (t) => { const x = _mcNorm(t); if (!x) return ''; if (/diesel|gasoil|tdi|hdi|crdi|d4d/.test(x)) return 'diesel'; if (/hibrid/.test(x)) return 'hibrido'; if (/electr/.test(x)) return 'electrico'; if (/gnc/.test(x)) return 'gnc'; if (/nafta|naftero|gasolina/.test(x)) return 'nafta'; return x; };
const _mcTrac = (t) => { const x = _mcNorm(t); if (!x) return ''; if (/4x4|4wd|awd|integral/.test(x)) return '4x4'; if (/4x2|2wd|fwd|rwd/.test(x)) return '4x2'; return x; };
const _mcColor = (t) => _mcNorm(t).replace(/\b(metalizado|perlado|oscuro|claro)\b/g, '').trim().split(' ')[0] || '';

// Una fila del stock (autos) o de ofertas_externas → vehículo comparable
function vehiculoDe(f, origen, C) {
  const x = f || {}, bk = C.marca(x.marca || '') || C.marca(x.modelo || '');
  // El modelo sale de marca + modelo (la versión "GTI" no lo cambia: un Golf GTI es un Golf); la versión solo afina la categoría si hace falta
  const mBase = C.modelo(`${x.marca || ''} ${x.modelo || ''}`, bk), mVer = C.modelo(`${x.marca || ''} ${x.modelo || ''} ${x.version || ''}`, bk);
  const m = mBase || mVer, seg = (mBase && mBase.segment) || (mVer && mVer.segment) || null;
  const tipoExtra = C.tipoDeTexto((x.extra && x.extra.tipo) || x.tipo || '');
  return { id: x.id, origen, marca: x.marca || '', modelo: x.modelo || '', version: x.version || '', marca_k: bk || (m && m.brand) || _mcNorm(x.marca),
    modelo_k: m ? m.key : _mcNorm(x.modelo), segmento: seg, tipo: C.tipoDeSegmento(seg) || tipoExtra || null,
    anio: _mcNum(x.anio), km: x.km == null || x.km === '' ? null : _mcNum(x.km), precio: _mcNum(x.precio), moneda: String(x.moneda || 'USD').toUpperCase(),
    color: _mcColor(x.color), transmision: _mcTrans(x.transmision), combustible: _mcComb(x.combustible), traccion: _mcTrac(x.traccion || (x.version && /4x4/i.test(x.version) ? '4x4' : '')),
    puertas: _mcNum(x.puertas), foto_url: x.foto_url || '', estado: x.estado || 'activa',
    titulo: [x.marca, x.modelo, x.version].filter(Boolean).join(' ') + (x.anio ? ' ' + x.anio : ''),
    nombre: x.nombre || '', telefono: x.telefono || '', vendedor: x.vendedor || null };
}

// Qué busca, en palabras ("una Toyota Hilux o similar, 2018 o más nueva, hasta U$S 25.000")
function textoBusqueda(b) {
  const x = b || {}, cat = (CATEGORIAS.find((c) => c[0] === x.categoria) || [])[1];
  let que = [x.marca, x.modelo, x.version].filter(Boolean).join(' ');
  if (x.flexibilidad === 'categoria' || !que) que = cat ? (cat === 'SUV' ? 'una SUV' : 'una ' + cat.toLowerCase().split(' /')[0]) : (que || 'un auto');
  else if (x.flexibilidad === 'similares') que += ' o similar';
  const anios = x.anio_min && x.anio_max ? (Number(x.anio_min) === Number(x.anio_max) ? `año ${x.anio_min}` : `${x.anio_min} a ${x.anio_max}`) : x.anio_min ? `${x.anio_min} o más nueva` : x.anio_max ? `hasta ${x.anio_max}` : '';
  const partes = [que, anios, x.km_max ? `menos de ${_mcMiles(x.km_max)} km` : '', x.presupuesto ? `hasta ${x.moneda === 'ARS' ? '$' : 'U$S'} ${_mcMiles(x.presupuesto)}` : '',
    x.transmision ? (x.transmision === 'manual' ? 'manual' : 'automática') : '', (x.colores || []).length ? (x.colores.length > 1 ? 'color ' + x.colores.join(' o ') : 'color ' + x.colores[0]) : ''];
  return partes.filter(Boolean).join(', ');
}
const _mcMiles = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ── Puntaje ──────────────────────────────────────────────────────────────────
// Pesos de lo que se pidió (solo cuentan los campos completados). ok = todo · aviso ("un poco arriba", "similar") = parte · duda (dato faltante) = 40%
const _MC_PESO = { modelo: 35, anio: 15, km: 10, precio: 20, transmision: 6, combustible: 5, traccion: 5, puertas: 4, color: 5, version: 5 };
function puntuar(b, v, C) {
  const x = b || {}, razones = [];
  let gana = 0, posible = 0;
  const sumar = (k, factor, tipo, texto) => { const w = _MC_PESO[k]; posible += w; gana += w * factor; razones.push({ tipo, texto }); };
  const no = (motivo) => ({ match: false, puntaje: 0, razones, descarte: motivo });
  // 1. Qué auto
  const flex = x.flexibilidad || (x.modelo ? 'exacto' : x.categoria ? 'categoria' : x.marca ? 'exacto' : 'categoria');
  const bm = x.modelo ? C.modelo(`${x.marca || ''} ${x.modelo}`, C.marca(x.marca || '')) : null;
  const bmk = bm ? bm.key : _mcNorm(x.modelo), bmarca = C.marca(x.marca || '') || _mcNorm(x.marca);
  const bseg = bm ? bm.segment : null, btipo = x.categoria || C.tipoDeSegmento(bseg);
  const mismoModelo = !!bmk && v.modelo_k === bmk && (!bmarca || !v.marca_k || v.marca_k === bmarca);
  if (flex === 'exacto') {
    if (x.modelo) { if (!mismoModelo) return no('otro modelo'); sumar('modelo', 1, 'ok', 'Modelo exacto'); }
    else if (bmarca) { if (v.marca_k !== bmarca) return no('otra marca'); sumar('modelo', 1, 'ok', 'Marca ' + (C.marcaLabel(bmarca) || x.marca)); }
  } else if (flex === 'similares') {
    if (mismoModelo) sumar('modelo', 1, 'ok', 'Modelo exacto');
    else if (bseg && v.segmento === bseg) sumar('modelo', 0.75, 'aviso', 'Similar (' + C.etiquetaSegmento(bseg) + ')');
    else if (!bseg && btipo && v.tipo === btipo) sumar('modelo', 0.6, 'aviso', 'Misma categoría');
    else return no('no es similar');
  } else {
    if (!btipo) { if (bmarca && v.marca_k !== bmarca) return no('otra marca'); }
    else if (!v.tipo) sumar('modelo', 0.4, 'duda', 'Categoría a confirmar');
    else if (v.tipo !== btipo) return no('otra categoría');
    else sumar('modelo', 1, 'ok', 'Es ' + (((CATEGORIAS.find((c) => c[0] === btipo) || [])[1] || btipo).split(' /')[0].replace(/^(?!SUV).*/, (t) => t.toLowerCase())));
    if (btipo && bmarca) { if (v.marca_k !== bmarca) return no('otra marca'); }
  }
  // Versión pedida (palabras): "GTI" tiene que estar en la versión del auto
  if (x.version && flex === 'exacto') {
    const pal = _mcNorm(x.version).split(' ').filter((w) => w.length >= 2), vv = _mcNorm(`${v.version} ${v.modelo}`);
    if (!vv.trim()) sumar('version', 0.4, 'duda', 'Versión a confirmar');
    else if (pal.every((w) => vv.includes(w))) sumar('version', 1, 'ok', 'Versión ' + x.version);
    else return no('otra versión');
  }
  // 2. Año
  const amin = _mcNum(x.anio_min), amax = _mcNum(x.anio_max);
  if (amin || amax) {
    if (!v.anio) sumar('anio', 0.4, 'duda', 'Año a confirmar');
    else if ((amin && v.anio < amin) || (amax && v.anio > amax)) return no('año fuera de rango');
    else sumar('anio', 1, 'ok', 'Año ' + v.anio);
  }
  // 3. Km
  const kmax = _mcNum(x.km_max);
  if (kmax) {
    if (v.km == null) sumar('km', 0.4, 'duda', 'Km a confirmar');
    else if (v.km > kmax) return no('más km');
    else sumar('km', 1, 'ok', _mcMiles(v.km) + ' km');
  }
  // 4. Presupuesto (hasta 15% arriba = "un poco arriba")
  const pres = _mcNum(x.presupuesto), mon = String(x.moneda || 'USD').toUpperCase();
  if (pres) {
    const sim = mon === 'ARS' ? '$' : 'U$S';
    if (!v.precio) sumar('precio', 0.4, 'duda', 'Precio a confirmar');
    else if (v.moneda !== mon) sumar('precio', 0.4, 'duda', 'Precio en otra moneda');
    else if (v.precio <= pres) sumar('precio', 1, 'ok', `${sim} ${_mcMiles(v.precio)} (dentro)`);
    else if (v.precio <= pres * 1.15) sumar('precio', 0.5, 'aviso', `${sim} ${_mcMiles(v.precio)} (un poco arriba)`);
    else return no('se pasa del presupuesto');
  }
  // 5. Detalles: si se pidió, es requisito
  const det = [['transmision', x.transmision, v.transmision, _mcTrans, (t) => (t === 'manual' ? 'Manual' : 'Automática')],
    ['combustible', x.combustible, v.combustible, _mcComb, (t) => t[0].toUpperCase() + t.slice(1)],
    ['traccion', x.traccion, v.traccion, _mcTrac, (t) => t], ['puertas', x.puertas, v.puertas, _mcNum, (t) => t + ' puertas']];
  for (const [k, pedido, tiene, normf, etiqueta] of det) {
    if (!pedido) continue;
    const p = normf(pedido);
    if (!tiene) sumar(k, 0.4, 'duda', etiqueta(p) + ' a confirmar');
    else if (tiene !== p) return no('otra ' + k);
    else sumar(k, 1, 'ok', etiqueta(p));
  }
  const colores = (x.colores || []).map(_mcColor).filter(Boolean);
  if (colores.length) {
    if (!v.color) sumar('color', 0.4, 'duda', 'Color a confirmar');
    else if (!colores.includes(v.color)) return no('otro color');
    else sumar('color', 1, 'ok', 'Color ' + v.color);
  }
  if (!posible) return { match: true, puntaje: 50, razones: [{ tipo: 'aviso', texto: 'Búsqueda sin detalles' }], descarte: null };
  return { match: true, puntaje: Math.round((100 * gana) / posible), razones, descarte: null };
}

// Todas las búsquedas activas × todos los vehículos → matches ordenados (mejor puntaje primero). estados: { 'busqueda|origen|id': {estado, ...} }
function matchesDe(busquedas, vehiculos, C, estados) {
  const out = [], e = estados || {};
  for (const b of busquedas || []) {
    if (b.estado && b.estado !== 'activa') continue;
    for (const v of vehiculos || []) {
      if (v.origen === 'afuera' && v.telefono && b.telefono && String(v.telefono).replace(/\D/g, '') === String(b.telefono).replace(/\D/g, '')) continue; // la misma persona
      const r = puntuar(b, v, C);
      if (!r.match) continue;
      const clave = `${b.id}|${v.origen}|${v.id}`;
      out.push({ clave, busqueda: b, vehiculo: v, puntaje: r.puntaje, razones: r.razones, estado: (e[clave] && e[clave].estado) || 'nuevo' });
    }
  }
  return out.sort((a, b) => b.puntaje - a.puntaje || String(b.busqueda.creado || '').localeCompare(String(a.busqueda.creado || '')));
}
function interesadosEn(v, busquedas, C) {
  return (busquedas || []).filter((b) => !b.estado || b.estado === 'activa').map((b) => ({ busqueda: b, ...puntuar(b, v, C) })).filter((r) => r.match).sort((a, b) => b.puntaje - a.puntaje);
}

// Vigencia: 90 días desde que se cargó o se renovó (los últimos 10, "por vencer")
function vigencia(f, ahoraMs) {
  const base = Date.parse((f && (f.renovada || f.creado)) || '') || ahoraMs, dias = Math.floor((ahoraMs - base) / 864e5);
  return { dias, estado: dias >= 90 ? 'vencida' : dias >= 80 ? 'por_vencer' : 'vigente', quedan: Math.max(0, 90 - dias) };
}

// ── WhatsApp con el tono de la casa (voseo, sin emojis, "HAY AUTOS") ──────────────────────────
const _mcPrimer = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const _mcPrecio = (v) => (v.precio ? `${v.moneda === 'ARS' ? '$' : 'U$S'} ${_mcMiles(v.precio)}` : '');
function mensajeMatch({ busqueda, vehiculo, para }) {
  const b = busqueda || {}, v = vehiculo || {}, datos = [v.anio, v.km != null ? _mcMiles(v.km) + ' km' : '', _mcPrecio(v)].filter(Boolean).join(', ');
  const auto = [v.marca, v.modelo, v.version].filter(Boolean).join(' ');
  if (para === 'dueno') return `Hola ${_mcPrimer(v.nombre)}! ¿Cómo estás? Te escribo de HAY AUTOS por tu ${auto}. Tenemos una persona interesada en algo así. ¿Seguís con ganas de venderlo?`;
  const que = textoBusqueda(b);
  return v.origen === 'afuera'
    ? `Hola ${_mcPrimer(b.nombre)}! ¿Cómo estás? Te escribo de HAY AUTOS. Nos dijiste que buscabas ${que}. Tenemos un contacto que vende un ${auto}${datos ? ' (' + datos + ')' : ''}. ¿Querés que te pase más información?`
    : `Hola ${_mcPrimer(b.nombre)}! ¿Cómo estás? Te escribo de HAY AUTOS. Nos dijiste que buscabas ${que}. Nos entró un ${auto}${datos ? ' (' + datos + ')' : ''}. ¿Querés que te pase más información?`;
}
function mensajeSigueBuscando(b, esOferta) {
  return esOferta
    ? `Hola ${_mcPrimer(b.nombre)}! ¿Cómo estás? Te escribo de HAY AUTOS. ¿Seguís con ganas de vender tu ${[b.marca, b.modelo].filter(Boolean).join(' ')}?`
    : `Hola ${_mcPrimer(b.nombre)}! ¿Cómo estás? Te escribo de HAY AUTOS. ¿Seguís buscando ${textoBusqueda(b)}?`;
}
// Celular argentino → wa.me (549 + característica + número). Sin número válido → '' (no hay links rotos, D-057)
function linkWhatsApp(tel, texto) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, (m, a, n) => (a.length + n.length === 10 ? a + n : m));
  if (d.length !== 10) return '';
  return 'https://wa.me/549' + d + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

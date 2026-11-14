// Tablero de Inicio del panel (D-079): números de la agencia a partir de lo que ya hay (stock, operaciones, búsquedas). Sin IA.
// Probado con jsc en tests/unit/test_tablero.js. Usa vehiculoDe/CATEGORIAS de matches_core.js (cargado antes).
// Nombres internos con prefijo _tb para no chocar con los otros cores (son globales en la página).

const _TB_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const _tbMes = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const _tbFecha = (v) => { const t = Date.parse(v || ''); return isNaN(t) ? null : t; };
const _tbNum = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };

// Cuándo entró al stock: fecha de la planilla (fecha_ingreso) si la tiene; si no, desde que el sistema lo vio por primera vez
function ingresoDe(a) { return _tbFecha((a.extra || {}).ingreso) || _tbFecha(a.creado); }

// Stock: disponibles + reservados (lo que está en la agencia)
function resumenStock(autos, ahora) {
  const enStock = (autos || []).filter((a) => a.estado === 'disponible' || a.estado === 'reservado');
  const valor = { USD: 0, ARS: 0 }, conPrecio = { USD: 0 };
  for (const a of enStock) { const m = String(a.moneda || 'USD').toUpperCase() === 'ARS' ? 'ARS' : 'USD'; valor[m] += _tbNum(a.precio); if (m === 'USD' && _tbNum(a.precio)) conPrecio.USD++; }
  const dias = enStock.map((a) => { const i = ingresoDe(a); return i == null ? null : Math.max(0, Math.floor((ahora - i) / 864e5)); });
  const conDias = dias.filter((d) => d != null);
  const viejos = enStock.map((a, k) => ({ auto: a, dias: dias[k] })).filter((x) => x.dias != null && x.dias >= 60).sort((x, y) => y.dias - x.dias);
  return {
    disponibles: enStock.filter((a) => a.estado === 'disponible').length,
    reservados: enStock.filter((a) => a.estado === 'reservado').length,
    valor, precio_promedio: conPrecio.USD ? Math.round(valor.USD / conPrecio.USD) : 0,
    dias_promedio: conDias.length ? Math.round(conDias.reduce((s, d) => s + d, 0) / conDias.length) : null,
    viejos,
    sin_foto: enStock.filter((a) => !a.foto_url).length,
    sin_publicar: enStock.filter((a) => a.estado === 'disponible' && !(a.extra || {}).ig_link).length,
  };
}

// Ventas por mes (últimos n): un auto cuenta una vez, en la primera fecha conocida.
// Fuentes: la fecha en que el stock lo vio pasar a vendido (extra.vendido_en) y los boletos generados desde el panel.
function ventasPorMes(autos, boletos, ahora, n) {
  const cuando = {};
  for (const a of autos || []) { const f = a.estado === 'vendido' && _tbFecha((a.extra || {}).vendido_en); if (f) cuando[a.id] = Math.min(cuando[a.id] || Infinity, f); }
  for (const b of boletos || []) { const f = _tbFecha(b.fecha); if (b.auto_id && f) cuando[b.auto_id] = Math.min(cuando[b.auto_id] || Infinity, f); }
  const d = new Date(ahora), meses = [];
  for (let k = (n || 6) - 1; k >= 0; k--) { const m = new Date(d.getFullYear(), d.getMonth() - k, 1); meses.push({ mes: _tbMes(m.getTime()), etiqueta: _TB_MESES[m.getMonth()], n: 0 }); }
  for (const f of Object.values(cuando)) { const x = meses.find((m) => m.mes === _tbMes(f)); if (x) x.n++; }
  const sin_fecha = (autos || []).filter((a) => a.estado === 'vendido' && !cuando[a.id]).length;
  const este = meses[meses.length - 1].n, anterior = meses.length > 1 ? meses[meses.length - 2].n : 0;
  return { meses, este_mes: este, mes_anterior: anterior, diferencia: este - anterior, sin_fecha };
}

// Qué busca la gente vs qué hay en el stock, por tipo de auto (pickup, SUV…)
function demandaVsStock(busquedas, vehiculosStock, C) {
  const filas = {};
  const fila = (t) => filas[t] || (filas[t] = { tipo: t, etiqueta: ((CATEGORIAS.find((c) => c[0] === t) || [])[1] || t), buscan: 0, stock: 0 });
  for (const b of busquedas || []) {
    if (b.estado && b.estado !== 'activa') continue;
    const t = b.categoria || (b.modelo || b.marca ? vehiculoDe({ marca: b.marca, modelo: b.modelo }, 'x', C).tipo : null);
    if (t) fila(t).buscan++;
  }
  for (const v of vehiculosStock || []) if (v.tipo) fila(v.tipo).stock++;
  return Object.values(filas).sort((a, b) => b.buscan - a.buscan || b.stock - a.stock)
    .map((f) => ({ ...f, falta: f.buscan > f.stock }));
}

// Personas (D-079): una sola lista con clientes (tabla personas) + quienes buscan + dueños de autos de particulares.
// Se une por celular (mismo número = misma persona), así alguien que buscaba y después compró aparece una vez con las dos etiquetas.
const _tbTel = (t) => { const w = linkWhatsApp(t); if (w) return w.slice(-10); const d = String(t || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-10) : ''; };
function unirPersonas(personas, busquedas, ofertas) {
  const filas = [], porTel = {};
  const fila = (base) => { const f = { persona: null, nombre: '', telefono: '', creado: '', etiquetas: [], busquedas: [], ofertas: [], ...base }; filas.push(f); const k = _tbTel(f.telefono); if (k && !porTel[k]) porTel[k] = f; return f; };
  const etiqueta = (f, e) => { if (!f.etiquetas.includes(e)) f.etiquetas.push(e); };
  for (const p of personas || []) etiqueta(fila({ persona: p, nombre: p.nombre, telefono: p.telefono || '', creado: p.creado || '' }), 'cliente');
  const sumar = (x, lista, e) => {
    const k = _tbTel(x.telefono);
    let f = k && porTel[k];
    if (!f) f = fila({ nombre: x.nombre, telefono: x.telefono || '', creado: x.creado || '' });
    f[lista].push(x); etiqueta(f, e);
    if ((x.creado || '') > f.creado) f.creado = x.creado;
  };
  for (const b of busquedas || []) sumar(b, 'busquedas', 'busca');
  for (const o of ofertas || []) sumar(o, 'ofertas', 'vende');
  return filas.sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
}

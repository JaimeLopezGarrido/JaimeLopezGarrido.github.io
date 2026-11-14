// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENTOS DE OPERACIÓN (sin IA) — v0.1 (D-062, agencia piloto: Hay Autos)
// Reserva de compra y boleto de compraventa: el texto legal vive en plantillas de Google Docs con huecos {{CLAVE}};
// acá solo se arman los VALORES (montos en letras, fechas, DNI, patente) y se valida lo que cargó el responsable.
//   enLetras(n)                         → "NUEVE MIL NOVECIENTOS" (con apócope: VEINTIÚN MIL, UN MILLÓN)
//   montoTexto(n, moneda, estilo)       → "NUEVE MIL NOVECIENTOS DÓLARES ESTADOUNIDENSES (U$S 9.900)"
//   fechaPartes(iso)                    → { dia: '13', mes: 'octubre', anio: '2026', corta: '13/10/2026' }
//   formatoDni(t) · normalizarPatente(t) · miles(n)
//   camposFormulario(tipo, inventario, compradores, cfg, hoyIso) → campos (JSON) de la 2ª página del formulario
//   armarDocumento(tipo, respuestas, inventario, compradores, cfg) → { ok, errores, reemplazos, resumen }
// ═══════════════════════════════════════════════════════════════════════════════

const _U = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
  'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS',
  'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const _D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const _C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
function _menorMil(n) {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100), r = n % 100, out = [];
  if (c) out.push(_C[c]);
  if (r) out.push(r < 30 ? _U[r] : _D[Math.floor(r / 10)] + (r % 10 ? ' Y ' + _U[r % 10] : ''));
  return out.join(' ');
}
// "UNO" y "VEINTIUNO" se acortan delante de MIL / MILLONES / un sustantivo (UN MIL no: MIL; VEINTIÚN MIL; TREINTA Y UN MIL)
function _apocope(t) { return t.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/(^| )UNO$/, '$1UN'); }
function enLetras(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1e6), miles_ = Math.floor((n % 1e6) / 1000), resto = n % 1000, out = [];
  if (millones) out.push(millones === 1 ? 'UN MILLÓN' : _apocope(_menorMil(millones)) + ' MILLONES');
  if (miles_) out.push(miles_ === 1 ? 'MIL' : _apocope(_menorMil(miles_)) + ' MIL');
  if (resto) out.push(_menorMil(resto));
  return out.join(' ');
}
function miles(n) { const d = String(Math.floor(Math.abs(Number(n) || 0))); return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function _num(v) { const s = String(v == null ? '' : v).replace(/[^\d]/g, ''); return s ? Number(s) : null; }
const MONEDAS = {
  USD: { nombre: 'DÓLARES ESTADOUNIDENSES', intro: 'dólares estadounidenses', simbolo: { reserva: 'U$S', boleto: 'U$s' } },
  ARS: { nombre: 'PESOS ARGENTINOS', intro: 'pesos argentinos', simbolo: { reserva: 'ARS', boleto: 'ARS' } },
};
// estilo: 'reserva' (U$S) | 'boleto' (U$s), como en cada documento de la agencia; sinNombre: "NUEVE MIL NOVECIENTOS (U$S 9.900)"
function montoTexto(n, moneda, estilo, sinNombre) {
  const m = MONEDAS[String(moneda || 'USD').toUpperCase()] || MONEDAS.USD;
  const letras = _apocope(enLetras(n));
  return `${letras}${sinNombre ? '' : ' ' + m.nombre} (${m.simbolo[estilo || 'reserva']} ${miles(n)})`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaPartes(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = Number(m[3]), mes = Number(m[2]);
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  return { dia: String(d), mes: MESES[mes - 1], anio: m[1], corta: `${m[3]}/${m[2]}/${m[1]}` };
}
function formatoDni(t) {
  const d = String(t || '').replace(/\D/g, '');
  return d.length >= 7 && d.length <= 8 ? miles(d) : null;
}
// Patentes argentinas: AAA123 (1995-2016) o AA123AA (Mercosur). Se aceptan con espacios o guiones.
function normalizarPatente(t) {
  const p = String(t || '').toUpperCase().replace(/[\s\-.]/g, '');
  return /^[A-Z]{3}\d{3}$/.test(p) || /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) ? p : null;
}

// ── Formulario (2ª página): los rótulos son las claves de lo que devuelve n8n ──────────────────
const L = {
  auto: 'Auto', fecha: 'Fecha del documento', patente: 'Patente (dominio)', version: 'Versión', km: 'Kilometraje', anio: 'Año del auto',
  precio: 'Precio total', moneda: 'Moneda del precio', comprador: 'Comprador',
  cTrat: 'Comprador: Sr. o Sra.', cNombre: 'Comprador: nombre y apellido', cDni: 'Comprador: DNI', cCuil: 'Comprador: CUIL', cFotoF: 'Foto del DNI (frente)', cFotoD: 'Foto del DNI (dorso)', cDom: 'Comprador: domicilio (calle y número – localidad – provincia)',
  reserva: 'Monto de la reserva', monedaReserva: 'Moneda de la reserva', pago: 'Forma de pago', pagoOtra: 'Forma de pago (si elegiste "Otra")',
  vTrat: 'Vendedor: Sr. o Sra.', vNombre: 'Vendedor: nombre y apellido', vDni: 'Vendedor: DNI', vDom: 'Vendedor: domicilio (calle y número – localidad – provincia)',
  hora: 'Hora de entrega (desde la que el comprador es responsable)', pagoBoleto: 'Forma de pago (boleto)',
};
const NUEVO = 'Nuevo comprador (lo cargo abajo)';
const PAGO_SIEMPRE = 'Dólares, billetes de cien cara grande (como siempre)';
const PAGO_OTRA = 'Otra (la escribo abajo)';
function etiquetaAuto(r) {
  return [String(r.id_unidad || ''), [r.marca, r.modelo, r.version, r['año']].map((x) => String(x || '').trim()).filter(Boolean).join(' '),
    normalizarPatente(r.dominio) ? 'patente ' + normalizarPatente(r.dominio) : ''].filter(Boolean).join(' · ');
}
function etiquetaComprador(c) { return `${String(c.nombre || '').trim()} · DNI ${formatoDni(c.dni) || c.dni || ''}`; }
function _autosParaDocs(inventario) {
  return (inventario || []).filter((r) => r && r.id_unidad && ['disponible', 'reservado'].includes(String(r.estado || '').toLowerCase().trim()));
}
function camposFormulario(tipo, inventario, compradores, cfg, hoyIso) {
  const autos = _autosParaDocs(inventario);
  const cs = (compradores || []).filter((c) => c && c.nombre && c.dni).slice(-40).reverse();
  const doc = (cfg && cfg.documentos) || {};
  const v = doc.vendedor_por_defecto || {};
  const f = [
    { fieldLabel: L.auto, fieldType: 'dropdown', requiredField: true, fieldOptions: { values: autos.map((r) => ({ option: etiquetaAuto(r) })) } },
    { fieldLabel: L.fecha, fieldType: 'date', requiredField: true, defaultValue: hoyIso },
    { fieldLabel: L.patente, fieldType: 'text', placeholder: 'AB123CD o ABC123 (si ya está en el stock, dejalo vacío)' },
    { fieldLabel: L.precio, fieldType: 'number', placeholder: 'Si lo dejás vacío se usa el precio del stock' },
    { fieldLabel: L.moneda, fieldType: 'dropdown', fieldOptions: { values: [{ option: 'USD' }, { option: 'ARS' }] }, defaultValue: 'USD' },
    { fieldLabel: L.comprador, fieldType: 'dropdown', requiredField: true, fieldOptions: { values: [{ option: NUEVO }].concat(cs.map((c) => ({ option: etiquetaComprador(c) }))) }, defaultValue: NUEVO },
    { fieldLabel: L.cTrat, fieldType: 'radio', fieldOptions: { values: [{ option: 'Sr.' }, { option: 'Sra.' }] }, defaultValue: 'Sr.' },
    { fieldLabel: L.cNombre, fieldType: 'text', placeholder: 'Solo si es un comprador nuevo' },
    { fieldLabel: L.cDni, fieldType: 'text', placeholder: 'Ej. 12345678' },
    { fieldLabel: L.cCuil, fieldType: 'text', placeholder: 'Ej. 20-12345678-6 (está en el dorso del DNI)' },
    { fieldLabel: L.cFotoF, fieldType: 'file', name: 'dni_frente', placeholder: 'Opcional: la IA lo lee y lo compara con lo que escribiste' },
    { fieldLabel: L.cFotoD, fieldType: 'file', name: 'dni_dorso' },
    { fieldLabel: L.cDom, fieldType: 'textarea', placeholder: 'Ej. Lagos García 4625 - 9 de Abril - Buenos Aires' },
  ];
  if (tipo === 'reserva') f.push(
    { fieldLabel: L.version, fieldType: 'text', placeholder: 'Si lo dejás vacío se usa la del stock' },
    { fieldLabel: L.km, fieldType: 'number', placeholder: 'Si lo dejás vacío se usan los km del stock' },
    { fieldLabel: L.reserva, fieldType: 'number', requiredField: true, placeholder: 'Ej. 300000' },
    { fieldLabel: L.monedaReserva, fieldType: 'dropdown', fieldOptions: { values: [{ option: 'ARS' }, { option: 'USD' }] }, defaultValue: 'ARS' },
    { fieldLabel: L.pago, fieldType: 'dropdown', fieldOptions: { values: [{ option: PAGO_SIEMPRE }, { option: PAGO_OTRA }] }, defaultValue: PAGO_SIEMPRE },
    { fieldLabel: L.pagoOtra, fieldType: 'textarea', placeholder: 'Ej. Transferencia bancaria a la cuenta que indique HAY AUTOS' });
  if (tipo === 'boleto') f.push(
    { fieldLabel: L.anio, fieldType: 'number', placeholder: 'Si lo dejás vacío se usa el del stock' },
    { fieldLabel: L.vTrat, fieldType: 'radio', fieldOptions: { values: [{ option: 'Sr.' }, { option: 'Sra.' }] }, defaultValue: v.tratamiento || 'Sr.' },
    { fieldLabel: L.vNombre, fieldType: 'text', requiredField: true, defaultValue: v.nombre || '' },
    { fieldLabel: L.vDni, fieldType: 'text', requiredField: true, defaultValue: v.dni || '' },
    { fieldLabel: L.vDom, fieldType: 'textarea', requiredField: true, defaultValue: v.domicilio || '' },
    { fieldLabel: L.hora, fieldType: 'number', defaultValue: 13 },
    { fieldLabel: L.pagoBoleto, fieldType: 'text', defaultValue: 'de contado efectivo' });
  return f;
}

// ── Armado de un documento: respuestas del formulario + stock → reemplazos de la plantilla ─────
function _t(v) { return String(v == null ? '' : v).trim(); }
function _limpio(t) { return _t(t).replace(/\s+/g, ' ').replace(/\s*\n\s*/g, ' '); }
function armarDocumento(tipo, r, inventario, compradores, cfg) {
  const errores = [];
  const autos = _autosParaDocs(inventario);
  const auto = autos.find((x) => etiquetaAuto(x) === _t(r[L.auto]));
  if (!auto) errores.push('No encontré el auto elegido en el stock (¿se vendió o cambió?). Volvé a empezar.');
  const a = auto || {};
  const fp = fechaPartes(r[L.fecha]);
  if (!fp) errores.push('Fecha inválida.');
  const dominio = normalizarPatente(r[L.patente]) || normalizarPatente(a.dominio);
  if (!dominio) errores.push(_t(r[L.patente]) ? `La patente "${_t(r[L.patente])}" no tiene un formato válido (AB123CD o ABC123).` : 'Falta la patente: cargala en el formulario o en la columna dominio del stock.');
  const precio = _num(r[L.precio]) != null ? _num(r[L.precio]) : _num(a.precio);
  const moneda = _t(r[L.moneda]) || _t(a.moneda) || 'USD';
  if (!precio) errores.push('Falta el precio (no está en el formulario ni en el stock).');
  // Comprador: nuevo o uno que ya cargó sus datos
  let c = null;
  if (_t(r[L.comprador]) && _t(r[L.comprador]) !== NUEVO) {
    const elegido = (compradores || []).find((x) => etiquetaComprador(x) === _t(r[L.comprador]));
    if (elegido) c = { trat: _t(elegido.tratamiento) || _t(r[L.cTrat]) || 'Sr.', nombre: _t(elegido.nombre), dni: formatoDni(elegido.dni), dom: _limpio(elegido.domicilio), cuil: _t(elegido.cuil), verificado: _t(elegido.verificado) };
    else errores.push('No encontré al comprador elegido.');
  } else {
    c = { trat: _t(r[L.cTrat]) || 'Sr.', nombre: _limpio(r[L.cNombre]), dni: formatoDni(r[L.cDni]), dom: _limpio(r[L.cDom]), cuil: '' };
    const ci = cuilInfo(r[L.cCuil], r[L.cDni]);
    if (!_t(r[L.cCuil])) errores.push('Falta el CUIL del comprador (está en el dorso del DNI).');
    else if (!ci.ok) errores.push(ci.motivo);
    else c.cuil = ci.formateado;
  }
  if (c) {
    if (!c.nombre) errores.push('Falta el nombre del comprador.');
    if (!c.dni) errores.push('El DNI del comprador tiene que tener 7 u 8 números.');
    if (!c.dom) errores.push('Falta el domicilio del comprador.');
  }
  c = c || {};
  const fem = (t) => /sra/i.test(String(t || ''));
  const R = { C_TRAT: c.trat, C_ART: fem(c.trat) ? 'la' : 'el', C_DEL: fem(c.trat) ? 'de la ' + c.trat : 'del ' + (c.trat || 'Sr.'), C_NOMBRE: c.nombre, C_DNI: c.dni, C_DOMICILIO: c.dom, DOMINIO: dominio || '', MARCA: _t(a.marca).toUpperCase(),
    DIA: fp ? fp.dia : '', MES: fp ? fp.mes : '', ANIO: fp ? fp.anio : '' };
  const resumen = { tipo, id_unidad: _t(a.id_unidad), dominio: dominio || '', comprador: c.nombre, dni: c.dni, cuil: c.cuil || '', precio, moneda, fecha: _t(r[L.fecha]) };
  if (tipo === 'reserva') {
    const monto = _num(r[L.reserva]);
    const monedaR = _t(r[L.monedaReserva]) || 'ARS';
    if (!monto) errores.push('Falta el monto de la reserva.');
    if (monto && precio && monedaR === moneda && monto >= precio) errores.push('La reserva no puede ser igual o mayor que el precio total.');
    const km = _num(r[L.km]) != null ? _num(r[L.km]) : _num(a.km);
    const otra = _t(r[L.pago]) === PAGO_OTRA;
    if (otra && !_t(r[L.pagoOtra])) errores.push('Elegiste otra forma de pago: escribila.');
    Object.assign(R, { RESERVA_TEXTO: monto ? montoTexto(monto, monedaR, 'reserva') : '', MODELO: _t(a.modelo).toUpperCase(),
      VERSION: (_t(r[L.version]) || _t(a.version)).toUpperCase(), KM: km != null ? miles(km) : '',
      PRECIO_INTRO: (MONEDAS[moneda] || MONEDAS.USD).intro, PRECIO_TEXTO: precio ? montoTexto(precio, moneda, 'reserva') : '',
      PAGO_DESC: otra ? _limpio(r[L.pagoOtra]).replace(/[.\s]+$/, '') : 'Dólares estadounidenses billetes de cien cara grande y en perfecto estado de conservación',
      PAGO_MONTO: precio ? montoTexto(precio, moneda, 'reserva', true) : '' });
    if (!R.KM) errores.push('Faltan los kilómetros (no están en el formulario ni en el stock).');
    Object.assign(resumen, { reserva: monto, moneda_reserva: monedaR });
  } else if (tipo === 'boleto') {
    const v = { trat: _t(r[L.vTrat]) || 'Sr.', nombre: _limpio(r[L.vNombre]), dni: formatoDni(r[L.vDni]), dom: _limpio(r[L.vDom]) };
    if (!v.nombre) errores.push('Falta el nombre del vendedor.');
    if (!v.dni) errores.push('El DNI del vendedor tiene que tener 7 u 8 números.');
    if (!v.dom) errores.push('Falta el domicilio del vendedor.');
    const anioAuto = _num(r[L.anio]) || _num(a['año']);
    if (!anioAuto) errores.push('Falta el año del auto.');
    const hora = _num(r[L.hora]) != null ? _num(r[L.hora]) : 13;
    if (hora > 23) errores.push('La hora de entrega tiene que ser de 0 a 23.');
    Object.assign(R, { V_TRAT: v.trat, V_EL: (fem(v.trat) ? 'la ' : 'el ') + v.trat, V_NOMBRE: v.nombre, V_DNI: v.dni || '', V_DOMICILIO: v.dom,
      MODELO: [_t(a.modelo), _t(a.version)].filter(Boolean).join(' ').toUpperCase(), ANIO_AUTO: anioAuto ? String(anioAuto) : '',
      PRECIO_TEXTO: precio ? montoTexto(precio, moneda, 'boleto') : '', FORMA_PAGO_BOLETO: _limpio(r[L.pagoBoleto]) || 'de contado efectivo',
      HORA: String(hora), FECHA_ENTREGA: fp ? fp.corta : '' });
    Object.assign(resumen, { vendedor: v.nombre });
  } else errores.push('Tipo de documento desconocido: ' + tipo);
  return { ok: !errores.length, errores, reemplazos: R, resumen, auto: a };
}

// ── Páginas web propias (D-063): reemplazan los formularios de varias páginas de n8n ──────────────────
// Caso real 994 (22/10): con el formulario de n8n de 2 páginas el navegador se quedaba esperando la respuesta
// (el documento SÍ se generaba). Ahora: GET = página HTML armada acá · POST = un envío normal y la respuesta es el resultado.
function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const _CSS = 'body{margin:0;background:#f4f5f7;color:#18202c;font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}main{max-width:640px;margin:0 auto;padding:20px 16px 48px}'
  + 'h1{font-size:24px;margin:8px 0 4px}p.sub{color:#5a6473;margin:0 0 18px}.card{background:#fff;border:1px solid #dde1e6;border-radius:12px;padding:16px;margin:0 0 14px}'
  + 'label{display:block;font-weight:600;margin:0 0 6px}.req{color:#c0392b}input,select,textarea{width:100%;box-sizing:border-box;font:inherit;padding:11px 12px;border:1px solid #c9ced6;border-radius:8px;background:#fff}'
  + 'textarea{min-height:70px}.radios label{display:inline-flex;gap:6px;align-items:center;font-weight:400;margin-right:18px}.radios input{width:auto}.hint{color:#5a6473;font-size:14px;margin:6px 0 0}'
  + 'button,.btn{display:block;width:100%;box-sizing:border-box;text-align:center;font:600 17px/1 inherit;padding:16px;border:0;border-radius:10px;background:#1F4FA3;color:#fff;text-decoration:none;margin:10px 0}'
  + '.v-ok{color:#1c7c4a;font-weight:600}.v-err{color:#b3261e;font-weight:600}.v-warn{color:#9a5b00;font-weight:600}input.ok{border-color:#2e9e5b;background:#f1fbf4}input.mal{border-color:#d93025;background:#fdf1f0}'
  + 'table{width:100%;border-collapse:collapse}td{padding:8px 6px;border-bottom:1px solid #e5e8ec;vertical-align:top}td:first-child{color:#5a6473;width:38%}'
  + 'button[disabled]{opacity:.6}.btn.sec{background:#fff;color:#1F4FA3;border:2px solid #1F4FA3}.err{background:#fdecea;border:1px solid #f5c2c0;color:#8a1f17;border-radius:10px;padding:12px 16px;margin:0 0 14px}'
  + '.ok{background:#e7f5ec;border:1px solid #b9e2c7;border-radius:10px;padding:14px 16px;margin:0 0 14px}';
function _html(titulo, cuerpo) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${_esc(titulo)}</title><style>${_CSS}</style></head><body><main>${cuerpo}</main></body></html>`;
}
function _campoHTML(c, i, valores) {
  const id = 'f' + i, n = _esc(c.fieldLabel), req = c.requiredField ? ' required' : '';
  const v = valores && valores[c.fieldLabel] != null ? valores[c.fieldLabel] : (c.defaultValue != null ? c.defaultValue : '');
  const etiqueta = `<label for="${id}">${n}${c.requiredField ? ' <span class="req">*</span>' : ''}</label>`;
  if (c.fieldType === 'file') return `<div class="card">${etiqueta}<input id="${id}" type="file" accept="image/*" name="${_esc(c.name || c.fieldLabel)}"${req}>${c.placeholder ? '<p class="hint">' + _esc(c.placeholder) + '</p>' : ''}</div>`;
  const ph = c.placeholder ? ` placeholder="${_esc(c.placeholder)}"` : '';
  const ops = ((c.fieldOptions || {}).values || []).map((o) => o.option);
  if (c.fieldType === 'dropdown') return `<div class="card">${etiqueta}<select id="${id}" name="${n}"${req}>${c.requiredField && !c.defaultValue ? '<option value="">Elegí…</option>' : ''}${ops.map((o) => `<option${String(o) === String(v) ? ' selected' : ''}>${_esc(o)}</option>`).join('')}</select></div>`;
  if (c.fieldType === 'radio') return `<div class="card"><label>${n}</label><div class="radios">${ops.map((o, k) => `<label><input type="radio" name="${n}" value="${_esc(o)}"${String(o) === String(v) || (!v && !k) ? ' checked' : ''}> ${_esc(o)}</label>`).join('')}</div></div>`;
  if (c.fieldType === 'textarea') return `<div class="card">${etiqueta}<textarea id="${id}" name="${n}"${ph}${req}>${_esc(v)}</textarea></div>`;
  const tipo = { number: 'number', date: 'date', email: 'email' }[c.fieldType] || 'text';
  return `<div class="card">${etiqueta}<input id="${id}" type="${tipo}" name="${n}" value="${_esc(v)}"${ph}${req}${tipo === 'number' ? ' inputmode="numeric" step="any"' : ''}><p class="hint v" data-para="${n}"></p></div>`;
}
const _ENVIAR_JS = '<script>document.querySelector("form").addEventListener("submit",function(){var b=document.querySelector("button[type=submit]");b.disabled=true;b.textContent="Generando… (puede tardar unos 20 segundos)";});</script>';
function htmlInicio(agencia, accion) {
  return _html(agencia + ' · Documentos', `<h1>${_esc(agencia)} · Documentos</h1><p class="sub">¿Qué documento querés generar?</p>`
    + `<a class="btn" href="${_esc(accion)}?tipo=reserva">Reserva de compra</a><a class="btn" href="${_esc(accion)}?tipo=boleto">Boleto de compraventa</a>`);
}
function htmlFormulario({ agencia, tipo, campos, accion, errores, valores, autos }) {
  const titulo = tipo === 'boleto' ? 'Boleto de compraventa' : 'Reserva de compra';
  const err = (errores || []).length ? `<div class="err"><b>Revisá esto:</b><ul>${errores.map((e) => '<li>' + _esc(e) + '</li>').join('')}</ul></div>` : '';
  return _html(titulo, `<h1>${titulo}</h1><p class="sub">${_esc(agencia)} · sale un Google Doc editable y el PDF listo para imprimir.</p>${err}`
    + `<form method="post" action="${_esc(accion)}" enctype="multipart/form-data"><input type="hidden" name="tipo" value="${_esc(tipo)}"><input type="hidden" name="paso" value="revisar">${campos.map((c, i) => _campoHTML(c, i, valores)).join('')}`
    + `<button type="submit">Revisar</button></form><a class="btn sec" href="${_esc(accion)}">Volver</a>${_ENVIAR_JS.replace('Generando… (puede tardar unos 20 segundos)', 'Revisando… (unos segundos)')}${scriptVivo(autos || {}, tipo)}`);
}
function htmlResultado({ titulo, nombre, pdfB64, pdfNombre, docUrl, carpetaUrl, accion, errores }) {
  if ((errores || []).length) return _html('No se pudo generar', `<h1>No se pudo generar</h1><div class="err">${errores.map(_esc).join('<br>')}</div><a class="btn sec" href="${_esc(accion)}">Volver</a>`);
  return _html(titulo, `<div class="ok"><h1 style="margin:0">Listo: ${_esc(titulo)}</h1><p style="margin:6px 0 0">${_esc(nombre)}</p></div>`
    + (pdfB64 ? `<a class="btn" download="${_esc(pdfNombre)}" href="data:application/pdf;base64,${pdfB64}">Descargar PDF</a>` : '')
    + (docUrl ? `<a class="btn sec" href="${_esc(docUrl)}" target="_blank">Abrir el Google Doc (para corregir algo)</a>` : '')
    + (carpetaUrl ? `<a class="btn sec" href="${_esc(carpetaUrl)}" target="_blank">Carpeta de la operación en Drive</a>` : '')
    + `<a class="btn sec" href="${_esc(accion)}">Generar otro documento</a>`);
}
// Formulario del cliente (sus datos para la documentación)
const CAMPOS_CLIENTE = [
  { fieldLabel: 'Sr. o Sra.', fieldType: 'radio', fieldOptions: { values: [{ option: 'Sr.' }, { option: 'Sra.' }] }, defaultValue: 'Sr.' },
  { fieldLabel: 'Nombre y apellido (como figura en el DNI)', fieldType: 'text', requiredField: true },
  { fieldLabel: 'DNI', fieldType: 'text', requiredField: true, placeholder: 'Solo números' },
  { fieldLabel: 'CUIL', fieldType: 'text', requiredField: true, placeholder: 'Está en el dorso del DNI. Ej. 20-12345678-6' },
  { fieldLabel: 'Calle y número (piso y depto si corresponde)', fieldType: 'text', requiredField: true },
  { fieldLabel: 'Localidad', fieldType: 'text', requiredField: true }, { fieldLabel: 'Provincia', fieldType: 'text', requiredField: true, placeholder: 'Ej. Buenos Aires' },
  { fieldLabel: 'Teléfono', fieldType: 'text' }, { fieldLabel: 'Email', fieldType: 'email' },
  { fieldLabel: 'Foto del DNI (frente)', fieldType: 'file', name: 'dni_frente', requiredField: true, placeholder: 'La usamos solo para verificar que los datos estén bien escritos; no la guardamos.' },
  { fieldLabel: 'Foto del DNI (dorso)', fieldType: 'file', name: 'dni_dorso' }];
function htmlCliente({ agencia, accion, errores, valores, gracias }) {
  if (gracias) return _html(agencia, `<div class="ok"><h1 style="margin:0">¡Gracias!</h1><p style="margin:6px 0 0">Recibimos tus datos. Ya podemos preparar la documentación.</p></div>`);
  const err = (errores || []).length ? `<div class="err">${errores.map(_esc).join('<br>')}</div>` : '';
  return _html(agencia, `<h1>${_esc(agencia)}</h1><p class="sub">Completá tus datos para preparar la documentación de la operación. Los usamos solo para eso.</p>${err}`
    + `<form method="post" action="${_esc(accion)}" enctype="multipart/form-data">${CAMPOS_CLIENTE.map((c, i) => _campoHTML(c, i, valores)).join('')}<button type="submit">Enviar</button></form>${_ENVIAR_JS}`);
}
function datosCliente(r, leido) {
  const t = (k) => String((r || {})[k] || '').trim().replace(/\s+/g, ' ');
  const dni = formatoDni(t('DNI'));
  const errores = [];
  const ci = cuilInfo(t('CUIL'), t('DNI'));
  if (!ci.ok) errores.push(ci.motivo);
  if (!t('Nombre y apellido (como figura en el DNI)')) errores.push('Falta el nombre y apellido.');
  if (!dni) errores.push('El DNI tiene que tener 7 u 8 números.');
  if (!t('Calle y número (piso y depto si corresponde)') || !t('Localidad') || !t('Provincia')) errores.push('Falta completar el domicilio.');
  // Con la foto del DNI: el DNI tiene que coincidir (si no, se pide corregir); el nombre distinto solo se anota para que lo vea el responsable
  let verificado = 'sin foto', nota = '';
  if (leido) { const c = compararDNI({ nombre: t('Nombre y apellido (como figura en el DNI)'), dni: t('DNI'), cuil: t('CUIL') }, leido);
    errores.push(...c.errores); verificado = !leido.legible ? 'foto ilegible' : c.avisos.length ? 'foto con diferencias' : 'foto ok'; nota = c.avisos.join(' '); }
  return { ok: !errores.length, errores, fila: { fecha: new Date().toISOString(), origen: 'cliente', tratamiento: t('Sr. o Sra.') || 'Sr.', nombre: t('Nombre y apellido (como figura en el DNI)'), dni: dni || '', cuil: ci.ok ? ci.formateado : '', verificado, nota,
    domicilio: [t('Calle y número (piso y depto si corresponde)'), t('Localidad'), t('Provincia')].filter(Boolean).join(' – '), telefono: t('Teléfono'), email: t('Email') } };
}

// ── Verificaciones para evitar errores (D-064, pedido del responsable 22/10) ─────────────────────────
// CUIL: 11 dígitos, prefijo válido, dígito verificador (módulo 11) y DNI adentro. Detecta casi cualquier número mal tipeado.
function cuilInfo(cuil, dni) {
  const c = String(cuil || '').replace(/\D/g, ''), d = String(dni || '').replace(/\D/g, '');
  if (c.length !== 11) return { ok: false, motivo: 'El CUIL tiene que tener 11 números.' };
  if (!['20', '23', '24', '27'].includes(c.slice(0, 2))) return { ok: false, motivo: 'El CUIL de una persona empieza con 20, 23, 24 o 27.' };
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let s = 0; for (let i = 0; i < 10; i++) s += Number(c[i]) * w[i];
  let dv = 11 - (s % 11); if (dv === 11) dv = 0;
  if (dv === 10 || dv !== Number(c[10])) return { ok: false, motivo: 'El CUIL no es válido (no da el dígito verificador): revisá los números.' };
  if (d && c.slice(2, 10) !== d.padStart(8, '0')) return { ok: false, motivo: 'El CUIL no corresponde a ese DNI: revisá el DNI o el CUIL.' };
  return { ok: true, formateado: `${c.slice(0, 2)}-${c.slice(2, 10)}-${c[10]}` };
}

// Lecturas de la IA de visión (fotos): pedidos y lectura tolerante del JSON
const PROMPT_DNI = 'Te paso fotos de un DNI argentino (frente y/o dorso). Copiá EXACTAMENTE lo que se lee, sin inventar ni completar. Si algo no se lee, dejalo vacío. '
  + 'Respondé SOLO con JSON: {"apellido":"","nombres":"","dni":"","sexo":"","fecha_nacimiento":"AAAA-MM-DD","domicilio":"","cuil":"","legible":true}';
const PROMPT_CEDULA = 'Te paso fotos de la cédula de identificación de un automotor argentino (cédula verde o azul) o del título. Copiá EXACTAMENTE lo que se lee, sin inventar ni completar. Si algo no se lee, dejalo vacío. '
  + 'Respondé SOLO con JSON: {"dominio":"","marca":"","modelo":"","tipo":"","anio":"","motor_marca":"","motor_numero":"","chasis_marca":"","chasis_numero":"","legible":true}';
function textoDeVision(resp) {
  if (!resp || resp.error) return '';
  if (resp.choices) return String((((resp.choices[0] || {}).message) || {}).content || '');
  const parts = ((((resp.candidates || [])[0] || {}).content) || {}).parts || [];
  return parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
}
function _json(t) { const s = String(t || ''), a = s.indexOf('{'), b = s.lastIndexOf('}'); try { return a >= 0 && b > a ? JSON.parse(s.slice(a, b + 1)) : null; } catch (e) { return null; } }
function _titulo(t) { return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/(^|[\s-])(\S)/g, (m, a, b) => a + b.toUpperCase()); }
function leerDNI(texto) {
  const j = _json(texto); if (!j) return null;
  const dni = String(j.dni || '').replace(/\D/g, '');
  return { nombre: _titulo([j.nombres, j.apellido].filter(Boolean).join(' ')), dni: dni.length >= 7 && dni.length <= 8 ? dni : '', sexo: String(j.sexo || '').toUpperCase().slice(0, 1),
    fecha_nacimiento: String(j.fecha_nacimiento || ''), domicilio: String(j.domicilio || '').replace(/\s+/g, ' ').trim(), cuil: String(j.cuil || '').replace(/\D/g, ''), legible: j.legible !== false && !!dni };
}
function leerCedula(texto) {
  const j = _json(texto); if (!j) return null;
  const anio = String(j.anio || '').replace(/\D/g, '');
  return { dominio: normalizarPatente(j.dominio) || '', marca: String(j.marca || '').trim().toUpperCase(), modelo: String(j.modelo || '').trim().toUpperCase(), tipo: String(j.tipo || '').trim(),
    anio: /^(19|20)\d\d$/.test(anio) ? anio : '', motor: [j.motor_marca, j.motor_numero].map((x) => String(x || '').trim()).filter(Boolean).join(' '),
    chasis: [j.chasis_marca, j.chasis_numero].map((x) => String(x || '').trim()).filter(Boolean).join(' '), legible: j.legible !== false && !!(j.dominio || j.chasis_numero) };
}
const _palabras = (t) => _sinTildesDoc(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
function _sinTildesDoc(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
// Lo que escribió el responsable vs lo que se lee en la foto del DNI
function compararDNI(tipeado, leido) {
  const errores = [], avisos = [], ok = [];
  if (!leido || !leido.legible) { avisos.push('No se pudo leer bien la foto del DNI: revisá los datos a mano.'); return { errores, avisos, ok }; }
  const d = String(tipeado.dni || '').replace(/\D/g, '');
  if (d && leido.dni && d !== leido.dni) errores.push(`El DNI escrito (${miles(d)}) no coincide con el de la foto (${miles(leido.dni)}).`);
  else if (leido.dni) ok.push(`DNI ${miles(leido.dni)} coincide con la foto`);
  const tw = _palabras(tipeado.nombre), lw = new Set(_palabras(leido.nombre));
  if (tw.length && lw.size) {
    const faltan = tw.filter((w) => !lw.has(w));
    if (faltan.length) avisos.push(`El nombre escrito ("${tipeado.nombre}") no coincide del todo con la foto ("${leido.nombre}").`);
    else ok.push(`Nombre coincide con la foto: ${leido.nombre}`);
  }
  if (tipeado.cuil && leido.cuil && String(tipeado.cuil).replace(/\D/g, '') !== leido.cuil) avisos.push('El CUIL escrito no coincide con el que figura en la foto del DNI.');
  return { errores, avisos, ok };
}
// Lo leído en la cédula vs lo que dice el stock
function compararCedula(leido, auto) {
  const dif = [], igual = [];
  if (!leido || !leido.legible) return { dif: ['No se pudo leer bien la cédula: probá con otra foto, con buena luz y sin reflejos.'], igual };
  const a = auto || {};
  if (normalizarPatente(a.dominio) && leido.dominio && normalizarPatente(a.dominio) !== leido.dominio) dif.push(`Patente: en el stock dice ${normalizarPatente(a.dominio)} y en la cédula ${leido.dominio}.`);
  const marca = _sinTildesDoc(a.marca), mL = _sinTildesDoc(leido.marca);
  if (marca && mL && !mL.includes(marca) && !marca.includes(mL)) dif.push(`Marca: en el stock "${a.marca}" y en la cédula "${leido.marca}".`); else if (marca && mL) igual.push('Marca');
  const mod = _palabras(a.modelo), modL = new Set(_palabras(leido.modelo));
  if (mod.length && modL.size && !mod.some((w) => modL.has(w))) dif.push(`Modelo: en el stock "${a.modelo}" y en la cédula "${leido.modelo}".`); else if (mod.length && modL.size) igual.push('Modelo');
  const an = String(a['año'] || '').replace(/\D/g, '');
  if (an && leido.anio && an !== leido.anio) dif.push(`Año: en el stock ${an} y en la cédula ${leido.anio}.`); else if (an && leido.anio) igual.push('Año');
  return { dif, igual };
}
// Avisos que no frenan (cosas raras)
function avisosOperacion({ tipo, resp, auto, compradores, hoyIso }) {
  const av = [], a = auto || {}, r = resp || {};
  if (String(a.estado || '').toLowerCase().trim() === 'reservado') av.push('El auto figura como RESERVADO en el stock.');
  const f = Date.parse(String(r[L.fecha] || '') + 'T12:00:00Z'), h = Date.parse(String(hoyIso || '') + 'T12:00:00Z');
  if (Number.isFinite(f) && Number.isFinite(h)) { const dias = Math.round((f - h) / 86400e3); if (dias < -30) av.push(`La fecha del documento es de hace ${-dias} días.`); if (dias > 30) av.push(`La fecha del documento es dentro de ${dias} días.`); }
  const precioStock = _num(a.precio), precio = _num(r[L.precio]) != null ? _num(r[L.precio]) : precioStock;
  if (_num(r[L.precio]) != null && precioStock && _num(r[L.precio]) !== precioStock) av.push(`El precio cargado (${miles(_num(r[L.precio]))}) es distinto al del stock (${miles(precioStock)}).`);
  if (tipo === 'reserva') {
    const m = _num(r[L.reserva]), mon = String(r[L.monedaReserva] || 'ARS'), monP = String(r[L.moneda] || a.moneda || 'USD');
    if (m && precio && mon === monP && m > precio * 0.3) av.push(`La reserva es más del 30 % del precio (${Math.round(100 * m / precio)} %).`);
  }
  const nom = _sinTildesDoc(r[L.cNombre]).trim(), dni = String(r[L.cDni] || '').replace(/\D/g, '');
  const otro = nom && dni && (compradores || []).find((c) => _sinTildesDoc(c.nombre).trim() === nom && String(c.dni || '').replace(/\D/g, '') !== dni);
  if (otro) av.push(`Ya hay un comprador "${otro.nombre}" con otro DNI (${formatoDni(otro.dni) || otro.dni}).`);
  return av;
}


// Mapa de autos para la página (etiqueta → patente y título del stock) — para el chequeo en vivo
function autosParaPagina(inventario) {
  const m = {};
  for (const r of _autosParaDocs(inventario)) m[etiquetaAuto(r)] = { dominio: normalizarPatente(r.dominio) || '', titulo: [r.marca, r.modelo, r.version, r['año']].map((x) => String(x || '').trim()).filter(Boolean).join(' '),
    precio: _num(r.precio), moneda: String(r.moneda || 'USD').toUpperCase() };
  return m;
}
// Verificaciones EN VIVO en el navegador (sin pedir nada al servidor): patente vs stock, CUIL vs DNI, montos en letras
function scriptVivo(autos, tipo) {
  const fn = [_menorMil, _apocope, enLetras, miles, montoTexto, normalizarPatente, cuilInfo].map((f) => f.toString()).join('\n');
  return `<script>
const AUTOS=${JSON.stringify(autos).replace(/</g, '\\u003c')}, ESTILO=${JSON.stringify(tipo === 'boleto' ? 'boleto' : 'reserva')};
const _U=${JSON.stringify(_U)},_D=${JSON.stringify(_D)},_C=${JSON.stringify(_C)},MONEDAS=${JSON.stringify(MONEDAS)};
${fn}
const $n=(n)=>document.querySelector('[name="'+n+'"]');
const nota=(n,txt,cls)=>{const p=document.querySelector('[data-para="'+n+'"]');const i=$n(n);if(p){p.textContent=txt||'';p.className='hint v '+(cls||'');}if(i&&i.classList){i.classList.toggle('ok',cls==='v-ok');i.classList.toggle('mal',cls==='v-err');}};
function chequearPatente(){const a=AUTOS[($n('Auto')||{}).value]||null;const i=$n('Patente (dominio)');if(!i)return;const v=i.value.trim();
  if(!v){if(a&&a.dominio)nota('Patente (dominio)','✓ Se usa la del stock: '+a.dominio+' ('+a.titulo+')','v-ok');else if(a)nota('Patente (dominio)','Este auto no tiene la patente en el stock: escribila o cargá su cédula.','v-warn');else nota('Patente (dominio)','');return;}
  const p=normalizarPatente(v);if(!p){nota('Patente (dominio)','✗ Formato inválido: tiene que ser AB123CD o ABC123.','v-err');return;}
  const de=Object.values(AUTOS).find((x)=>x.dominio===p);
  if(a&&a.dominio===p){nota('Patente (dominio)','✓ '+p+' — '+a.titulo,'v-ok');return;}
  if(de){nota('Patente (dominio)','✗ Esa patente es de otro auto: '+de.titulo,'v-err');return;}
  if(a&&a.dominio){nota('Patente (dominio)','✗ No coincide con la del stock para este auto ('+a.dominio+').','v-err');return;}
  nota('Patente (dominio)','⚠ '+p+' no está en el stock: verificala con la cédula.','v-warn');}
function chequearCuil(){const c=$n('Comprador: CUIL'),d=$n('Comprador: DNI');if(!c)return;if(!c.value.trim()){nota('Comprador: CUIL','');return;}const r=cuilInfo(c.value,d?d.value:'');nota('Comprador: CUIL',r.ok?'✓ CUIL válido y coincide con el DNI ('+r.formateado+')':'✗ '+r.motivo,r.ok?'v-ok':'v-err');}
function chequearDni(){const d=$n('Comprador: DNI');if(!d)return;const x=d.value.replace(/\\D/g,'');if(!x){nota('Comprador: DNI','');return;}nota('Comprador: DNI',x.length>=7&&x.length<=8?'✓ '+miles(x):'✗ El DNI tiene 7 u 8 números.',x.length>=7&&x.length<=8?'v-ok':'v-err');chequearCuil();}
function enLetrasCampo(campo,moneda,usarStock){const i=$n(campo);if(!i)return;const m=($n(moneda)||{}).value||'USD';const n=Number(String(i.value).replace(/[^\\d]/g,''));const a=AUTOS[($n('Auto')||{}).value]||null;
  if(n){nota(campo,'Va a decir: '+montoTexto(n,m,ESTILO),'v-ok');}else if(usarStock&&a&&a.precio){nota(campo,'Se usa el precio del stock: '+montoTexto(a.precio,a.moneda,ESTILO),'v-ok');}else nota(campo,'');}
function todo(){chequearPatente();chequearDni();enLetrasCampo('Precio total','Moneda del precio',true);enLetrasCampo('Monto de la reserva','Moneda de la reserva',false);}
document.addEventListener('input',todo);document.addEventListener('change',todo);todo();
</script>`;
}
// Resumen para la pantalla de revisión: lo que va a decir el documento
function filasRevision(tipo, d) {
  const R = d.reemplazos, r = d.resumen, f = [];
  f.push(['Documento', tipo === 'boleto' ? 'Boleto de compraventa' : 'Reserva de compra'], ['Fecha', `${R.DIA} de ${R.MES} de ${R.ANIO}`]);
  if (tipo === 'boleto') f.push(['Vendedor', `${R.V_TRAT} ${R.V_NOMBRE} · DNI ${R.V_DNI}`], ['Domicilio del vendedor', R.V_DOMICILIO]);
  f.push(['Comprador', `${R.C_TRAT} ${R.C_NOMBRE}`], ['DNI del comprador', R.C_DNI + (r.cuil ? ' · CUIL ' + r.cuil : '')], ['Domicilio del comprador', R.C_DOMICILIO]);
  f.push(['Auto', [R.MARCA, R.MODELO, R.VERSION].filter(Boolean).join(' ') + (R.ANIO_AUTO ? ' · ' + R.ANIO_AUTO : '')], ['Patente', R.DOMINIO]);
  if (tipo === 'reserva') f.push(['Kilometraje', R.KM], ['Reserva', R.RESERVA_TEXTO], ['Precio', R.PRECIO_TEXTO], ['Forma de pago', `${R.PAGO_DESC} ${R.PAGO_MONTO}`]);
  else f.push(['Precio', `${R.PRECIO_TEXTO} ${R.FORMA_PAGO_BOLETO}`], ['Responsable desde', `las ${R.HORA} horas del ${R.FECHA_ENTREGA}`]);
  return f;
}
function htmlRevision({ agencia, tipo, filas, avisos, verificados, datos, accion }) {
  const lista = (xs, cls) => xs.length ? `<div class="card"><ul style="margin:0;padding-left:20px">${xs.map((x) => `<li class="${cls}">${_esc(x)}</li>`).join('')}</ul></div>` : '';
  return _html('Revisá antes de generar', `<h1>Revisá antes de generar</h1><p class="sub">${_esc(agencia)} · así va a quedar en el documento.</p>`
    + lista(verificados || [], 'v-ok') + lista(avisos || [], 'v-warn')
    + `<div class="card"><table>${filas.map(([k, v]) => `<tr><td>${_esc(k)}</td><td><b>${_esc(v)}</b></td></tr>`).join('')}</table></div>`
    + `<form method="post" action="${_esc(accion)}"><input type="hidden" name="paso" value="generar"><input type="hidden" name="tipo" value="${_esc(tipo)}"><input type="hidden" name="__datos" value="${_esc(JSON.stringify(datos))}">`
    + `<button type="submit">Confirmar y generar</button></form><button class="btn sec" type="button" onclick="history.back()">Corregir</button>${_ENVIAR_JS}`);
}
// ── Cédula del auto → stock (patente, chasis, motor) ─────────────────────────────
function htmlCedula({ agencia, inventario, accion, error }) {
  const autos = (inventario || []).filter((r) => r && r.id_unidad && String(r.estado || '').toLowerCase().trim() !== 'vendido');
  const op = autos.map((r) => { const t = [r.id_unidad, [r.marca, r.modelo, r.version, r['año']].filter(Boolean).join(' ')].join(' · ');
    return `<option value="${_esc(r.id_unidad)}">${_esc(t)}${normalizarPatente(r.dominio) ? ' · patente ' + normalizarPatente(r.dominio) : ' · SIN cédula cargada'}</option>`; }).join('');
  return _html('Cargar cédula del auto', `<h1>Cargar cédula del auto</h1><p class="sub">${_esc(agencia)} · sacale foto a la cédula (o al título): la IA lee patente, chasis y motor, y vos confirmás antes de guardar.</p>`
    + (error ? `<div class="err">${_esc(error)}</div>` : '')
    + `<form method="post" action="${_esc(accion)}" enctype="multipart/form-data"><input type="hidden" name="paso" value="revisar">`
    + `<div class="card"><label>Auto <span class="req">*</span></label><select name="id_unidad" required><option value="">Elegí…</option>${op}</select></div>`
    + `<div class="card"><label>Foto de la cédula (frente) <span class="req">*</span></label><input type="file" accept="image/*" name="cedula_frente" required><p class="hint">Con buena luz, derecha y sin reflejos.</p></div>`
    + `<div class="card"><label>Foto de la cédula (dorso)</label><input type="file" accept="image/*" name="cedula_dorso"></div>`
    + `<button type="submit">Leer la cédula</button></form>${_ENVIAR_JS.replace('Generando… (puede tardar unos 20 segundos)', 'Leyendo la cédula… (unos segundos)')}`);
}
function htmlCedulaRevision({ agencia, auto, leido, comp, accion }) {
  const a = auto || {};
  const fila = (k, st, ce) => `<tr><td>${_esc(k)}</td><td>${_esc(st || '—')}</td><td><b>${_esc(ce || '—')}</b></td></tr>`;
  const datos = { id_unidad: a.id_unidad, dominio: leido.dominio, nro_chasis: leido.chasis, nro_motor: leido.motor };
  const ok = leido.legible && !!leido.dominio;
  return _html('Revisá la cédula', `<h1>Revisá la cédula</h1><p class="sub">${_esc(agencia)} · ${_esc([a.id_unidad, a.marca, a.modelo, a['año']].filter(Boolean).join(' '))}</p>`
    + (comp.dif.length ? `<div class="err"><b>Diferencias con el stock:</b><ul>${comp.dif.map((x) => '<li>' + _esc(x) + '</li>').join('')}</ul></div>` : (ok ? '<div class="ok">✓ Coincide con el stock</div>' : ''))
    + `<div class="card"><table><tr><td></td><td>Stock</td><td>Cédula</td></tr>${fila('Patente', normalizarPatente(a.dominio), leido.dominio)}${fila('Marca', a.marca, leido.marca)}${fila('Modelo', [a.modelo, a.version].filter(Boolean).join(' '), leido.modelo)}${fila('Año', a['año'], leido.anio)}${fila('Chasis', a.nro_chasis, leido.chasis)}${fila('Motor', a.nro_motor, leido.motor)}</table></div>`
    + (ok ? `<form method="post" action="${_esc(accion)}"><input type="hidden" name="paso" value="guardar"><input type="hidden" name="__datos" value="${_esc(JSON.stringify(datos))}"><button type="submit">Guardar patente, chasis y motor en el stock</button></form>` : '<div class="err">No se pudo leer la patente: probá con otra foto.</div>')
    + `<a class="btn sec" href="${_esc(accion)}">Volver a sacar la foto</a>`);
}
function htmlCedulaGuardada({ agencia, datos, accion }) {
  return _html('Cédula guardada', `<div class="ok"><h1 style="margin:0">Listo</h1><p style="margin:6px 0 0">${_esc(datos.id_unidad)} · patente ${_esc(datos.dominio)} guardada en el stock (con chasis y motor).</p></div><a class="btn" href="${_esc(accion)}">Cargar otra cédula</a>`);
}

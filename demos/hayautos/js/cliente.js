// Página del cliente (link fijo): rol → fotos → revisar → gracias. Habla SOLO con la función `cliente` de Supabase.
// Usa documentos_core.js (cuilInfo, formatoDni) y webapp_core.js (formatoPatente, cuilSugerido), cargados antes.
(function () {
  const CFG = window.HA_CONFIG;
  const $ = (s) => document.querySelector(s);
  const FOTOS = {
    dni_frente: { titulo: 'DNI, frente', ayuda: 'Sacá la foto o elegila de tu galería' },
    dni_dorso: { titulo: 'DNI, dorso', ayuda: 'El lado con el código de barras' },
    cedula: { titulo: 'Cédula del auto, frente', ayuda: 'La cédula verde o azul' },
  };
  const estado = { rol: null, tipo: 'fisica', relacion: '', fotos: {}, carga: null, robot: '' };

  function mostrar(paso) {
    ['rol', 'tipo', 'fotos', 'revisar', 'gracias', 'busqueda', 'oferta'].forEach((p) => { $('#paso-' + p).hidden = p !== paso; });
    window.scrollTo(0, 0);
  }

  // ── Paso 1 ──
  document.querySelectorAll('[data-rol]').forEach((b) => b.addEventListener('click', () => {
    estado.rol = b.dataset.rol; estado.fotos = {}; estado.carga = null; estado.tipo = 'fisica'; estado.relacion = '';
    // Paso 1b: a nombre de quién (persona o empresa) · en "Otro": qué es del titular
    const ops = estado.rol === 'otro'
      ? [['conyuge', 'Cónyuge', 'Del titular del auto o del comprador.'], ['cotitular', 'Cotitular', 'El auto está a nombre de dos o más personas.'], ['apoderado', 'Apoderado', 'Firmo con un poder en nombre del titular.']]
      : [['fisica', 'A mi nombre', 'Soy una persona: firmo yo.'], ['juridica', 'A nombre de una empresa', 'Sociedad (S.A., S.R.L., etc.): cargo mis datos como su representante.']];
    $('#tipo-titulo').textContent = estado.rol === 'otro' ? '¿Qué sos del titular?' : (estado.rol === 'vendedor' ? '¿A nombre de quién está el auto?' : '¿A nombre de quién va a quedar el auto?');
    $('#tipo-sub').textContent = estado.rol === 'otro' ? 'Así sabemos cómo participás en los documentos.' : 'Si es de una empresa, cargás tus datos como su representante.';
    $('#tipo-opciones').innerHTML = ops.map(([k, t, d]) => `<button type="button" class="rol" data-tipo="${k}"><span><b>${t}</b><span>${d}</span></span></button>`).join('');
    mostrar('tipo');
  }));
  $('#tipo-opciones').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tipo]'); if (!b) return;
    if (estado.rol === 'otro') { estado.relacion = b.dataset.tipo; estado.tipo = 'fisica'; } else estado.tipo = b.dataset.tipo;
    $('#fotos-sub').textContent = (estado.tipo === 'juridica' ? 'Tu DNI (como representante de la empresa) de los dos lados' : 'Necesitamos tu DNI de los dos lados')
      + (estado.rol === 'vendedor' ? ' y la cédula del auto.' : '.');
    pintarFotos(); mostrar('fotos'); robot();
  });
  document.querySelectorAll('[data-volver]').forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.volver)));

  // ── Paso 2: fotos (se achican en el celular antes de mandarlas) ──
  function necesarias() { return estado.rol === 'vendedor' ? ['dni_frente', 'dni_dorso', 'cedula'] : ['dni_frente', 'dni_dorso']; }
  function pintarFotos() {
    const lista = $('#fotos-lista'); lista.innerHTML = '';
    necesarias().forEach((k) => {
      const f = FOTOS[k], lista_ = estado.fotos[k];
      const el = document.createElement('label');
      el.className = 'foto' + (lista_ ? '' : ' vacia');
      el.innerHTML = lista_
        ? `<img src="${lista_}" alt=""><span class="grow stack" style="gap: 0;"><b style="font-weight: 600;">${f.titulo}</b><span class="nota nota-ok">✓ Lista</span></span><span style="color: var(--brand-strong); font-weight: 500; font-size: 14px;">Cambiar</span>`
        : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#006bc4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
           <b style="font-weight: 600;">${f.titulo}</b><span class="caption">${f.ayuda}</span>`;
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.setAttribute('aria-label', f.titulo);
      input.addEventListener('change', async () => {
        const archivo = input.files && input.files[0]; if (!archivo) return;
        try { estado.fotos[k] = await achicar(archivo); } catch (_) { error('#fotos-error', 'No pudimos abrir esa foto. Probá con otra.'); return; }
        pintarFotos();
      });
      el.appendChild(input); lista.appendChild(el);
    });
    $('#leer').disabled = !necesarias().every((k) => estado.fotos[k]);
  }
  function achicar(archivo, max = 1400, calidad = 0.8) {
    return new Promise((ok, mal) => {
      const img = new Image(), url = URL.createObjectURL(archivo);
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', calidad));
      };
      img.onerror = mal; img.src = url;
    });
  }
  function error(sel, texto) { const e = $(sel); e.textContent = texto || ''; e.hidden = !texto; }

  // Anti-bot invisible (Cloudflare Turnstile), si está configurado
  function robot() {
    if (!CFG.turnstileSiteKey || $('#robot').dataset.listo) return;
    $('#robot').dataset.listo = '1';
    window.onTurnstile = () => window.turnstile.render('#robot', { sitekey: CFG.turnstileSiteKey, size: 'flexible', callback: (t) => { estado.robot = t; } });
    const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstile'; s.async = true; document.head.appendChild(s);
  }

  async function llamar(cuerpo) {
    // Tope del lado de la página: la función responde en menos de un minuto; si la conexión se cuelga, se avisa en vez de quedar "pensando"
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 60000);
    let r;
    try {
      // Leer (con IA) lo hace n8n (D-077: rápido y visible); confirmar, la función de Supabase. A n8n va como texto plano: sin consulta previa de CORS.
      r = cuerpo.accion === 'leer' && CFG.n8nUrl
        ? await fetch(CFG.n8nUrl + '/webhook/' + CFG.rutaLeer, { signal: ctrl.signal, method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({ agencia: CFG.agencia, ...cuerpo }) })
        : await fetch(CFG.supabaseUrl + '/functions/v1/cliente', { signal: ctrl.signal,
            method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey },
            body: JSON.stringify({ agencia: CFG.agencia, ...cuerpo }) });
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'Está tardando demasiado. Revisá tu conexión y probá de nuevo.' : 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.'); }
    finally { clearTimeout(t); }
    let j = null; try { j = await r.json(); } catch (_) { /* respuesta vacía */ }
    if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.');
    return j;
  }

  $('#leer').addEventListener('click', async () => {
    const b = $('#leer'); error('#fotos-error', '');
    b.disabled = true; b.innerHTML = '<span class="cargando" aria-hidden="true"></span> Leyendo tus documentos…';
    try {
      const fotos = {}; necesarias().forEach((k) => { fotos[k] = estado.fotos[k]; });
      estado.carga = await llamar({ accion: 'leer', rol: estado.rol, fotos, turnstile: estado.robot });
      llenar(estado.carga); mostrar('revisar');
    } catch (e) { error('#fotos-error', e.message); if (window.turnstile) window.turnstile.reset('#robot'); }
    b.innerHTML = 'Leer mis datos'; b.disabled = false;
  });

  // ── Paso 3: revisar lo leído ──
  function llenar(c) {
    const f = $('#form-datos'), d = c.dni || {}, ce = c.cedula || {};
    f.nombre.value = d.nombre || ''; f.dni.value = d.dni ? formatoDni(d.dni) || d.dni : '';
    f.nacimiento.value = /^\d{4}-\d\d-\d\d$/.test(d.fecha_nacimiento || '') ? d.fecha_nacimiento : '';
    const ci = cuilInfo(d.cuil, d.dni);
    f.cuil.value = ci.ok ? ci.formateado : cuilSugerido(d.dni, d.sexo);
    f.domicilio.value = d.domicilio || ''; f.telefono.value = ''; f.email.value = ''; f.acepto.checked = false;
    const emp = estado.tipo === 'juridica', otro = estado.rol === 'otro';
    $('#sec-empresa').hidden = !emp; $('#sec-relacion').hidden = !otro; $('#sec-civil').hidden = emp || otro;
    $('#titulo-tus-datos').textContent = emp ? 'Tus datos (representante)' : 'Tus datos';
    if (otro) $('#titulo-relacion').textContent = { conyuge: '¿De quién sos cónyuge?', cotitular: '¿Con quién compartís la titularidad?', apoderado: '¿De quién sos apoderado?' }[estado.relacion];
    ['razon_social', 'cuit', 'cargo', 'domicilio_empresa', 'titular_nombre', 'titular_dni', 'estado_civil', 'conyuge_nombre', 'conyuge_dni'].forEach((k) => { f[k].value = ''; });
    $('#sec-conyuge').hidden = true; notaCuit();
    const vende = estado.rol === 'vendedor';
    $('#sec-auto').hidden = !vende;
    if (vende) { f.patente.value = ce.dominio || ''; f.anio.value = ce.anio || ''; f.marca_modelo.value = [ce.marca, ce.modelo].filter(Boolean).join(' '); }
    $('#revisar-sub').textContent = d.legible === false ? 'No pudimos leer bien tu DNI: completá los datos a mano.' : 'Los leímos de tus fotos. Si algo está mal, corregilo antes de confirmar.';
    error('#datos-error', ''); notaCuil();
  }
  function notaCuil() {
    const f = $('#form-datos'), n = $('#nota-cuil');
    if (!f.cuil.value.trim()) { n.textContent = ''; return; }
    const r = cuilInfo(f.cuil.value, f.dni.value);
    n.className = 'nota ' + (r.ok ? 'nota-ok' : 'nota-error');
    n.textContent = r.ok ? '✓ CUIL válido para este DNI' : r.motivo;
  }
  function notaCuit() {
    const f = $('#form-datos'), n = $('#nota-cuit');
    if (!f.cuit.value.trim()) { n.textContent = ''; return; }
    const r = cuitInfo(f.cuit.value);
    n.className = 'nota ' + (r.ok ? 'nota-ok' : 'nota-error'); n.textContent = r.ok ? '✓ CUIT válido' : r.motivo;
  }
  $('#form-datos').cuit.addEventListener('input', notaCuit);
  $('#form-datos').estado_civil.addEventListener('change', (e) => { $('#sec-conyuge').hidden = !/casad|convivencial/i.test(e.target.value); });
  $('#form-datos').cuil.addEventListener('input', notaCuil);
  $('#form-datos').dni.addEventListener('input', notaCuil);

  $('#form-datos').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target, b = $('#confirmar'); error('#datos-error', '');
    const faltan = [];
    if (!f.nombre.value.trim()) faltan.push('tu nombre y apellido');
    if (!formatoDni(f.dni.value)) faltan.push('un DNI válido');
    if (!f.telefono.value.replace(/\D/g, '')) faltan.push('tu celular');
    if (estado.tipo === 'juridica') {
      if (!f.razon_social.value.trim()) faltan.push('la razón social');
      if (!cuitInfo(f.cuit.value).ok) faltan.push('un CUIT de empresa válido');
      if (!f.cargo.value) faltan.push('tu cargo en la empresa');
    } else if (estado.rol !== 'otro') {
      if (!f.estado_civil.value) faltan.push('tu estado civil');
      else if (/casad|convivencial/i.test(f.estado_civil.value) && (!f.conyuge_nombre.value.trim() || f.conyuge_dni.value.replace(/\D/g, '').length < 7)) faltan.push('el nombre y DNI de tu cónyuge');
    } else if (!f.titular_nombre.value.trim()) faltan.push('el nombre del titular');
    if (faltan.length) return error('#datos-error', 'Completá ' + faltan.join(', ') + '.');
    if (f.cuil.value.trim() && !cuilInfo(f.cuil.value, f.dni.value).ok) return error('#datos-error', 'Revisá el CUIL: ' + cuilInfo(f.cuil.value, f.dni.value).motivo);
    if (!f.acepto.checked) return error('#datos-error', 'Marcá la casilla para confirmar que los datos son correctos.');
    b.disabled = true; b.innerHTML = '<span class="cargando" aria-hidden="true"></span> Enviando…';
    try {
      const datos = Object.fromEntries(['nombre', 'dni', 'nacimiento', 'cuil', 'domicilio', 'telefono', 'email', 'patente', 'anio', 'marca_modelo', 'razon_social', 'cuit', 'cargo',
        'domicilio_empresa', 'estado_civil', 'conyuge_nombre', 'conyuge_dni', 'titular_nombre', 'titular_dni'].map((k) => [k, f[k].value.trim()]));
      datos.tipo_persona = estado.tipo; datos.relacion = estado.relacion;
      await llamar({ accion: 'confirmar', carga_id: estado.carga.carga_id, token: estado.carga.token, datos });
      $('#gracias-sep').hidden = $('#gracias-otra').hidden = false;
      $('#gracias-texto').textContent = 'Recibimos tus datos. Alguien de nuestro equipo los revisa y te escribe por WhatsApp.';
      mostrar('gracias');
    } catch (e) { error('#datos-error', e.message); }
    b.innerHTML = 'Confirmar mis datos'; b.disabled = false;
  });

  // ── Busco un auto / vendo sin dejarlo (sin DNI) ──
  document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.ir)));
  function datosDe(form, campos) {
    const d = Object.fromEntries(campos.map((k) => [k, (form[k] && form[k].value || '').trim()]));
    if ('colores' in d) d.colores = d.colores ? d.colores.split(/[,/]| y /).map((c) => c.trim()).filter(Boolean) : [];
    return d;
  }
  function gracias(texto) {
    $('#gracias-texto').textContent = texto; $('#gracias-sep').hidden = $('#gracias-otra').hidden = true; mostrar('gracias');
  }
  $('#form-busqueda').addEventListener('submit', async (ev) => {
    ev.preventDefault(); const f = ev.target, b = document.querySelector('[form="form-busqueda"]'); error('#busqueda-error', '');
    const d = datosDe(f, ['marca', 'modelo', 'version', 'flexibilidad', 'categoria', 'anio_min', 'anio_max', 'km_max', 'presupuesto', 'moneda', 'transmision', 'combustible', 'traccion', 'puertas', 'colores', 'notas', 'nombre', 'telefono', 'web']);
    if (!d.marca && !d.modelo && !d.categoria) return error('#busqueda-error', 'Contanos qué buscás: un modelo o un tipo de auto.');
    if (d.flexibilidad === 'categoria' && !d.categoria) return error('#busqueda-error', 'Elegí el tipo de auto.');
    if (!d.nombre || d.telefono.replace(/\D/g, '').length < 8) return error('#busqueda-error', 'Dejanos tu nombre y un WhatsApp para avisarte.');
    b.disabled = true; b.innerHTML = '<span class="cargando" aria-hidden="true"></span> Enviando…';
    try { await llamar({ accion: 'busqueda', datos: d }); f.reset(); gracias('Anotamos lo que buscás. Si nos entra algo así, alguien de nuestro equipo te escribe por WhatsApp.'); }
    catch (e) { error('#busqueda-error', e.message); }
    b.disabled = false; b.textContent = 'Avisame si aparece';
  });
  $('#form-oferta').addEventListener('submit', async (ev) => {
    ev.preventDefault(); const f = ev.target, b = document.querySelector('[form="form-oferta"]'); error('#oferta-error', '');
    const d = datosDe(f, ['marca', 'modelo', 'version', 'anio', 'km', 'color', 'categoria', 'transmision', 'combustible', 'puertas', 'precio', 'moneda', 'puede_dejarlo', 'notas', 'nombre', 'telefono', 'web']);
    if (!d.marca || !d.modelo) return error('#oferta-error', 'Contanos la marca y el modelo.');
    if (!d.nombre || d.telefono.replace(/\D/g, '').length < 8) return error('#oferta-error', 'Dejanos tu nombre y un WhatsApp para contactarte.');
    b.disabled = true; b.innerHTML = '<span class="cargando" aria-hidden="true"></span> Enviando…';
    try {
      const fotos = []; for (const a of Array.from(f.fotos_auto.files || []).slice(0, 6)) { try { fotos.push(await achicar(a, 1280, 0.78)); } catch (_) { /* foto que no abre */ } }
      await llamar({ accion: 'oferta', datos: d, fotos }); f.reset();
      gracias('Recibimos los datos de tu auto. Si aparece alguien interesado, alguien de nuestro equipo te escribe por WhatsApp.');
    } catch (e) { error('#oferta-error', e.message); }
    b.disabled = false; b.textContent = 'Enviar los datos de mi auto';
  });

  // ── Paso 4 ──
  $('#otra').addEventListener('click', () => { $('#gracias-sep').hidden = $('#gracias-otra').hidden = false; $('#gracias-texto').textContent = 'Recibimos tus datos. Alguien de nuestro equipo los revisa y te escribe por WhatsApp.'; estado.rol = null; estado.tipo = 'fisica'; estado.relacion = ''; estado.fotos = {}; estado.carga = null; mostrar('rol'); });

  if (!CFG || !CFG.supabaseUrl) document.body.insertAdjacentHTML('afterbegin', '<div class="aviso-caja aviso-error" style="margin: 16px;">Falta configurar la conexión (js/config.js).</div>');
})();

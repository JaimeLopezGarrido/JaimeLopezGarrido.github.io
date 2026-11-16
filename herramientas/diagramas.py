"""Genera los bloques "Cómo funciona" (diagrama SVG animado + ejemplo paso a paso) y los inserta en index.html.

Uso: python3 herramientas/diagramas.py
OJO: los diagramas ahora los dibuja herramientas/flujos/render.mjs (Mermaid). Si corrés este script,
volvé a correr ese después para no perder los flujos nuevos.
Cada diagrama: cajas (x, y, ancho, alto, título, subtítulo), conexiones (paths SVG) y un "recorrido":
el camino que hace un ejemplo real, por el que viaja un punto rojo.
"""

import html
import re
from pathlib import Path

INDEX = Path(__file__).resolve().parent.parent / 'index.html'


def caja(x, y, w, h, titulo, sub='', destacada=False):
    clase = 'nodo destacado' if destacada else 'nodo'
    t = f'<rect class="{clase}" x="{x}" y="{y}" width="{w}" height="{h}" rx="10"/>'
    cy = y + h / 2 + (-6 if sub else 4)
    t += f'<text class="t" x="{x + w / 2}" y="{cy}">{html.escape(titulo)}</text>'
    if sub:
        t += f'<text class="s" x="{x + w / 2}" y="{cy + 16}">{html.escape(sub)}</text>'
    return t


def svg(ancho, alto, cajas, conexiones, recorrido, punteadas=(), segundos=5):
    partes = [f'<svg class="diagrama" viewBox="0 0 {ancho} {alto}" role="img" aria-hidden="true">']
    partes += [f'<path class="c" d="{d}"/>' for d in conexiones]
    partes += [f'<path class="c punteada" d="{d}"/>' for d in punteadas]
    partes += [f'<path class="recorrido" d="{recorrido}"/>']
    partes += [caja(*c) for c in cajas]
    partes += [f'<circle class="punto" r="5"><animateMotion dur="{segundos}s" repeatCount="indefinite" '
               f'path="{recorrido}" keyPoints="0;1" keyTimes="0;1" calcMode="linear"/></circle>']
    partes.append('</svg>')
    return ''.join(partes)


def bloque(id_, diagrama, titulo_es, titulo_en, pasos):
    """pasos: [(texto_es, texto_en)]"""
    lista = ''.join(f'<li><span lang="es">{es}</span><span lang="en">{en}</span></li>' for es, en in pasos)
    return (f'<details class="como" id="como-{id_}"><summary class="mono"><span lang="es">Cómo funciona</span>'
            f'<span lang="en">How it works</span><span class="flecha">↓</span></summary>'
            f'<div class="como-cuerpo"><div class="diagrama-caja">{diagrama}</div>'
            f'<div class="ejemplo"><div class="mono ej-titulo"><span lang="es">{titulo_es}</span><span lang="en">{titulo_en}</span></div>'
            f'<ol>{lista}</ol></div></div></details>')


# ---------- Asistente de atención ----------
chat = svg(980, 300, [
    (10, 125, 120, 50, 'NAVEGADOR', 'chat web'),
    (160, 125, 140, 50, 'API /CHAT', 'sesión · límites'),
    (330, 125, 140, 50, 'ROUTER', '1 llamada LLM'),
    (520, 14, 210, 50, 'POLÍTICAS + MANUAL', 'RAG híbrido · cita pág.', True),
    (520, 84, 210, 50, 'AGENTE', 'disponibilidad · cotizar'),
    (520, 154, 210, 50, 'RECLAMO', 'respuesta fija · humano'),
    (520, 224, 210, 50, 'FUERA DE ALCANCE', 'respuesta fija'),
    (780, 115, 190, 70, 'VALIDACIÓN', 'esquema · citas · fuentes'),
    (300, 240, 190, 46, 'MODELOS', 'groq → groq 120b → gemini'),
], [
    'M130 150 H160', 'M300 150 H330',
    'M470 150 C495 150 495 39 520 39', 'M470 150 C495 150 495 109 520 109',
    'M470 150 C495 150 495 179 520 179', 'M470 150 C495 150 495 249 520 249',
    'M730 39 C755 39 755 140 780 140', 'M730 109 C755 109 755 145 780 145',
    'M730 179 C755 179 755 155 780 155', 'M730 249 C755 249 755 160 780 160',
], 'M130 150 H470 C495 150 495 39 520 39 H730 C755 39 755 140 780 140 H970',
    punteadas=['M395 240 V175', 'M490 263 C505 263 505 230 520 230'])

pasos_chat = [
    ('Alguien escribe <i>"¿Qué hago si pincho una goma?"</i>. La API la recibe y controla los límites por visitante y por conversación.',
     'Someone types <i>"What do I do if I get a flat tire?"</i>. The API receives it and checks the per-visitor and per-conversation limits.'),
    ('El <b>router</b> (una llamada al modelo con salida en JSON) la clasifica como <b>política</b>: no hace falta el agente con herramientas.',
     'The <b>router</b> (one model call with JSON output) classifies it as a <b>policy</b> question: the tool-using agent isn\'t needed.'),
    ('El <b>RAG</b> busca en el manual: embeddings de la pregunta + búsqueda por palabras. Encuentra la <b>página 7</b> (similitud 0,74; lo que no tiene relación queda debajo de 0,62 y se descarta).',
     '<b>RAG</b> searches the manual: question embeddings + keyword search. It finds <b>page 7</b> (similarity 0.74; anything unrelated stays below 0.62 and is discarded).'),
    ('El modelo responde en un formato fijo que lo obliga a decir qué páginas usó (<code>paginas_manual: [7]</code>). Si falla un proveedor, pasa al siguiente en segundos.',
     'The model answers in a fixed format that forces it to state which pages it used (<code>paginas_manual: [7]</code>). If a provider fails, it switches to the next one in seconds.'),
    ('El <b>código valida</b>: si el texto no trae la cita, la agrega; arma las fuentes con el fragmento original. La web muestra la respuesta, la ruta y la fuente <b>[pág. 7]</b>.',
     'The <b>code validates</b>: if the text lacks the citation, it adds it, and builds the sources from the original passage. The page shows the answer, the route and the source <b>[p. 7]</b>.'),
]

# ---------- HAY AUTOS ----------
hay = svg(980, 260, [
    (10, 24, 160, 50, 'DRIVE', 'fotos de autos'),
    (10, 104, 160, 50, 'PLANILLA', 'stock'),
    (10, 184, 160, 50, 'LINK CLIENTE', 'DNI · cédula', True),
    (230, 99, 150, 60, 'N8N', 'flujos'),
    (230, 4, 150, 56, 'IA', 'lee DNI · ordena fotos'),
    (440, 99, 150, 60, 'SUPABASE', 'datos · permisos'),
    (650, 34, 150, 60, 'PANEL WEB', 'pendientes · radar'),
    (650, 164, 150, 60, 'PUBLICACIONES', 'carrusel · historias'),
    (840, 34, 130, 60, 'DOCUMENTOS', 'reserva · seña'),
], [
    'M170 49 C200 49 200 120 230 120', 'M170 129 H230', 'M170 209 C200 209 200 140 230 140',
    'M305 99 V60', 'M380 129 H440',
    'M590 129 C620 129 620 64 650 64', 'M590 129 C620 129 620 194 650 194', 'M800 64 H840',
], 'M170 209 C200 209 200 140 230 140 H305 V60 V129 H440 H590 C620 129 620 64 650 64 H840 H970')

pasos_hay = [
    ('Un cliente que vende su auto abre el link desde el celular y sube <b>DNI y cédula</b> (almacenamiento privado).',
     'A customer selling their car opens the link on their phone and uploads their <b>ID and car title</b> (private storage).'),
    ('<b>n8n</b> le pasa las fotos a la <b>IA</b>, que devuelve nombre, DNI, CUIL y patente en un formato fijo.',
     '<b>n8n</b> sends the photos to the <b>AI</b>, which returns name, ID number, tax ID and plate in a fixed format.'),
    ('El <b>código valida</b> sin IA: el CUIL con su dígito verificador y que el titular de la cédula sea el del DNI.',
     'The <b>code validates</b> without AI: the tax ID check digit, and that the title holder matches the ID.'),
    ('Vincula al auto del stock <b>por patente</b>, corrigiendo confusiones de lectura (O/0, B/8). Si hay dos candidatos, no adivina: lo deja para revisar.',
     'It links the car in stock <b>by plate</b>, fixing reading mix-ups (O/0, B/8). If there are two candidates, it doesn\'t guess: it flags it for review.'),
    ('Aparece en <b>Pendientes</b> del panel; el dueño aprueba y genera la <b>reserva o el boleto</b> al instante, con montos en letras.',
     'It shows up in the dashboard\'s <b>Pending</b> list; the owner approves it and generates the <b>reservation or bill of sale</b> instantly, with amounts in words.'),
]

# ---------- Proper ----------
proper = svg(980, 260, [
    (10, 100, 140, 56, 'INSTAGRAM', 'mensaje del cliente'),
    (180, 100, 140, 56, 'N8N', 'junta mensajes'),
    (350, 14, 160, 56, 'IA · MODO PLAN', '{acción, datos, texto}', True),
    (350, 186, 160, 56, 'RESPUESTA', 'texto fijo + números'),
    (560, 100, 150, 56, 'API DE LA APP', '/api/bot'),
    (750, 100, 210, 56, 'MOTOR DE REGLAS', 'disponibilidad · precios'),
    (750, 196, 210, 50, 'PANEL Y PORTAL', 'mismo motor'),
], [
    'M150 128 H180', 'M320 120 C335 120 335 42 350 42', 'M510 42 C535 42 535 120 560 120',
    'M710 128 H750', 'M855 156 V196', 'M560 136 C535 136 535 214 510 214',
    'M350 214 C300 214 270 180 250 156',
], 'M150 128 H180 H250 H320 C335 120 335 42 350 42 H510 C535 42 535 120 560 120 H750 H855 H710 H560 C535 136 535 214 510 214 H350')

pasos_proper = [
    ('Escriben por Instagram: <i>"¿Tienen auto del 20 al 25 de enero? Viajo con mi perro"</i>. <b>n8n</b> espera unos segundos para juntar mensajes seguidos.',
     'Someone writes on Instagram: <i>"Do you have a car Jan 20–25? I\'m traveling with my dog"</i>. <b>n8n</b> waits a few seconds to group consecutive messages.'),
    ('La <b>IA en modo plan</b> no responde directo: devuelve qué hacer, por ejemplo <code>acción: cotizar</code>, con las fechas y <code>mascota: sí</code>.',
     'The <b>AI in plan mode</b> doesn\'t answer directly: it returns what to do, e.g. <code>action: quote</code>, with the dates and <code>pet: yes</code>.'),
    ('n8n llama a la <b>API de la app</b>, que calcula con el <b>mismo motor que usa el panel</b>: disponibilidad, temporada y cargo por mascota.',
     'n8n calls the <b>app\'s API</b>, which calculates with the <b>same engine the dashboard uses</b>: availability, season and pet fee.'),
    ('La respuesta se arma con <b>texto fijo y los números de la app</b>: la IA nunca escribe un precio. En 38 charlas de prueba no inventó ninguno.',
     'The reply is built from <b>fixed text and the app\'s numbers</b>: the AI never writes a price. In 38 test conversations it never made one up.'),
    ('Si el cliente pre-reserva o pide un cambio, cae en el <b>panel</b> de la agencia para aprobarlo.',
     'If the customer pre-books or requests a change, it lands in the agency\'s <b>dashboard</b> for approval.'),
]

BLOQUES = {
    'id="asistente"': bloque('asistente', chat, 'Ejemplo: "¿Qué hago si pincho una goma?"', 'Example: "What do I do if I get a flat tire?"', pasos_chat),
    'HAY AUTOS</h3>': bloque('hayautos', hay, 'Ejemplo: un cliente carga su DNI y cédula', 'Example: a customer uploads their ID and car title', pasos_hay),
    'Proper Rent a Car</h3>': bloque('proper', proper, 'Ejemplo: una consulta por Instagram', 'Example: an Instagram inquiry', pasos_proper),
}


def main():
    t = INDEX.read_text(encoding='utf-8')
    t = re.sub(r'\n?\s*<details class="como".*?</details>', '', t, flags=re.S)  # regenerable
    for marca, contenido in BLOQUES.items():
        i = t.index(marca)
        j = t.index('</article>', i)
        t = t[:j] + '  ' + contenido + '\n  ' + t[j:]
    INDEX.write_text(t, encoding='utf-8')
    print('bloques insertados:', t.count('class="como"'))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Genera una versión pública del dashboard del TP de Web Mining sin referencias
a NBI / nivel socioeconómico. No modifica el original: lee y escribe una copia.

Uso:  python3 limpiar_dashboard.py [ORIGEN] [DESTINO]
"""
import re
import sys
from pathlib import Path

ORIGEN = Path(sys.argv[1] if len(sys.argv) > 1 else
              "/Users/jaimelopezgarrido/Desktop/TP Web Mining/Diego - TP Web Mining/outputs/dashboard_tp.html")
DESTINO = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).with_name("index.html"))

PATRONES = [r"\bNBI\b", r"pobreza", r"socioecon", r"necesidades b[aá]sicas", r"estrato",
            r"vulnerab", r"ingreso de", r"ingresos", r"insatisfech", r"g_nbi", r"nbi_"]


def contar(s):
    return {p: len(re.findall(p, s, re.I)) for p in PATRONES}


def quitar_una(s, inicio, fin, nombre, incluir_fin=True):
    a = s.find(inicio)
    if a < 0:
        raise SystemExit(f"No encontré el inicio de: {nombre}")
    b = s.find(fin, a + len(inicio))
    if b < 0:
        raise SystemExit(f"No encontré el fin de: {nombre}")
    b += len(fin) if incluir_fin else 0
    print(f"  - quitado {nombre}: {b - a:,} caracteres")
    return s[:a] + s[b:]


def reemplazar(s, viejo, nuevo):
    n = s.count(viejo)
    if n == 0:
        raise SystemExit(f"No encontré el texto: {viejo!r}")
    print(f"  - reemplazado ({n}x): {viejo!r} -> {nuevo!r}")
    return s.replace(viejo, nuevo)


s = ORIGEN.read_text(encoding="utf-8")
antes = contar(s)
print("Cambios:")

# 1. Capa del mapa (objeto JSON escapado dentro del srcdoc del iframe del visor).
#    Se quita el objeto completo + la coma que lo separa del siguiente.
s = quitar_una(s, '{\\"tipo\\":\\"coropleta\\",\\"titulo\\":\\"Hogares con NBI (solo contraste)\\"',
               '\\"id\\":\\"06_hogares_con_nbi_solo_contraste_\\"},', "capa 'Hogares con NBI' del visor")

# 1b. Botón del recorrido que enciende esa capa.
s = quitar_una(s, '<button class="rv" data-capas="[&quot;Hogares con NBI (solo contraste)&quot;]"',
               '>NBI</button>', "botón NBI del recorrido")

# 2. Tarjeta del gráfico "Hogares con NBI por cuadrante" (div + su JSON).
s = quitar_una(s, '<div class="gcard" id="g_nbi">', '</script></div>', "tarjeta g_nbi")

# 3. Textos.
for viejo, nuevo in [
    ("Censo 2022 (población y NBI)", "Censo 2022 (población)"),
    ("Radios censales con población y NBI", "Radios censales con población"),
    ("Radios censales con su población; el NBI, solo para interpretar.", "Radios censales con su población."),
    ("Cuadrantes y nivel socioeconómico", "Cuadrantes"),
]:
    s = reemplazar(s, viejo, nuevo)

# 4. <head>: título y contador de visitas.
s, n = re.subn(r"<title>.*?</title>", "<title>Arbolado urbano en CABA · Web Mining</title>", s, count=1)
assert n == 1
GC = '<script data-goatcounter="https://jaimelopezgarrido.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>'
s = s.replace("</title>", "</title>\n" + GC, 1)

# 5. Cartel superior fino (no sticky: se va al scrollear, no tapa el header).
CARTEL = (
    '<style>#tp-cartel{background:#0b1418;color:#9fb0b6;font:12px/1.4 "IBM Plex Sans",system-ui,sans-serif;'
    'padding:5px 20px;display:flex;gap:14px;align-items:center;justify-content:space-between;'
    'border-bottom:1px solid rgba(255,255,255,.06)}'
    '#tp-cartel span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}'
    '#tp-cartel a{color:#e6eef0;text-decoration:none;white-space:nowrap;flex:none}'
    '#tp-cartel a:hover{text-decoration:underline}'
    '@media(max-width:700px){#tp-cartel{flex-direction:column-reverse;align-items:flex-start;gap:2px;padding:5px 16px}'
    '#tp-cartel span{white-space:normal}}</style>'
    '<div id="tp-cartel"><span>TP final de Web Mining · Maestría en Ciencia de Datos, Universidad Austral · '
    'equipo de 5: Analía Alé, Diego Farfán, Jaime López Garrido, Gabriel Martina, Lucía Pereyra Huertas</span>'
    '<a href="https://jaimelopezgarrido.github.io/#proyectos">← Volver al portfolio</a></div>\n'
)
s = reemplazar(s, "<body>\n<header>", "<body>\n" + CARTEL + "<header>")

despues = contar(s)
DESTINO.parent.mkdir(parents=True, exist_ok=True)
DESTINO.write_text(s, encoding="utf-8")

print("\nMenciones (case-insensitive)   antes  después")
for p in PATRONES:
    print(f"  {p:<28} {antes[p]:>5}  {despues[p]:>7}")
for p in PATRONES:
    for m in re.finditer(p, s, re.I):
        print("  MATCH RESTANTE:", repr(s[max(0, m.start() - 80):m.end() + 80]))
print(f"\nEscrito: {DESTINO} ({DESTINO.stat().st_size:,} bytes)")

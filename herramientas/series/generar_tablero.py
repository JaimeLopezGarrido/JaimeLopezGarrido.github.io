"""Genera index.html: tablero estático del TP de Series Temporales (Salar de Callacao).

Lee SOLO los CSV del proyecto original (no los modifica) y embebe los datos como JSON.
Uso:  ~/anaconda3/bin/python generar_tablero.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

BASE = Path("/Users/jaimelopezgarrido/Desktop/Documentos/Posgrado Austral/2A/Series Temporales")
TP2 = BASE / "TP_Final"
OUT = TP2 / "OUTPUTS"
TP1_DATA = TP2 / "DATASETS_TP1"          # copia de TP1/OUTPUTS hecha por el notebook 00
SALIDA = Path(__file__).resolve().parent / "index.html"

SERIES = ["nieve", "agua", "savi"]
TEST = {"nieve": 24, "savi": 12, "agua": 12}       # regla T1 de la guía: split idéntico al TP1

GRUPO = {  # familia del CSV -> grupo de color del tablero
    "TP1 (clásicos)": "TP1 clásicos",
    "Ensamble (ML)": "Ensamble ML",
    "Deep Learning": "Deep Learning",
    "Híbrido (Prophet)": "Híbrido",
    "Híbrido (Neural Prophet)": "Híbrido",
    "AutoML": "AutoML",
}


def limpio(x):
    """float -> float JSON (NaN -> None)."""
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return None
    return float(x)


# ---------------------------------------------------------------- series
completo = pd.read_csv(TP1_DATA / "01_series_mensuales_completo.csv", parse_dates=["fecha"]).set_index("fecha")
comun = pd.read_csv(TP1_DATA / "01_series_mensuales_comun.csv", parse_dates=["fecha"]).set_index("fecha")
# regla T8: nieve del archivo completo; SAVI y agua de la ventana común (agua imputada en TP1)
Y = {"nieve": completo["nieve"].dropna(), "savi": comun["savi"], "agua": comun["agua"]}

series_json, perfil_json, test_info = {}, {}, {}
for s in SERIES:
    y = Y[s]
    series_json[s] = {"x": y.index.strftime("%Y-%m").tolist(), "y": [limpio(v) for v in y.values]}
    g = y.groupby(y.index.month)
    perfil_json[s] = {
        "mediana": [limpio(v) for v in g.median().values],
        "q25": [limpio(v) for v in g.quantile(0.25).values],
        "q75": [limpio(v) for v in g.quantile(0.75).values],
        "n_anios": int(g.size().min()),
    }
    n = TEST[s]
    tr, te = y.iloc[:-n], y.iloc[-n:]
    escala = float(np.mean(np.abs(tr.values[12:] - tr.values[:-12])))   # naive estacional en train
    test_info[s] = {
        "n": n,
        "desde": te.index[0].strftime("%Y-%m"),
        "hasta": te.index[-1].strftime("%Y-%m"),
        "x": te.index.strftime("%Y-%m").tolist(),
        "y": [limpio(v) for v in te.values],
        "train_x": tr.index[-36:].strftime("%Y-%m").tolist(),
        "train_y": [limpio(v) for v in tr.values[-36:]],
        "escala_mase": escala,
        "n_total": int(len(y)),
        "inicio": y.index[0].strftime("%Y-%m"),
    }

# ---------------------------------------------------------------- métricas
comp = pd.read_csv(OUT / "04_comparacion_final.csv")
mejores = pd.read_csv(OUT / "04_mejores_por_serie.csv")
res01 = pd.read_csv(OUT / "01_resumen_ensamble.csv")

preds = pd.concat([pd.read_csv(OUT / f"0{i}_predicciones_test.csv") for i in (1, 2, 3)], ignore_index=True)


def metricas(real, pred, escala):
    real, pred = np.asarray(real, float), np.asarray(pred, float)
    e = real - pred
    mae = np.mean(np.abs(e))
    return {
        "MAE": float(mae),
        "RMSE": float(np.sqrt(np.mean(e ** 2))),
        "sMAPE": float(100 * np.mean(2 * np.abs(e) / (np.abs(real) + np.abs(pred)))),
        "MASE": float(mae / escala),
    }


pred_json = {s: {} for s in SERIES}
for (s, m), g in preds.groupby(["serie", "modelo"]):
    g = g.assign(mes=g.fecha.str[:7]).set_index("mes")["prediccion"].reindex(test_info[s]["x"])
    assert g.notna().all(), (s, m)
    pred_json[s][m] = [limpio(v) for v in g.values]
# Naive estacional: y(t-12). Se recalcula y se verifica contra la tabla (00_baseline_tp1 lo marca
# como "TP2 (recalculado)"): sólo se usa si reproduce el MAE de la tabla.
for s in SERIES:
    y = Y[s]
    nv = y.shift(12).iloc[-TEST[s]:]
    pred_json[s]["Naive estacional"] = [limpio(v) for v in nv.values]

filas = []
for s in SERIES:
    bloque = comp[comp.serie == s].reset_index(drop=True)   # el CSV ya viene ordenado por MASE
    ganador = mejores.loc[mejores.serie == s, "modelo"].iloc[0]
    for i, r in bloque.iterrows():
        modelo, etiqueta, clave = r.modelo, r.modelo, r.modelo
        nota = []
        # El CSV tiene dos filas "Random Forest" en nieve: la recursiva y la directa.
        # Se identifican por MASE contra 01_resumen_ensamble.csv.
        if modelo == "Random Forest" and s == "nieve":
            est = res01[(res01.serie == s) & (res01.modelo == "Random Forest")]
            match = est.loc[(est.MASE - r.MASE).abs() < 1e-9, "estrategia"].iloc[0]
            if match == "Directa":
                etiqueta, clave = "Random Forest (directa)", "Random Forest (directa)"
                nota.append("En 04_comparacion_final.csv figura como «Random Forest»; es la estrategia directa (01_resumen_ensamble.csv).")
        tiene_pred = clave in pred_json[s]
        recalc = None
        if tiene_pred:
            recalc = metricas(test_info[s]["y"], pred_json[s][clave], test_info[s]["escala_mase"])
        if r.familia == "Deep Learning" and "N-BEATS" in modelo:
            nota.append("Métricas: promedio de 2 semillas (123 y 456). La curva guardada es de la semilla 123.")
        if modelo == "VAR(1)" and int(r.n_test) != TEST[s]:
            nota.append(f"El VAR del TP1 se evaluó sobre {int(r.n_test)} meses, no {TEST[s]}: horizonte más corto, más fácil.")
        if "Neural Prophet" in modelo:
            nota.append("Neural Prophet resultó inestable en Colab: estos números vienen de una corrida que no se pudo reproducir.")
        if modelo == "Naive estacional":
            nota.append("Repite el valor del mismo mes del año anterior. Es la referencia del MASE.")
        if not tiene_pred:
            nota.append("No hay predicciones de test guardadas para este modelo (sólo sus métricas).")
        filas.append({
            "serie": s, "modelo": modelo, "etiqueta": etiqueta, "clave": clave if tiene_pred else None,
            "familia": r.familia, "grupo": GRUPO[r.familia], "n_test": int(r.n_test),
            "MAE": float(r.MAE), "RMSE": float(r.RMSE), "sMAPE": float(r["sMAPE %"]), "MASE": float(r.MASE),
            "puesto": int(i + 1), "n_modelos": int(len(bloque)),
            "ganador": bool(modelo == ganador and abs(r.MASE - mejores.loc[mejores.serie == s, "MASE"].iloc[0]) < 1e-12),
            "recalc": recalc, "nota": nota,
        })

# ---------------------------------------------------------------- pronósticos
pron = pd.concat([pd.read_csv(OUT / f) for f in
                  ["01_pronosticos_ensamble.csv", "02_pronosticos_lstm_nbeats.csv", "03_pronosticos_prophet.csv"]],
                 ignore_index=True)
pron_json, pron_elegido = {s: {} for s in SERIES}, {}
for (s, m), g in pron.groupby(["serie", "modelo"]):
    g = g.sort_values("fecha")
    pron_json[s][m] = {"x": [f[:7] for f in g.fecha], "y": [limpio(v) for v in g.pronostico]}
for s in SERIES:
    bloque = [f for f in filas if f["serie"] == s]
    ganador = next(f for f in bloque if f["ganador"])
    if ganador["modelo"] in pron_json[s]:
        elegido, motivo = ganador["modelo"], "ganador"
    else:   # mejor MASE entre los modelos que sí guardaron pronóstico
        cand = [f for f in bloque if f["modelo"] in pron_json[s] and f["etiqueta"] == f["modelo"]]
        elegido, motivo = min(cand, key=lambda f: f["MASE"])["modelo"], "sustituto"
    pron_elegido[s] = {"modelo": elegido, "motivo": motivo, "ganador": ganador["modelo"]}

# historia reciente para el gráfico de pronóstico
hist_json = {}
for s in SERIES:
    y = Y[s].iloc[-60:]
    hist_json[s] = {"x": y.index.strftime("%Y-%m").tolist(), "y": [limpio(v) for v in y.values]}

datos = {
    "series": series_json, "perfil": perfil_json, "test": test_info, "filas": filas,
    "pred": pred_json, "pron": pron_json, "pron_elegido": pron_elegido, "hist": hist_json,
}

# ---------------------------------------------------------------- controles
# 1) la naive recalculada reproduce la tabla
for s in SERIES:
    f = next(f for f in filas if f["serie"] == s and f["modelo"] == "Naive estacional")
    assert abs(f["recalc"]["MAE"] - f["MAE"]) < 1e-6, s
# 1b) las métricas recalculadas de las curvas reproducen la tabla (salvo N-BEATS/N-BEATSx: semilla 123 vs promedio)
for f in filas:
    if f["recalc"] and "N-BEATS" not in f["modelo"]:
        assert abs(f["recalc"]["MASE"] - f["MASE"]) < 1e-9, (f["serie"], f["etiqueta"], f["recalc"]["MASE"], f["MASE"])
# 2) los valores embebidos son exactamente los del CSV
for f in filas:
    r = comp[(comp.serie == f["serie"]) & (comp.modelo == f["modelo"]) & ((comp.MASE - f["MASE"]).abs() < 1e-15)]
    assert len(r) == 1 and r.MAE.iloc[0] == f["MAE"] and r.RMSE.iloc[0] == f["RMSE"] \
        and r["sMAPE %"].iloc[0] == f["sMAPE"], f
assert len(filas) == len(comp)

PLANTILLA = r'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Salar de Callacao · Series temporales</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M2 28 L12 10 L17 18 L21 12 L30 28 Z' fill='%2336505c'/%3E%3Cpath d='M12 10 L15 15 L13 15 L10 14 Z' fill='%23fff'/%3E%3C/svg%3E">
<meta name="description" content="Tablero del TP de Análisis de Series Temporales (Maestría en Ciencia de Datos, Universidad Austral): nieve, agua superficial y SAVI de la cuenca del Salar de Callacao, modelados con SARIMA, VAR, ensambles, deep learning, Prophet y AutoML.">
<script data-goatcounter="https://jaimelopezgarrido.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
<script src="https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.35.2/plotly.min.js"></script>
<style>
:root{
  color-scheme: light;
  --bg:#f4f5f2; --surface:#ffffff; --surface-2:#eef0ec; --line:#dfe2dc; --grid:#e9ebe6;
  --ink:#1d2428; --ink-2:#4b5559; --ink-3:#747d80;
  --accent:#36505c;
  --nieve:#4553C2; --agua:#0090B8; --savi:#8F8A14;
  --f-tp1:#6b5b4b; --f-ml:#d9662a; --f-dl:#2a78d6; --f-hib:#159a6a; --f-auto:#b03a8a;
  --real:#1d2428; --warn-bg:#fbf4e4; --warn-line:#e2c98d;
  --radius:10px;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;overflow-x:hidden}
a{color:var(--accent)}
.topbar{background:#1f2e35;color:#d7dfe1;font-size:12.5px;line-height:1.4}
.topbar .in{max-width:1180px;margin:0 auto;padding:7px 16px;display:flex;gap:14px;align-items:center;justify-content:space-between}
.topbar a{color:#fff;text-decoration:none;white-space:nowrap;font-weight:600}
.topbar a:hover{text-decoration:underline}
header.hero{background:linear-gradient(180deg,#e6ebee 0%,var(--bg) 100%);border-bottom:1px solid var(--line)}
.wrap{max-width:1180px;margin:0 auto;padding:0 16px}
.hero .wrap{padding-top:26px;padding-bottom:18px}
.hero svg.ridge{display:block;width:100%;height:46px;margin-top:4px}
h1{font-size:30px;line-height:1.15;margin:0 0 6px;letter-spacing:-.01em}
.sub{color:var(--ink-2);max-width:820px;margin:0}
.kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;border-top:4px solid var(--c)}
.kpi .lab{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600}
.kpi .val{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2}
.kpi .val small{font-size:13px;font-weight:600;color:var(--ink-2)}
.kpi .mod{font-size:13.5px;color:var(--ink-2)}
nav.tabs{position:sticky;top:0;z-index:20;background:rgba(244,245,242,.96);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
nav.tabs .wrap{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
nav.tabs .wrap::-webkit-scrollbar{display:none}
nav.tabs button{flex:0 0 auto;border:0;background:none;padding:12px 12px 10px;font:inherit;font-size:14px;color:var(--ink-2);cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}
nav.tabs button[aria-selected=true]{color:var(--ink);font-weight:650;border-bottom-color:var(--accent)}
nav.tabs button:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
main{padding:22px 0 40px}
section.panel{display:none}
section.panel.on{display:block}
h2{font-size:22px;margin:0 0 4px}
.lead{color:var(--ink-2);margin:0 0 16px;max-width:860px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;margin-bottom:14px;min-width:0}
.card h3{font-size:16px;margin:0 0 2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.card .meta{font-size:13px;color:var(--ink-3);margin:0 0 6px}
.dot{width:10px;height:10px;border-radius:50%;background:var(--c);display:inline-block;flex:0 0 auto}
.grid-2{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:14px}
.grid-2 > .card{margin-bottom:0}
.row{margin-bottom:14px}
.plot{width:100%;height:300px}
.plot.tall{height:380px}
.controls{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:flex-end;margin-bottom:12px}
.controls label{font-size:12.5px;color:var(--ink-3);font-weight:600;display:flex;flex-direction:column;gap:4px;min-width:0}
select{font:inherit;font-size:14px;padding:7px 30px 7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);max-width:100%;min-width:0}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface)}
.seg button{border:0;background:none;font:inherit;font-size:13.5px;padding:7px 11px;cursor:pointer;color:var(--ink-2)}
.seg button + button{border-left:1px solid var(--line)}
.seg button[aria-pressed=true]{background:var(--accent);color:#fff;font-weight:600}
.chk{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;color:var(--ink-2);cursor:pointer}
.tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:10px 0 6px}
.tile{background:var(--surface-2);border-radius:8px;padding:9px 11px}
.tile .lab{font-size:12px;color:var(--ink-3);font-weight:600}
.tile .val{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
.note{font-size:13px;color:var(--ink-2);background:var(--warn-bg);border:1px solid var(--warn-line);border-radius:8px;padding:8px 11px;margin:8px 0 0}
.note:empty{display:none}
.muted{color:var(--ink-3);font-size:13px}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:var(--ink-2);margin:4px 0 8px}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:12px;height:12px;border-radius:3px;background:var(--c);display:inline-block}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}
table{border-collapse:collapse;width:100%;font-size:13.5px;font-variant-numeric:tabular-nums}
th,td{padding:6px 8px;border-bottom:1px solid var(--grid);text-align:right;white-space:nowrap}
th:nth-child(2),td:nth-child(2),th:nth-child(3),td:nth-child(3){text-align:left}
th{font-size:12px;color:var(--ink-3);font-weight:650;cursor:pointer;user-select:none;position:sticky;top:0;background:var(--surface)}
th[aria-sort=ascending]::after{content:" ▲";font-size:9px}
th[aria-sort=descending]::after{content:" ▼";font-size:9px}
tr.win td{background:#eef6f1;font-weight:650}
td .fam{display:inline-flex;align-items:center;gap:6px}
td .fam i{width:9px;height:9px;border-radius:2px;background:var(--c);display:inline-block}
.explica{border-left:4px solid var(--accent);background:var(--surface);padding:10px 14px;border-radius:0 8px 8px 0;margin:0 0 14px;font-size:14px}
.pipeline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;counter-reset:paso;margin:6px 0 4px}
.paso{background:var(--surface-2);border-radius:8px;padding:10px 12px;position:relative}
.paso b{display:block;font-size:14px;margin-bottom:2px}
.paso b::before{counter-increment:paso;content:counter(paso);display:inline-flex;width:20px;height:20px;border-radius:50%;background:var(--accent);color:#fff;font-size:12px;align-items:center;justify-content:center;margin-right:7px}
.paso span{font-size:13px;color:var(--ink-2)}
ul.dec{margin:6px 0 0;padding-left:18px}
ul.dec li{margin-bottom:6px}
.cols-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
.cols-2 > .card{margin-bottom:0}
footer{border-top:1px solid var(--line);color:var(--ink-3);font-size:12.5px;padding:16px 0 28px}
@media (max-width:860px){
  .grid-2,.cols-2{grid-template-columns:minmax(0,1fr)}
  .pipeline{grid-template-columns:repeat(2,minmax(0,1fr))}
  .tiles{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:560px){
  h1{font-size:24px}
  .kpis{grid-template-columns:minmax(0,1fr)}
  .kpi{display:grid;grid-template-columns:auto 1fr;column-gap:12px;align-items:baseline}
  .kpi .lab{grid-column:1/-1}
  .topbar .in{flex-direction:column;align-items:flex-start;gap:4px}
  .plot{height:270px}.plot.tall{height:340px}
  .pipeline{grid-template-columns:minmax(0,1fr)}
  .card{padding:12px}
  .controls label{width:100%} .controls select{width:100%}
  #r-tabla th:nth-child(3),#r-tabla td:nth-child(3),#r-tabla th:nth-child(4),#r-tabla td:nth-child(4),#r-tabla th:nth-child(6),#r-tabla td:nth-child(6){display:none}
  #r-tabla td:nth-child(2){white-space:normal;min-width:120px}
  #r-tabla{font-size:12.5px} #r-tabla th,#r-tabla td{padding:6px 5px}
}
</style>
</head>
<body>
<div class="topbar"><div class="in">
  <span>TP de Análisis de Series Temporales · Maestría en Ciencia de Datos, Universidad Austral · equipo de 5: Analía Alé, Diego Farfán, Jaime López Garrido, Gabriel Martina, Lucía Pereyra Huertas</span>
  <a href="https://jaimelopezgarrido.github.io/#data-science">← Volver al portfolio</a>
</div></div>

<header class="hero"><div class="wrap">
  <h1>Salar de Callacao · Series temporales</h1>
  <p class="sub">Tres señales satelitales de una cuenca endorreica de la Puna salteña, a unos 4.000 m: superficie de nieve (Landsat, 1986–2025), superficie de agua y vegetación SAVI (Sentinel-2, 2016–2025). Primero con Box-Jenkins (SARIMA, VAR) y después con machine learning, deep learning, modelos híbridos y AutoML, todos evaluados sobre el mismo tramo de prueba.</p>
  <div class="kpis" id="kpis"></div>
  <svg class="ridge" viewBox="0 0 1200 46" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 46 L0 34 L90 22 L160 30 L250 10 L320 24 L400 16 L470 28 L560 6 L640 22 L720 14 L800 30 L880 12 L960 26 L1040 18 L1120 30 L1200 20 L1200 46 Z" fill="#d7dee2"/>
    <path d="M250 10 L272 16 L262 17 L280 22 L232 14 Z M560 6 L586 13 L572 14 L594 19 L540 11 Z M880 12 L902 18 L890 19 L905 23 L862 16 Z" fill="#ffffff"/>
  </svg>
</div></header>

<nav class="tabs" aria-label="Secciones"><div class="wrap" role="tablist">
  <button role="tab" aria-selected="true" data-tab="series">1 · Las series</button>
  <button role="tab" aria-selected="false" data-tab="test">2 · Real vs. predicción</button>
  <button role="tab" aria-selected="false" data-tab="ranking">3 · Ranking de modelos</button>
  <button role="tab" aria-selected="false" data-tab="futuro">4 · Pronóstico</button>
  <button role="tab" aria-selected="false" data-tab="como">5 · Cómo se hizo</button>
</div></nav>

<main class="wrap">

<!-- 1 ─────────────────────────────── -->
<section class="panel on" id="p-series" role="tabpanel">
  <h2>Las tres series en el tiempo</h2>
  <p class="lead">Promedios mensuales a nivel de cuenca, exportados desde Google Earth Engine: las superficies se suman sobre las siete zonas de la cuenca y el SAVI se promedia. La franja sombreada es el tramo que se reservó como prueba para comparar modelos.</p>

  <div class="grid-2 row">
    <div class="card">
      <h3><span class="dot" style="--c:var(--nieve)"></span>Superficie cubierta de nieve</h3>
      <p class="meta">Landsat · ene-1986 a mar-2025 · 471 meses · superficie (unidad del export de GEE)*</p>
      <div class="controls" style="margin-bottom:4px"><label class="chk" style="flex-direction:row"><input type="checkbox" id="logNieve" checked> Escala logarítmica</label></div>
      <div class="plot" id="g-nieve"></div>
    </div>
    <div class="card">
      <h3>Perfil estacional · nieve</h3>
      <p class="meta">Mediana por mes y rango intercuartil (39–40 años)</p>
      <div class="plot" id="e-nieve"></div>
    </div>
  </div>
  <div class="grid-2 row">
    <div class="card">
      <h3><span class="dot" style="--c:var(--agua)"></span>Superficie de agua</h3>
      <p class="meta">Sentinel-2 · jul-2016 a mar-2025 · 105 meses · superficie (unidad del export de GEE)*</p>
      <div class="plot" id="g-agua"></div>
    </div>
    <div class="card">
      <h3>Perfil estacional · agua</h3>
      <p class="meta">Mediana por mes y rango intercuartil (8–9 años)</p>
      <div class="plot" id="e-agua"></div>
    </div>
  </div>
  <div class="grid-2 row">
    <div class="card">
      <h3><span class="dot" style="--c:var(--savi)"></span>Vegetación · SAVI</h3>
      <p class="meta">Sentinel-2 · jul-2016 a mar-2025 · 105 meses · índice adimensional (más alto = más vegetación activa)</p>
      <div class="plot" id="g-savi"></div>
    </div>
    <div class="card">
      <h3>Perfil estacional · SAVI</h3>
      <p class="meta">Mediana por mes y rango intercuartil (8–9 años)</p>
      <div class="plot" id="e-savi"></div>
    </div>
  </div>
  <p class="muted">* La documentación del trabajo no fija la unidad de las superficies (una de las guías dice km², pero la magnitud de los valores no es compatible con km²). Se muestran tal como las exporta Google Earth Engine. La nieve es muy asimétrica (asimetría +3,77 según el TP1): por eso se modeló en logaritmo y por eso el gráfico arranca en escala log. La línea vertical marca el quiebre estructural de mayo de 2019 que detectó el test de Zivot-Andrews.</p>
</section>

<!-- 2 ─────────────────────────────── -->
<section class="panel" id="p-test" role="tabpanel">
  <h2>Real vs. predicción en el tramo de prueba</h2>
  <p class="lead">Cada modelo se entrenó sin ver estos meses y después se lo comparó contra lo observado. Test: últimos 24 meses en nieve (abr-2023 a mar-2025) y últimos 12 en agua y SAVI (abr-2024 a mar-2025), el mismo corte que el TP1.</p>
  <div class="card">
    <div class="controls">
      <label>Serie<select id="t-serie"></select></label>
      <label style="flex:1 1 280px">Modelo<select id="t-modelo"></select></label>
      <label class="chk" style="flex-direction:row"><input type="checkbox" id="t-naive" checked> Mostrar naive estacional</label>
      <label class="chk" style="flex-direction:row" id="t-log-wrap"><input type="checkbox" id="t-log"> Escala log (nieve)</label>
    </div>
    <div class="plot tall" id="g-test"></div>
    <div class="tiles" id="t-tiles"></div>
    <p class="muted" id="t-meta"></p>
    <p class="note" id="t-nota"></p>
  </div>
  <p class="muted">Las métricas son las de <code>04_comparacion_final.csv</code>. Los modelos del TP1 (SARIMA, VAR), Neural Prophet y AutoTS no dejaron predicciones de test guardadas, así que aparecen en el selector pero sin curva. La naive estacional se recalculó desde la serie y reproduce exactamente el MAE de la tabla.</p>
</section>

<!-- 3 ─────────────────────────────── -->
<section class="panel" id="p-ranking" role="tabpanel">
  <h2>Ranking de modelos</h2>
  <p class="lead">49 evaluaciones de 24 configuraciones de modelos en cinco familias. El orden oficial del trabajo es por MASE, la única métrica comparable entre series.</p>
  <div class="explica"><b>¿Qué es el MASE?</b> Es el error absoluto medio del modelo dividido por el error que comete, en el entrenamiento, la regla “repetir el mismo mes del año anterior” (naive estacional). MASE &lt; 1 significa que el modelo le gana a esa regla trivial; MASE &gt; 1, que no la supera.</div>
  <div class="card">
    <div class="controls">
      <label>Serie<select id="r-serie"></select></label>
      <div><div class="muted" style="font-weight:600;font-size:12.5px;margin-bottom:4px">Métrica</div>
        <div class="seg" id="r-metrica" role="group" aria-label="Métrica">
          <button aria-pressed="true" data-m="MASE">MASE</button><button aria-pressed="false" data-m="sMAPE">sMAPE</button><button aria-pressed="false" data-m="MAE">MAE</button><button aria-pressed="false" data-m="RMSE">RMSE</button>
        </div></div>
    </div>
    <div class="legend" id="r-legend"></div>
    <div class="plot" id="g-rank"></div>
    <p class="muted" id="r-meta"></p>
  </div>
  <div class="card">
    <h3>Tabla completa</h3>
    <p class="meta">Tocá un encabezado para ordenar. En el celular se ocultan familia, n test y RMSE (el gráfico de arriba muestra RMSE). Fila resaltada: ganador de la serie (04_mejores_por_serie.csv).</p>
    <div class="tablewrap"><table id="r-tabla"><thead></thead><tbody></tbody></table></div>
    <p class="muted" id="r-pie"></p>
  </div>
</section>

<!-- 4 ─────────────────────────────── -->
<section class="panel" id="p-futuro" role="tabpanel">
  <h2>Pronóstico a futuro</h2>
  <p class="lead">Proyección fuera de la muestra desde abril de 2025: 24 meses para la nieve y 12 para agua y SAVI, con el modelo seleccionado para cada serie, junto con los últimos cinco años observados.</p>
  <div class="card">
    <div class="controls">
      <label>Serie<select id="f-serie"></select></label>
    </div>
    <div class="plot tall" id="g-futuro"></div>
    <div id="f-otros" class="controls" style="margin-top:8px"></div>
    <p class="note" id="f-nota"></p>
  </div>
</section>

<!-- 5 ─────────────────────────────── -->
<section class="panel" id="p-como" role="tabpanel">
  <h2>Cómo se hizo</h2>
  <p class="lead">Dos trabajos encadenados sobre las mismas tres series: el TP1 con la metodología clásica y el TP final con machine learning y deep learning, comparados con las mismas reglas.</p>
  <div class="card">
    <h3>El recorrido</h3>
    <div class="pipeline">
      <div class="paso"><b>Datos satelitales</b><span>Nieve (Landsat) y agua y SAVI (Sentinel-2) por zona, exportados de Google Earth Engine.</span></div>
      <div class="paso"><b>Serie mensual de cuenca</b><span>Suma de superficies y promedio del SAVI en las 7 zonas; promedio de las escenas de cada mes.</span></div>
      <div class="paso"><b>TP1 · Box-Jenkins</b><span>Estacionariedad (ADF, KPSS, PP, DF-GLS, Zivot-Andrews), SARIMA por serie y VAR con causalidad de Granger.</span></div>
      <div class="paso"><b>Exógenas</b><span>ONI de NOAA (El Niño / La Niña) y temperatura y precipitación de NASA POWER en el centroide de la cuenca.</span></div>
      <div class="paso"><b>Ensambles</b><span>Random Forest y LightGBM con rezagos, ajustados con Optuna en ventana expansiva.</span></div>
      <div class="paso"><b>Deep learning</b><span>LSTM por serie, N-BEATS global para las tres series y N-BEATSx con exógenas.</span></div>
      <div class="paso"><b>Híbridos y AutoML</b><span>Prophet y Neural Prophet (con el quiebre de 2019) y AutoTS como referencia automática.</span></div>
      <div class="paso"><b>Comparación y pronóstico</b><span>Misma partición y mismo MASE para todos; el mejor de cada serie se proyecta hacia adelante.</span></div>
    </div>
  </div>
  <div class="cols-2 row">
    <div class="card">
      <h3>Decisiones clave</h3>
      <ul class="dec">
        <li><b>Nieve en logaritmo.</b> Es muy asimétrica (+3,77): meses de verano casi sin nieve y picos invernales enormes. Las métricas se calculan siempre en la escala original.</li>
        <li><b>Dos ventanas: 471 y 105 meses.</b> La nieve se usa con toda su historia (1986–2025); agua y SAVI sólo existen desde jul-2016, y esa ventana común de 105 meses es la que usa el VAR.</li>
        <li><b>Mismo corte de prueba que el TP1</b> (24 meses nieve, 12 agua y SAVI), para comparar sin recalcular el TP1.</li>
        <li><b>MASE con el mismo denominador</b> en los cinco notebooks: el naive estacional sobre el entrenamiento de cada serie.</li>
        <li><b>Pronóstico recursivo.</b> Con ~93 meses de entrenamiento no alcanza para un modelo por cada mes del horizonte. En la nieve, donde sí se pudo probar, la estrategia directa empeoró el MASE (0,343 contra 0,181).</li>
        <li><b>N-BEATS global.</b> Un solo modelo aprende de las tres series a la vez (471 + 105 + 105 meses), así las series cortas aprovechan la estructura de la larga.</li>
        <li><b>Exógenas de a una (ablation) y con dos semillas.</b> Una mejora sólo se atribuye a una exógena si supera la diferencia entre dos entrenamientos del mismo modelo.</li>
        <li><b>Prophet como híbrido desarrollado</b>, porque es reproducible; Neural Prophet quedó en la tabla con aclaración.</li>
      </ul>
    </div>
    <div class="card">
      <h3>Qué se encontró</h3>
      <ul class="dec">
        <li><b>La nieve anticipa el agua</b> (Granger, F = 4,51, p = 0,035). Tiene sentido físico: el deshielo alimenta los cuerpos de agua. En el TP1, el VAR bajó el MAE del agua de 64,2 a 34,1.</li>
        <li><b>Quiebre en mayo de 2019</b> en la nieve: un salto de nivel de −50,8 %. Prophet sólo modela cambios de pendiente, por eso no lo encuentra.</li>
        <li><b>El TP final mejora al TP1 en agua y SAVI.</b> Agua: Random Forest 0,550 contra VAR 0,661. SAVI: N-BEATSx con temperatura es el único modelo de los 14 que le gana al naive (0,842).</li>
        <li><b>Las exógenas ayudaron poco.</b> Sólo la temperatura rezagada 3 meses superó el ruido entre semillas, y sólo en agua y SAVI. La nieve como exógena del agua no mejoró el Random Forest (0,571 contra 0,550): la relación de Granger no se tradujo en mejor pronóstico. La precipitación no mostró asociación útil.</li>
        <li><b>AutoTS quedó último o anteúltimo</b> en las tres series: con configuración por defecto, la herramienta automática no alcanzó a los modelos armados con decisiones explícitas.</li>
      </ul>
    </div>
  </div>
  <div class="card">
    <h3>Límites a tener en cuenta</h3>
    <ul class="dec">
      <li>El mejor MASE de la nieve (Neural Prophet, 0,116) viene de una corrida que no se pudo reproducir. El VAR (0,121) se evaluó a 12 meses en vez de 24. Sin contar esos dos casos, el mejor de la nieve es N-BEATS global (0,169), que también le gana al SARIMA del TP1 (0,256) y al naive (0,208).</li>
      <li>El sMAPE de la nieve es alto en todos los modelos: con meses de superficie casi nula, un error chico se vuelve un porcentaje enorme. Por eso se ordena por MASE.</li>
      <li>Son productos satelitales, no mediciones de campo, y la ventana común es de nueve años. Causalidad de Granger no es causalidad física.</li>
    </ul>
  </div>
</section>
</main>

<footer><div class="wrap">
  Fuentes: Landsat y Sentinel-2 vía Google Earth Engine; ONI de NOAA CPC (ERSST v5); NASA POWER (MERRA-2) en lat −24,81 / lon −68,30. Todos los números del tablero salen de los CSV de salida de los notebooks del trabajo (TP1 y TP final, Grupo 8).
</div></footer>

<script id="datos" type="application/json">/*__DATOS__*/</script>
<script>
(function(){
const D = JSON.parse(document.getElementById('datos').textContent);
const css = getComputedStyle(document.documentElement);
const C = n => css.getPropertyValue(n).trim();
const SER = {
  nieve:{nombre:'Nieve', color:C('--nieve'), unidad:'superficie'},
  agua:{nombre:'Agua', color:C('--agua'), unidad:'superficie'},
  savi:{nombre:'SAVI', color:C('--savi'), unidad:'índice'}
};
const ORDEN = ['nieve','agua','savi'];
const GRUPOS = ['TP1 clásicos','Ensamble ML','Deep Learning','Híbrido','AutoML'];
const GC = {'TP1 clásicos':C('--f-tp1'),'Ensamble ML':C('--f-ml'),'Deep Learning':C('--f-dl'),'Híbrido':C('--f-hib'),'AutoML':C('--f-auto')};
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const narrow = () => window.innerWidth < 600;
const nf = (v, d) => v == null ? '—' : v.toLocaleString('es-AR', {minimumFractionDigits:d, maximumFractionDigits:d});
const DEC = {nieve:{MAE:1,RMSE:1}, agua:{MAE:2,RMSE:2}, savi:{MAE:4,RMSE:4}};
const fmt = (s, m, v) => m === 'MASE' ? nf(v,3) : m === 'sMAPE' ? nf(v,2) + ' %' : nf(v, DEC[s][m]);
const hoverFmt = s => s === 'savi' ? '.3f' : ',.0f';

const BASE_LAYOUT = () => ({
  margin:{l:narrow()?46:58, r:12, t:10, b:narrow()?36:40},
  paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
  font:{family:'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif', size:12, color:C('--ink-2')},
  xaxis:{gridcolor:C('--grid'), linecolor:C('--line'), zeroline:false, tickfont:{size:11}},
  yaxis:{gridcolor:C('--grid'), linecolor:C('--line'), zeroline:false, tickfont:{size:11}, separatethousands:true},
  hoverlabel:{bgcolor:'#fff', bordercolor:C('--line'), font:{color:C('--ink'), size:12}},
  hovermode:'x unified', showlegend:false, separators:',.'
});
const CFG = {responsive:true, displayModeBar:false, locale:'es'};
const draw = (id, data, layout) => Plotly.react(id, data, layout, CFG);

/* ---------- KPIs ---------- */
(function(){
  const box = document.getElementById('kpis');
  ORDEN.forEach(s => {
    const w = D.filas.find(f => f.serie === s && f.ganador);
    const el = document.createElement('div');
    el.className = 'kpi'; el.style.setProperty('--c', SER[s].color);
    el.innerHTML = `<div class="lab">${SER[s].nombre} · ganador</div><div class="val">${nf(w.MASE,3)} <small>MASE</small></div><div class="mod">${w.etiqueta}${w.modelo.includes('Neural Prophet') ? ' <span title="corrida no reproducible">⚠</span>' : ''}<br><span class="muted">${w.grupo} · test de ${D.test[s].n} meses</span></div>`;
    box.appendChild(el);
  });
})();

/* ---------- 1 · series ---------- */
function testShape(s){
  const t = D.test[s];
  return {type:'rect', xref:'x', yref:'paper', x0:t.desde+'-01', x1:t.hasta+'-28', y0:0, y1:1, fillcolor:'#36505c', opacity:.07, line:{width:0}, layer:'below'};
}
function drawSerie(s){
  const S = D.series[s], L = BASE_LAYOUT();
  const shapes = [testShape(s)], ann = [{x:D.test[s].desde+'-01', y:1, xref:'x', yref:'paper', text:'test', showarrow:false, xanchor:'left', yanchor:'top', font:{size:11, color:C('--ink-3')}}];
  if (s === 'nieve'){
    shapes.push({type:'line', xref:'x', yref:'paper', x0:'2019-05-01', x1:'2019-05-01', y0:0, y1:1, line:{color:C('--ink-3'), width:1, dash:'dot'}});
    ann.push({x:'2019-05-01', y:1, xref:'x', yref:'paper', text:'quiebre may-2019', showarrow:false, xanchor:'right', yanchor:'top', font:{size:11, color:C('--ink-3')}});
    L.yaxis.type = document.getElementById('logNieve').checked ? 'log' : 'linear';
    if (L.yaxis.type === 'log') L.yaxis.dtick = 1;
  }
  L.shapes = shapes; L.annotations = ann;
  L.yaxis.title = {text: s==='savi' ? 'SAVI' : 'superficie', font:{size:11}};
  L.xaxis.hoverformat = '%b %Y';
  draw('g-'+s, [{x:S.x, y:S.y, type:'scatter', mode:'lines', line:{color:SER[s].color, width:s==='nieve'?1.4:2}, name:SER[s].nombre, hovertemplate:'%{y:'+hoverFmt(s)+'}<extra></extra>'}], L);
}
function drawPerfil(s){
  const P = D.perfil[s], L = BASE_LAYOUT();
  const col = SER[s].color;
  L.hovermode = 'x unified';
  L.xaxis.tickvals = MESES; L.xaxis.ticktext = narrow() ? MESES.map(m=>m[0]) : MESES;
  if (s === 'nieve' && document.getElementById('logNieve').checked){ L.yaxis.type = 'log'; L.yaxis.dtick = 1; }
  draw('e-'+s, [
    {x:MESES, y:P.q75, type:'scatter', mode:'lines', line:{width:0}, hoverinfo:'skip'},
    {x:MESES, y:P.q25, type:'scatter', mode:'lines', line:{width:0}, fill:'tonexty', fillcolor:col+'2e', name:'Q1–Q3', hovertemplate:'Q1 %{y:'+hoverFmt(s)+'}<extra></extra>'},
    {x:MESES, y:P.mediana, type:'scatter', mode:'lines+markers', line:{color:col, width:2}, marker:{size:8, color:col, line:{color:'#fff', width:2}}, name:'mediana', hovertemplate:'mediana %{y:'+hoverFmt(s)+'}<extra></extra>'}
  ], L);
}
function renderSeries(){ ORDEN.forEach(s => {drawSerie(s); drawPerfil(s);}); }
document.getElementById('logNieve').addEventListener('change', () => {drawSerie('nieve'); drawPerfil('nieve');});

/* ---------- selects comunes ---------- */
function fillSerie(id){
  const el = document.getElementById(id);
  el.innerHTML = ORDEN.map(s => `<option value="${s}">${SER[s].nombre}</option>`).join('');
  return el;
}

/* ---------- 2 · real vs predicción ---------- */
const tSerie = fillSerie('t-serie'), tModelo = document.getElementById('t-modelo');
function filasDe(s){ return D.filas.filter(f => f.serie === s); }
function fillModelos(){
  const s = tSerie.value, fs = filasDe(s);
  tModelo.innerHTML = GRUPOS.map(g => {
    const op = fs.filter(f => f.grupo === g);
    if (!op.length) return '';
    return `<optgroup label="${g}">` + op.map(f => `<option value="${f.puesto}">${f.ganador?'★ ':''}${f.etiqueta} · MASE ${nf(f.MASE,3)}${f.clave?'':' (sin curva)'}</option>`).join('') + '</optgroup>';
  }).join('');
  const conCurva = fs.filter(f => f.clave);
  const w = fs.find(f => f.ganador);
  tModelo.value = String((w.clave ? w : conCurva[0]).puesto);
}
function renderTest(){
  const s = tSerie.value, f = filasDe(s).find(x => String(x.puesto) === tModelo.value), T = D.test[s];
  const L = BASE_LAYOUT(); L.showlegend = true;
  L.legend = {orientation:'h', x:0, y:-0.14, font:{size:11.5}};
  L.margin.b = narrow() ? 92 : 70;
  L.xaxis.hoverformat = '%b %Y';
  L.yaxis.title = {text: s==='savi' ? 'SAVI' : 'superficie', font:{size:11}};
  L.shapes = [{type:'line', xref:'x', yref:'paper', x0:T.x[0]+'-01', x1:T.x[0]+'-01', y0:0, y1:1, line:{color:C('--ink-3'), width:1, dash:'dot'}}];
  const hf = '%{y:'+hoverFmt(s)+'}';
  const tr = [
    {x:T.train_x, y:T.train_y, type:'scatter', mode:'lines', name:'entrenamiento (últimos 36 meses)', line:{color:'#9aa3a6', width:1.6}, hovertemplate:hf+'<extra>entrenamiento</extra>'},
    {x:T.x, y:T.y, type:'scatter', mode:'lines+markers', name:'real (test)', line:{color:C('--real'), width:2}, marker:{size:8, color:C('--real'), line:{color:'#fff', width:2}}, hovertemplate:hf+'<extra>real</extra>'}
  ];
  if (document.getElementById('t-naive').checked && f.modelo !== 'Naive estacional')
    tr.push({x:T.x, y:D.pred[s]['Naive estacional'], type:'scatter', mode:'lines', name:'naive estacional', line:{color:C('--f-tp1'), width:1.6, dash:'dot'}, hovertemplate:hf+'<extra>naive</extra>'});
  if (f.clave)
    tr.push({x:T.x, y:D.pred[s][f.clave], type:'scatter', mode:'lines+markers', name:f.etiqueta, line:{color:GC[f.grupo], width:2.2, dash:'dash'}, marker:{size:8, color:GC[f.grupo], line:{color:'#fff', width:2}}, hovertemplate:hf+'<extra>predicción</extra>'});
  else L.annotations = [{xref:'paper', yref:'paper', x:.98, y:.97, xanchor:'right', showarrow:false, text:'Sin predicción guardada para este modelo', font:{size:12, color:C('--ink-2')}, bgcolor:'#fff', bordercolor:C('--line'), borderpad:5}];
  document.getElementById('t-log-wrap').style.display = s === 'nieve' ? '' : 'none';
  if (s === 'nieve' && document.getElementById('t-log').checked){ L.yaxis.type = 'log'; L.yaxis.dtick = 1; }
  draw('g-test', tr, L);
  document.getElementById('t-tiles').innerHTML = ['MAE','RMSE','sMAPE','MASE'].map(m => `<div class="tile" data-m="${m}"><div class="lab">${m}</div><div class="val">${fmt(s,m,f[m])}</div></div>`).join('');
  document.getElementById('t-meta').innerHTML = `<b>${f.etiqueta}</b> · ${f.familia} · puesto ${f.puesto} de ${f.n_modelos} por MASE · evaluado sobre ${f.n_test} meses. MAE y RMSE en unidades de la serie.`;
  const notas = f.nota.slice();
  if (f.recalc && f.nota.some(n => n.includes('semilla'))) notas.push(`Con la curva dibujada (semilla 123) el MASE da ${nf(f.recalc.MASE,3)}.`);
  document.getElementById('t-nota').textContent = notas.join(' ');
}
tSerie.addEventListener('change', () => {fillModelos(); renderTest();});
tModelo.addEventListener('change', renderTest);
document.getElementById('t-naive').addEventListener('change', renderTest);
document.getElementById('t-log').addEventListener('change', renderTest);
fillModelos();

/* ---------- 3 · ranking ---------- */
const rSerie = fillSerie('r-serie');
let rMet = 'MASE', rSort = {k:'MASE', dir:1};
document.getElementById('r-legend').innerHTML = GRUPOS.map(g => `<span><i style="--c:${GC[g]}"></i>${g}</span>`).join('') + '<span>★ ganador</span>';
function corto(t){ const n = narrow() ? 22 : 44; return t.length > n ? t.slice(0, n-1) + '…' : t; }
function renderRank(){
  const s = rSerie.value, m = rMet;
  const fs = filasDe(s).slice().sort((a,b) => a[m]-b[m]);
  const L = BASE_LAYOUT(); L.hovermode = 'closest';
  const h = Math.max(300, fs.length * (narrow()?22:24) + 60);
  document.getElementById('g-rank').style.height = h + 'px';
  L.margin = {l:10, r:narrow()?44:60, t:26, b:34};
  L.yaxis = {automargin:true, autorange:'reversed', tickfont:{size:narrow()?11:12, color:C('--ink')}, gridcolor:'rgba(0,0,0,0)'};
  L.xaxis = {gridcolor:C('--grid'), zeroline:false, title:{text:m + (m==='sMAPE'?' (%)':'') + ' · menor es mejor', font:{size:11}}, rangemode:'tozero', separatethousands:true};
  const ys = fs.map(f => (f.ganador ? '★ ' : '') + corto(f.etiqueta) + (f.modelo==='VAR(1)' && f.n_test !== D.test[s].n ? ' †' : '') + '​'.repeat(f.puesto));
  L.shapes = []; L.annotations = [];
  if (m === 'MASE'){
    L.shapes.push({type:'line', xref:'x', yref:'paper', x0:1, x1:1, y0:0, y1:1, line:{color:C('--ink'), width:1.2, dash:'dash'}});
    L.annotations.push({x:1, y:1, xref:'x', yref:'paper', text:'naive = 1', showarrow:false, xanchor:'left', yanchor:'bottom', font:{size:11, color:C('--ink-2')}});
  }
  draw('g-rank', [{
    type:'bar', orientation:'h', x:fs.map(f=>f[m]), y:ys,
    marker:{color:fs.map(f=>GC[f.grupo]), line:{color:fs.map(f=>f.ganador?C('--ink'):'#fff'), width:fs.map(f=>f.ganador?2:1)}},
    text:fs.map(f=>fmt(s,m,f[m])), textposition:'outside', cliponaxis:false, textfont:{size:11, color:C('--ink-2')},
    customdata:fs.map(f=>[f.etiqueta, f.familia, f.n_test]),
    hovertemplate:'<b>%{customdata[0]}</b><br>%{customdata[1]} · test %{customdata[2]} meses<br>'+m+': %{text}<extra></extra>'
  }], L);
  const w = fs.find(f=>f.ganador);
  const naive = fs.find(f=>f.modelo==='Naive estacional');
  const sup = filasDe(s).filter(f=>f.MASE<1).length;
  document.getElementById('r-meta').textContent = `Ganador por MASE: ${w.etiqueta} (${w.grupo}), MASE ${nf(w.MASE,3)} · sMAPE ${nf(w.sMAPE,2)} %. ${sup} de ${fs.length} modelos le ganan al naive estacional (MASE ${nf(naive.MASE,3)} en el test).` + (s==='nieve' ? ' † VAR(1) evaluado sobre 12 meses en lugar de 24.' : '');
  renderTabla();
}
function renderTabla(){
  const s = rSerie.value, cols = [['puesto','#'],['etiqueta','Modelo'],['grupo','Familia'],['n_test','n test'],['MAE','MAE'],['RMSE','RMSE'],['sMAPE','sMAPE'],['MASE','MASE']];
  const thead = document.querySelector('#r-tabla thead'), tbody = document.querySelector('#r-tabla tbody');
  thead.innerHTML = '<tr>' + cols.map(([k,t]) => `<th data-k="${k}" ${rSort.k===k?`aria-sort="${rSort.dir>0?'ascending':'descending'}"`:''}>${t}</th>`).join('') + '</tr>';
  const fs = filasDe(s).slice().sort((a,b) => { const x=a[rSort.k], y=b[rSort.k]; return (typeof x==='string' ? x.localeCompare(y,'es') : x-y) * rSort.dir; });
  tbody.innerHTML = fs.map(f => `<tr class="${f.ganador?'win':''}" data-modelo="${f.etiqueta}"><td>${f.puesto}</td><td>${f.ganador?'★ ':''}${f.etiqueta}</td><td><span class="fam"><i style="--c:${GC[f.grupo]}"></i>${f.familia}</span></td><td>${f.n_test}</td>` + ['MAE','RMSE','sMAPE','MASE'].map(m=>`<td data-m="${m}">${fmt(s,m,f[m])}</td>`).join('') + '</tr>').join('');
  thead.querySelectorAll('th').forEach(th => th.addEventListener('click', () => {
    const k = th.dataset.k; rSort = {k, dir: rSort.k===k ? -rSort.dir : 1}; renderTabla();
  }));
  document.getElementById('r-pie').textContent = s==='nieve' ? 'El MASE 0,116 de Neural Prophet viene de una corrida no reproducible; el VAR(1) se evaluó a 12 meses. El sMAPE de la nieve es alto en todos los modelos porque hay meses con superficie casi nula.' : '';
}
rSerie.addEventListener('change', renderRank);
document.querySelectorAll('#r-metrica button').forEach(b => b.addEventListener('click', () => {
  rMet = b.dataset.m; document.querySelectorAll('#r-metrica button').forEach(x => x.setAttribute('aria-pressed', x===b)); renderRank();
}));

/* ---------- 4 · pronóstico ---------- */
const fSerie = fillSerie('f-serie');
const DASH = ['dot','dashdot','longdash','longdashdot','dash'];
function renderFuturo(){
  const s = fSerie.value, H = D.hist[s], P = D.pron[s], E = D.pron_elegido[s];
  const fila = m => filasDe(s).find(f => f.modelo === m && f.etiqueta === m);
  const otros = Object.keys(P).filter(m => m !== E.modelo);
  const box = document.getElementById('f-otros');
  const previos = new Set([...box.querySelectorAll('input:checked')].map(i => i.value));
  if (box.dataset.serie !== s){
    box.dataset.serie = s;
    box.innerHTML = '<span class="muted" style="width:100%">Comparar con otros pronósticos guardados:</span>' + otros.map(m => `<label class="chk" style="flex-direction:row"><input type="checkbox" value="${m}"><span>${m} <span class="muted">(MASE ${nf(fila(m).MASE,3)})</span></span></label>`).join('');
    box.querySelectorAll('input').forEach(i => i.addEventListener('change', renderFuturo));
  }
  const sel = [...box.querySelectorAll('input:checked')].map(i => i.value);
  const L = BASE_LAYOUT(); L.showlegend = true;
  L.legend = {orientation:'h', x:0, y:-0.14, font:{size:11.5}}; L.margin.b = narrow() ? 96 : 70;
  L.xaxis.hoverformat = '%b %Y';
  L.yaxis.title = {text: s==='savi' ? 'SAVI' : 'superficie', font:{size:11}};
  const p0 = P[E.modelo].x[0], p1 = P[E.modelo].x[P[E.modelo].x.length-1];
  L.shapes = [{type:'rect', xref:'x', yref:'paper', x0:p0+'-01', x1:p1+'-28', y0:0, y1:1, fillcolor:'#36505c', opacity:.06, line:{width:0}, layer:'below'}];
  L.annotations = [{x:p0+'-01', y:1, xref:'x', yref:'paper', text:'pronóstico', showarrow:false, xanchor:'left', yanchor:'top', font:{size:11, color:C('--ink-3')}}];
  const hf = '%{y:'+hoverFmt(s)+'}';
  const lastX = H.x[H.x.length-1], lastY = H.y[H.y.length-1];
  const fe = fila(E.modelo);
  const tr = [{x:H.x, y:H.y, type:'scatter', mode:'lines', name:'observado', line:{color:SER[s].color, width:2}, hovertemplate:hf+'<extra>observado</extra>'}];
  sel.forEach((m,i) => { const f = fila(m); tr.push({x:[lastX, ...P[m].x], y:[lastY, ...P[m].y], type:'scatter', mode:'lines', name:m, line:{color:GC[f.grupo], width:1.6, dash:DASH[i%DASH.length]}, opacity:.85, hovertemplate:hf+'<extra>'+m+'</extra>'}); });
  tr.push({x:[lastX, ...P[E.modelo].x], y:[lastY, ...P[E.modelo].y], type:'scatter', mode:'lines+markers', name:E.modelo + (E.motivo==='ganador' ? ' (ganador)' : ' (seleccionado)'), line:{color:GC[fe.grupo], width:2.4, dash:'dash'}, marker:{size:7, color:GC[fe.grupo], line:{color:'#fff', width:1.5}}, hovertemplate:hf+'<extra>'+E.modelo+'</extra>'});
  if (s === 'nieve') L.yaxis.type = 'linear';
  draw('g-futuro', tr, L);
  let nota = `Modelo: ${E.modelo} (${fe.familia}), MASE ${nf(fe.MASE,3)} en el test. Horizonte: ${P[E.modelo].x.length} meses (${p0} a ${p1}).`;
  if (E.motivo !== 'ganador') nota += ` El ganador por MASE de esta serie (${E.ganador}) no dejó guardado su pronóstico a futuro y además su resultado no fue reproducible; se muestra el mejor modelo que sí lo guardó.`;
  if (E.modelo.includes('temperatura')) nota += ' Usa la temperatura como exógena: los meses futuros sin dato observado se completan con el mismo mes del año anterior.';
  if (fe.grupo === 'Ensamble ML') nota += ' Los modelos de árboles no extrapolan y el pronóstico recursivo acumula error: los primeros meses son más confiables que los últimos.';
  document.getElementById('f-nota').textContent = nota;
}
fSerie.addEventListener('change', renderFuturo);

/* ---------- pestañas ---------- */
const RENDER = {series:renderSeries, test:renderTest, ranking:renderRank, futuro:renderFuturo, como:()=>{}};
const hecho = {};
function show(tab){
  document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab===tab));
  document.querySelectorAll('section.panel').forEach(p => p.classList.toggle('on', p.id==='p-'+tab));
  RENDER[tab](); hecho[tab] = true;
  const act = document.querySelector(`nav.tabs button[data-tab="${tab}"]`); if (act && act.scrollIntoView) act.scrollIntoView({block:'nearest', inline:'nearest'});
  if (history.replaceState) history.replaceState(null, '', '#'+tab);
}
document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
let ancho = window.innerWidth;
window.addEventListener('resize', () => {
  if ((ancho < 600) !== (window.innerWidth < 600)){ const t = document.querySelector('nav.tabs [aria-selected=true]').dataset.tab; RENDER[t](); }
  ancho = window.innerWidth;
});
const inicial = (location.hash || '').slice(1);
show(RENDER[inicial] ? inicial : 'series');
window.__tablero = {show, D};
})();
</script>
</body>
</html>
'''

assert "NaN" not in json.dumps(datos)
html = PLANTILLA.replace("/*__DATOS__*/", json.dumps(datos, ensure_ascii=False, separators=(",", ":")))
SALIDA.write_text(html, encoding="utf-8")
print(f"OK -> {SALIDA}  ({SALIDA.stat().st_size / 1024:.1f} KB, {len(filas)} filas de métricas)")
for s in SERIES:
    print(f"  {s}: test {test_info[s]['desde']}..{test_info[s]['hasta']} · pronóstico: {pron_elegido[s]}")


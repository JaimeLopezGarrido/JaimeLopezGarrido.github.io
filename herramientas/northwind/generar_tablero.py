#!/usr/bin/env python3
"""
generar_tablero.py - Version web ESTATICA del tablero Northwind DWA.

Lee la base SQLite del proyecto (solo lectura) y arma un unico index.html
con los datos embebidos como JSON y Plotly.js desde CDN. Replica el tablero
Streamlit original (scripts/04_publicacion/S44_streamlit_app.py):

  * Consume los mismos productos de datos: DP01_VENTAS, DP02_CLIENTES,
    DP03_PRODUCTOS, y las tablas del DQM / memoria (DQM_*, DWM_*_HIST).
  * Las paginas Resumen, Ventas, Clientes y Productos se calculan en el
    navegador (JS) a partir de las filas de los DP, para que los filtros
    globales (anios, segmentos, categorias, paises) y el cross-filtering
    por clic funcionen igual que en Streamlit.
  * La pagina Calidad del dato no se filtra (igual que el original), asi
    que se precalcula aca con la MISMA logica pandas del original.

Uso:
    ~/anaconda3/bin/python generar_tablero.py \
        --db "<ruta>/northwind-dwa/db/northwind_dwa.db" --out index.html
"""
from __future__ import annotations

import argparse
import json
import math
import sqlite3
from datetime import datetime
from pathlib import Path

import pandas as pd

DEFAULT_DB = Path.home() / "Desktop/Documentos/Posgrado Austral/2A/DW/northwind-dwa/db/northwind_dwa.db"
HERE = Path(__file__).resolve().parent


# ---------------------------------------------------------------------
# Lectura (solo lectura: mode=ro)
# ---------------------------------------------------------------------
def load(db: Path) -> dict[str, pd.DataFrame]:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    names = {
        "ventas": "DP01_VENTAS", "clientes": "DP02_CLIENTES", "productos": "DP03_PRODUCTOS",
        "cargas": "DQM_DWA_CARGA", "controles": "DQM_CONTROL_CAMPO", "alertas": "DQM_ALERTA",
        "logs": "DQM_LOG_EJECUCION", "inventario": "DQM_INVENTARIO_SCRIPTS",
        "hist_cliente": "DWM_CLIENTE_HIST", "hist_producto": "DWM_PRODUCTO_HIST",
    }
    out = {k: pd.read_sql_query(f"SELECT * FROM {t}", con) for k, t in names.items()}
    con.close()
    # Misma normalizacion que normalize_frames() del original
    for f, cols in {"ventas": ["order_date"], "clientes": ["primera_compra", "ultima_compra"],
                    "cargas": ["fecha"], "controles": ["fecha_control"],
                    "logs": ["fecha_inicio", "fecha_fin"]}.items():
        for c in cols:
            # DIFERENCIA DELIBERADA con el original: las 14 lineas de Ingesta 2
            # (ordenes 11078-11083) traen order_date sin hora ("1998-01-01") y
            # pd.to_datetime sin format las deja en NaT, por lo que el original
            # las omite de los graficos mensuales. Aca se parsean con format="mixed".
            fmt = {"format": "mixed"} if (f, c) == ("ventas", "order_date") else {}
            out[f][c] = pd.to_datetime(out[f][c], errors="coerce", **fmt)
    for f, cols in {"cargas": ["ingesta", "filas_origen", "filas_cargadas", "pct_carga"],
                    "controles": ["ingesta", "valores_evaluados", "valores_validos", "pct_calidad", "umbral_aceptacion"],
                    "alertas": ["resuelta"], "logs": ["filas_afectadas"]}.items():
        for c in cols:
            out[f][c] = pd.to_numeric(out[f][c], errors="coerce")
    return out


def clean(v):
    """Convierte NaN/NaT/numpy a tipos JSON."""
    if v is None or v is pd.NA or v is pd.NaT:
        return None
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, float) and v.is_integer() and abs(v) < 1e15:
        return int(v)
    return v


def records(df: pd.DataFrame, cols: list[str]) -> list[list]:
    return [[clean(v) for v in row] for row in df[cols].itertuples(index=False, name=None)]


# ---------------------------------------------------------------------
# Datos para las paginas filtrables (columnar + diccionarios)
# ---------------------------------------------------------------------
def build_sales(fr) -> dict:
    v = fr["ventas"].copy()
    dicts = {}

    def enc(col):
        vals = sorted(v[col].dropna().astype(str).unique().tolist())
        idx = {s: i for i, s in enumerate(vals)}
        dicts[col] = vals
        return [idx[s] if isinstance(s, str) else None for s in v[col]]

    cols = {
        "order_id": v["order_id"].astype(int).tolist(),
        "fecha": v["order_date"].dt.strftime("%Y-%m-%d").tolist(),
        "anio": v["anio"].astype(int).tolist(),
        "mes": v["mes"].astype(int).tolist(),
        "product_id": v["product_id"].astype(int).tolist(),
        "product_name": enc("product_name"),
        "category_name": enc("category_name"),
        "customer_id": enc("customer_id"),
        "cliente": enc("cliente"),
        "cliente_pais": enc("cliente_pais"),
        "cliente_segmento": enc("cliente_segmento"),
        "empleado_nombre": enc("empleado_nombre"),
        "dias_entrega": [clean(x) for x in v["dias_entrega"]],
        "unidades": [clean(x) for x in v["unidades"]],
        "precio_unitario": [clean(x) for x in v["precio_unitario"]],
        "descuento": [clean(x) for x in v["descuento"]],
        "monto_bruto": [clean(x) for x in v["monto_bruto"]],
        "monto_neto": [clean(x) for x in v["monto_neto"]],
    }
    return {"cols": cols, "dicts": dicts, "n": len(v)}


def build_quality(fr, db: Path) -> dict:
    """Pagina Calidad del dato: misma logica que show_quality() del original."""
    cargas, controles, alertas, logs = fr["cargas"], fr["controles"], fr["alertas"], fr["logs"]

    # calcular_estado_base (opcion B)
    pendientes = int((alertas["resuelta"].fillna(0) == 0).sum())
    dec = controles["decision"].fillna("").str.upper()
    ok_directo = dec.isin(["ACEPTAR", "CORRECCION", "CORRECCIÓN"])
    rechazos_resueltos = dec.eq("RECHAZAR") & (pendientes == 0)
    calidad_ok = round(100.0 * int((ok_directo | rechazos_resueltos).sum()) / len(controles), 1)
    fecha_base = pd.Timestamp.fromtimestamp(db.stat().st_mtime).strftime("%Y-%m-%d %H:%M")

    cs = controles.groupby(["tipo_control", "decision"], as_index=False).agg(total=("control_id", "count"))

    al = alertas.copy()
    al["estado"] = al["resuelta"].fillna(0).map({1: "Resuelta", 0: "Abierta"})
    al_cols = ["nivel", "estado", "tabla", "script_id", "mensaje", "resuelta_por", "resolucion"]

    tc = controles["tipo_control"].fillna("").str.upper()
    sel = controles[(tc == "CORRECCION") | ((tc == "FALTANTE") & (controles["pct_calidad"].fillna(100) < 100))].copy()
    sel["tipo"] = sel["tipo_control"].fillna("").str.upper().map(
        lambda t: "Corrección" if t == "CORRECCION" else "Decisión (faltante)")
    sel["_orden"] = sel["tipo"].map({"Corrección": 0, "Decisión (faltante)": 1})
    sel = sel.sort_values(["_orden", "tabla"])

    hc = fr["hist_cliente"].copy(); hc["entidad"] = "Cliente"; hc = hc.rename(columns={"customer_id": "id"})
    hp = fr["hist_producto"].copy(); hp["entidad"] = "Producto"; hp = hp.rename(columns={"product_id": "id"})
    mem = pd.concat([hc, hp], ignore_index=True)
    mem_cols = ["entidad", "id", "campo_modificado", "valor_anterior", "valor_nuevo", "ingesta"]
    mem = mem[mem_cols].sort_values(["entidad", "id"])

    def s(tabla, ing=None):
        q = cargas[cargas["tabla_dwa"] == tabla]
        if ing is not None:
            q = q[q["ingesta"] == ing]
        return int(q["filas_cargadas"].sum())

    pies = {
        "fact": [s("DWA_FACT_VENTAS", 1), s("DWA_FACT_VENTAS", 2)],
        "ord": [s("DWA_DIM_ORDEN", 1), s("DWA_DIM_ORDEN", 2)],
        "cli": [s("DWA_DIM_CLIENTE"), s("DWA_DIM_CLIENTE (SCD2)")],
        "prod": [s("DWA_DIM_PRODUCTO"), s("DWA_DIM_PRODUCTO (SCD2)")],
    }

    cg = (cargas.groupby("tabla_dwa", as_index=False)
          .agg(filas_origen=("filas_origen", "sum"), filas_cargadas=("filas_cargadas", "sum"),
               orden=("carga_id", "min"),
               resultado=("resultado", lambda x: "ERROR" if (x == "ERROR").any() else "EXITO")))
    cg["pct_real"] = (100.0 * cg["filas_cargadas"] / cg["filas_origen"].replace(0, pd.NA)).astype(float).round(1)
    cg["pct_grafico"] = cg["pct_real"].clip(upper=100)
    cg = cg.sort_values("orden")

    lg = logs.sort_values("log_id")[["script_id", "fecha_inicio", "resultado", "filas_afectadas", "mensaje"]].copy()
    lg["fecha_inicio"] = lg["fecha_inicio"].dt.strftime("%Y-%m-%d %H:%M").fillna("—")

    inv = fr["inventario"].sort_values("orden")[["orden", "etapa", "script_id", "nombre_archivo", "descripcion"]]

    return {
        "estado": "Disponible", "fecha_base": fecha_base, "pendientes": pendientes, "calidad_ok": calidad_ok,
        "n_controles": int(len(controles)),
        "controles_tipo": records(cs, ["tipo_control", "decision", "total"]),
        "alertas": records(al, al_cols),
        "correcciones": records(sel, ["tipo", "tabla", "campo", "decision", "detalle"]),
        "memoria": records(mem, mem_cols),
        "pies": pies,
        "carga": records(cg, ["tabla_dwa", "pct_grafico", "pct_real", "filas_cargadas", "filas_origen", "resultado"]),
        "logs": records(lg, ["script_id", "fecha_inicio", "resultado", "filas_afectadas", "mensaje"]),
        "inventario": records(inv, ["orden", "etapa", "script_id", "nombre_archivo", "descripcion"]),
    }


def build_data(db: Path) -> dict:
    fr = load(db)
    cli = fr["clientes"]
    prod = fr["productos"]
    return {
        "generado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "ventas": build_sales(fr),
        "clientes": {
            "cols": ["customer_id", "cliente", "segmento", "score", "cliente_pais", "cant_ordenes",
                     "total_unidades", "total_comprado", "dias_entrega_promedio"],
            "rows": records(cli, ["customer_id", "cliente", "segmento", "score", "cliente_pais", "cant_ordenes",
                                  "total_unidades", "total_comprado", "dias_entrega_promedio"]),
        },
        "productos": {
            "cols": ["product_id", "category_name", "discontinued", "precio_actual", "precio_anterior",
                     "pct_cambio_precio", "ventas_a_precio_nuevo"],
            "rows": records(prod, ["product_id", "category_name", "discontinued", "precio_actual",
                                   "precio_anterior", "pct_cambio_precio", "ventas_a_precio_nuevo"]),
        },
        "calidad": build_quality(fr, db),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--out", type=Path, default=HERE / "index.html")
    ap.add_argument("--plantilla", type=Path, default=HERE / "plantilla.html")
    a = ap.parse_args()
    data = build_data(a.db)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = a.plantilla.read_text(encoding="utf-8").replace("/*__DATA__*/null", payload)
    a.out.write_text(html, encoding="utf-8")
    print(f"OK -> {a.out} ({a.out.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()

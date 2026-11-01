"""Hourly PM2.5 forecast service for the gateway Pi (Phase 3).

One run (normally from a systemd timer): fetch the latest CPCB hours for each station and the current weather, build the same
features as in training, ask the verified model for q10/q50/q90 at +1/3/6/12/24 h with TreeSHAP drivers, store everything in a
local SQLite file, check earlier forecasts against what actually happened, and upload new rows to the cloud.

Every row says what it is: the model version, the input source ("CPCB <station>", never an AEIOS node), the weather source, how
stale the newest reading was, and whether it came from the model or from the labelled persistence fallback. If a station has no
fresh reading, a `no_input` row is stored instead of a forecast; the service never fills in or invents data.

    python -m ai.service.forecast_service --stations stations.json --db forecasts.db            # one run
    python -m ai.service.forecast_service --stations stations.json --db forecasts.db --dry-run   # compute and print, store nothing
    python -m ai.service.forecast_service --db forecasts.db --report                              # live skill so far

Environment (from private files under ~/.config/aeios/, never committed): OPENAQ_API_KEY; AEIOS_INGEST_URL, AEIOS_DEVICE_TOKEN,
AEIOS_DEVICE_ID for uploads (the same variables the gateway uploader uses).
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from ai.feature_engineering.features import HOUR, Series, build_rows
from ai.inference.engine import ForecastEngine
from ai.preprocessing.common import JsonClient, RateLimiter
from ai.preprocessing.openaq_fetch import BASE_URL as OPENAQ_URL
from ai.service import live_inputs as LI
from ai.service import node_inputs as NI
from ai.service.stations import load as load_stations

HORIZONS = (1, 3, 6, 12, 24)
MAX_STALE_H = 4          # a station whose newest clean hour is older than this gets a no_input row, not a forecast
WEATHER_URL = "https://api.open-meteo.com/v1"
UPLOAD_BATCH = 200

SCHEMA = """
CREATE TABLE IF NOT EXISTS forecasts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  made_utc TEXT NOT NULL, origin_utc TEXT, due_utc TEXT,
  station TEXT NOT NULL, location_id INTEGER NOT NULL, station_code INTEGER NOT NULL, horizon_h INTEGER NOT NULL,
  source TEXT NOT NULL, model_version TEXT, input_source TEXT NOT NULL, weather_source TEXT, stale_h REAL,
  pm_now REAL, q10 REAL, q50 REAL, q90 REAL, interval TEXT, drivers TEXT, reason TEXT,
  UNIQUE(location_id, horizon_h, origin_utc));
CREATE TABLE IF NOT EXISTS outcomes(
  forecast_id INTEGER PRIMARY KEY REFERENCES forecasts(id), actual_pm REAL NOT NULL, persistence_pm REAL,
  in_interval INTEGER, abs_err REAL, persistence_abs_err REAL, checked_utc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS state(k TEXT PRIMARY KEY, v TEXT NOT NULL);
"""

UPLOAD_COLS = ["station", "location_id", "horizon_h", "made_utc", "origin_utc", "due_utc", "source", "model_version", "input_source",
               "weather_source", "stale_h", "pm_now", "q10", "q50", "q90", "interval", "reason"]


def log(msg: str) -> None:
    print(f"{time.strftime('%H:%M:%S')}  {msg}", flush=True)


def iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def open_store(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=30)
    conn.executescript(SCHEMA)
    return conn


# ---- one run ---------------------------------------------------------------------------------------------------------------

def forecast_station(st: dict, pm: Series, wx: dict[str, Series], weather_note: str, engine: ForecastEngine, now: datetime,
                     problems: list[str]) -> list[dict]:
    """Rows (one per horizon) for one station or node. Pure function of its inputs, so it is easy to test."""
    is_node = bool(st.get("node"))
    label = st.get("input_label") or f"CPCB {st['name']} (OpenAQ hourly mean, not an AEIOS node)"
    base = {"station": st["name"], "location_id": st["location_id"], "station_code": st["station_code"],
            "made_utc": iso(int(now.timestamp())), "input_source": label, "weather_source": weather_note}
    origin = LI.latest_origin(pm, now)
    stale_h = None if origin is None else (int(LI.floor_hour(now).timestamp()) - origin) / HOUR
    if origin is None or stale_h > MAX_STALE_H:
        why = ("no clean PM2.5 reading in the last 36 h" if origin is None
               else f"newest clean reading is {stale_h:.0f} h old (limit {MAX_STALE_H} h)")
        if is_node:
            why = "node not reporting: " + why
        if problems:
            why += "; " + "; ".join(problems)
        return [dict(base, horizon_h=h, source="no_input", model_version=None, origin_utc=None if origin is None else iso(origin),
                     due_utc=None, stale_h=stale_h, pm_now=None, q10=None, q50=None, q90=None, interval=None, drivers=None, reason=why)
                for h in HORIZONS]
    feats = build_rows(pm, wx, horizon=1, start_ts=origin, end_ts=origin, require_target=False)[0]["features"]
    feats["station_code"] = st["station_code"]
    rows = []
    for h in HORIZONS:
        f = engine.predict(feats, h, input_source=base["input_source"])
        reason = f.get("reason", "")
        if weather_note.startswith("unavailable"):
            reason = (reason + "; " if reason else "") + "weather unavailable: forecast is degraded"
        if is_node:
            reason = (reason + "; " if reason else "") + NI.NODE_CAVEAT
        rows.append(dict(base, horizon_h=h, source=f["source"], model_version=f.get("model_version"), origin_utc=iso(origin),
                         due_utc=iso(origin + h * HOUR), stale_h=stale_h, pm_now=feats["pm_now"], q10=f.get("q10"), q50=f.get("q50"),
                         q90=f.get("q90"), interval=f.get("interval"), drivers=json.dumps(f["drivers"]) if f.get("drivers") else None,
                         reason=reason or None))
    return rows


def store_rows(conn: sqlite3.Connection, rows: list[dict]) -> int:
    cols = ["made_utc", "origin_utc", "due_utc", "station", "location_id", "station_code", "horizon_h", "source", "model_version",
            "input_source", "weather_source", "stale_h", "pm_now", "q10", "q50", "q90", "interval", "drivers", "reason"]
    n = 0
    with conn:
        for r in rows:
            cur = conn.execute(f"INSERT OR IGNORE INTO forecasts({','.join(cols)}) VALUES ({','.join('?' * len(cols))})", [r.get(c) for c in cols])
            n += cur.rowcount
    return n


def verify(conn: sqlite3.Connection, st: dict, pm: Series, now: datetime) -> int:
    """Fill in outcomes for this station's forecasts whose due hour has now been observed."""
    pending = conn.execute(
        "SELECT f.id, f.due_utc, f.q10, f.q90, f.pm_now, f.source FROM forecasts f LEFT JOIN outcomes o ON o.forecast_id=f.id "
        "WHERE f.location_id=? AND o.forecast_id IS NULL AND f.due_utc IS NOT NULL AND f.source IN ('lightgbm_cqr','fallback_persistence')",
        (st["location_id"],)).fetchall()
    done = 0
    with conn:
        for fid, due, q10, q90, now_pm, source in pending:
            ts = int(datetime.strptime(due, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp())
            actual = pm.at(ts)
            if actual is None:
                continue
            q50 = conn.execute("SELECT q50 FROM forecasts WHERE id=?", (fid,)).fetchone()[0]
            conn.execute("INSERT OR IGNORE INTO outcomes VALUES (?,?,?,?,?,?,?)",
                         (fid, actual, now_pm, None if q10 is None or q90 is None else int(q10 <= actual <= q90),
                          None if q50 is None else abs(actual - q50), None if now_pm is None else abs(actual - now_pm), iso(int(now.timestamp()))))
            done += 1
    return done


def upload(conn: sqlite3.Connection, url: str, token: str, device: str, post=None) -> int:
    """Send rows not yet acknowledged. At-least-once; the cloud de-duplicates on (device_id, id)."""
    post = post or _post
    sent = 0
    while True:
        last = int((conn.execute("SELECT v FROM state WHERE k='uploaded_id'").fetchone() or ("0",))[0])
        cur = conn.execute(f"SELECT id, drivers, {','.join(UPLOAD_COLS)} FROM forecasts WHERE id > ? ORDER BY id LIMIT ?", (last, UPLOAD_BATCH))
        batch = [dict(zip(["id", "drivers"] + UPLOAD_COLS, r)) for r in cur.fetchall()]
        if not batch:
            return sent
        for b in batch:
            b["drivers"] = json.loads(b["drivers"]) if b["drivers"] else None
        post(url, token, {"device_id": device, "table": "forecasts", "rows": batch})
        with conn:
            conn.execute("INSERT OR REPLACE INTO state VALUES ('uploaded_id', ?)", (str(batch[-1]["id"]),))
        sent += len(batch)


def _post(url: str, token: str, body: dict, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-AEIOS-Device-Token": token})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def run_once(cfg: dict, engine: ForecastEngine, openaq: JsonClient, weather: JsonClient, conn: Optional[sqlite3.Connection],
             now: Optional[datetime] = None, node_db: Optional[str] = None) -> dict:
    now = now or datetime.now(timezone.utc)
    site = cfg["weather_site"]
    wx, wproblem = LI.fetch_weather(weather, site["lat"], site["lon"])
    note = f"unavailable ({wproblem})" if wproblem else "Open-Meteo analysis (training used ERA5 reanalysis)"
    summary = {"nodes": 0, "stations": 0, "forecast_rows": 0, "no_input": 0, "stored": 0, "verified": 0, "engine": engine.version or f"fallback: {engine.reason}",
               "weather": note, "rows": []}
    # Primary: the AEIOS nodes. Each node's series comes from the Pi's intelligence database; without it the node reports no input.
    for n in cfg.get("nodes", []):
        pm = NI.hourly_series(node_db, n["wire_id"], now) if node_db else Series()
        st = {"name": n["display_id"], "location_id": n["location_id"], "station_code": n["station_code"], "node": True,
              "input_label": f"AEIOS node {n['display_id']} (PMS5003 readings, hourly mean; nearest CPCB station {n['nearest_cpcb']} used as model context)"}
        problems = [] if node_db else ["node database not configured"]
        rows = forecast_station(st, pm, wx, note, engine, now, problems)
        summary["nodes"] += 1
        summary["no_input"] += sum(r["source"] == "no_input" for r in rows)
        summary["forecast_rows"] += sum(r["source"] != "no_input" for r in rows)
        summary["rows"].extend(rows)
        if conn is not None:
            summary["stored"] += store_rows(conn, rows)
            summary["verified"] += verify(conn, st, pm, now)
    # Fallback: CPCB reference stations, so the picture is never empty while a node is off.
    for st in cfg["stations"]:
        pm, problems = LI.fetch_station_pm(openaq, st["pm25_sensor_ids"], now)
        rows = forecast_station(st, pm, wx, note, engine, now, problems)
        summary["stations"] += 1
        summary["no_input"] += sum(r["source"] == "no_input" for r in rows)
        summary["forecast_rows"] += sum(r["source"] != "no_input" for r in rows)
        summary["rows"].extend(rows)
        if conn is not None:
            summary["stored"] += store_rows(conn, rows)
            summary["verified"] += verify(conn, st, pm, now)
    return summary


def report(conn: sqlite3.Connection) -> str:
    L = ["# Live forecast verification", ""]
    n = conn.execute("SELECT count(*) FROM outcomes").fetchone()[0]
    L.append(f"Verified forecasts so far: {n} (of {conn.execute('SELECT count(*) FROM forecasts').fetchone()[0]} stored).")
    if n == 0:
        return "\n".join(L + ["", "Nothing verified yet: outcomes appear once a forecast's due hour has been observed."])
    L += ["", "| horizon | n | model MAE | persistence MAE | skill | 80% interval coverage |", "|---|---|---|---|---|---|"]
    for h, k, m, p, cov in conn.execute(
            "SELECT f.horizon_h, count(*), avg(o.abs_err), avg(o.persistence_abs_err), avg(o.in_interval) FROM outcomes o JOIN forecasts f ON f.id=o.forecast_id "
            "WHERE f.source='lightgbm_cqr' GROUP BY f.horizon_h ORDER BY f.horizon_h"):
        sk = "-" if not p else f"{(1 - m / p) * 100:.1f} %"
        L.append(f"| +{h} h | {k} | {m:.1f} | {p:.1f} | {sk} | {'-' if cov is None else f'{cov * 100:.0f} %'} |")
    return "\n".join(L)


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stations", default="stations.json")
    ap.add_argument("--db", default="forecasts.db")
    ap.add_argument("--model-dir", default=None, help="model version directory (default: newest in the registry)")
    ap.add_argument("--dry-run", action="store_true", help="compute and print; store and upload nothing")
    ap.add_argument("--no-upload", action="store_true")
    ap.add_argument("--report", action="store_true", help="print live verification results and exit")
    ap.add_argument("--node-db", default=None, help="the Pi's intelligence database (aeios.db) holding node readings")
    a = ap.parse_args(argv)

    if a.report:
        print(report(open_store(a.db)))
        if a.node_db and os.path.exists(a.node_db):
            cfg_r = load_stations(Path(a.stations)) if os.path.exists(a.stations) else {"nodes": []}
            for r in NI.training_readiness(a.node_db, [n["wire_id"] for n in cfg_r["nodes"]]):
                print(f"node {r['wire_id']}: {r['hours']} h of hourly history; node-trained model needs {r['target_hours']} h "
                      f"({'ready' if r['ready_for_node_model'] else 'not yet'})")
        return 0
    key = os.environ.get("OPENAQ_API_KEY", "").strip()
    if not key:
        sys.exit("OPENAQ_API_KEY is not set (put it in ~/.config/aeios/forecast.env, mode 600).")
    cfg = load_stations(Path(a.stations))
    engine = ForecastEngine.load(Path(a.model_dir) if a.model_dir else None)
    if engine.ready and engine.version != cfg["model_version"]:
        log(f"WARNING: stations file is for model {cfg['model_version']} but {engine.version} is loaded; station codes may not match")
    openaq = JsonClient(OPENAQ_URL, {"X-API-Key": key}, RateLimiter(40))
    weather = JsonClient(WEATHER_URL, limiter=RateLimiter(20))
    conn = None if a.dry_run else open_store(a.db)
    s = run_once(cfg, engine, openaq, weather, conn, node_db=a.node_db)
    log(f"engine {s['engine']}; weather {s['weather']}")
    log(f"{s['nodes']} nodes and {s['stations']} CPCB stations: {s['forecast_rows']} forecast rows, {s['no_input']} no_input, {s['stored']} stored, {s['verified']} outcomes verified")
    if a.dry_run:
        for r in s["rows"]:
            if r["horizon_h"] in (1, 6, 24):
                q = "-" if r["q50"] is None else f"{r['q50']:.0f} [{r['q10']:.0f}..{r['q90']:.0f}]" if r["q10"] is not None else f"{r['q50']:.0f}"
                log(f"  {r['station'][:30]:30s} +{r['horizon_h']:>2}h {r['source']:20s} now={r['pm_now']} -> {q}  {r['reason'] or ''}")
        return 0
    url, token = os.environ.get("AEIOS_INGEST_URL", "").strip(), os.environ.get("AEIOS_DEVICE_TOKEN", "").strip()
    if not a.no_upload and url and token:
        try:
            sent = upload(conn, url, token, os.environ.get("AEIOS_DEVICE_ID", socket.gethostname()))
            log(f"uploaded {sent} rows")
        except (urllib.error.URLError, OSError, ValueError) as e:
            log(f"upload failed ({type(e).__name__}: {e}); rows stay queued for the next run")
    return 0


if __name__ == "__main__":
    sys.exit(main())

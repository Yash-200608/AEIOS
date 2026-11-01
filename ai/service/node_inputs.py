"""AEIOS node PM2.5 as forecast input (the primary path; CPCB stations are the fallback).

Reads the Pi's intelligence database (aeios.db, written by gateway.services.v0_bridge) and turns one node's LIVE readings into an
hourly series keyed by the END of each hour, the same convention as the CPCB series. A value therefore only exists once its whole
hour has passed, so a forecast origin can never use data from the future.

Caveat that travels with every node forecast: the model was trained on CPCB reference-station PM2.5. Applying it to a low-cost
PMS5003 node is a domain change that has NOT been validated. Node-trained models need node history; `training_readiness` says how
much exists.
"""

from __future__ import annotations

import sqlite3
from collections import defaultdict
from datetime import datetime
from typing import Optional

from ai.feature_engineering.features import HOUR, Series, clean_pm

MIN_READINGS_PER_HOUR = 2       # nodes report about every 5 minutes; an hour with fewer readings is too thin to trust
LOOKBACK_H = 40                 # what the feature builder needs (24 h lags and rolling windows) plus margin
NODE_CAVEAT = "CPCB-trained model applied to node PM2.5; not validated on node data"
READINESS_HOURS = 8 * 7 * 24    # about eight weeks of hourly history per node before a node-trained model is worth attempting


def hourly_series(db_path: str, wire_id: int, now: datetime) -> Series:
    """Hourly node PM2.5 keyed by hour end, using only readings at or before `now`."""
    cutoff = int(now.timestamp())
    lo = cutoff - LOOKBACK_H * HOUR
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=10)
    try:
        rows = conn.execute(
            "SELECT measurement_time, pm25 FROM sensor_readings WHERE wire_id=? AND provenance='LIVE' AND pm25 IS NOT NULL "
            "AND measurement_time>=? AND measurement_time<=? ORDER BY measurement_time",
            (wire_id, lo, cutoff)).fetchall()
    finally:
        conn.close()
    buckets: dict[int, list[float]] = defaultdict(list)
    for t, v in rows:
        c = clean_pm(float(v), None, "pm25")
        if c is not None:
            buckets[(int(t) // HOUR + 1) * HOUR].append(c)      # the hour that contains t ends at the next whole hour
    s = Series()
    for end, vals in buckets.items():
        if end <= cutoff and len(vals) >= MIN_READINGS_PER_HOUR:
            s.data[end] = sum(vals) / len(vals)
    return s


def training_readiness(db_path: str, wire_ids: list[int]) -> list[dict]:
    """Hours of valid hourly history per node and whether it is enough for a node-trained model (never gates forecasting)."""
    out = []
    for w in wire_ids:
        hours = _history_hours(db_path, w)
        out.append({"wire_id": w, "hours": hours, "target_hours": READINESS_HOURS,
                    "ready_for_node_model": hours >= READINESS_HOURS})
    return out


def _history_hours(db_path: str, wire_id: int) -> int:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=10)
    try:
        rows = conn.execute("SELECT measurement_time, pm25 FROM sensor_readings WHERE wire_id=? AND provenance='LIVE' AND pm25 IS NOT NULL", (wire_id,)).fetchall()
    finally:
        conn.close()
    buckets: dict[int, int] = defaultdict(int)
    for t, v in rows:
        if clean_pm(float(v), None, "pm25") is not None:
            buckets[int(t) // HOUR] += 1
    return sum(1 for n in buckets.values() if n >= MIN_READINGS_PER_HOUR)

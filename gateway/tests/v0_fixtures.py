"""Real v0 packets (the 14 valid LoRa packets received on 2026-10-27) and helpers to build a receiver database.

Values are copied from the cloud copy of the Pi's gateway.db. They are PROTOTYPE data from two bench nodes, not
field evidence.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

# id, node, boot, node_time, rx_utc, temp, rh, pressure, gas_kohm, pm1, pm2_5, pm10, mq_mv, rssi, snr
_REAL = [
    (7, "N2", 3, "2026-10-27T05:34:48", "2026-10-27 05:35:23", 31.2, 54, 993, 32.8, 61, 99, 106, 1821, -34, 9.75),
    (8, "N2", 4, "2026-10-27T05:39:47", "2026-10-27 05:40:22", 31.2, 53, 993, 33.5, 55, 87, 95, 1747, -35, 9.75),
    (9, "N1", 8, "2026-10-27T11:53:30", "2026-10-27 06:24:06", 30.8, 54, 992, 25.6, 52, 83, 88, 830, -37, 10),
    (10, "N2", 1, "2026-10-27T06:26:37", "2026-10-27 06:27:08", 30.6, 54, 992, 34.4, 50, 83, 87, 1125, -39, 10.5),
    (11, "N1", 1, "2026-10-27T13:45:31", "2026-10-27 06:31:16", 30.9, 47, 991, 18.8, 50, 78, 86, 731, -47, 10.25),
    (13, "N1", 2, "2026-10-27T13:50:25", "2026-10-27 06:36:14", 32.7, 44, 991, 24.2, 46, 74, 78, 750, -46, 9.5),
    (14, "N1", 3, "2026-10-27T13:55:24", "2026-10-27 08:26:01", 33.5, 43, 991, 26.8, 48, 74, 80, 777, -40, 9.75),
    (15, "N1", 4, "2026-10-27T14:00:23", "2026-10-27 08:31:00", 33.7, 42, 991, 28.7, 46, 69, 76, 800, -40, 9.5),
    (16, "N1", 5, "2026-10-27T14:05:22", "2026-10-27 08:35:58", 33.9, 42, 991, 30.5, 44, 67, 75, 816, -41, 10.5),
    (17, "N1", 6, "2026-10-27T14:10:21", "2026-10-27 08:40:57", 34.1, 42, 991, 31.6, 42, 62, 72, 829, -41, 9.25),
    (18, "N1", 9, "2026-10-27T14:25:17", "2026-10-27 08:55:53", 32.2, 37, 991, 34.6, 42, 67, 76, 815, -56, 10),
    (19, "N1", 12, "2026-10-27T14:40:13", "2026-10-27 09:10:50", 32.4, 41, 992, 36.6, 42, 65, 73, 818, -39, 9.5),
    (20, "N1", 13, "2026-10-27T14:45:12", "2026-10-27 09:15:48", 31.8, 42, 992, 36.9, 40, 63, 73, 787, -59, 9.75),
    (21, "N1", 14, "2026-10-27T14:50:10", "2026-10-27 09:20:47", 31.8, 42, 992, 37.2, 41, 67, 78, 830, -57, 9.5),
]
_COLS = ("id", "node", "boot", "node_time", "rx_utc", "temp", "rh", "pressure", "gas_kohm", "pm1", "pm2_5", "pm10", "mq_mv", "rssi", "snr")

REAL_ROWS: list[dict] = [dict(zip(_COLS, r), source="lora", lat=0.0, lon=0.0, fix=-1, sats=0) for r in _REAL]

SCHEMA = """
CREATE TABLE packets(
  id INTEGER PRIMARY KEY, rx_utc TEXT, raw TEXT, rssi REAL, snr REAL, source TEXT,
  node TEXT, boot INTEGER, node_time TEXT, temp REAL, rh REAL, pressure REAL, gas_kohm REAL,
  pm1 REAL, pm2_5 REAL, pm10 REAL, mq_mV REAL, lat REAL, lon REAL, fix INTEGER, sats INTEGER)
"""


def make_source_db(path: Path, rows: list[dict]) -> None:
    """Create a receiver-style gateway.db. NOTE: the Pi column is `mq_mv` (SQLite names are case-insensitive)."""
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    add_rows(conn, rows)
    conn.close()


def add_rows(conn: sqlite3.Connection, rows: list[dict]) -> None:
    for r in rows:
        conn.execute(
            "INSERT INTO packets(id, rx_utc, raw, rssi, snr, source, node, boot, node_time, temp, rh, pressure, gas_kohm,"
            " pm1, pm2_5, pm10, mq_mv, lat, lon, fix, sats) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (r["id"], r["rx_utc"], "", r.get("rssi"), r.get("snr"), r.get("source", "lora"), r["node"], r.get("boot"), r.get("node_time"),
             r.get("temp"), r.get("rh"), r.get("pressure"), r.get("gas_kohm"), r.get("pm1"), r.get("pm2_5"), r.get("pm10"),
             r.get("mq_mv"), r.get("lat", 0.0), r.get("lon", 0.0), r.get("fix", -1), r.get("sats", 0)),
        )
    conn.commit()

"""Pooled, leakage-safe training matrices for the PM2.5 forecaster (Phase 3).

All usable CPCB stations are stacked into one table per horizon. The date splits are fixed constants (recorded in every
model's metadata) rather than fractions, so a number in the benchmark can always be traced to the exact windows:

    train        target known on or before TRAIN_END
    calibration  origins in [CALIB_START, CALIB_END]  (winter, the hard regime; used only for conformal calibration)
    test         origins on or after TEST_START       (late winter .. now, never touched while fitting)

Feature sets: `base` uses only data stamped <= the forecast origin (CPCB history, calendar, ERA5 weather at the origin).
`cams` adds the CAMS PM at the origin, available only from Aug 2022. Target-time weather (an oracle) is not offered here.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Optional

import numpy as np

from ai.feature_engineering.features import HOUR, build_rows, load_station_pm, load_weather
from ai.preprocessing.quality_report import gap_stats, is_usable


from ai.feature_engineering.windows import CALIB_END, CALIB_START, TEST_START, TRAIN_END  # noqa: E402,F401

SITE = "sgt"  # weather/CAMS are taken at SGT for every station (all lie within ~25 km; a coarse but honest simplification)


@dataclass
class Matrix:
    horizon: int
    feature_names: list[str]
    X: np.ndarray            # float32, NaN = missing
    y: np.ndarray            # float32
    t: np.ndarray            # origin, unix s
    station: np.ndarray      # station code (index into `stations`)
    pm_now: np.ndarray
    cams_target: np.ndarray  # CAMS PM2.5 at the target time (baseline only, never a feature)
    stations: list[tuple[int, str]]

    def mask(self, which: str) -> np.ndarray:
        tgt = self.t + self.horizon * HOUR
        if which == "train":
            return tgt <= TRAIN_END
        if which == "calibration":
            return (self.t >= CALIB_START) & (tgt <= CALIB_END)
        if which == "test":
            return self.t >= TEST_START
        raise ValueError(which)

    def subset(self, which: str) -> "Matrix":
        m = self.mask(which)
        return Matrix(self.horizon, self.feature_names, self.X[m], self.y[m], self.t[m], self.station[m], self.pm_now[m],
                      self.cams_target[m], self.stations)


def usable_stations(conn: sqlite3.Connection) -> list[tuple[int, str]]:
    out = []
    for lid, name in conn.execute("SELECT location_id, name FROM aq_stations ORDER BY distance_km").fetchall():
        hrs = sorted(load_station_pm(conn, lid, "pm25").data)
        if is_usable(gap_stats(hrs)):
            out.append((lid, name))
    return out


def feature_set(all_names: list[str], kind: str) -> list[str]:
    names = [n for n in all_names if not n.startswith("tw_")]
    if kind == "base":
        names = [n for n in names if not n.startswith("cams_")]
    elif kind != "cams":
        raise ValueError(kind)
    return names + ["station_code"]


def build_matrix(conn: sqlite3.Connection, horizon: int, *, kind: str = "base", stations: Optional[list[tuple[int, str]]] = None) -> Matrix:
    stations = stations if stations is not None else usable_stations(conn)
    wx = load_weather(conn, SITE)
    cams = wx.get("cams_pm2_5")
    rows_all: list[dict] = []
    codes: list[int] = []
    for code, (lid, _) in enumerate(stations):
        pm = load_station_pm(conn, lid, "pm25")
        rows = build_rows(pm, wx, horizon=horizon)
        rows_all.extend(rows)
        codes.extend([code] * len(rows))
    if not rows_all:
        raise ValueError("no feature rows: is the cache populated? (see ai/reports/data_quality.md)")
    names = feature_set(sorted(rows_all[0]["features"]), kind)
    X = np.full((len(rows_all), len(names)), np.nan, dtype=np.float32)
    for i, (r, code) in enumerate(zip(rows_all, codes)):
        f = r["features"]
        for j, n in enumerate(names[:-1]):
            v = f.get(n)
            if v is not None:
                X[i, j] = v
        X[i, -1] = code
    order = np.argsort([r["t"] for r in rows_all], kind="stable")
    t = np.array([r["t"] for r in rows_all], dtype=np.int64)[order]
    cams_t = np.array([(cams.at(r["target_ts"]) if cams else None) or np.nan for r in rows_all], dtype=np.float32)[order]
    return Matrix(horizon, names, X[order], np.array([r["y"] for r in rows_all], dtype=np.float32)[order], t,
                  np.array(codes, dtype=np.int32)[order], np.array([r["features"]["pm_now"] for r in rows_all], dtype=np.float32)[order],
                  cams_t, stations)

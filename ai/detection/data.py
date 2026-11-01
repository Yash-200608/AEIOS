"""Aligned hourly panel of CPCB PM2.5 for all usable stations, plus SGT weather on the same grid (Phase 4).

Rows are stations, columns are hours on one shared UTC grid, NaN where a station has no clean value. Sharing the grid is what
lets a station be compared with its neighbours at the same hour (the spatial-consistency signal the fault classifier uses).
"""

from __future__ import annotations

import sqlite3
import warnings
from dataclasses import dataclass

import numpy as np

from ai.feature_engineering.features import HOUR, load_station_pm, load_weather
from ai.feature_engineering.windows import CALIB_END, CALIB_START, TEST_START, TRAIN_END
from ai.training.dataset import SITE, usable_stations


@dataclass
class Panel:
    ts: np.ndarray            # (T,) unix seconds, hourly
    X: np.ndarray             # (n_stations, T) PM2.5, NaN = no clean value
    names: list[str]
    codes: list[int]
    blh: np.ndarray           # (T,) boundary-layer height at SGT, NaN if missing
    wind: np.ndarray          # (T,) 10 m wind speed at SGT

    def index(self, ts: int) -> int:
        return int((ts - int(self.ts[0])) // HOUR)

    def period(self, name: str) -> tuple[int, int]:
        """Half-open index range [lo, hi) of a named period: tune (before TRAIN_END), calibration, test."""
        bounds = {"tune": (int(self.ts[0]), TRAIN_END), "calibration": (CALIB_START, CALIB_END),
                  "test": (TEST_START, int(self.ts[-1]) + HOUR)}[name]
        return max(0, self.index(bounds[0])), min(len(self.ts), self.index(bounds[1]))


def load_panel(conn: sqlite3.Connection) -> Panel:
    stations = usable_stations(conn)
    series = [load_station_pm(conn, lid, "pm25").data for lid, _ in stations]
    lo = min(min(s) for s in series)
    hi = max(max(s) for s in series)
    ts = np.arange(lo, hi + HOUR, HOUR, dtype=np.int64)
    X = np.full((len(stations), len(ts)), np.nan)
    for i, s in enumerate(series):
        for t, v in s.items():
            X[i, (t - lo) // HOUR] = v
    wx = load_weather(conn, SITE)

    def grid(var: str) -> np.ndarray:
        out = np.full(len(ts), np.nan)
        s = wx.get(var)
        if s is not None:
            for t, v in s.data.items():
                if lo <= t <= hi:
                    out[(t - lo) // HOUR] = v
        return out

    return Panel(ts, X, [n for _, n in stations], [lid for lid, _ in stations], grid("boundary_layer_height"), grid("wind_speed_10m"))


def network_reference(X: np.ndarray, i: int) -> np.ndarray:
    """Median PM2.5 of every OTHER station at each hour (NaN where none of them reports)."""
    others = np.delete(X, i, axis=0)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        return np.nanmedian(others, axis=0)

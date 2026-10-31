"""Leakage-safe feature rows for PM forecasting (Phase 2).

One row = one forecast origin t (a whole hour, UTC) for one horizon h. Every feature is computed from data stamped <= t;
the target is the cleaned PM value stamped t + h. `leakage_audit` proves it: it recomputes sampled rows from data truncated
at t and requires identical features.

Weather/CAMS at the *target* time (`tw_*`, off by default) is an ORACLE: ERA5 reanalysis acts as a perfect forecast of the
future weather. Models using it will look better than they can in operation until archived forecasts replace it, so
anything trained with it must say so.

Pure Python (no numpy/pandas) so it runs and tests anywhere; Phase 3 converts rows to arrays.
"""

from __future__ import annotations

import math
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

HOUR = 3600
HORIZONS = (1, 3, 6, 12, 24)
LAGS = (1, 2, 3, 6, 12, 24)
IST = timedelta(hours=5, minutes=30)

PM25_MAX = 1500.0  # above this a CPCB hourly mean is treated as a sensor artefact, not weather
PM10_MAX = 3000.0
MIN_COVERAGE_PCT = 75.0  # hourly means built from less than this share of the hour are not trusted

# Diwali evening (local date) for the years in the training window; the flag spans 3 days either side.
DIWALI = {2022: (10, 24), 2023: (11, 12), 2024: (11, 1), 2025: (10, 20), 2026: (11, 8)}

WEATHER_NOW = ["temperature_2m", "relative_humidity_2m", "dew_point_2m", "surface_pressure", "precipitation",
               "wind_speed_10m", "wind_speed_100m", "cloud_cover", "boundary_layer_height",
               "cams_pm2_5", "cams_pm10", "cams_aod", "cams_dust"]


def clean_pm(value: Optional[float], coverage_pct: Optional[float], parameter: str = "pm25") -> Optional[float]:
    if value is None or not math.isfinite(value) or value < 0:
        return None
    if value > (PM25_MAX if parameter == "pm25" else PM10_MAX):
        return None
    if coverage_pct is not None and coverage_pct < MIN_COVERAGE_PCT:
        return None
    return value


@dataclass
class Series:
    """Hourly values keyed by unix hour; missing hours are simply absent."""
    data: dict[int, float] = field(default_factory=dict)

    def at(self, ts: int) -> Optional[float]:
        return self.data.get(ts)


def load_pm_series(conn: sqlite3.Connection, sensor_id: int, parameter: str = "pm25") -> Series:
    s = Series()
    for ts, v, cov in conn.execute("SELECT ts, value, coverage_pct FROM aq_hourly WHERE sensor_id=? ORDER BY ts", (sensor_id,)):
        c = clean_pm(v, cov, parameter)
        if c is not None:
            s.data[ts - ts % HOUR] = c
    return s


def load_weather(conn: sqlite3.Connection, site: str) -> dict[str, Series]:
    out: dict[str, Series] = {}
    for ts, var, val in conn.execute("SELECT ts, var, value FROM wx_hourly WHERE site=?", (site,)):
        if val is not None:
            out.setdefault(var, Series()).data[ts] = val
    return out


def _window(series: Series, t: int, hours: int) -> tuple[list[float], int]:
    """Values at t, t-1h ... t-(hours-1)h that exist, and how many hours were asked for."""
    vals = [v for k in range(hours) if (v := series.at(t - k * HOUR)) is not None]
    return vals, hours


def _cyc(x: float, period: float) -> tuple[float, float]:
    a = 2 * math.pi * x / period
    return math.sin(a), math.cos(a)


def calendar_features(t: int) -> dict[str, float]:
    local = datetime.fromtimestamp(t, timezone.utc) + IST
    hs, hc = _cyc(local.hour, 24)
    ds, dc = _cyc(local.weekday(), 7)
    ms, mc = _cyc(local.month - 1, 12)
    d = local.date()
    stubble = (d.month == 10 and d.day >= 15) or d.month == 11 and d.day <= 30
    diwali = 0.0
    if local.year in DIWALI:
        m, day = DIWALI[local.year]
        diwali = 1.0 if abs((d - datetime(local.year, m, day).date()).days) <= 3 else 0.0
    return {"hour_sin": hs, "hour_cos": hc, "dow_sin": ds, "dow_cos": dc, "month_sin": ms, "month_cos": mc,
            "stubble_season": 1.0 if stubble else 0.0, "diwali_window": diwali,
            "winter_fog_season": 1.0 if d.month in (12, 1) else 0.0}


def ventilation(blh: Optional[float], ws10: Optional[float], ws100: Optional[float]) -> Optional[float]:
    """Boundary-layer height x mean low-level wind (m2/s). Same idea as frontend/web/src/lib/derived.ts, but the archive
    has only 10 m and 100 m wind, so the mean is over those two levels (the web panel averages four forecast heights)."""
    winds = [w for w in (ws10, ws100) if w is not None]
    if blh is None or not winds:
        return None
    return blh * (sum(winds) / len(winds))


def weather_features(wx: dict[str, Series], ts: int, prefix: str) -> tuple[dict[str, Optional[float]], int]:
    row: dict[str, Optional[float]] = {}
    for var in WEATHER_NOW:
        s = wx.get(var)
        row[f"{prefix}{var}"] = s.at(ts) if s else None
    wd = wx.get("wind_direction_10m")
    d = wd.at(ts) if wd else None
    row[f"{prefix}wind_dir_sin"] = math.sin(math.radians(d)) if d is not None else None
    row[f"{prefix}wind_dir_cos"] = math.cos(math.radians(d)) if d is not None else None
    row[f"{prefix}ventilation"] = ventilation(row[f"{prefix}boundary_layer_height"], row[f"{prefix}wind_speed_10m"],
                                              row[f"{prefix}wind_speed_100m"])
    return row, ts


def build_rows(pm: Series, wx: dict[str, Series], *, horizon: int, start_ts: Optional[int] = None,
               end_ts: Optional[int] = None, target_weather: bool = False, require_target: bool = True) -> list[dict]:
    """Rows for one horizon. A row needs PM at t (the current level) and, unless require_target is False, at t + h."""
    if not pm.data:
        return []
    lo = start_ts if start_ts is not None else min(pm.data)
    hi = end_ts if end_ts is not None else max(pm.data)
    rows: list[dict] = []
    for t in range(lo - lo % HOUR, hi + 1, HOUR):
        now = pm.at(t)
        if now is None:
            continue
        target = pm.at(t + horizon * HOUR)
        if require_target and target is None:
            continue
        feat: dict[str, Optional[float]] = {"pm_now": now}
        for k in LAGS:
            feat[f"pm_lag{k}"] = pm.at(t - k * HOUR)
        for n in (3, 6, 24):
            vals, _ = _window(pm, t, n)
            feat[f"pm_mean{n}"] = sum(vals) / len(vals) if vals else None
        vals6, _ = _window(pm, t, 6)
        if len(vals6) >= 3:
            mu = sum(vals6) / len(vals6)
            feat["pm_std6"] = math.sqrt(sum((v - mu) ** 2 for v in vals6) / len(vals6))
        else:
            feat["pm_std6"] = None
        vals24, _ = _window(pm, t, 24)
        feat["pm_max24"] = max(vals24) if vals24 else None
        feat["pm_delta1"] = now - feat["pm_lag1"] if feat["pm_lag1"] is not None else None
        feat["pm_delta3"] = now - feat["pm_lag3"] if feat["pm_lag3"] is not None else None
        feat.update(calendar_features(t))
        wxf, _ = weather_features(wx, t, "")
        feat.update(wxf)
        if target_weather:
            twf, _ = weather_features(wx, t + horizon * HOUR, "tw_")  # ORACLE features, see module docstring
            feat.update(twf)
        rows.append({"t": t, "target_ts": t + horizon * HOUR, "horizon": horizon, "y": target, "features": feat})
    return rows


def feature_names(rows: Iterable[dict]) -> list[str]:
    for r in rows:
        return sorted(r["features"])
    return []


def _truncate(series: Series, t: int) -> Series:
    return Series({ts: v for ts, v in series.data.items() if ts <= t})


def _same(a: Optional[float], b: Optional[float]) -> bool:
    return a is None and b is None or (a is not None and b is not None and abs(a - b) <= 1e-9 * max(1.0, abs(a)))


def leakage_audit(pm: Series, wx: dict[str, Series], rows: list[dict], *, sample: int = 200) -> list[str]:
    """Recompute up to `sample` evenly spaced rows using only data stamped <= t. Any feature that changes was reading the
    future. Returns problems (empty = clean). Target weather (tw_*) is excluded: it is a declared oracle."""
    problems: list[str] = []
    if not rows:
        return problems
    step = max(1, len(rows) // sample)
    for r in rows[::step]:
        t = r["t"]
        again = build_rows(_truncate(pm, t), {k: _truncate(v, t) for k, v in wx.items()}, horizon=r["horizon"],
                           start_ts=t, end_ts=t, require_target=False)
        if not again:
            problems.append(f"t={t}: row vanished when future data was removed")
            continue
        for name, v in again[0]["features"].items():
            if not _same(v, r["features"].get(name)):
                problems.append(f"t={t}: feature {name} changed when data after t was removed")
        if r["target_ts"] <= t:
            problems.append(f"t={t}: target is not in the future")
    return problems

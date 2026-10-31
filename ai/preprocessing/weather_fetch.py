"""Open-Meteo weather (ERA5 archive + recent forecast-model days) and CAMS PM into the local cache.

    python -m ai.preprocessing.weather_fetch --since 2022-08-01
    python -m ai.preprocessing.weather_fetch --site chandu --lat 28.4750 --lon 76.9167

No API key. Values are stored long-format as (site, hour, variable, value); CAMS variables are prefixed `cams_`.
Everything here is model output (reanalysis / forecast model), never a measurement; features built from it say so.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
import time
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

from ai.preprocessing.common import SGT_LAT, SGT_LON, JsonClient, RateLimiter, open_cache

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1"
FORECAST_URL = "https://api.open-meteo.com/v1"
AQ_URL = "https://air-quality-api.open-meteo.com/v1"

WEATHER_VARS = [
    "temperature_2m", "relative_humidity_2m", "dew_point_2m", "surface_pressure", "precipitation",
    "wind_speed_10m", "wind_direction_10m", "wind_speed_100m", "cloud_cover", "boundary_layer_height",
]
CAMS_VARS = {"pm2_5": "cams_pm2_5", "pm10": "cams_pm10", "aerosol_optical_depth": "cams_aod", "dust": "cams_dust"}
DEFAULT_SINCE = "2022-08-01"  # first day of CAMS data in Open-Meteo's air-quality API
ARCHIVE_LAG_DAYS = 7  # ERA5 archive trails real time; the forecast API's past_days covers the gap
OVERLAP_D = 3


def make_client(base: str, limiter: Optional[RateLimiter] = None, **kw) -> JsonClient:
    return JsonClient(base, limiter=limiter or RateLimiter(20), **kw)


def parse_hourly(payload: dict, rename: Optional[dict[str, str]] = None) -> list[tuple[int, str, Optional[float]]]:
    """Open-Meteo `hourly` block -> (unix_ts, variable, value) rows. Times are requested in UTC."""
    h = payload.get("hourly") or {}
    times = h.get("time") or []
    out: list[tuple[int, str, Optional[float]]] = []
    for var, series in h.items():
        if var == "time":
            continue
        name = (rename or {}).get(var, var)
        for t, v in zip(times, series):
            ts = int(datetime.fromisoformat(t).replace(tzinfo=timezone.utc).timestamp())
            out.append((ts, name, None if v is None else float(v)))
    return out


def _year_windows(start: date, end: date) -> Iterable[tuple[date, date]]:
    cur = start
    while cur <= end:
        stop = min(end, date(cur.year, 12, 31))
        yield cur, stop
        cur = stop + timedelta(days=1)


def _store(conn: sqlite3.Connection, site: str, rows: list[tuple[int, str, Optional[float]]]) -> None:
    with conn:
        conn.executemany("INSERT OR REPLACE INTO wx_hourly VALUES (?,?,?,?)", [(site, ts, v, val) for ts, v, val in rows])


def _start_for(conn: sqlite3.Connection, site: str, source: str, since: date) -> date:
    row = conn.execute("SELECT fetched_through FROM wx_fetch_state WHERE site=? AND source=?", (site, source)).fetchone()
    if not row:
        return since
    return max(since, datetime.fromtimestamp(row[0], timezone.utc).date() - timedelta(days=OVERLAP_D))


def _mark(conn: sqlite3.Connection, site: str, source: str, through: date) -> None:
    ts = int(datetime(through.year, through.month, through.day, tzinfo=timezone.utc).timestamp())
    with conn:
        conn.execute("INSERT OR REPLACE INTO wx_fetch_state VALUES (?,?,?,?)", (site, source, ts, int(time.time())))


def fetch_site(conn: sqlite3.Connection, site: str, lat: float, lon: float, *, since: str = DEFAULT_SINCE,
               today: Optional[date] = None, archive: Optional[JsonClient] = None, forecast: Optional[JsonClient] = None,
               aq: Optional[JsonClient] = None) -> dict:
    today = today or datetime.now(timezone.utc).date()
    since_d = date.fromisoformat(since)
    archive = archive or make_client(ARCHIVE_URL)
    forecast = forecast or make_client(FORECAST_URL)
    aq = aq or make_client(AQ_URL)
    stats = {"weather_rows": 0, "recent_rows": 0, "cams_rows": 0}
    common = {"latitude": lat, "longitude": lon, "timezone": "UTC"}

    # 1. ERA5 archive up to the lag boundary
    arch_end = today - timedelta(days=ARCHIVE_LAG_DAYS)
    start = _start_for(conn, site, "archive", since_d)
    for a, b in _year_windows(start, arch_end):
        p = archive.get("/archive", {**common, "start_date": a.isoformat(), "end_date": b.isoformat(),
                                     "hourly": ",".join(WEATHER_VARS), "wind_speed_unit": "ms"})
        rows = parse_hourly(p)
        _store(conn, site, rows)
        stats["weather_rows"] += len(rows)
    if start <= arch_end:
        _mark(conn, site, "archive", arch_end)

    # 2. recent days from the forecast API (observed-analysis days before "now"), filling the archive lag
    gap_days = min(92, (today - arch_end).days + 2)
    p = forecast.get("/forecast", {**common, "past_days": gap_days, "forecast_days": 1, "hourly": ",".join(WEATHER_VARS),
                                   "wind_speed_unit": "ms"})
    rows = [r for r in parse_hourly(p) if r[0] >= int(datetime(arch_end.year, arch_end.month, arch_end.day, tzinfo=timezone.utc).timestamp())]
    _store(conn, site, rows)
    stats["recent_rows"] = len(rows)

    # 3. CAMS PM / aerosol
    start = _start_for(conn, site, "cams", max(since_d, date.fromisoformat(DEFAULT_SINCE)))
    for a, b in _year_windows(start, today):
        p = aq.get("/air-quality", {**common, "start_date": a.isoformat(), "end_date": b.isoformat(),
                                    "hourly": ",".join(CAMS_VARS)})
        rows = parse_hourly(p, CAMS_VARS)
        _store(conn, site, rows)
        stats["cams_rows"] += len(rows)
    _mark(conn, site, "cams", today)
    return stats


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", default="sgt")
    ap.add_argument("--lat", type=float, default=SGT_LAT)
    ap.add_argument("--lon", type=float, default=SGT_LON)
    ap.add_argument("--since", default=DEFAULT_SINCE)
    a = ap.parse_args(argv)
    print(fetch_site(open_cache(), a.site, a.lat, a.lon, since=a.since))
    return 0


if __name__ == "__main__":
    sys.exit(main())

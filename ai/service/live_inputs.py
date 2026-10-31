"""Live inputs for the forecast service: the latest CPCB hours from OpenAQ and the current weather from Open-Meteo.

Both reuse the same parsing and cleaning as training (`parse_hours` stamps each hour at its period END rounded up, `clean_pm`
rejects implausible values), so a live feature row is built exactly like a training row. Weather here is Open-Meteo's
analysis/forecast-model output, while training used ERA5 reanalysis; the service labels it so (a small, disclosed shift).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from ai.feature_engineering.features import HOUR, Series, clean_pm
from ai.preprocessing.common import HttpError, JsonClient
from ai.preprocessing.openaq_fetch import PAGE, parse_hours
from ai.preprocessing.weather_fetch import WEATHER_VARS, parse_hourly

LOOKBACK_H = 36  # features read at most 24 h back; the rest is margin for late data and for verifying earlier forecasts


def fetch_station_pm(client: JsonClient, sensor_ids: list[int], now: datetime, lookback_h: int = LOOKBACK_H) -> tuple[Series, list[str]]:
    """Merged recent PM2.5 for one station (newer feed wins). Returns (series, problems); a failing sensor is reported, not fatal."""
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    start = now - timedelta(hours=lookback_h)
    merged = Series()
    problems: list[str] = []
    for sid in sorted(sensor_ids):  # ascending, so the newest feed overwrites the legacy one on overlap
        try:
            payload = client.get(f"/sensors/{sid}/hours", {"datetime_from": start.strftime(fmt), "datetime_to": now.strftime(fmt), "limit": PAGE})
        except HttpError as e:
            problems.append(f"sensor {sid}: {e}")
            continue
        for ts, v, cov in parse_hours(payload):
            c = clean_pm(v, cov, "pm25")
            if c is not None and ts <= int(now.timestamp()):
                merged.data[ts] = c
    return merged, problems


def fetch_weather(client: JsonClient, lat: float, lon: float) -> tuple[dict[str, Series], Optional[str]]:
    """Last two days plus today from the Open-Meteo forecast API (hourly, UTC). Returns (series by variable, problem or None)."""
    try:
        payload = client.get("/forecast", {"latitude": lat, "longitude": lon, "timezone": "UTC", "past_days": 2, "forecast_days": 1,
                                           "hourly": ",".join(WEATHER_VARS + ["wind_direction_10m"]), "wind_speed_unit": "ms"})
    except HttpError as e:
        return {}, str(e)
    wx: dict[str, Series] = {}
    for ts, var, val in parse_hourly(payload):
        if val is not None:
            wx.setdefault(var, Series()).data[ts] = val
    return wx, None


def latest_origin(pm: Series, now: datetime) -> Optional[int]:
    """Newest hour stamp at or before `now` with a clean value."""
    cutoff = int(now.timestamp())
    cands = [t for t in pm.data if t <= cutoff]
    return max(cands) if cands else None


def floor_hour(now: datetime) -> datetime:
    return now.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)


__all__ = ["fetch_station_pm", "fetch_weather", "latest_origin", "floor_hour", "HOUR"]

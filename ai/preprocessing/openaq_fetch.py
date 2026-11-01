"""CPCB air-quality history from OpenAQ v3 into the local cache (Phase 2 of the intelligence plan).

    python -m ai.preprocessing.openaq_fetch discover            # list stations/sensors near SGT (needs OPENAQ_API_KEY)
    python -m ai.preprocessing.openaq_fetch history --since 2022-08-01
    python -m ai.preprocessing.openaq_fetch status              # what is cached (no network, no key)

The key comes from the environment or an untracked `.env` (OPENAQ_API_KEY=...). It is only ever sent as the X-API-Key
header to api.openaq.org and is never printed or stored in the cache. Free keys allow 60 requests/minute; this stays
under 50. Readings are CPCB reference-grade data (they are NOT AEIOS node measurements) and the cache keeps them as-is:
cleaning is a feature-engineering decision, not a download decision.
"""

from __future__ import annotations

import argparse
import math
import os
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

from ai.preprocessing.common import SGT_LAT, SGT_LON, HttpError, JsonClient, RateLimiter, load_env, open_cache

BASE_URL = "https://api.openaq.org/v3"
PARAM_IDS = {"pm10": 1, "pm25": 2}
MAX_RADIUS_M = 25_000  # OpenAQ's documented maximum for coordinate searches
PAGE = 1000
DEFAULT_SINCE = "2022-08-01"  # CAMS data in Open-Meteo starts here, so earlier AQ is not usable as a feature pair
OVERLAP_H = 48  # re-read the last two days on every incremental fetch (late-arriving CPCB values)


def make_client(api_key: Optional[str] = None, limiter: Optional[RateLimiter] = None, **kw: Any) -> JsonClient:
    key = api_key or os.environ.get("OPENAQ_API_KEY", "")
    if not key:
        raise SystemExit("OPENAQ_API_KEY is not set. Put OPENAQ_API_KEY=... in the untracked .env at the repository root.")
    return JsonClient(BASE_URL, {"X-API-Key": key}, limiter or RateLimiter(50), **kw)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(a))


def _utc(obj: Optional[dict]) -> Optional[str]:
    return obj.get("utc") if isinstance(obj, dict) else None


def parse_locations(payload: dict, lat: float, lon: float) -> tuple[list[dict], list[dict]]:
    """Return (stations, sensors) for the PM2.5/PM10 sensors in an OpenAQ /locations payload."""
    stations: list[dict] = []
    sensors: list[dict] = []
    for loc in payload.get("results", []):
        coords = loc.get("coordinates") or {}
        la, lo = coords.get("latitude"), coords.get("longitude")
        pm = [
            {"sensor_id": s["id"], "location_id": loc["id"], "parameter": (s.get("parameter") or {}).get("name", ""),
             "units": (s.get("parameter") or {}).get("units")}
            for s in loc.get("sensors", [])
            if (s.get("parameter") or {}).get("name") in PARAM_IDS
        ]
        if not pm:
            continue
        sensors.extend(pm)
        stations.append({
            "location_id": loc["id"], "name": loc.get("name"), "provider": (loc.get("provider") or {}).get("name", ""),
            "lat": la, "lon": lo,
            "distance_km": haversine_km(lat, lon, la, lo) if la is not None and lo is not None else None,
            "first_utc": _utc(loc.get("datetimeFirst")), "last_utc": _utc(loc.get("datetimeLast")),
        })
    return stations, sensors


def _iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def parse_hours(payload: dict) -> list[tuple[int, float, Optional[float]]]:
    """Return (stamp, value, coverage_pct) per hourly row, dropping rows without a value or time.

    The stamp is the END of the averaging period rounded UP to a whole UTC hour. CPCB hours are local (IST, UTC+5:30), so
    many periods run xx:30..xx+1:30; stamping at the end means a value is never attributed to a time before it was known
    (a feature at origin t may only use stamps <= t). Aligned periods are unchanged: 07:00-08:00 is stamped 08:00."""
    out: list[tuple[int, float, Optional[float]]] = []
    for r in payload.get("results", []):
        period = r.get("period") or {}
        start, end = _utc(period.get("datetimeFrom")), _utc(period.get("datetimeTo"))
        v = r.get("value")
        if (start is None and end is None) or v is None:
            continue
        end_ts = int(_iso(end).timestamp()) if end else int(_iso(start).timestamp()) + 3600
        stamp = -(-end_ts // 3600) * 3600
        cov = (r.get("coverage") or {}).get("percentComplete")
        out.append((stamp, float(v), float(cov) if cov is not None else None))
    return out


def discover(client: JsonClient, conn: sqlite3.Connection, *, lat: float = SGT_LAT, lon: float = SGT_LON,
             radius_m: int = MAX_RADIUS_M, provider_contains: Optional[str] = "cpcb") -> dict:
    """Find PM stations near a point and store them. `provider_contains` filters on the provider name (case-insensitive);
    None keeps every provider (they stay labelled by provider in the cache and the report)."""
    seen: dict[int, dict] = {}
    sensors: dict[int, dict] = {}
    for pid in PARAM_IDS.values():
        page = 1
        while True:
            payload = client.get("/locations", {"coordinates": f"{lat},{lon}", "radius": min(radius_m, MAX_RADIUS_M),
                                                "parameters_id": pid, "limit": PAGE, "page": page})
            st, se = parse_locations(payload, lat, lon)
            for s in st:
                seen[s["location_id"]] = s
            for s in se:
                sensors[s["sensor_id"]] = s
            if len(payload.get("results", [])) < PAGE:
                break
            page += 1
    keep = {i: s for i, s in seen.items()
            if provider_contains is None or provider_contains.lower() in (s["provider"] or "").lower()}
    providers = sorted({s["provider"] for s in seen.values()})
    n_sensors = 0
    with conn:
        for s in keep.values():
            conn.execute("INSERT OR REPLACE INTO aq_stations VALUES (?,?,?,?,?,?,?,?)",
                         (s["location_id"], s["name"], s["provider"], s["lat"], s["lon"], s["distance_km"],
                          s["first_utc"], s["last_utc"]))
        for s in sensors.values():
            if s["location_id"] in keep:
                conn.execute("INSERT OR REPLACE INTO aq_sensors VALUES (?,?,?,?)",
                             (s["sensor_id"], s["location_id"], s["parameter"], s["units"]))
                n_sensors += 1
    return {"stations_found": len(seen), "stations_kept": len(keep), "sensors": n_sensors, "providers_seen": providers}


def _month_windows(start: datetime, end: datetime) -> Iterable[tuple[datetime, datetime]]:
    cur = start
    while cur < end:
        nxt = (cur.replace(day=1) + timedelta(days=32)).replace(day=1)
        yield cur, min(nxt, end)
        cur = nxt


def _hours_page(client: JsonClient, sensor_id: int, a: datetime, b: datetime, page: int) -> dict:
    # NOTE: only `datetime_from`/`datetime_to` filter. The `date_from`/`date_to` spelling in the docs is silently ignored
    # by the live API (it returns the oldest rows whatever the window), so it is deliberately not used as a fallback.
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    return client.get(f"/sensors/{sensor_id}/hours",
                      {"datetime_from": a.strftime(fmt), "datetime_to": b.strftime(fmt), "limit": PAGE, "page": page})


def fetch_history(client: JsonClient, conn: sqlite3.Connection, *, since: str = DEFAULT_SINCE,
                  until: Optional[datetime] = None, now: Optional[float] = None,
                  parameters: Optional[tuple[str, ...]] = None, sensor_ids: Optional[Iterable[int]] = None,
                  backfill: bool = False) -> dict:
    """Download hourly history for every cached PM sensor. Resumable: a sensor is re-read from its last fetched hour
    minus OVERLAP_H, so repeated runs only fetch what is new. `backfill=True` instead reads from `since` up to the earliest
    hour already cached (plus the overlap), to extend history backwards without re-downloading what is there."""
    end = until or datetime.fromtimestamp(now if now is not None else time.time(), timezone.utc).replace(
        minute=0, second=0, microsecond=0)
    floor = datetime.fromisoformat(since).replace(tzinfo=timezone.utc)
    stats = {"sensors": 0, "rows": 0, "requests": 0}
    wanted = set(sensor_ids) if sensor_ids is not None else None
    for (sid, param) in conn.execute("SELECT sensor_id, parameter FROM aq_sensors ORDER BY sensor_id").fetchall():
        if (parameters and param not in parameters) or (wanted is not None and sid not in wanted):
            continue
        row = conn.execute("SELECT fetched_through FROM aq_fetch_state WHERE sensor_id=?", (sid,)).fetchone()
        start, stop = floor, end
        if backfill:
            first = conn.execute("SELECT min(ts) FROM aq_hourly WHERE sensor_id=?", (sid,)).fetchone()[0]
            if first is not None:
                stop = min(end, datetime.fromtimestamp(first, timezone.utc) + timedelta(hours=OVERLAP_H))
        elif row:
            start = max(floor, datetime.fromtimestamp(row[0], timezone.utc) - timedelta(hours=OVERLAP_H))
        total = 0
        for a, b in _month_windows(start, stop):
            page = 1
            while True:
                payload = _hours_page(client, sid, a, b, page)
                stats["requests"] += 1
                rows = parse_hours(payload)
                with conn:
                    conn.executemany("INSERT OR REPLACE INTO aq_hourly VALUES (?,?,?,?)",
                                     [(sid, ts, v, c) for ts, v, c in rows])
                total += len(rows)
                if len(payload.get("results", [])) < PAGE:
                    break
                page += 1
        if not backfill:
            with conn:
                conn.execute("INSERT OR REPLACE INTO aq_fetch_state VALUES (?,?,?)", (sid, int(end.timestamp()), int(time.time())))
        stats["sensors"] += 1
        stats["rows"] += total
    return stats


def status(conn: sqlite3.Connection) -> dict:
    def q(sql: str) -> list:
        return conn.execute(sql).fetchall()

    return {
        "stations": q("SELECT location_id, name, provider, round(distance_km,1) FROM aq_stations ORDER BY distance_km"),
        "sensors": q("SELECT parameter, count(*) FROM aq_sensors GROUP BY parameter"),
        "hourly_rows": q("SELECT count(*) FROM aq_hourly")[0][0],
    }


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("discover")
    d.add_argument("--provider", default="cpcb", help="provider-name filter, or 'any'")
    d.add_argument("--radius-km", type=float, default=25.0)
    h = sub.add_parser("history")
    h.add_argument("--since", default=DEFAULT_SINCE)
    h.add_argument("--parameters", default="pm25,pm10", help="comma list, e.g. pm25")
    h.add_argument("--backfill", action="store_true", help="extend history back to --since without touching newer data")
    h.add_argument("--sensor", type=int, action="append", help="only this sensor id (repeatable)")
    sub.add_parser("status")
    a = ap.parse_args(argv)
    load_env()
    conn = open_cache()
    if a.cmd == "status":
        print(status(conn))
        return 0
    client = make_client()
    if a.cmd == "discover":
        print(discover(client, conn, radius_m=int(a.radius_km * 1000),
                       provider_contains=None if a.provider == "any" else a.provider))
    else:
        print(fetch_history(client, conn, since=a.since, parameters=tuple(a.parameters.split(',')), sensor_ids=a.sensor, backfill=a.backfill))
    return 0


if __name__ == "__main__":
    sys.exit(main())

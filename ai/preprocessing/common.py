"""Shared plumbing for the AEIOS data-foundation fetchers: HTTP with rate limiting, the local SQLite cache, .env loading.

The cache is an untracked SQLite file (ai/data/cache/, see .gitignore). Nothing here sends credentials anywhere except
the header of the one API they belong to, and nothing prints them.
"""

from __future__ import annotations

import json
import os
import sqlite3
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable, Optional

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "ai" / "data" / "cache"
CACHE_DB = CACHE_DIR / "aeios_data.db"

# SGT University (the reference site for station selection and for weather/CAMS features).
SGT_LAT, SGT_LON = 28.4782417, 76.9040528
USER_AGENT = "aeios-data-foundation/0.1 (research prototype)"


def load_env(path: Optional[Path] = None) -> None:
    """Read KEY=VALUE lines from ROOT/.env into os.environ (without overriding real environment variables)."""
    p = path or (ROOT / ".env")
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def ssl_context() -> ssl.SSLContext:
    """Verified TLS. Some Windows cert stores carry an expired chain Python rejects while browsers and curl accept it,
    so prefer the certifi bundle when it is installed (never disable verification); otherwise use the system store."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


class RateLimiter:
    """Allow at most `per_minute` calls in any rolling minute (the injected clock/sleep make it testable)."""

    def __init__(self, per_minute: int, clock: Callable[[], float] = time.monotonic, sleep: Callable[[float], None] = time.sleep) -> None:
        self.per_minute = per_minute
        self._clock = clock
        self._sleep = sleep
        self._calls: list[float] = []

    def wait(self) -> None:
        now = self._clock()
        self._calls = [t for t in self._calls if now - t < 60.0]
        if len(self._calls) >= self.per_minute:
            self._sleep(60.0 - (now - self._calls[0]) + 0.05)
            now = self._clock()
            self._calls = [t for t in self._calls if now - t < 60.0]
        self._calls.append(now)


class HttpError(RuntimeError):
    pass


class JsonClient:
    def __init__(
        self,
        base_url: str,
        headers: Optional[dict[str, str]] = None,
        limiter: Optional[RateLimiter] = None,
        retries: int = 4,
        opener: Optional[Callable[[urllib.request.Request, float], Any]] = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = {"User-Agent": USER_AGENT, "Accept": "application/json", **(headers or {})}
        self.limiter = limiter
        self.retries = retries
        self._open = opener or (lambda req, timeout: urllib.request.urlopen(req, timeout=timeout, context=ssl_context()))
        self._sleep = sleep

    def get(self, path: str, params: Optional[dict[str, Any]] = None, timeout: float = 60.0) -> dict:
        url = self.base_url + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        last: Optional[Exception] = None
        for attempt in range(self.retries + 1):
            if self.limiter:
                self.limiter.wait()
            try:
                with self._open(urllib.request.Request(url, headers=self.headers), timeout) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                last = e
                if e.code == 429 or e.code >= 500:
                    retry_after = e.headers.get("Retry-After") if e.headers else None
                    self._sleep(float(retry_after) if retry_after and retry_after.isdigit() else min(60.0, 2.0 ** (attempt + 1)))
                    continue
                raise HttpError(f"HTTP {e.code} for {path}") from None  # 4xx: do not retry, and never echo headers
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                last = e
                self._sleep(min(30.0, 2.0 ** (attempt + 1)))
        raise HttpError(f"giving up on {path} after {self.retries + 1} attempts: {type(last).__name__}")


SCHEMA = """
CREATE TABLE IF NOT EXISTS aq_stations(
  location_id INTEGER PRIMARY KEY, name TEXT, provider TEXT, lat REAL, lon REAL, distance_km REAL,
  first_utc TEXT, last_utc TEXT);
CREATE TABLE IF NOT EXISTS aq_sensors(
  sensor_id INTEGER PRIMARY KEY, location_id INTEGER NOT NULL, parameter TEXT NOT NULL, units TEXT);
CREATE TABLE IF NOT EXISTS aq_hourly(
  sensor_id INTEGER NOT NULL, ts INTEGER NOT NULL, value REAL, coverage_pct REAL,
  PRIMARY KEY(sensor_id, ts)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS aq_fetch_state(
  sensor_id INTEGER PRIMARY KEY, fetched_through INTEGER NOT NULL, fetched_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wx_hourly(
  site TEXT NOT NULL, ts INTEGER NOT NULL, var TEXT NOT NULL, value REAL,
  PRIMARY KEY(site, ts, var)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS wx_fetch_state(
  site TEXT NOT NULL, source TEXT NOT NULL, fetched_through INTEGER NOT NULL, fetched_at INTEGER NOT NULL,
  PRIMARY KEY(site, source));
"""


def open_cache(path: Optional[Path] = None) -> sqlite3.Connection:
    p = Path(path) if path else CACHE_DB
    if str(p) != ":memory:":
        p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(p))
    conn.executescript(SCHEMA)
    return conn

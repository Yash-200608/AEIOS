#!/usr/bin/env python3
"""AEIOS smoke watch: runs on the gateway Pi and warns when air that passed over burning fields is reaching a site.

Every cycle it
  1. loads winds (Open-Meteo, 88-point grid over north-west India) and fire detections (NASA FIRMS VIIRS 375 m);
     each download is cached on disk, so when the internet is down it carries on with the last copy (flagged stale);
  2. traces back-trajectories from each site for the current hour and the next few hours, at three heights;
  3. counts the fires each trajectory passed, and compares with the local PM2.5 from the node packets in gateway.db;
  4. on a new or higher alert level it writes a row to the smoke_alerts table, logs it, and runs AEIOS_ALERT_CMD if set
     (hook for a buzzer, relay, siren or SMS gateway).

Same method as the website's "Smoke origin" panel (web/src/lib/trajectory.ts). Horizontal winds only: read each path as a
corridor, not a line. A fire match shows the air passed over burning fields; it does not prove how much PM came from them.
Standard library only. Alert thresholds are starting values to tune against real PM data.
"""
import argparse, csv, io, json, math, os, shlex, signal, sqlite3, subprocess, sys, time
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))

SITES = {
    "SGT": {"name": "SGT University", "lat": 28.4782417, "lon": 76.9040528},
    "CHANDU": {"name": "Chandu village", "lat": 28.4750, "lon": 76.9167},
}
GRID = {"lat0": 25.0, "lon0": 71.0, "n_lat": 8, "n_lon": 11, "step": 1.0}          # 25-32 N, 71-81 E
LEVELS = [
    ("120m", "~120 m", "wind_speed_120m", "wind_direction_120m"),
    ("950", "~350 m (950 hPa)", "wind_speed_950hPa", "wind_direction_950hPa"),
    ("925", "~650 m (925 hPa)", "wind_speed_925hPa", "wind_direction_925hPa"),
]
BOX = {"south": 24, "north": 33, "west": 70, "east": 82}                              # fire filter
FIRE_SOURCES = [
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_Asia_7d.csv",
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_Asia_7d.csv",
    "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_Asia_7d.csv",
]
MATCH = {"radius_km": 15.0, "before_h": 3.0, "after_h": 12.0}                         # same as the website
STEP_S = 600
M_PER_DEG = 111320.0
HOUR = 3600.0
LEVEL_NAMES = ["NONE", "WATCH", "WARNING"]
PM_POOR = 91.0   # CPCB PM2.5 "Poor" starts above 90 ug/m3 (see dashboard.py BANDS); PMS5003 values are indicative


def env_f(name, default):
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return float(default)


# Starting values, to be tuned against real PM episodes.
WATCH_FIRES, WATCH_MW = env_f("SMOKE_WATCH_FIRES", 5), env_f("SMOKE_WATCH_MW", 10)
WARN_FIRES, WARN_MW = env_f("SMOKE_WARN_FIRES", 20), env_f("SMOKE_WARN_MW", 50)


def log(msg):
    print(f"{time.strftime('%H:%M:%S')}  {msg}", flush=True)


# ------------------------------------------------------------------ data with on-disk cache
class Cache:
    """Raw responses saved as files; the file's modification time is when it was fetched."""
    def __init__(self, directory, offline=False):
        self.dir, self.offline = directory, offline
        os.makedirs(directory, exist_ok=True)

    def get(self, name, url, max_age_s):
        path = os.path.join(self.dir, name)
        age = time.time() - os.path.getmtime(path) if os.path.exists(path) else None
        if not self.offline and (age is None or age > max_age_s):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "AEIOS-smoke-watch/1.0"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = r.read()
                tmp = path + ".tmp"
                with open(tmp, "wb") as f:
                    f.write(data)
                os.replace(tmp, path)
                age = 0.0
            except Exception as e:
                log(f"{name}: download failed ({type(e).__name__}: {e}); using the cached copy" if age is not None else f"{name}: download failed ({e}) and nothing cached")
        if not os.path.exists(path):
            return None, None
        with open(path, "rb") as f:
            return f.read(), time.time() - os.path.getmtime(path)


def wind_url():
    lats, lons = [], []
    for i in range(GRID["n_lat"]):
        for j in range(GRID["n_lon"]):
            lats.append(GRID["lat0"] + i * GRID["step"]); lons.append(GRID["lon0"] + j * GRID["step"])
    vars_ = ",".join(v for _, _, s, d in LEVELS for v in (s, d))
    return ("https://api.open-meteo.com/v1/forecast?latitude=" + ",".join(f"{x:g}" for x in lats) + "&longitude=" + ",".join(f"{x:g}" for x in lons)
            + f"&hourly={vars_}&past_days=3&forecast_days=2&wind_speed_unit=ms&timezone=GMT")


def parse_time(s):
    return datetime.strptime(s[:16], "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc).timestamp()


class WindGrid:
    def __init__(self, raw):
        data = json.loads(raw)
        self.times = [parse_time(t) for t in data[0]["hourly"]["time"]]
        n_t, n_p = len(self.times), len(data)
        self.n_p = n_p
        self.u, self.v = {}, {}
        for key, _, sp, di in LEVELS:
            u, v = [math.nan] * (n_t * n_p), [math.nan] * (n_t * n_p)
            for p, pt in enumerate(data):
                s_arr, d_arr = pt["hourly"][sp], pt["hourly"][di]
                for k in range(n_t):
                    s, d = s_arr[k], d_arr[k]
                    if s is None or d is None:
                        continue
                    rad = math.radians(d)                      # meteorological direction: wind blows FROM d
                    u[k * n_p + p] = -s * math.sin(rad)
                    v[k * n_p + p] = -s * math.cos(rad)
            self.u[key], self.v[key] = u, v

    def wind_at(self, level, lat, lon, t):
        fi, fj = (lat - GRID["lat0"]) / GRID["step"], (lon - GRID["lon0"]) / GRID["step"]
        if fi < 0 or fj < 0 or fi > GRID["n_lat"] - 1 or fj > GRID["n_lon"] - 1:
            return None
        n = len(self.times)
        if t < self.times[0] or t > self.times[n - 1]:
            return None
        k = min(n - 2, int((t - self.times[0]) // HOUR))
        ft = (t - self.times[k]) / (self.times[k + 1] - self.times[k])
        i, j = min(GRID["n_lat"] - 2, int(fi)), min(GRID["n_lon"] - 2, int(fj))
        di, dj = fi - i, fj - j
        n_lon = GRID["n_lon"]

        def sample(arr, kk):
            base = kk * self.n_p
            a = arr[base + i * n_lon + j]; b = arr[base + (i + 1) * n_lon + j]
            c = arr[base + i * n_lon + j + 1]; d = arr[base + (i + 1) * n_lon + j + 1]
            return a * (1 - di) * (1 - dj) + b * di * (1 - dj) + c * (1 - di) * dj + d * di * dj

        uu = sample(self.u[level], k) * (1 - ft) + sample(self.u[level], k + 1) * ft
        vv = sample(self.v[level], k) * (1 - ft) + sample(self.v[level], k + 1) * ft
        return (uu, vv) if math.isfinite(uu) and math.isfinite(vv) else None   # NaN: level below ground


def back_trajectory(grid, level, lat, lon, arrival, hours):
    path = [(lat, lon, arrival)]
    t, end = arrival, arrival - hours * HOUR
    while t > end:
        w = grid.wind_at(level, lat, lon, t)
        if not w:
            break
        lat -= w[1] * STEP_S / M_PER_DEG
        lon -= w[0] * STEP_S / (M_PER_DEG * math.cos(math.radians(lat)))
        t -= STEP_S
        path.append((lat, lon, t))
    return path


def km(a_lat, a_lon, b_lat, b_lon):
    x = (b_lon - a_lon) * math.cos(math.radians((a_lat + b_lat) / 2))
    return math.hypot(x, b_lat - a_lat) * 111.32


def bearing(a_lat, a_lon, b_lat, b_lon):
    deg = math.degrees(math.atan2((b_lon - a_lon) * math.cos(math.radians(a_lat)), b_lat - a_lat))
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][round(((deg + 360) % 360) / 45) % 8]


def load_fires(cache, now, hours=72):
    fires, newest_age = [], None
    for url in FIRE_SOURCES:
        raw, age = cache.get(os.path.basename(url), url, 30 * 60)
        if raw is None:
            continue
        newest_age = age if newest_age is None else min(newest_age, age)
        for row in csv.DictReader(io.StringIO(raw.decode("utf-8", "replace"))):
            try:
                lat, lon = float(row["latitude"]), float(row["longitude"])
            except (KeyError, ValueError):
                continue
            if not (BOX["south"] <= lat <= BOX["north"] and BOX["west"] <= lon <= BOX["east"]) or row.get("confidence") == "low":
                continue
            hhmm = row["acq_time"].zfill(4)
            t = parse_time(f"{row['acq_date']}T{hhmm[:2]}:{hhmm[2:]}")
            if now - hours * HOUR <= t <= now:
                fires.append({"lat": lat, "lon": lon, "t": t, "frp": float(row.get("frp") or 0)})
    return fires, newest_age


def match_fires(path, fires, arrival):
    lat_min, lat_max = min(p[0] for p in path) - 0.2, max(p[0] for p in path) + 0.2
    lon_min, lon_max = min(p[1] for p in path) - 0.2, max(p[1] for p in path) + 0.2
    out = []
    for f in fires:
        if not (lat_min <= f["lat"] <= lat_max and lon_min <= f["lon"] <= lon_max):
            continue
        best = None
        for lat, lon, t in path:
            if t < f["t"] - MATCH["before_h"] * HOUR or t > f["t"] + MATCH["after_h"] * HOUR:
                continue
            d = km(lat, lon, f["lat"], f["lon"])
            if d <= MATCH["radius_km"] and (best is None or d < best[0]):
                best = (d, (arrival - t) / HOUR)
        if best:
            out.append({"fire": f, "dist_km": best[0], "hours_before": best[1]})
    return out


# ------------------------------------------------------------------ alerts
def level_for(n, mw):
    if n >= WARN_FIRES or mw >= WARN_MW:
        return 2
    if n >= WATCH_FIRES or mw >= WATCH_MW:
        return 1
    return 0


def assess(grid, fires, site, now, look_ahead_h, trace_h=24):
    """Worst case over the next look_ahead_h hours and the three heights."""
    first_hour = math.floor(now / HOUR) * HOUR
    best = None
    for h in range(0, look_ahead_h + 1):
        arrival = first_hour + h * HOUR
        if arrival > grid.times[-1]:
            break
        for key, label, _, _ in LEVELS:
            path = back_trajectory(grid, key, site["lat"], site["lon"], arrival, trace_h)
            matches = match_fires(path, fires, arrival)
            n, mw = len(matches), sum(m["fire"]["frp"] for m in matches)
            end = path[-1]
            cand = {"hours_ahead": h, "level_key": key, "level_label": label, "fires": n, "frp_mw": round(mw, 1),
                    "origin_km": round(km(site["lat"], site["lon"], end[0], end[1])), "origin_dir": bearing(site["lat"], site["lon"], end[0], end[1]),
                    "traced_h": round((arrival - end[2]) / HOUR), "level": level_for(n, mw),
                    "min_hours_before": round(min((m["hours_before"] for m in matches), default=0), 1)}
            if best is None or (cand["level"], cand["frp_mw"], cand["fires"]) > (best["level"], best["frp_mw"], best["fires"]):
                best = cand
    return best


def local_pm25(db_path, now):
    """Latest real node PM2.5 within 30 minutes, or None."""
    try:
        db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=5)
        rows = db.execute("SELECT node, rx_utc, pm2_5 FROM packets WHERE source='lora' AND pm2_5 >= 0 ORDER BY id DESC LIMIT 20").fetchall()
        db.close()
    except sqlite3.Error:
        return None
    for node, rx, pm in rows:
        t = parse_time(rx.replace(" ", "T"))
        if now - 1800 <= t <= now + 60:
            return {"node": node, "pm2_5": pm, "age_min": round((now - t) / 60)}
    return None


def ensure_table(db):
    db.execute("""CREATE TABLE IF NOT EXISTS smoke_alerts(id INTEGER PRIMARY KEY, utc TEXT, site TEXT, level TEXT, hours_ahead INTEGER,
        fires INTEGER, frp_mw REAL, origin_km INTEGER, origin_dir TEXT, height TEXT, local_pm25 REAL, stale_h REAL, message TEXT)""")


def message(site, a, pm, stale_h):
    when = "now" if a["hours_ahead"] == 0 else f"in about {a['hours_ahead']} h"
    s = (f"{LEVEL_NAMES[a['level']]}: air reaching {site['name']} {when} at {a['level_label']} passed {a['fires']} fires "
         f"({a['frp_mw']} MW) {a['min_hours_before']:.0f}+ h earlier; it came from {a['origin_km']} km {a['origin_dir']}.")
    if pm:
        s += f" Local PM2.5 {pm['pm2_5']:.0f} ug/m3 ({pm['node']}, {pm['age_min']} min ago)."
    if stale_h and stale_h > 3:
        s += f" Data {stale_h:.0f} h old (offline?)."
    return s


def run_hook(site_key, level, msg):
    cmd = os.environ.get("AEIOS_ALERT_CMD", "").strip()
    if not cmd:
        return
    env = dict(os.environ, SMOKE_SITE=site_key, SMOKE_LEVEL=LEVEL_NAMES[level], SMOKE_MESSAGE=msg)
    try:
        subprocess.run(shlex.split(cmd), env=env, timeout=20, check=False)
    except Exception as e:
        log(f"alert command failed: {e}")


def cycle(args, cache, state, now):
    wind_raw, wind_age = cache.get("wind_grid.json", wind_url(), 25 * 60)
    fires, fire_age = load_fires(cache, now)
    if wind_raw is None:
        log("no wind data yet (first run needs internet once); skipping this cycle")
        return
    grid = WindGrid(wind_raw)
    stale_h = max((wind_age or 0), (fire_age or 0)) / HOUR
    if grid.times[-1] < now:
        log(f"cached winds end {(now - grid.times[-1]) / HOUR:.0f} h ago, too old to trust; skipping this cycle")
        return
    pm = local_pm25(args.db, now) if os.path.exists(args.db) else None
    status = {"updated": datetime.fromtimestamp(now, timezone.utc).isoformat(), "fires_loaded": len(fires),
              "wind_age_h": round((wind_age or 0) / HOUR, 1), "fire_age_h": round((fire_age or 0) / HOUR, 1), "sites": {}}
    db = None
    if not args.dry_run and os.path.exists(args.db):
        db = sqlite3.connect(args.db, timeout=10)
        ensure_table(db)
    for key, site in SITES.items():
        a = assess(grid, fires, site, now, args.look_ahead)
        level = a["level"]
        # Local PM2.5 in the Poor band corroborates the trajectory and raises the level by one.
        if pm and pm["pm2_5"] >= PM_POOR and level == 1:
            level = 2
        a = dict(a, level=level)
        status["sites"][key] = dict(a, level_name=LEVEL_NAMES[level], local_pm25=pm)
        prev = state.get(key, {"level": 0, "t": 0})
        should = level > 0 and (level > prev["level"] or now - prev["t"] >= args.repeat_h * HOUR)
        log(f"{key}: {LEVEL_NAMES[level]}  worst case {a['fires']} fires / {a['frp_mw']} MW at {a['level_label']} (+{a['hours_ahead']} h), "
            f"origin {a['origin_km']} km {a['origin_dir']}" + (f", local PM2.5 {pm['pm2_5']:.0f}" if pm else ""))
        if should:
            msg = message(site, a, pm, stale_h)
            log("ALERT " + msg)
            if db:
                db.execute("INSERT INTO smoke_alerts(utc,site,level,hours_ahead,fires,frp_mw,origin_km,origin_dir,height,local_pm25,stale_h,message) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                           (datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), key, LEVEL_NAMES[level], a["hours_ahead"], a["fires"],
                            a["frp_mw"], a["origin_km"], a["origin_dir"], a["level_label"], pm["pm2_5"] if pm else None, round(stale_h, 1), msg))
                db.commit()
            run_hook(key, level, msg)
            state[key] = {"level": level, "t": now}
        elif level == 0 and prev["level"] > 0:
            log(f"{key}: back to NONE")
            state[key] = {"level": 0, "t": now}
    if db:
        db.close()
    if not args.dry_run:
        tmp = os.path.join(HERE, "smoke_status.json.tmp")
        with open(tmp, "w") as f:
            json.dump(status, f, indent=1)
        os.replace(tmp, os.path.join(HERE, "smoke_status.json"))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=os.path.join(HERE, "gateway.db"))
    ap.add_argument("--cache-dir", default=os.path.join(HERE, "smoke_cache"))
    ap.add_argument("--interval", type=float, default=600, help="seconds between checks")
    ap.add_argument("--look-ahead", type=int, default=6, help="hours ahead to check using forecast winds")
    ap.add_argument("--repeat-h", type=float, default=3, help="repeat a standing alert every N hours")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--offline", action="store_true", help="never download; use the cache only (testing)")
    ap.add_argument("--dry-run", action="store_true", help="log only: no database or status-file writes")
    ap.add_argument("--now", help="pretend it is this UTC time, e.g. 2026-10-29T05:30 (testing)")
    args = ap.parse_args()

    cache = Cache(args.cache_dir, args.offline)
    state_path = os.path.join(HERE, "smoke_state.json")
    try:
        with open(state_path) as f:
            state = json.load(f)
    except (OSError, ValueError):
        state = {}
    stop = []
    signal.signal(signal.SIGTERM, lambda *_: stop.append(1))
    log(f"smoke watch started: sites {list(SITES)}, look ahead {args.look_ahead} h, thresholds WATCH {WATCH_FIRES:g} fires or {WATCH_MW:g} MW, WARNING {WARN_FIRES:g} fires or {WARN_MW:g} MW")
    while not stop:
        now = parse_time(args.now) if args.now else time.time()
        try:
            cycle(args, cache, state, now)
            if not args.dry_run:
                with open(state_path, "w") as f:
                    json.dump(state, f)
        except Exception as e:                               # a bad cycle must never stop the watch
            log(f"cycle failed: {type(e).__name__}: {e}")
        if args.once or args.now:
            break
        for _ in range(int(args.interval)):
            if stop:
                break
            time.sleep(1)


if __name__ == "__main__":
    main()

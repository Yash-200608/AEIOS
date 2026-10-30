#!/usr/bin/env python3
"""SYNTHETIC sensor data for nodes N1 and N2, for testing the ML pipeline only. Nothing here is a measurement.
Rows use the exact LoRa packet format of the node firmware and are always marked source='synthetic'.
The physics is deliberately simple: one indoor room shared by both nodes, a daily cycle, slow weather,
and particle events (cooking, incense, sweeping) that build up and decay. Per-node gains, offsets, noise
and faults (no PMS frame, failed BME680, frozen MQ135, lost packets) follow the bench notes.
Usage:
  python3 synth.py --days 28 --out synthetic.csv          history for train.py (events go to synthetic_events.csv)
  python3 synth.py --live --db demo.db --every 2          stream one 5-minute step every 2 s into a database
"""
import argparse, calendar, csv, math, os, sys, time
import numpy as np

STEP_S = 300
IST_S = 19800

# Illustrative node settings. Baselines echo the bench notes (MQ135 ~700 mV vs ~2000 mV); none are calibration constants.
NODES = {
    "N1": dict(period=300.4, phase=0, pm_gain=1.00, t_off=0.0, rh_off=0.0, p_off=0.0, gas_base=60.0, mq_base=700.0, mq_voc=1.2, clock_s=IST_S, sats=(0, 0)),
    "N2": dict(period=299.7, phase=30, pm_gain=1.12, t_off=-0.4, rh_off=2.0, p_off=0.6, gas_base=45.0, mq_base=2000.0, mq_voc=2.0, clock_s=0, sats=(2, 6)),
}
# kind, events per day, local-hour windows, median peak ug/m3, emission minutes, decay tau minutes, PM10/PM2.5 of the event, VOC per ug
EVENTS = [
    ("cooking",  2.5, [(7, 9), (12, 14), (19, 21.5)], 110, (15, 40), (25, 60),  1.3,  1.0),
    ("incense",  0.3, [(6, 7.5), (18, 20)],           180, (20, 40), (60, 120), 1.15, 2.0),
    ("sweeping", 0.6, [(9, 12), (16, 18)],             60, (10, 20), (10, 25),  3.0,  0.1),
]

def ar1(rng, n, sigma, tau):
    """Smooth random wander with standard deviation sigma and correlation time tau (steps)."""
    a = math.exp(-1.0 / tau); e = rng.normal(0.0, sigma * math.sqrt(1 - a * a), n)
    x = np.empty(n); x[0] = rng.normal(0.0, sigma)
    for i in range(1, n): x[i] = a * x[i - 1] + e[i]
    return x

def room(rng, t0, n):
    """Conditions in the shared room on a 5-minute grid starting at epoch t0 (UTC), plus the event log."""
    t = t0 + np.arange(n) * STEP_S
    hour = ((t + IST_S) % 86400) / 3600.0
    temp = 27 + 2.5 * np.sin(2 * np.pi * (hour - 9) / 24) + ar1(rng, n, 1.5, 3 * 288)
    rh = np.clip(55 - 1.8 * (temp - 27) + ar1(rng, n, 8, 2 * 288), 20, 95)
    pres = 990 + 1.2 * np.cos(2 * np.pi * (hour - 10) / 12) + ar1(rng, n, 4, 4 * 288)
    bg = (35 + 10 * (1 + np.cos(2 * np.pi * (hour - 1) / 24)) + 12 * np.exp(-((hour - 8.5) / 1.5) ** 2)) * np.exp(ar1(rng, n, 0.35, 288))
    fine, coarse, voc, log = np.zeros(n), np.zeros(n), np.zeros(n), []
    day0 = (t0 + IST_S) // 86400 * 86400 - IST_S          # local midnight on the first day, as UTC epoch
    for kind, rate, wins, peak, emit, tau, ratio, vocf in EVENTS:
        for d in range(int(math.ceil(n * STEP_S / 86400)) + 1):
            for _ in range(rng.poisson(rate)):
                lo, hi = wins[rng.integers(len(wins))]
                i0 = int(round((day0 + d * 86400 + rng.uniform(lo, hi) * 3600 - t0) / STEP_S))
                if not 0 <= i0 < n: continue
                amp = peak * math.exp(rng.normal(0, 0.5)); k = math.exp(-STEP_S / (rng.uniform(*tau) * 60))
                end, c, i = i0 + int(rng.uniform(*emit) * 60 / STEP_S), 0.0, i0
                while i < n and (i <= end or c > 0.5):           # first-order build-up while emitting, then decay
                    c = c * k + (amp * (1 - k) if i <= end else 0.0)
                    fine[i] += c; coarse[i] += c * (ratio - 1); voc[i] += c * vocf; i += 1
                log.append((kind, "N1+N2", t[i0], t[min(i, n - 1)], round(amp)))
    return dict(t=t, temp=temp, rh=rh, pres=pres, bg=bg, fine=fine, coarse=coarse, voc=voc), log

def ts(epoch, fmt="%Y-%m-%d %H:%M:%S"): return time.strftime(fmt, time.gmtime(epoch))

def node_rows(rng, R, name, cfg, t0, n, log):
    """Readings one node would send. Returns [(rx_epoch, raw_packet, rssi, snr)]."""
    st = t0 + cfg["phase"] + np.arange(int(n * STEP_S / cfg["period"])) * cfg["period"]
    st = st[st < t0 + n * STEP_S]; m = len(st)
    j = np.clip(np.round((st - t0) / STEP_S).astype(int), 0, n - 1)
    rh_room = R["rh"][j]
    pm25 = (R["bg"][j] + R["fine"][j]) * cfg["pm_gain"] * (1 + 0.03 * np.maximum(0, rh_room - 75)) * np.exp(rng.normal(0, 0.08, m)) + rng.normal(0, 1, m)
    pm10 = pm25 + (0.6 * R["bg"][j] + R["coarse"][j]) * cfg["pm_gain"] * np.exp(rng.normal(0, 0.1, m))
    pm1 = pm25 * rng.uniform(0.65, 0.75, m)
    pm1 = np.maximum(0, np.round(pm1)); pm25 = np.maximum(pm1, np.round(pm25)); pm10 = np.maximum(pm25, np.round(pm10))
    temp = R["temp"][j] + cfg["t_off"] + rng.normal(0, 0.08, m)
    rh = np.clip(rh_room + cfg["rh_off"] + rng.normal(0, 0.5, m), 0, 100)
    pres = R["pres"][j] + cfg["p_off"] + rng.normal(0, 0.12, m)
    gas = cfg["gas_base"] * np.exp(-0.015 * (rh - 50)) / (1 + R["voc"][j] / 40) * np.exp(rng.normal(0, 0.02, m))
    mq = np.clip(cfg["mq_base"] + cfg["mq_voc"] * R["voc"][j] - 8 * (temp - 27) + rng.normal(0, 6, m), 0, 3100)
    no_pms, no_bme, lost = rng.random(m) < 0.005, rng.random(m) < 0.002, rng.random(m) < 0.02
    for _ in range(rng.poisson(n * STEP_S / 86400 / 7)):  # about one frozen-MQ135 episode a week
        a = rng.integers(m); mq[a:a + 24] = mq[a]; log.append(("fault_mq_frozen", name, st[a], st[min(a + 23, m - 1)], ""))
    for i in np.flatnonzero(no_pms): log.append(("fault_no_pms_frame", name, st[i], st[i], ""))
    for i in np.flatnonzero(no_bme): log.append(("fault_bme_nan", name, st[i], st[i], ""))
    rows = []
    for i in range(m):
        if lost[i]: continue
        bme = "nan,nan,nan,nan" if no_bme[i] else f"{temp[i]:.1f},{rh[i]:.0f},{pres[i]:.0f},{gas[i]:.1f}"
        pms = "-1,-1,-1" if no_pms[i] else f"{pm1[i]:.0f},{pm25[i]:.0f},{pm10[i]:.0f}"
        raw = (f"{name},{i + 1},{ts(st[i] + cfg['clock_s'], '%Y-%m-%dT%H:%M:%S')},{bme},{pms},{mq[i]:.0f},"
               f"0.000000,0.000000,0,{rng.integers(cfg['sats'][0], cfg['sats'][1] + 1)}")
        rows.append((st[i] + 1.0 + abs(rng.normal(0, 0.2)), raw, round(-37 + rng.normal(0, 1.5), 1), round(9.5 + rng.normal(0, 0.4), 1)))
    return rows

def generate(days, seed, t0=None):
    """All packets from both nodes in receive order, and the event and fault log."""
    rng = np.random.default_rng(seed)
    t0 = int(t0 if t0 is not None else time.time()) // STEP_S * STEP_S
    n = int(days * 86400 / STEP_S)
    R, log = room(rng, t0, n)
    rows = sorted(r for name, cfg in NODES.items() for r in node_rows(rng, R, name, cfg, t0, n, log))
    return rows, sorted(log, key=lambda e: e[2])

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=float, default=28); ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--start", default="", help="first day (UTC date, YYYY-MM-DD) of the history; default: so it ends now")
    ap.add_argument("--out", default="synthetic.csv")
    ap.add_argument("--live", action="store_true", help="stream into --db instead of writing a CSV")
    ap.add_argument("--db", default="demo.db"); ap.add_argument("--every", type=float, default=2.0, help="seconds between 5-minute steps")
    ap.add_argument("--steps", type=int, default=0, help="stop after this many packets (0 = run through all --days)")
    a = ap.parse_args()
    if a.live:
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        import gwdb
        gwdb.DB_PATH = os.path.abspath(a.db)
        if os.path.abspath(a.db) == os.path.abspath(os.path.join(os.path.dirname(gwdb.__file__), "gateway.db")):
            sys.exit("Refusing to stream synthetic rows into gateway.db; use a separate --db such as demo.db.")
        db = gwdb.connect(); rows, _ = generate(a.days, a.seed)
        print(f"SYNTHETIC stream into {a.db}: {len(rows)} packets, one 5-minute step every {a.every} s. Ctrl+C to stop.", flush=True)
        prev = None
        for k, (rx, raw, rssi, snr) in enumerate(rows):
            if a.steps and k >= a.steps: break
            if prev is not None and a.every > 0: time.sleep(a.every * (rx - prev) / STEP_S)
            prev = rx
            gwdb.store(db, raw, rssi, snr, source="synthetic")
            db.execute("UPDATE packets SET rx_utc=? WHERE id=last_insert_rowid()", (ts(rx),)); db.commit()   # synthetic clock, not wall clock
            print("synthetic", ts(rx), raw, flush=True)
        return
    t0 = calendar.timegm(time.strptime(a.start, "%Y-%m-%d")) if a.start else time.time() - a.days * 86400
    rows, log = generate(a.days, a.seed, t0)
    with open(a.out, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["rx_utc", "raw", "rssi", "snr", "source"])
        for rx, raw, rssi, snr in rows: w.writerow([ts(rx), raw, rssi, snr, "synthetic"])
    ev = os.path.splitext(a.out)[0] + "_events.csv"
    with open(ev, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["kind", "nodes", "start_utc", "end_utc", "peak_ug_m3"])
        for kind, nodes, s, e, amp in log: w.writerow([kind, nodes, ts(s), ts(e), amp])
    print(f"SYNTHETIC data: {len(rows)} packets over {a.days:g} days -> {a.out}; {len(log)} events and faults -> {ev}")

if __name__ == "__main__":
    main()

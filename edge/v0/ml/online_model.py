"""Online PM2.5 / PM10 forecaster for the gateway (numpy only, runs on the Pi as installed).
For every node, target (pm2_5, pm10) and horizon (1, 3, 6 steps = 5, 15, 30 min) an exponentially weighted
ridge regression learns the change from the current value, in log space. With no data it predicts
"no change" (persistence) and moves away from that only as far as the data supports. It keeps learning:
each prediction is stored, and when the real value arrives h steps later the model is updated with it.
Also scores every signal against its own last 24 h (robust z, median and MAD) to flag unusual readings.
"""
import calendar, hashlib, json, math, os, time
import numpy as np

STEP_S = 300                      # node sample period
HORIZONS = (1, 3, 6)              # steps ahead: 5, 15, 30 min
TARGETS = ("pm2_5", "pm10")
SIGNALS = ("temp", "rh", "pressure", "gas_kohm", "pm1", "pm2_5", "pm10", "mq_mv")   # packet fields 3..10
RANGES = {"temp": (-40, 85), "rh": (0, 100), "pressure": (300, 1100), "gas_kohm": (0.001, 5000),
          "pm1": (0, 1000), "pm2_5": (0, 1000), "pm10": (0, 1000), "mq_mv": (0, 3300)}
Z_FLOOR = {"temp": 0.1, "rh": 1.0, "pressure": 0.5, "gas_kohm": None, "pm1": 1.0, "pm2_5": 1.0, "pm10": 1.0, "mq_mv": 5.0}
HIST = 288                        # 24 h of steps kept per node
MIN_BASELINE = 48                 # 4 h of valid points before any 24 h statistic is used
IST_S = 19800
FEATURES = ("bias", "level", "change_5m", "change_15m", "change_30m", "vs_1h_mean", "vs_24h_median",
            "rh", "rh_over_75", "temp", "hour_sin", "hour_cos", "gas_rel", "mq_rel", "vs_other_node", "other_node_missing")
MODEL_NAME, STATE_VERSION = "online_ridge_v1", 1

def parse_packet(raw):
    """node,boot,time,temp,rh,pressure,gas_kohm,pm1,pm2_5,pm10,mq_mV[,lat,lon,fix,sats] -> dict, or None if unusable.
    Firmware sentinels: PMS -1 means no frame, 'nan' means a failed BME680. Out-of-range values become missing."""
    f = raw.strip().split(",")
    if len(f) < 11 or not f[0] or len(raw) > 200: return None
    r = {"node": f[0], "node_time": f[2]}
    for k, s in zip(SIGNALS, f[3:11]):
        try: v = float(s)
        except ValueError: v = math.nan
        lo, hi = RANGES[k]
        r[k] = v if math.isfinite(v) and lo <= v <= hi else math.nan
    return r

def utc_epoch(s): return calendar.timegm(time.strptime(s, "%Y-%m-%d %H:%M:%S"))

def _ffill(v):
    """Forward-fill NaNs (leading NaNs stay NaN)."""
    ok = ~np.isnan(v); idx = np.where(ok, np.arange(len(v)), 0)
    np.maximum.accumulate(idx, out=idx)
    return v[idx]

class Ridge:
    """Exponentially weighted ridge regression: w = (A + alpha I)^-1 b, A and b decay by lam per update."""
    def __init__(self, n, lam=0.9995, alpha=3.0):
        self.lam, self.alpha = lam, alpha
        self.A, self.b, self.updates, self.var, self._w = np.zeros((n, n)), np.zeros(n), 0, None, None
    def weights(self):
        if self._w is None: self._w = np.linalg.solve(self.A + self.alpha * np.eye(len(self.b)), self.b)
        return self._w
    def predict(self, x): return float(x @ self.weights())
    def update(self, x, y):
        r = y - self.predict(x)                       # residual before learning from this point (honest error)
        self.var = r * r if self.var is None else 0.995 * self.var + 0.005 * r * r
        self.A = self.lam * self.A + np.outer(x, x); self.b = self.lam * self.b + y * x
        self.updates += 1; self._w = None
    def to_dict(self): return {"A": self.A.tolist(), "b": self.b.tolist(), "updates": self.updates, "var": self.var}
    @classmethod
    def from_dict(cls, d, lam, alpha):
        m = cls(len(d["b"]), lam, alpha); m.A, m.b = np.array(d["A"]), np.array(d["b"])
        m.updates, m.var = d["updates"], d["var"]; return m

class Forecaster:
    def __init__(self, nodes=("N1", "N2"), lam=0.9995, alpha=3.0):
        self.nodes, self.lam, self.alpha = tuple(nodes), lam, alpha
        self.hist = {n: {k: [] for k in ("t",) + SIGNALS} for n in self.nodes}
        self.models = {(n, tg, h): Ridge(len(FEATURES), lam, alpha) for n in self.nodes for tg in TARGETS for h in HORIZONS}
        self.stats = {k: [0, 0.0, 0.0] for k in self.models}          # scored count, sum |model error|, sum |persistence error|
        self.pending, self.streak, self.learned_from, self.last_packet_id = [], {}, {}, 0

    # -------- one packet --------
    def step(self, r, t, source="lora"):
        """r: parse_packet() result, t: gateway receive time (UTC epoch s). Predict, learn, score.
        Returns {"predictions", "scored", "anomalies", "skipped"}."""
        n = r["node"] if r else None
        if n not in self.nodes: return {"skipped": f"unknown node {n!r}", "predictions": [], "scored": [], "anomalies": []}
        H = self.hist[n]
        if H["t"] and t < H["t"][-1] - STEP_S / 2:            # clock went backwards: start this node's history again
            for k in H: H[k].clear()
            self.pending = [p for p in self.pending if p["node"] != n]
        if H["t"] and t - H["t"][-1] < STEP_S / 2:
            return {"skipped": "packet too soon after the previous one (duplicate?)", "predictions": [], "scored": [], "anomalies": []}
        if H["t"]:                                             # missed packets become explicit gaps, never "normal"
            for _ in range(min(max(int(round((t - H["t"][-1]) / STEP_S)) - 1, 0), HIST)):
                H["t"].append(H["t"][-1] + STEP_S)
                for s in SIGNALS: H[s].append(math.nan)
        anomalies = self._anomalies(n, r)
        H["t"].append(t)
        for s in SIGNALS: H[s].append(r[s])
        for k in H: del H[k][:-HIST]
        self.learned_from[source] = self.learned_from.get(source, 0) + 1
        scored = self._learn(n, r, t)
        return {"predictions": self._predict(n, t), "scored": scored, "anomalies": anomalies, "skipped": None}

    def _learn(self, n, r, t):
        keep, scored = [], []
        for p in self.pending:
            if p["node"] != n or p["due"] > t + STEP_S / 2: keep.append(p); continue
            y = r[p["target"]]
            if p["due"] >= t - STEP_S / 2 and not math.isnan(y):
                key = (n, p["target"], p["h"])
                self.models[key].update(np.array(p["x"]), math.log1p(y) - p["l0"])
                e, ep = abs(p["p50"] - y), abs(p["now"] - y); st = self.stats[key]
                st[0] += 1; st[1] += e; st[2] += ep
                scored.append({"node": n, "target": p["target"], "horizon_min": p["h"] * 5, "t": t, "actual": y,
                               "predicted": p["p50"], "persistence": p["now"], "err": e, "err_persistence": ep})
        self.pending = keep
        return scored

    def _features(self, n, t):
        H = self.hist[n]; a = {s: np.array(H[s], float) for s in SIGNALS}
        def now(s, default):
            v = _ffill(a[s])[-1]; return default if math.isnan(v) else v
        def rel(s):                                            # current value against its own 24 h median
            v, past = a[s][-1], a[s][:-1]; past = past[~np.isnan(past)]
            if math.isnan(v) or len(past) < MIN_BASELINE: return None
            return v, float(np.median(past))
        rh, temp, hr = now("rh", 50.0), now("temp", 27.0), ((t + IST_S) % 86400) / 3600.0
        g, q = rel("gas_kohm"), rel("mq_mv")
        gas_rel = math.log(g[0] / g[1]) if g and g[1] > 0 else 0.0
        mq_rel = (q[0] - q[1]) / 200.0 if q else 0.0
        other = next((o for o in self.nodes if o != n), None)
        out = {}
        for tg in TARGETS:
            v = a[tg]
            if math.isnan(v[-1]): continue                    # no current value: no forecast (not a guess)
            f, l0 = _ffill(v), math.log1p(v[-1])
            lag = lambda k: math.log1p(f[-1 - k]) if len(f) > k and not math.isnan(f[-1 - k]) else l0
            past = v[:-1][~np.isnan(v[:-1])]
            med = math.log1p(float(np.median(past))) if len(past) >= 12 else l0
            vs_other, missing = 0.0, 1.0
            if other:
                O = self.hist[other]
                if O["t"] and abs(t - O["t"][-1]) <= 1.5 * STEP_S and not math.isnan(O[tg][-1]):
                    vs_other, missing = math.log1p(O[tg][-1]) - l0, 0.0
            x = np.array([1.0, l0 / 5, l0 - lag(1), l0 - lag(3), l0 - lag(6), l0 - math.log1p(np.nanmean(v[-12:])), l0 - med,
                          (rh - 50) / 20, max(0.0, rh - 75) / 10, (temp - 27) / 5,
                          math.sin(2 * math.pi * hr / 24), math.cos(2 * math.pi * hr / 24),
                          gas_rel, mq_rel, vs_other, missing])
            out[tg] = (np.clip(x, -5, 5), l0, float(v[-1]))
        return out

    def _predict(self, n, t):
        out = []
        for tg, (x, l0, now) in self._features(n, t).items():
            for h in HORIZONS:
                m = self.models[(n, tg, h)]; d = m.predict(x)
                p50 = max(0.0, math.expm1(l0 + d)); p10 = p90 = None
                if m.updates >= 50 and m.var:                  # 80 % band once the model has seen enough errors
                    sd = math.sqrt(m.var)
                    p10, p90 = max(0.0, math.expm1(l0 + d - 1.2816 * sd)), math.expm1(l0 + d + 1.2816 * sd)
                self.pending.append({"node": n, "target": tg, "h": h, "due": t + h * STEP_S, "x": x.tolist(), "l0": l0, "p50": p50, "now": now})
                out.append({"node": n, "target": tg, "horizon_min": h * 5, "made": t, "due": t + h * STEP_S,
                            "now": now, "p50": p50, "p10": p10, "p90": p90, "updates": m.updates})
        return out

    def _anomalies(self, n, r):
        """Robust z of each reading against the node's last 24 h. An episode opens at |z| >= 6, or |z| >= 4 twice
        in a row, and closes after 3 readings with |z| < 2. Only the opening is reported, so one event is one flag."""
        out = []
        for s in SIGNALS:
            st = self.streak.setdefault((n, s), [0, False, 0])     # high-z run, episode open, calm run
            v, past = r[s], np.array(self.hist[n][s], float)
            past = past[~np.isnan(past)]
            if math.isnan(v) or len(past) < MIN_BASELINE: st[0] = 0; continue
            med = float(np.median(past)); mad = float(np.median(np.abs(past - med)))
            floor = Z_FLOOR[s] if Z_FLOOR[s] is not None else 0.02 * abs(med)
            z = (v - med) / max(1.4826 * mad, floor)
            st[0] = st[0] + 1 if abs(z) >= 4 else 0
            st[2] = st[2] + 1 if abs(z) < 2 else 0
            if st[1] and st[2] >= 3: st[1] = False
            elif not st[1] and (abs(z) >= 6 or st[0] >= 2):
                st[1] = True
                out.append({"node": n, "signal": s, "value": v, "median_24h": med, "z": round(z, 1)})
        return out

    # -------- reporting and state --------
    def summary(self):
        rows = []
        for (n, tg, h), (c, se, sp) in sorted(self.stats.items()):
            if c: rows.append({"node": n, "target": tg, "horizon_min": h * 5, "scored": c, "mae": se / c,
                               "mae_persistence": sp / c, "skill": 1 - se / sp if sp else 0.0})
        return rows

    def save(self, path):
        d = {"version": STATE_VERSION, "model": MODEL_NAME, "features": FEATURES, "horizons": HORIZONS, "nodes": self.nodes,
             "lam": self.lam, "alpha": self.alpha, "saved_utc": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
             "learned_from": self.learned_from, "last_packet_id": self.last_packet_id, "hist": self.hist, "pending": self.pending,
             "streak": {"|".join(k): v for k, v in self.streak.items()},
             "stats": {"|".join(map(str, k)): v for k, v in self.stats.items()},
             "models": {"|".join(map(str, k)): m.to_dict() for k, m in self.models.items()}}
        data = json.dumps(d).encode()
        for p, b in ((path, data), (path + ".sha256", hashlib.sha256(data).hexdigest().encode())):
            with open(p + ".tmp", "wb") as f: f.write(b)
            os.replace(p + ".tmp", p)

    @classmethod
    def load(cls, path):
        with open(path, "rb") as f: data = f.read()
        want = ""
        if os.path.exists(path + ".sha256"):
            with open(path + ".sha256") as f: want = f.read().strip()
        if want != hashlib.sha256(data).hexdigest():
            raise ValueError(f"{path} does not match its checksum file; refusing to load it")
        d = json.loads(data)
        if d["version"] != STATE_VERSION or tuple(d["features"]) != FEATURES:
            raise ValueError(f"{path} was saved by a different model version or feature set")
        fc = cls(d["nodes"], d["lam"], d["alpha"])
        fc.hist, fc.pending, fc.learned_from, fc.last_packet_id = d["hist"], d["pending"], d["learned_from"], d["last_packet_id"]
        fc.streak = {tuple(k.split("|")): v for k, v in d["streak"].items()}
        key = lambda k: (lambda n, tg, h: (n, tg, int(h)))(*k.split("|"))
        fc.stats = {key(k): v for k, v in d["stats"].items()}
        fc.models = {key(k): Ridge.from_dict(m, fc.lam, fc.alpha) for k, m in d["models"].items()}
        return fc

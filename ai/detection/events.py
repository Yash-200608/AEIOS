"""Pollution-event detectors compared at a matched alert burden (Phase 4).

Four ways to say "something unusual is happening to PM2.5 at this station":

  rule      robust local baseline: rise over the previous day's median, scaled by its spread, for two consecutive hours
  iforest   Isolation Forest on local-history, calendar and weather features, upward deviations only
  surprise  the Phase 3 forecaster: the observed hour exceeds the model's own 80 % upper bound from one hour earlier
  repo      the repository's deterministic EventDetector (quality -> EWMA baseline -> features -> detector), run AS SHIPPED

Fair comparison needs equal alert burden, so each tunable method gets one threshold, chosen on the calibration window (out of sample
for every model) to give TARGET_BURDEN alerts per station-day on REAL data. The repo detector has no knob and is reported as it is.
Recall is then measured on INJECTED episodes in the test window. Real PM2.5 contains genuine unlabelled episodes, so "burden" counts
real events too: it is workload, not a false-alarm rate.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from ai.detection.data import Panel
from ai.detection.inject import Episode, inject_events
from ai.feature_engineering.features import HOUR, Series, build_rows

TARGET_BURDEN = 0.5   # alerts per station-day on real data
PERSIST = 2           # consecutive flagged hours before an alert (the repo detector's persist_needed is also 2)
REFRACTORY = 6        # hours after an alert during which a continuing run is not a new alert
MATCH_AFTER = 2       # an episode counts as detected if an alert falls in [start, start + dur + MATCH_AFTER)


# ---- alerts from scores -------------------------------------------------------------------------------------------------------


def alert_indices(score: np.ndarray, thr: float, lo: int, hi: int, persist: int = PERSIST, refractory: int = REFRACTORY) -> list[int]:
    """Indices in [lo, hi) where a run of `persist` consecutive scores >= thr is first completed. A run alerts once, at its start: a
    long continuing episode is one alert, not one every few hours. A new run within `refractory` hours of the last alert is ignored."""
    flag = np.nan_to_num(score, nan=-np.inf) >= thr
    run = 0
    armed = True
    last = -10**9
    out: list[int] = []
    for t in range(max(lo - persist, 0), hi):
        if flag[t]:
            run += 1
        else:
            run, armed = 0, True
        if run >= persist and armed:
            armed = False
            if t >= lo and t - last > refractory:
                out.append(t)
                last = t
    return out


def burden(alerts: int, finite_hours: int) -> float:
    return alerts / max(1e-9, finite_hours / 24.0)


def tune_threshold(scores: list[np.ndarray], xs: list[np.ndarray], lo: int, hi: int, target: float = TARGET_BURDEN) -> float:
    """Smallest threshold whose pooled alert burden on the real series is at or below `target` (bisection on the score range)."""
    hours = sum(int(np.isfinite(x[lo:hi]).sum()) for x in xs)
    allv = np.concatenate([s[lo:hi][np.isfinite(s[lo:hi])] for s in scores])
    a, b = float(np.quantile(allv, 0.5)), float(allv.max()) + 1e-6
    for _ in range(40):
        mid = (a + b) / 2
        n = sum(len(alert_indices(s, mid, lo, hi)) for s in scores)
        if burden(n, hours) > target:
            a = mid
        else:
            b = mid
    return b


# ---- scores -------------------------------------------------------------------------------------------------------------------


def rule_score(x: np.ndarray) -> np.ndarray:
    """Rise over the previous 24 h median, in units of that day's robust spread (floored at 5 ug/m3)."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        s = pd.Series(x)
        prev = s.shift(1)
        med = prev.rolling(24, min_periods=12).median()
        spread = (prev.rolling(24, min_periods=12).quantile(0.75) - prev.rolling(24, min_periods=12).quantile(0.25)) / 1.349
        return ((s - med) / (spread + 5.0)).to_numpy()


IF_FEATURES = ["lvl", "d1", "d3", "vs6", "cv6", "hour_sin", "hour_cos", "blh", "wind", "vent"]


def iforest_features(x: np.ndarray, panel: Panel) -> pd.DataFrame:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        s = pd.Series(x)
        med = s.shift(1).rolling(24, min_periods=12).median()
        mean6 = s.shift(1).rolling(6, min_periods=3).mean()
        local = pd.to_datetime(panel.ts + 19800, unit="s")
        f = pd.DataFrame({
            "lvl": np.log1p(s.clip(lower=0)) - np.log1p(med),
            "d1": s.diff(1), "d3": s.diff(3), "vs6": s - mean6,
            "cv6": s.shift(1).rolling(6, min_periods=3).std() / (mean6 + 5.0),
            "hour_sin": np.sin(2 * np.pi * local.hour.to_numpy() / 24), "hour_cos": np.cos(2 * np.pi * local.hour.to_numpy() / 24),
            "blh": panel.blh, "wind": panel.wind, "vent": panel.blh * panel.wind})
    return f[IF_FEATURES]


@dataclass
class IForestModel:
    forest: IsolationForest
    fill: dict[str, float]

    def score(self, x: np.ndarray, panel: Panel) -> np.ndarray:
        """Anomaly score (higher = stranger), reported only for hours that are upward deviations from the previous day's level."""
        f = iforest_features(x, panel)
        up = (f["lvl"] > 0).to_numpy() & np.isfinite(x)
        raw = -self.forest.score_samples(f.fillna(self.fill).to_numpy())
        return np.where(up, raw, np.nan)


def fit_iforest(panel: Panel, stations: list[int], period: str, *, seed: int = 20261101, max_rows: int = 150_000) -> IForestModel:
    lo, hi = panel.period(period)
    parts = []
    for i in stations:
        f = iforest_features(panel.X[i], panel).iloc[lo:hi]
        parts.append(f[np.isfinite(panel.X[i][lo:hi])])
    X = pd.concat(parts, ignore_index=True)
    if len(X) > max_rows:
        X = X.sample(max_rows, random_state=seed)
    fill = {c: float(X[c].median()) for c in IF_FEATURES}
    clean = X.fillna(fill)
    forest = IsolationForest(n_estimators=200, max_samples=512, contamination="auto", random_state=seed, n_jobs=4)
    forest.fit(clean.to_numpy())
    return IForestModel(forest, fill)


class SurpriseModel:
    """How far above the Phase 3 forecaster's own upper bound (from one hour earlier) the observed value is."""

    def __init__(self, engine, wx: dict[str, Series], station_codes: dict[int, int]) -> None:
        self.engine, self.wx, self.codes = engine, wx, station_codes

    def score(self, x: np.ndarray, panel: Panel, i: int, lo: int, hi: int) -> np.ndarray:
        out = np.full(len(x), np.nan)
        meta = self.engine.meta
        names = meta["feature_names"]
        b = self.engine.boosters[1]
        c = self.engine.conformal[1]
        a = max(0, lo - 60)
        pm = Series({int(panel.ts[t]): float(x[t]) for t in range(a, min(hi, len(x))) if np.isfinite(x[t]) and x[t] >= 0})
        rows = build_rows(pm, self.wx, horizon=1, start_ts=int(panel.ts[max(lo - 1, 0)]), end_ts=int(panel.ts[min(hi, len(x)) - 2]), require_target=False)
        if not rows:
            return out
        M = np.full((len(rows), len(names)), np.nan, dtype=np.float32)
        for r, row in enumerate(rows):
            f = dict(row["features"])
            f["station_code"] = self.codes[i]
            for j, n in enumerate(names):
                v = f.get(n)
                if v is not None and np.isfinite(v):
                    M[r, j] = v
        q50 = b[0.5].predict(M, num_iteration=b[0.5].best_iteration or None)
        q90 = b[0.9].predict(M, num_iteration=b[0.9].best_iteration or None) + c
        for r, row in enumerate(rows):
            t = panel.index(row["t"]) + 1
            if t < len(x) and np.isfinite(x[t]):
                out[t] = (np.log1p(max(x[t], 0)) - q90[r]) / max(0.1, q90[r] - q50[r])
        return out


# ---- the repository's deterministic detector, as shipped ---------------------------------------------------------------------


def repo_alerts(x: np.ndarray, panel: Panel, lo: int, hi: int, warmup: int = 72, pm_scale: Optional[float] = None) -> list[int]:
    """Run gateway.intelligence (quality -> baseline -> features -> detector) over one station's hourly PM2.5, as shipped: the CPCB
    station is presented as a node with only a PMS-type sensor fitted. Returns the indices where it OPENED an event."""
    from gateway.contracts import Observation
    import gateway.intelligence.detector as detector_module
    from gateway.intelligence.baseline import BaselineBank
    from gateway.intelligence.detector import EventDetector
    from gateway.intelligence.features import FeatureExtractor
    from gateway.intelligence.quality import QualityEngine

    qe, fe, bb, det = QualityEngine(), FeatureExtractor(), BaselineBank(), EventDetector()
    out: list[int] = []
    saved = detector_module.PM_SCALE
    if pm_scale is not None:
        detector_module.PM_SCALE = pm_scale   # the only PM threshold knob: deviation must exceed Z_THRESH * PM_SCALE ug/m3 over the baseline
    try:
        _run_repo(x, panel, lo, hi, warmup, qe, fe, bb, det, Observation, out)
    finally:
        detector_module.PM_SCALE = saved
    return out


def _run_repo(x, panel, lo, hi, warmup, qe, fe, bb, det, Observation, out) -> None:
    for t in range(max(0, lo - warmup), hi):
        if not np.isfinite(x[t]):
            continue
        obs = Observation(wire_id=1, display_id="CPCB", sequence=t, sample_id=t, measurement_time=int(panel.ts[t]), received_at=int(panel.ts[t]),
                          pm25=float(x[t]), installed_sensors=frozenset({"pms5003"}))
        obs.quality = qe.assess(obs)
        freeze = det.state(1).status in ("CONFIRMED", "RESOLVING")
        base = bb.snapshot(1)
        feat = fe.extract(obs, base)
        _, _, action = det.step(obs, feat, base, mq_primed=bb.mq_primed(1))
        bb.update(obs, freeze=freeze)
        if action == "OPEN" and t >= lo:
            out.append(t)


def tune_repo_scale(panel: Panel, stations: list[int], lo: int, hi: int, target: float = TARGET_BURDEN) -> float:
    """PM_SCALE (ug/m3) at which the repo detector gives `target` alerts per station-day on the real calibration window."""
    hours = sum(int(np.isfinite(panel.X[i][lo:hi]).sum()) for i in stations)
    a, b = 1.0, 200.0
    for _ in range(14):
        mid = (a + b) / 2
        n = sum(len(repo_alerts(panel.X[i], panel, lo, hi, pm_scale=mid)) for i in stations)
        if burden(n, hours) > target:
            a = mid
        else:
            b = mid
    return b


# ---- evaluation ---------------------------------------------------------------------------------------------------------------


@dataclass
class EventResult:
    name: str
    threshold: Optional[float]
    burden_calibration: Optional[float]
    burden_test: float
    recall: float
    recall_by_factor: dict[str, float]
    median_latency_h: Optional[float]
    n_episodes: int
    n_real_alerts_test: int
    hits: int = 0


def detect(alerts: list[int], ep: Episode) -> Optional[int]:
    hit = [a for a in alerts if ep.start <= a < ep.start + ep.dur + MATCH_AFTER]
    return min(hit) - ep.start if hit else None


def evaluate_method(name: str, panel: Panel, stations: list[int], alerts_fn: Callable[[np.ndarray, int, int, int], list[int]], *, seeds: list[int],
                    threshold: Optional[float] = None, burden_calibration: Optional[float] = None) -> EventResult:
    """alerts_fn(series, station_index, lo, hi) -> alert indices in [lo, hi). Burden is measured on the real test series; recall on
    episodes injected into copies of it."""
    lo, hi = panel.period("test")
    n_alerts = 0
    hours = 0
    found: dict[float, list[bool]] = {}
    lat: list[int] = []
    n_ep = 0
    for i in stations:
        x = panel.X[i]
        n_alerts += len(alerts_fn(x, i, lo, hi))
        hours += int(np.isfinite(x[lo:hi]).sum())
        for seed in seeds:
            xi, eps = inject_events(x, np.random.default_rng([seed, i]), lo, hi)
            al = alerts_fn(xi, i, lo, hi)
            for ep in eps:
                d = detect(al, ep)
                found.setdefault(ep.factor, []).append(d is not None)
                n_ep += 1
                if d is not None:
                    lat.append(d)
    allf = [v for vs in found.values() for v in vs]
    return EventResult(name, threshold, burden_calibration, burden(n_alerts, hours), float(np.mean(allf)) if allf else float("nan"),
                       {str(f): float(np.mean(v)) for f, v in sorted(found.items())}, float(np.median(lat)) if lat else None, n_ep, n_alerts, sum(allf))


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95 % Wilson interval for a proportion."""
    if n == 0:
        return float("nan"), float("nan")
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return float(c - h), float(c + h)

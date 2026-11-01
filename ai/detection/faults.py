"""Sensor-fault classification on hourly PM2.5 windows (Phase 4): a Random Forest against tuned hand-written rules.

Training data are real CPCB series with INJECTED faults (see inject.py), so what is measured is recognition of those injected
patterns, not of real sensor failures. Features combine the station's own recent behaviour with its agreement with the other
stations at the same hours (spatial consistency), which is the signal that makes slow drift visible at all.
"""

from __future__ import annotations

import itertools
import warnings
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support

from ai.detection.data import Panel, network_reference
from ai.detection.inject import CLASSES, FaultParams, inject_faults

FEATURES = ["x", "is_sentinel", "is_nan", "frac_sent6", "frac_sent24", "frac_nan6", "frac_nan24", "run_equal", "std6", "std24", "med24",
            "maxdx6", "maxdx24", "jump24", "ratio", "spike_dev", "spike_ratio", "lr", "lr_mean6", "lr_mean24", "lr_slope", "lr_std24",
            "corr24", "ref", "rel_to_ref", "lr_base168", "lr_shift24", "lr_shift6"]


def equal_run(x: np.ndarray) -> np.ndarray:
    """Length of the run of identical consecutive non-negative finite values ending at each hour (0 where the value is missing)."""
    run = np.zeros(len(x))
    for t in range(len(x)):
        if not np.isfinite(x[t]) or x[t] < 0:
            continue
        run[t] = run[t - 1] + 1 if t > 0 and x[t] == x[t - 1] and run[t - 1] > 0 else 1
    return run


def window_features(xf: np.ndarray, ref: np.ndarray) -> pd.DataFrame:
    """Causal features for every hour of one station's observed series `xf` (-1 = no-frame sentinel, NaN = missing) given the
    other stations' median `ref`. Row t uses only hours <= t."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        sent = pd.Series((xf < 0).astype(float))
        miss = pd.Series(np.isnan(xf).astype(float))
        valid = pd.Series(np.where(xf >= 0, xf, np.nan))
        refs = pd.Series(ref)
        f = pd.DataFrame(index=range(len(xf)))
        f["x"] = xf
        f["is_sentinel"] = sent
        f["is_nan"] = miss
        f["frac_sent6"] = sent.rolling(6, min_periods=1).mean()
        f["frac_sent24"] = sent.rolling(24, min_periods=1).mean()
        f["frac_nan6"] = miss.rolling(6, min_periods=1).mean()
        f["frac_nan24"] = miss.rolling(24, min_periods=1).mean()
        f["run_equal"] = equal_run(xf)
        f["std6"] = valid.rolling(6, min_periods=3).std()
        f["std24"] = valid.rolling(24, min_periods=12).std()
        f["med24"] = valid.rolling(24, min_periods=12).median()
        dx = valid.diff().abs()
        f["maxdx6"] = dx.rolling(6, min_periods=2).max()
        f["maxdx24"] = dx.rolling(24, min_periods=6).max()
        f["jump24"] = f["maxdx24"] / (f["med24"] + 10.0)
        f["ratio"] = valid / (f["med24"] + 1.0)
        prev3 = valid.shift(1).rolling(3, min_periods=2).median()
        f["spike_dev"] = valid - prev3
        f["spike_ratio"] = valid / (prev3 + 1.0)
        lr = np.log1p(valid.clip(lower=0)) - np.log1p(refs)
        f["lr"] = lr
        f["lr_mean6"] = lr.rolling(6, min_periods=3).mean()
        f["lr_mean24"] = lr.rolling(24, min_periods=12).mean()
        f["lr_slope"] = f["lr_mean6"] - f["lr_mean6"].shift(18)
        f["lr_std24"] = lr.rolling(24, min_periods=12).std()
        f["corr24"] = valid.rolling(24, min_periods=12).corr(refs)
        f["ref"] = refs
        f["rel_to_ref"] = (valid - refs) / (refs + 10.0)
        # Stations differ from their neighbours by a roughly constant amount for ordinary reasons (distance, local sources). Drift is a
        # CHANGE in that offset, so compare the recent offset with the same station's offset over the week that ended a day earlier.
        f["lr_base168"] = lr.rolling(168, min_periods=72).median().shift(24)
        f["lr_shift24"] = f["lr_mean24"] - f["lr_base168"]
        f["lr_shift6"] = f["lr_mean6"] - f["lr_base168"]
    return f[FEATURES]


# ---- dataset ------------------------------------------------------------------------------------------------------------------


@dataclass
class FaultSet:
    X: pd.DataFrame
    y: np.ndarray
    station: np.ndarray
    hour: np.ndarray      # panel index of the window end


def build_fault_set(panel: Panel, stations: list[int], period: str, params: FaultParams, seeds: list[int], *, max_faults: int = 120,
                    normal_ratio: Optional[float] = None) -> FaultSet:
    """Inject faults into each station over a period (one pass per seed) and collect a labelled row for every eligible hour.
    A row is eligible when the CLEAN series is complete over its previous 24 h, so a natural data gap is never mistaken for a fault.
    `normal_ratio` subsamples normal rows to that multiple of the fault rows (training only); None keeps every row (testing)."""
    lo, hi = panel.period(period)
    xs, ys, st, hr = [], [], [], []
    for i in stations:
        clean = panel.X[i]
        ref = network_reference(panel.X, i)
        ok = np.isfinite(clean)
        complete = pd.Series(ok.astype(float)).rolling(24, min_periods=24).sum().to_numpy() == 24
        for seed in seeds:
            rng = np.random.default_rng([seed, i])
            xf, labels = inject_faults(clean, rng, lo, hi, params, max_faults=max_faults)
            feats = window_features(xf, ref)
            idx = np.arange(len(clean))
            elig = complete & (idx >= lo) & (idx < hi)
            keep = elig.copy()
            if normal_ratio is not None:
                fault_n = int((labels[elig] > 0).sum())
                normals = np.flatnonzero(elig & (labels == 0))
                take = min(len(normals), max(50, int(fault_n * normal_ratio)))
                chosen = rng.choice(normals, size=take, replace=False) if take else np.array([], dtype=int)
                keep = np.zeros_like(elig)
                keep[np.flatnonzero(elig & (labels > 0))] = True
                keep[chosen] = True
            xs.append(feats[keep])
            ys.append(labels[keep])
            st.append(np.full(int(keep.sum()), i))
            hr.append(np.flatnonzero(keep))
    return FaultSet(pd.concat(xs, ignore_index=True), np.concatenate(ys), np.concatenate(st), np.concatenate(hr))


def build_clean_set(panel: Panel, stations: list[int], period: str) -> FaultSet:
    """Every eligible hour of the real, un-injected series (for measuring false fault flags on real data)."""
    lo, hi = panel.period(period)
    xs, st, hr = [], [], []
    for i in stations:
        clean = panel.X[i]
        ref = network_reference(panel.X, i)
        complete = pd.Series(np.isfinite(clean).astype(float)).rolling(24, min_periods=24).sum().to_numpy() == 24
        idx = np.arange(len(clean))
        keep = complete & (idx >= lo) & (idx < hi)
        xs.append(window_features(clean, ref)[keep])
        st.append(np.full(int(keep.sum()), i))
        hr.append(np.flatnonzero(keep))
    X = pd.concat(xs, ignore_index=True)
    return FaultSet(X, np.zeros(len(X), dtype=np.int8), np.concatenate(st), np.concatenate(hr))


# ---- models -------------------------------------------------------------------------------------------------------------------


def fit_forest(fs: FaultSet, *, seed: int = 20261101, n_jobs: int = 4) -> RandomForestClassifier:
    rf = RandomForestClassifier(n_estimators=150, max_depth=14, min_samples_leaf=3, class_weight="balanced_subsample",
                                random_state=seed, n_jobs=n_jobs)
    rf.fit(fs.X.to_numpy(dtype=np.float32), fs.y)
    return rf


@dataclass(frozen=True)
class RuleParams:
    stuck_run: int = 5
    spike_abs: float = 100.0
    spike_ratio: float = 3.0
    drift_lr: float = 0.25


def rules_predict(F: pd.DataFrame, p: RuleParams) -> np.ndarray:
    """Hand-written deterministic fault rules (the baseline the forest has to beat). Later rules override earlier ones."""
    pred = np.zeros(len(F), dtype=np.int8)
    d24, d6 = F["lr_shift24"], F["lr_shift6"]
    pred[((d24.abs() >= p.drift_lr) & (d6.abs() >= p.drift_lr) & (np.sign(d24) == np.sign(d6))).to_numpy()] = 5
    pred[((F["spike_dev"] >= p.spike_abs) & (F["spike_ratio"] >= p.spike_ratio)).to_numpy()] = 2
    pred[(F["run_equal"] >= p.stuck_run).to_numpy()] = 1
    pred[(F["is_nan"] > 0).to_numpy()] = 4
    pred[(F["is_sentinel"] > 0).to_numpy()] = 3
    return pred


def macro_f1(y: np.ndarray, pred: np.ndarray) -> float:
    _, _, f, _ = precision_recall_fscore_support(y, pred, labels=list(range(1, len(CLASSES))), average="macro", zero_division=0)
    return float(f)


def tune_rules(fs: FaultSet) -> RuleParams:
    """Grid search for the rule thresholds with the best macro-F1 over fault classes. Pass a set built at the natural fault rate
    (normal_ratio=None) from the training stations and period, never the test data: that makes false flags on normal hours cost
    what they will cost in use."""
    best, best_f = RuleParams(), -1.0
    for r, sa, sr, dl in itertools.product((3, 4, 5, 6, 8), (50.0, 80.0, 100.0, 150.0), (2.0, 3.0, 4.0), (0.15, 0.2, 0.3, 0.4)):
        p = RuleParams(r, sa, sr, dl)
        f = macro_f1(fs.y, rules_predict(fs.X, p))
        if f > best_f:
            best, best_f = p, f
    return best


def score(y: np.ndarray, pred: np.ndarray) -> dict:
    labels = list(range(len(CLASSES)))
    p, r, f, s = precision_recall_fscore_support(y, pred, labels=labels, zero_division=0)
    return {"per_class": {CLASSES[i]: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(s[i])} for i in labels},
            "macro_f1_faults": macro_f1(y, pred), "confusion": confusion_matrix(y, pred, labels=labels).tolist(),
            "false_flag_rate_on_normal": float(((pred != 0) & (y == 0)).sum() / max(1, (y == 0).sum()))}

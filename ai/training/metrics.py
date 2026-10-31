"""Forecast metrics (point and interval). Pure numpy; NaNs in predictions are scored only where a prediction exists."""

from __future__ import annotations

import numpy as np


def _ok(y: np.ndarray, p: np.ndarray) -> np.ndarray:
    return np.isfinite(y) & np.isfinite(p)


def mae(y: np.ndarray, p: np.ndarray) -> float:
    m = _ok(y, p)
    return float(np.mean(np.abs(y[m] - p[m]))) if m.any() else float("nan")


def rmse(y: np.ndarray, p: np.ndarray) -> float:
    m = _ok(y, p)
    return float(np.sqrt(np.mean((y[m] - p[m]) ** 2))) if m.any() else float("nan")


def bias(y: np.ndarray, p: np.ndarray) -> float:
    m = _ok(y, p)
    return float(np.mean(p[m] - y[m])) if m.any() else float("nan")


def pinball(y: np.ndarray, q: np.ndarray, tau: float) -> float:
    m = _ok(y, q)
    d = y[m] - q[m]
    return float(np.mean(np.maximum(tau * d, (tau - 1) * d))) if m.any() else float("nan")


def coverage(y: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> float:
    m = np.isfinite(y) & np.isfinite(lo) & np.isfinite(hi)
    return float(np.mean((y[m] >= lo[m]) & (y[m] <= hi[m]))) if m.any() else float("nan")


def width(lo: np.ndarray, hi: np.ndarray) -> float:
    m = np.isfinite(lo) & np.isfinite(hi)
    return float(np.mean(hi[m] - lo[m])) if m.any() else float("nan")


def skill(model_err: float, ref_err: float) -> float:
    """1 - model/reference. Positive = better than the reference; 0 = no better; negative = worse."""
    if not np.isfinite(model_err) or not np.isfinite(ref_err) or ref_err == 0:
        return float("nan")
    return 1.0 - model_err / ref_err


def cqr_correction(y: np.ndarray, lo: np.ndarray, hi: np.ndarray, alpha: float) -> float:
    """Conformalised quantile regression (Romano et al. 2019): the finite-sample quantile of the conformity scores
    max(lo - y, y - hi). Widen both ends by this amount (it can be negative: the raw interval was too wide)."""
    m = np.isfinite(y) & np.isfinite(lo) & np.isfinite(hi)
    scores = np.maximum(lo[m] - y[m], y[m] - hi[m])
    n = len(scores)
    if n == 0:
        return 0.0
    level = min(1.0, np.ceil((n + 1) * (1 - alpha)) / n)
    return float(np.quantile(scores, level, method="higher"))

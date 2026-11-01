"""Native TreeSHAP drivers for the deployed LightGBM forecaster (ADR-017: SHAP is required for deployed tree models).

The `shap` package has no aarch64 wheel for the Pi, so this uses LightGBM's built-in TreeSHAP (`pred_contrib=True`), which
computes the same exact Shapley values for tree ensembles. The models predict log1p(PM2.5), so contributions are in
log-space; each is also shown as the approximate multiplicative effect on the forecast (exp(c) - 1).
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np


def drivers(booster: Any, x: np.ndarray, feature_names: list[str], top: int = 5) -> list[dict]:
    """Top contributing features for one row `x` (shape (n_features,)). Contributions plus the bias sum to the raw score."""
    contrib = np.asarray(booster.predict(x.reshape(1, -1), pred_contrib=True))[0]
    bias = float(contrib[-1])
    per = contrib[:-1]
    order = np.argsort(-np.abs(per))[:top]
    return [{"feature": feature_names[i], "value": None if not math.isfinite(float(x[i])) else float(x[i]),
             "contribution_log": float(per[i]), "effect_pct": float(math.expm1(per[i]) * 100.0)} for i in order if per[i] != 0.0] + \
           [{"feature": "(baseline)", "value": None, "contribution_log": bias, "effect_pct": None}]

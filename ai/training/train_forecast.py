"""Forecast models for PM2.5 (Phase 3): LightGBM quantile regression + split-conformal (CQR), plus comparators.

Targets are modelled as log1p(PM2.5): quantiles are invariant to monotone transforms, so q10/q50/q90 come back as exact
quantiles after expm1, and the fit is far better behaved on a right-skewed pollutant. Early stopping uses the last slice of
the TRAINING period (never the calibration or test windows).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import lightgbm as lgb
import numpy as np
import xgboost as xgb
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ai.training.dataset import Matrix
from ai.training.metrics import cqr_correction

QUANTILES = (0.1, 0.5, 0.9)
ALPHA = 0.2  # 80 % central interval
SEED = 20261031
LGB_PARAMS = dict(learning_rate=0.05, num_leaves=31, min_data_in_leaf=200, feature_fraction=0.8, bagging_fraction=0.8,
                  bagging_freq=1, lambda_l2=5.0, verbose=-1, seed=SEED, deterministic=True, force_row_wise=True)
MAX_ROUNDS = 1500
EARLY_STOP = 50
VAL_FRACTION = 0.15  # tail of the training period, by time


def _split_tail(m: Matrix) -> tuple[np.ndarray, np.ndarray]:
    idx = np.argsort(m.t, kind="stable")
    k = int(len(idx) * (1 - VAL_FRACTION))
    return idx[:k], idx[k:]


@dataclass
class QuantileModel:
    horizon: int
    feature_names: list[str]
    boosters: dict[float, lgb.Booster]
    conformal: float = 0.0           # CQR widening in log1p space (can be negative)
    best_iters: dict[float, int] = field(default_factory=dict)

    def predict_log(self, X: np.ndarray) -> dict[float, np.ndarray]:
        return {q: b.predict(X, num_iteration=b.best_iteration or None) for q, b in self.boosters.items()}

    def predict(self, X: np.ndarray, calibrated: bool = True) -> dict[str, np.ndarray]:
        p = self.predict_log(X)
        lo, med, hi = np.sort(np.vstack([p[0.1], p[0.5], p[0.9]]), axis=0)  # undo any quantile crossing
        c = self.conformal if calibrated else 0.0
        return {"q10": np.expm1(lo - c).clip(min=0.0), "q50": np.expm1(med).clip(min=0.0), "q90": np.expm1(hi + c).clip(min=0.0)}


def fit_quantiles(train: Matrix, calibration: Matrix, *, threads: int = 4) -> QuantileModel:
    fit_idx, val_idx = _split_tail(train)
    ytr = np.log1p(train.y)
    cat = [train.feature_names.index("station_code")]
    boosters: dict[float, lgb.Booster] = {}
    iters: dict[float, int] = {}
    for q in QUANTILES:
        params = dict(LGB_PARAMS, objective="quantile", alpha=q, num_threads=threads)
        dtr = lgb.Dataset(train.X[fit_idx], ytr[fit_idx], feature_name=train.feature_names, categorical_feature=cat, free_raw_data=False)
        dva = lgb.Dataset(train.X[val_idx], ytr[val_idx], reference=dtr)
        b = lgb.train(params, dtr, MAX_ROUNDS, valid_sets=[dva], callbacks=[lgb.early_stopping(EARLY_STOP, verbose=False)])
        boosters[q] = b
        iters[q] = b.best_iteration
    model = QuantileModel(train.horizon, train.feature_names, boosters, 0.0, iters)
    if len(calibration.y):
        p = model.predict_log(calibration.X)
        lo, _, hi = np.sort(np.vstack([p[0.1], p[0.5], p[0.9]]), axis=0)
        model.conformal = cqr_correction(np.log1p(calibration.y), lo, hi, ALPHA)
    return model


def fit_xgb_point(train: Matrix, *, threads: int = 4) -> tuple[xgb.XGBRegressor, np.ndarray]:
    fit_idx, val_idx = _split_tail(train)
    ytr = np.log1p(train.y)
    m = xgb.XGBRegressor(n_estimators=MAX_ROUNDS, learning_rate=0.05, max_depth=6, min_child_weight=50, subsample=0.8,
                         colsample_bytree=0.8, reg_lambda=5.0, objective="reg:squarederror", tree_method="hist",
                         early_stopping_rounds=EARLY_STOP, random_state=SEED, n_jobs=threads)
    m.fit(train.X[fit_idx], ytr[fit_idx], eval_set=[(train.X[val_idx], ytr[val_idx])], verbose=False)
    return m, ytr


def fit_ridge(train: Matrix):
    """Linear comparator on the same features (stands in for the repo's online ridge, which needs node data)."""
    pipe = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), Ridge(alpha=10.0))
    pipe.fit(train.X, np.log1p(train.y))
    return pipe


def climatology(train: Matrix, test: Matrix) -> np.ndarray:
    """Mean PM2.5 by (IST hour of the target, month) from the training set: the 'know nothing but the calendar' baseline."""
    hours_tr = ((train.t + train.horizon * 3600 + 19800) // 3600) % 24
    hours_te = ((test.t + test.horizon * 3600 + 19800) // 3600) % 24
    months_tr = np.array([(_month(int(x) + train.horizon * 3600 + 19800)) for x in train.t])
    months_te = np.array([(_month(int(x) + test.horizon * 3600 + 19800)) for x in test.t])
    table: dict[tuple[int, int], float] = {}
    for h in range(24):
        for mo in range(1, 13):
            sel = (hours_tr == h) & (months_tr == mo)
            if sel.any():
                table[(h, mo)] = float(train.y[sel].mean())
    overall = float(train.y.mean())
    return np.array([table.get((int(h), int(mo)), overall) for h, mo in zip(hours_te, months_te)], dtype=np.float32)


def _month(ts: int) -> int:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, timezone.utc).month

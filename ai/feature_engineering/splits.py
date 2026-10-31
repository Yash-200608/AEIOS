"""Chronological splits and walk-forward folds for forecast rows (Phase 2).

Rows are never shuffled. Between two consecutive splits the last `horizon` hours of the earlier one are purged: a row at
origin t has its target at t + h, so without the purge a training target could overlap the calibration window.
"""

from __future__ import annotations

from typing import Iterator, Optional

HOUR = 3600


def chronological_split(rows: list[dict], *, train: float = 0.6, calibration: float = 0.2) -> dict[str, list[dict]]:
    """Split by time order into train / calibration / test (the remainder)."""
    if not 0 < train < 1 or not 0 < calibration < 1 or train + calibration >= 1:
        raise ValueError("train and calibration fractions must be positive and sum to less than 1")
    ordered = sorted(rows, key=lambda r: r["t"])
    if not ordered:
        return {"train": [], "calibration": [], "test": []}
    t0, t1 = ordered[0]["t"], ordered[-1]["t"]
    cut1 = t0 + int((t1 - t0) * train)
    cut2 = t0 + int((t1 - t0) * (train + calibration))
    # A split keeps a row only if its *target* is known by the split's end, which purges the last `horizon` hours of
    # origins from train and calibration (their targets would fall inside the next window).
    return {
        "train": [r for r in ordered if r["target_ts"] <= cut1],
        "calibration": [r for r in ordered if r["t"] >= cut1 and r["target_ts"] <= cut2],
        "test": [r for r in ordered if r["t"] >= cut2],
    }


def walk_forward(rows: list[dict], *, fold_days: int = 30, min_train_days: int = 180) -> Iterator[tuple[list[dict], list[dict]]]:
    """Expanding-window folds: train on everything whose target is known before the fold starts, test on the next
    `fold_days` of origins. Yields (train_rows, test_rows); folds with no test rows are skipped."""
    ordered = sorted(rows, key=lambda r: r["t"])
    if not ordered:
        return
    t0, tend = ordered[0]["t"], ordered[-1]["t"]
    start = t0 + min_train_days * 24 * HOUR
    step = fold_days * 24 * HOUR
    while start <= tend:
        train = [r for r in ordered if r["target_ts"] <= start]
        test = [r for r in ordered if start <= r["t"] < start + step]
        if train and test:
            yield train, test
        start += step

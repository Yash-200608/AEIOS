"""The fixed train / calibration / test windows, shared by the data-quality report and the benchmark (stdlib only).

    train        the target is known on or before TRAIN_END
    calibration  origins in [CALIB_START, CALIB_END] whose target is known by CALIB_END (winter: the hard regime)
    test         origins on or after TEST_START (never touched while fitting)

A row whose target straddles a boundary belongs to no split (purge), so no label leaks across a window edge.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

HOUR = 3600


def _ts(d: str) -> int:
    return int(datetime.fromisoformat(d).replace(tzinfo=timezone.utc).timestamp())


TRAIN_END = _ts("2025-10-01")
CALIB_START = _ts("2025-10-01")
CALIB_END = _ts("2026-01-16")
TEST_START = _ts("2026-01-16")


def split_of(t: int, horizon: int) -> Optional[str]:
    target = t + horizon * HOUR
    if target <= TRAIN_END:
        return "train"
    if t >= TEST_START:
        return "test"
    if t >= CALIB_START and target <= CALIB_END:
        return "calibration"
    return None


def describe() -> dict[str, str]:
    d = lambda x: datetime.fromtimestamp(x, timezone.utc).date().isoformat()  # noqa: E731
    return {"train targets until": d(TRAIN_END), "calibration origins": f"{d(CALIB_START)}..{d(CALIB_END)}",
            "test origins from": d(TEST_START)}

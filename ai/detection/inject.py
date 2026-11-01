"""Seeded injection of pollution episodes and sensor faults into real PM2.5 series (Phase 4).

Both injectors work on a copy of a real series and return exact labels, so detection can be scored. Everything produced here is
SYNTHETIC: it measures how well a detector recognises these injected patterns, not how it behaves on real sensor failures or real
pollution events. The real series themselves also contain unlabelled episodes and glitches.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# ---- pollution episodes -----------------------------------------------------------------------------------------------------


@dataclass
class Episode:
    start: int      # index of the first affected hour
    dur: int        # hours affected
    factor: float   # peak level relative to the local (24 h median) level


def inject_events(x: np.ndarray, rng: np.random.Generator, lo: int, hi: int, *, max_episodes: int = 80, min_gap: int = 72,
                  factors: tuple = (1.5, 2.0, 3.0), durs: tuple = (2, 3, 4, 6, 8), min_abs: float = 35.0) -> tuple[np.ndarray, list[Episode]]:
    """Add rise-plateau-decay episodes to x[lo:hi]. The added amount is max(min_abs, (factor - 1) * level) where level is the median of
    the previous 24 h, so a 3x episode in clean air is still a real, visible rise. Only places where the series is complete over the
    previous 24 h and the episode itself, and at least `min_gap` hours apart."""
    out = x.copy()
    ok = np.isfinite(x)
    cand = [t for t in range(max(lo, 24), hi - max(durs) - 1) if ok[t - 24:t + max(durs)].all()]
    rng.shuffle(cand)
    eps: list[Episode] = []
    taken: list[int] = []
    for t in cand:
        if len(eps) >= max_episodes:
            break
        if any(abs(t - s) < min_gap for s in taken):
            continue
        d = int(rng.choice(durs))
        f = float(rng.choice(factors))
        level = float(np.median(x[t - 24:t]))
        add = max(min_abs, (f - 1.0) * level)
        shape = np.ones(d)
        shape[0] = 0.6
        if d > 2:
            shape[-1] = 0.6
        out[t:t + d] = x[t:t + d] + add * shape
        eps.append(Episode(t, d, f))
        taken.append(t)
    return out, sorted(eps, key=lambda e: e.start)


# ---- sensor faults ------------------------------------------------------------------------------------------------------------

CLASSES = ["normal", "stuck", "spike", "sentinel", "dropout", "drift"]
SENTINEL = -1.0   # what a PMS5003 node reports when it has no frame


@dataclass(frozen=True)
class FaultParams:
    stuck_len: tuple = (4, 48)
    spike_mult: tuple = (4.0, 15.0)
    spike_add: tuple = (150.0, 600.0)
    spike_len: tuple = (1, 2)
    sentinel_len: tuple = (2, 24)
    dropout_len: tuple = (2, 24)
    drift_ramp: tuple = (48, 168)
    drift_hold: tuple = (24, 72)
    drift_gain: tuple = (0.3, 0.8)


TRAIN_PARAMS = FaultParams()
# Test-time faults come from deliberately different, harder ranges (shorter, weaker, slower), so a classifier that only memorised the
# training ranges is exposed.
SHIFTED_PARAMS = FaultParams(stuck_len=(3, 72), spike_mult=(2.5, 25.0), spike_add=(100.0, 900.0), sentinel_len=(1, 36), dropout_len=(1, 36),
                             drift_ramp=(72, 240), drift_hold=(12, 96), drift_gain=(0.25, 0.9))
DRIFT_VISIBLE = 0.2   # a drift counts as "active" once the gain is off by more than this


def _u(rng: np.random.Generator, r: tuple) -> float:
    return float(rng.uniform(r[0], r[1]))


def _i(rng: np.random.Generator, r: tuple) -> int:
    return int(rng.integers(r[0], r[1] + 1))


def inject_faults(x: np.ndarray, rng: np.random.Generator, lo: int, hi: int, params: FaultParams = TRAIN_PARAMS, *, max_faults: int = 120,
                  min_gap: int = 36) -> tuple[np.ndarray, np.ndarray]:
    """Return (faulted copy, per-hour class index). Class 0 = normal. Faults are placed only where the clean series is complete over
    the previous 24 h and over the fault, and are separated by at least `min_gap` hours. Types are drawn uniformly."""
    out = x.copy()
    labels = np.zeros(len(x), dtype=np.int8)
    ok = np.isfinite(x)
    longest = max(params.stuck_len[1], params.sentinel_len[1], params.dropout_len[1], params.drift_ramp[1] + params.drift_hold[1])
    cand = list(range(max(lo, 24), max(lo, hi - longest - 1)))
    rng.shuffle(cand)
    taken: list[tuple[int, int]] = []   # (start, end) with a safety margin already included
    n = 0
    for s in cand:
        if n >= max_faults:
            break
        kind = int(rng.integers(1, len(CLASSES)))
        ramp = 1
        if kind == 1:
            length = _i(rng, params.stuck_len)
        elif kind == 2:
            length = _i(rng, params.spike_len)
        elif kind == 3:
            length = _i(rng, params.sentinel_len)
        elif kind == 4:
            length = _i(rng, params.dropout_len)
        else:
            ramp = _i(rng, params.drift_ramp)
            length = ramp + _i(rng, params.drift_hold)
        if s + length >= hi or not ok[s - 24:s].all():
            continue   # only the previous 24 h must be complete; natural gaps inside the fault stay gaps (see `real` below)
        if any(s < b + min_gap and s + length + min_gap > a for a, b in taken):
            continue
        seg = slice(s, s + length)
        real = np.isfinite(x[seg])      # injected values replace real ones only where a real value existed
        if kind == 1:
            out[seg] = np.where(real, x[s - 1], np.nan)
        elif kind == 2:
            if rng.random() < 0.5:
                out[seg] = x[seg] * _u(rng, params.spike_mult)
            else:
                out[seg] = x[seg] + _u(rng, params.spike_add)
        elif kind == 3:
            out[seg] = np.where(real, SENTINEL, np.nan)
        elif kind == 4:
            out[seg] = np.nan
        else:
            sign = 1.0 if rng.random() < 0.5 else -1.0
            g = _u(rng, params.drift_gain) * sign
            gain = 1.0 + g * np.minimum(1.0, np.arange(1, length + 1) / ramp)
            out[seg] = np.maximum(0.0, x[seg] * gain)
            labels[seg] = np.where(np.abs(gain - 1.0) >= DRIFT_VISIBLE, kind, 0)
            taken.append((s, s + length))
            n += 1
            continue
        labels[seg] = kind
        taken.append((s, s + length))
        n += 1
    return out, labels

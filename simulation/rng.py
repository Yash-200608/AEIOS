from __future__ import annotations

import random


class StreamRng:
    """Deterministic per-stream RNG. Same seed+stream => same draws."""

    def __init__(self, seed: int, stream: int) -> None:
        self._r = random.Random((int(seed) * 1000003) ^ (int(stream) * 9176))

    def random(self) -> float:
        return self._r.random()

    def gauss(self, mu: float, sigma: float) -> float:
        if sigma <= 0:
            return mu
        return self._r.gauss(mu, sigma)

    def uniform(self, a: float, b: float) -> float:
        return self._r.uniform(a, b)

    def chance(self, p: float) -> bool:
        if p <= 0:
            return False
        if p >= 1:
            return True
        return self._r.random() < p

"""Virtual SCD41. Values are a model, not claimed SCD41 field accuracy."""

from __future__ import annotations

from typing import Optional

from simulation.environment.state import EnvState
from simulation.faults.injector import FaultContext
from simulation.rng import StreamRng


class VirtualSCD41:
    def __init__(self, seed: int, stream: int = 21, *, warmup_s: float = 8.0, noise: float = 8.0) -> None:
        self.rng = StreamRng(seed, stream)
        self.warmup_s = warmup_s
        self.noise = noise
        self.t0: Optional[float] = None
        self._last: Optional[dict] = None
        self.drift = 0.0

    def read(self, t: float, env: EnvState, faults: FaultContext) -> Optional[dict]:
        if self.t0 is None:
            self.t0 = t
        if faults.i2c_timeout or faults.sensor_missing:
            return None
        if faults.sensor_stuck and self._last:
            return dict(self._last)
        age = t - self.t0
        warm = age >= self.warmup_s
        self.drift += 0.002
        co2 = env.co2 + self.drift + faults.sensor_drift + faults.sensor_spike * 20 + self.rng.gauss(
            0, self.noise * faults.sensor_noise
        )
        temp = env.temperature + self.rng.gauss(0, 0.15)
        rh = env.humidity + self.rng.gauss(0, 0.8)
        q = 1.0 if warm else 0.25
        out = {
            "co2": max(350.0, co2),
            "temperature": temp,
            "humidity": max(0.0, min(100.0, rh)),
            "quality": q,
            "warming": not warm,
        }
        self._last = out
        return out

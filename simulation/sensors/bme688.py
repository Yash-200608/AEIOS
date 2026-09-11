"""Virtual BME688. Gas feature is not universal ppm (ADR-012)."""

from __future__ import annotations

from typing import Optional

from simulation.environment.state import EnvState
from simulation.faults.injector import FaultContext
from simulation.rng import StreamRng


class VirtualBME688:
    def __init__(self, seed: int, stream: int = 22, *, noise: float = 0.8) -> None:
        self.rng = StreamRng(seed, stream)
        self.noise = noise
        self._last: Optional[dict] = None

    def read(self, t: float, env: EnvState, faults: FaultContext) -> Optional[dict]:
        if faults.i2c_timeout or faults.sensor_missing:
            return None
        if faults.sensor_stuck and self._last:
            return dict(self._last)
        # MOx-like: higher gas_activity => lower resistance feature. Not ppm.
        gas = 80.0 / (0.25 + env.gas_activity) - faults.sensor_drift - faults.sensor_spike
        gas += self.rng.gauss(0, self.noise * faults.sensor_noise)
        gas *= 1.0 - 0.002 * (env.temperature - 25.0)
        gas *= 1.0 + 0.001 * (env.humidity - 50.0)
        out = {
            "temperature": env.temperature + self.rng.gauss(0, 0.12),
            "humidity": env.humidity + self.rng.gauss(0, 0.6),
            "pressure": env.pressure + self.rng.gauss(0, 0.15),
            "bme688_gas_feature": max(1.0, gas),
            "quality": 0.95,
        }
        self._last = out
        return out

"""Virtual MQ135: duty-cycled heater + unitless index. Never ppm (ADR-011)."""

from __future__ import annotations

from typing import Optional

from gateway.contracts import MqHeaterState
from simulation.environment.state import EnvState
from simulation.faults.injector import FaultContext
from simulation.rng import StreamRng


class VirtualMQ135:
    def __init__(
        self,
        seed: int,
        stream: int = 23,
        *,
        warmup_need_s: float = 12.0,
        noise: float = 12.0,
        base_adc: float = 1200.0,
    ) -> None:
        self.rng = StreamRng(seed, stream)
        self.warmup_need_s = warmup_need_s
        self.noise = noise
        self.base_adc = base_adc
        self.heater_state = MqHeaterState.OFF
        self.warmup_s = 0.0
        self._heater_on = False
        self._last: Optional[dict] = None

    def set_heater(self, want_on: bool, t: float) -> None:
        self._heater_on = want_on
        if want_on and self.heater_state in (MqHeaterState.OFF, MqHeaterState.COOLING):
            self.heater_state = MqHeaterState.WARMING
        if not want_on and self.heater_state in (
            MqHeaterState.WARMING,
            MqHeaterState.READY,
            MqHeaterState.MEASURING,
        ):
            self.heater_state = MqHeaterState.COOLING

    def tick(self, t: float, dt: float) -> None:
        if self.heater_state == MqHeaterState.WARMING:
            self.warmup_s += dt
            if self.warmup_s >= self.warmup_need_s:
                self.heater_state = MqHeaterState.READY
        elif self.heater_state in (MqHeaterState.READY, MqHeaterState.MEASURING):
            self.warmup_s += dt
        elif self.heater_state == MqHeaterState.COOLING:
            self.warmup_s = max(0.0, self.warmup_s - dt * 2)
            if self.warmup_s <= 0:
                self.heater_state = MqHeaterState.OFF
        elif self.heater_state == MqHeaterState.OFF:
            self.warmup_s = 0.0

    def read(self, t: float, env: EnvState, faults: FaultContext) -> Optional[dict]:
        if faults.sensor_missing:
            self.heater_state = MqHeaterState.FAULT
            return None
        if self.heater_state == MqHeaterState.FAULT:
            return None
        if faults.sensor_stuck and self._last:
            return dict(self._last)

        ready = self.heater_state in (MqHeaterState.READY, MqHeaterState.MEASURING)
        if ready:
            self.heater_state = MqHeaterState.MEASURING
        if ready:
            raw = self.base_adc + 900.0 * env.gas_activity + faults.sensor_spike * 40
            raw += faults.sensor_drift + self.rng.gauss(0, self.noise * faults.sensor_noise)
        else:
            raw = self.base_adc * 0.4 + self.rng.gauss(0, 6)
        raw = max(0.0, min(4095.0, raw))
        index = max(0.0, (raw - self.base_adc * 0.5) / 20.0) if ready else 0.0
        if self.heater_state in (MqHeaterState.OFF, MqHeaterState.COOLING):
            q = 0.12
        elif self.heater_state == MqHeaterState.WARMING:
            q = 0.35
        else:
            q = 0.9 if self.warmup_s >= self.warmup_need_s else 0.45
        out = {
            "mq135_raw": raw,
            "mq135_index": index,
            "heater_state": self.heater_state.value,
            "warmup_s": self.warmup_s,
            "quality": q,
            "energy_cost_j": (140.0 / 1000.0) if self._heater_on else 0.0,
        }
        self._last = out
        return out

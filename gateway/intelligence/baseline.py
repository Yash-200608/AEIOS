"""EWMA baselines that pause during confirmed events (CF04 §7)."""

from __future__ import annotations

from dataclasses import dataclass, field

from gateway.contracts import Observation


@dataclass
class _NodeBase:
    pm25: float = 12.0
    pm10: float = 20.0
    pm1: float = 8.0
    co2: float = 420.0
    temperature: float = 25.0
    humidity: float = 50.0
    pressure: float = 1013.25
    bme688_gas_feature: float = 50.0
    mq135_index: float = 5.0
    primed: bool = False


class BaselineBank:
    def __init__(self, alpha: float = 0.08) -> None:
        self.alpha = alpha
        self._nodes: dict[int, _NodeBase] = {}
        self._mq_ready: dict[int, bool] = {}

    def mq_primed(self, wire_id: int) -> bool:
        return bool(self._mq_ready.get(wire_id))

    def snapshot(self, wire_id: int) -> dict[str, float]:
        b = self._nodes.setdefault(wire_id, _NodeBase())
        return {
            "pm25": b.pm25,
            "pm10": b.pm10,
            "pm1": b.pm1,
            "co2": b.co2,
            "temperature": b.temperature,
            "humidity": b.humidity,
            "pressure": b.pressure,
            "bme688_gas_feature": b.bme688_gas_feature,
            "mq135_index": b.mq135_index,
        }

    def update(self, obs: Observation, *, freeze: bool) -> None:
        b = self._nodes.setdefault(obs.wire_id, _NodeBase())
        if freeze:
            if obs.mq135_index is not None and (obs.quality.mq135 or 0.0) >= 0.7 and not self._mq_ready.get(obs.wire_id):
                b.mq135_index = obs.mq135_index
                self._mq_ready[obs.wire_id] = True
            return
        a = 1.0 if not b.primed else self.alpha

        def step(cur: float, val: float | None) -> float:
            if val is None:
                return cur
            return (1 - a) * cur + a * val

        b.pm25 = step(b.pm25, obs.pm25)
        b.pm10 = step(b.pm10, obs.pm10)
        b.pm1 = step(b.pm1, obs.pm1)
        b.co2 = step(b.co2, obs.co2)
        b.temperature = step(b.temperature, obs.temperature)
        b.humidity = step(b.humidity, obs.humidity)
        b.pressure = step(b.pressure, obs.pressure)
        b.bme688_gas_feature = step(b.bme688_gas_feature, obs.bme688_gas_feature)
        if obs.mq135_index is not None and (obs.quality.mq135 or 0.0) >= 0.7:
            if not self._mq_ready.get(obs.wire_id):
                b.mq135_index = obs.mq135_index
                self._mq_ready[obs.wire_id] = True
            else:
                b.mq135_index = step(b.mq135_index, obs.mq135_index)
        b.primed = True

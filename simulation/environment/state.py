"""Deterministic environmental field (time + space). Not a climate model."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from simulation.rng import StreamRng


@dataclass
class EnvState:
    pm1: float
    pm25: float
    pm10: float
    co2: float
    temperature: float
    humidity: float
    pressure: float
    gas_activity: float
    time: float
    event_state: str


@dataclass
class Plume:
    kind: str  # particulate | gas | co2 | multimodal
    origin: tuple[float, float]
    start: float
    end: float
    severity: float
    speed_m_s: float = 5.0
    attack_s: float = 8.0
    decay_s: float = 12.0


@dataclass
class Environment:
    seed: int
    baseline: dict[str, float] = field(
        default_factory=lambda: {
            "pm1": 8.0,
            "pm25": 12.0,
            "pm10": 20.0,
            "co2": 420.0,
            "temperature": 25.0,
            "humidity": 50.0,
            "pressure": 1013.25,
            "gas_activity": 0.12,
        }
    )
    plumes: list[Plume] = field(default_factory=list)
    diurnal: bool = True

    def __post_init__(self) -> None:
        self._rng = StreamRng(self.seed, 1)

    def at(self, t: float, x: float, y: float) -> EnvState:
        b = self.baseline
        # Slow temporal evolution (not independent draws).
        wave = 0.15 * _sin01(t / 600.0)
        temp = b["temperature"] + 2.0 * _sin01(t / 86400.0) if self.diurnal else b["temperature"]
        temp += 0.05 * wave
        hum = b["humidity"] - 0.4 * (temp - b["temperature"])
        pressure = b["pressure"] + 0.3 * _sin01(t / 1800.0)
        pm25 = b["pm25"] + 0.8 * wave
        pm10 = b["pm10"] + 1.1 * wave
        pm1 = b["pm1"] + 0.5 * wave
        co2 = b["co2"] + 8.0 * wave
        gas = b["gas_activity"] + 0.01 * wave
        labels = []

        for p in self.plumes:
            dist = ((x - p.origin[0]) ** 2 + (y - p.origin[1]) ** 2) ** 0.5
            delay = dist / max(0.1, p.speed_m_s)
            env = _envelope(t, p.start + delay, p.end + delay, p.attack_s, p.decay_s)
            if env <= 0:
                continue
            mag = p.severity * env
            if p.kind in ("particulate", "multimodal"):
                pm25 += 70.0 * mag
                pm10 += 95.0 * mag
                pm1 += 45.0 * mag
                labels.append("particulate")
            if p.kind in ("gas", "multimodal"):
                gas += 0.85 * mag
                labels.append("gas")
            if p.kind in ("co2", "multimodal"):
                co2 += 550.0 * mag
                labels.append("co2")
            if p.kind == "multimodal":
                temp += 0.4 * mag

        event_state = ",".join(labels) if labels else "normal"
        return EnvState(
            pm1=max(0.0, pm1),
            pm25=max(0.0, pm25),
            pm10=max(0.0, pm10),
            co2=max(350.0, co2),
            temperature=temp,
            humidity=max(5.0, min(95.0, hum)),
            pressure=pressure,
            gas_activity=max(0.0, min(2.0, gas)),
            time=t,
            event_state=event_state,
        )


def _sin01(x: float) -> float:
    import math

    return math.sin(2.0 * math.pi * x)


def _envelope(t: float, start: float, end: float, attack: float, decay: float) -> float:
    if t < start:
        return 0.0
    if t < start + attack:
        return (t - start) / max(1e-6, attack)
    if t <= end:
        return 1.0
    if t < end + decay:
        return max(0.0, 1.0 - (t - end) / max(1e-6, decay))
    return 0.0

"""Sensor driver protocols — swap Virtual* for Real* without changing gateway."""

from __future__ import annotations

from typing import Optional, Protocol

from gateway.pms import PmsReading
from simulation.environment.state import EnvState
from simulation.faults.injector import FaultContext


class ParticleSensor(Protocol):
    def read(self, t: float, env: EnvState, faults: FaultContext) -> tuple[Optional[PmsReading], Optional[bytes]]:
        """Return (normalized reading, raw UART frame). Frame may be None on timeout."""


class Scd41Sensor(Protocol):
    def read(self, t: float, env: EnvState, faults: FaultContext) -> Optional[dict]:
        ...


class Bme688Sensor(Protocol):
    def read(self, t: float, env: EnvState, faults: FaultContext) -> Optional[dict]:
        ...


class Mq135Sensor(Protocol):
    heater_state: str
    warmup_s: float

    def set_heater(self, want_on: bool, t: float) -> None: ...

    def read(self, t: float, env: EnvState, faults: FaultContext) -> Optional[dict]:
        ...

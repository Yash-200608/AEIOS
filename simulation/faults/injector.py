"""Fault context passed into virtual sensors / radio / gateway."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FaultContext:
    sensor_missing: bool = False
    sensor_stuck: bool = False
    sensor_noise: float = 1.0
    sensor_drift: float = 0.0
    sensor_spike: float = 0.0
    checksum_failure: bool = False
    uart_timeout: bool = False
    i2c_timeout: bool = False
    radio_loss: bool = False
    packet_duplicate: bool = False
    packet_corruption: bool = False
    battery_low: bool = False
    gateway_restart: bool = False
    database_failure: bool = False


@dataclass
class FaultSpec:
    kind: str
    start: float
    end: float
    node: str | None = None  # display_id or None = all
    sensor: str | None = None
    magnitude: float = 1.0


class FaultInjector:
    def __init__(self, specs: list[FaultSpec]) -> None:
        self.specs = list(specs)

    def active(self, t: float, display_id: str, sensor: str | None = None) -> FaultContext:
        ctx = FaultContext()
        for s in self.specs:
            if t < s.start or t > s.end:
                continue
            if s.node is not None and s.node != display_id:
                continue
            if s.sensor is not None and sensor is not None and s.sensor != sensor:
                continue
            k = s.kind
            if k == "sensor_missing":
                ctx.sensor_missing = True
            elif k == "sensor_stuck":
                ctx.sensor_stuck = True
            elif k == "sensor_noise":
                ctx.sensor_noise = 1.0 + 4.0 * s.magnitude
            elif k == "sensor_drift":
                ctx.sensor_drift += s.magnitude * (t - s.start)
            elif k == "sensor_spike":
                ctx.sensor_spike += 25.0 * s.magnitude
            elif k == "checksum_failure":
                ctx.checksum_failure = True
            elif k == "uart_timeout":
                ctx.uart_timeout = True
            elif k == "i2c_timeout":
                ctx.i2c_timeout = True
            elif k == "radio_loss":
                ctx.radio_loss = True
            elif k == "packet_duplicate":
                ctx.packet_duplicate = True
            elif k == "packet_corruption":
                ctx.packet_corruption = True
            elif k == "battery_low":
                ctx.battery_low = True
            elif k == "gateway_restart":
                ctx.gateway_restart = True
            elif k == "database_failure":
                ctx.database_failure = True
        return ctx

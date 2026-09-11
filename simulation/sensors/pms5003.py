"""Virtual PMS5003: environment → UART bytes → production parser."""

from __future__ import annotations

from typing import Optional

from gateway.pms import PmsParseError, PmsReading, corrupt_checksum, encode_frame, parse_frame
from simulation.environment.state import EnvState
from simulation.faults.injector import FaultContext
from simulation.rng import StreamRng


class VirtualPMS5003:
    def __init__(self, seed: int, stream: int = 20, *, noise: float = 0.6, bias: float = 0.0) -> None:
        self.rng = StreamRng(seed, stream)
        self.noise = noise
        self.bias = bias
        self._last: Optional[PmsReading] = None
        self._stale = False

    def modeled(self, env: EnvState, faults: FaultContext) -> PmsReading:
        n = self.noise * faults.sensor_noise
        pm25 = env.pm25 + self.bias + faults.sensor_drift + faults.sensor_spike + self.rng.gauss(0, n)
        pm10 = max(pm25, env.pm10 + self.bias + 0.8 * faults.sensor_drift + self.rng.gauss(0, n * 1.2))
        pm1 = min(pm25, env.pm1 + 0.5 * self.bias + self.rng.gauss(0, n * 0.8))
        pm25 = max(0.0, pm25)
        n0p3 = 300 + 40 * pm25 + self.rng.gauss(0, 8)
        reading = PmsReading(
            pm1=pm1,
            pm25=pm25,
            pm10=pm10,
            pm1_cf1=pm1 * 1.05,
            pm25_cf1=pm25 * 1.05,
            pm10_cf1=pm10 * 1.05,
            n0p3=max(0.0, n0p3),
            n0p5=max(0.0, n0p3 * 0.55),
            n1p0=max(0.0, n0p3 * 0.25),
            n2p5=max(0.0, n0p3 * 0.08),
            n5p0=max(0.0, n0p3 * 0.03),
            n10=max(0.0, n0p3 * 0.01),
        )
        return reading

    def read(self, t: float, env: EnvState, faults: FaultContext) -> tuple[Optional[PmsReading], Optional[bytes]]:
        if faults.uart_timeout or faults.sensor_missing:
            return None, None
        if faults.sensor_stuck and self._last is not None:
            frame = encode_frame(self._last)
            err, parsed = parse_frame(frame)
            return (parsed if err == PmsParseError.OK else None), frame

        modeled = self.modeled(env, faults)
        frame = encode_frame(modeled)
        if faults.checksum_failure:
            frame = corrupt_checksum(frame)
        err, parsed = parse_frame(frame)
        if err != PmsParseError.OK:
            return None, frame
        self._last = parsed
        return parsed, frame

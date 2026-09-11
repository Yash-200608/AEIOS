"""Replaceable on-node adaptive policies (ADR-017). Deterministic, no TinyML."""

from __future__ import annotations

from dataclasses import dataclass

from gateway.amp import MODE_CODES
from gateway.contracts import OperatingMode

TRIGGER_BOOT = 0
TRIGGER_FIXED = 1
TRIGGER_BATTERY = 2
TRIGGER_THRESHOLD = 3
TRIGGER_CROSS_MODAL = 4
TRIGGER_VOI = 5
TRIGGER_MQ_ON = 6
TRIGGER_MQ_OFF = 7
TRIGGER_FAULT = 8

INTERVAL = {
    OperatingMode.NORMAL: 8.0,
    OperatingMode.WATCH: 5.0,
    OperatingMode.EVENT_CONFIRMATION: 3.0,
    OperatingMode.HIGH_RESOLUTION: 2.0,
    OperatingMode.LOW_BATTERY: 20.0,
    OperatingMode.DEGRADED: 8.0,
    OperatingMode.SAFE: 30.0,
}

SENSOR_NONE = 0
SENSOR_PMS = 1
SENSOR_SCD = 2
SENSOR_BME = 3
SENSOR_MQ = 4
SENSOR_ALL = 5


@dataclass
class PolicyInput:
    pm25: float | None
    co2: float | None
    mq_index: float | None
    bme_gas: float | None
    soc: float
    pms_ok: bool
    scd_ok: bool
    bme_ok: bool
    mq_ok: bool
    mq_heater_on: bool


@dataclass
class PolicyOutput:
    mode: OperatingMode
    interval_s: float
    mq_heater: bool
    trigger: int
    confidence: float
    expected_information_gain: float
    estimated_energy_cost: float
    selected_sensor: int


class Policy:
    name = "BASE"

    def decide(self, inp: PolicyInput, current: OperatingMode) -> PolicyOutput:
        raise NotImplementedError


class FixedRatePolicy(Policy):
    name = "FIXED_RATE"

    def decide(self, inp: PolicyInput, current: OperatingMode) -> PolicyOutput:
        return PolicyOutput(
            mode=OperatingMode.NORMAL,
            interval_s=INTERVAL[OperatingMode.NORMAL],
            mq_heater=True,
            trigger=TRIGGER_FIXED,
            confidence=0.5,
            expected_information_gain=0.2,
            estimated_energy_cost=0.25,
            selected_sensor=SENSOR_ALL,
        )


class BatteryAwarePolicy(Policy):
    name = "BATTERY_AWARE"

    def decide(self, inp: PolicyInput, current: OperatingMode) -> PolicyOutput:
        if inp.soc < 0.12:
            mode = OperatingMode.SAFE
            heater = False
            trig = TRIGGER_BATTERY
            eig = 0.05
        elif inp.soc < 0.25:
            mode = OperatingMode.LOW_BATTERY
            heater = False
            trig = TRIGGER_BATTERY
            eig = 0.1
        else:
            mode = OperatingMode.NORMAL
            heater = True
            trig = TRIGGER_FIXED
            eig = 0.2
        return PolicyOutput(
            mode=mode,
            interval_s=INTERVAL[mode],
            mq_heater=heater,
            trigger=trig,
            confidence=0.6,
            expected_information_gain=eig,
            estimated_energy_cost=0.35 if heater else 0.08,
            selected_sensor=SENSOR_PMS if not heater else SENSOR_ALL,
        )


class ThresholdAdaptivePolicy(Policy):
    name = "THRESHOLD_ADAPTIVE"

    def decide(self, inp: PolicyInput, current: OperatingMode) -> PolicyOutput:
        pm = inp.pm25 or 0.0
        co2 = inp.co2 or 0.0
        mq = inp.mq_index or 0.0
        hot = pm > 35.0 or co2 > 700.0 or mq > 22.0
        mode = OperatingMode.EVENT_CONFIRMATION if hot else OperatingMode.NORMAL
        return PolicyOutput(
            mode=mode,
            interval_s=INTERVAL[mode],
            mq_heater=True,
            trigger=TRIGGER_THRESHOLD if hot else TRIGGER_FIXED,
            confidence=0.7 if hot else 0.4,
            expected_information_gain=0.65 if hot else 0.15,
            estimated_energy_cost=0.28,
            selected_sensor=SENSOR_PMS if pm > 35 else SENSOR_ALL,
        )


class CrossModalAdaptivePolicy(Policy):
    name = "CROSS_MODAL_ADAPTIVE"

    def decide(self, inp: PolicyInput, current: OperatingMode) -> PolicyOutput:
        flags = [
            bool(inp.pms_ok and inp.pm25 is not None and inp.pm25 > 30),
            bool(inp.scd_ok and inp.co2 is not None and inp.co2 > 650),
            bool(inp.bme_ok and inp.bme_gas is not None and inp.bme_gas < 90),
            bool(inp.mq_ok and inp.mq_index is not None and inp.mq_index > 20),
        ]
        n = sum(flags)
        if n >= 2:
            mode = OperatingMode.HIGH_RESOLUTION
            trig = TRIGGER_CROSS_MODAL
            eig = 0.8
        elif n == 1:
            mode = OperatingMode.WATCH
            trig = TRIGGER_CROSS_MODAL
            eig = 0.45
        else:
            mode = OperatingMode.NORMAL
            trig = TRIGGER_FIXED
            eig = 0.15
        heater = n >= 1
        return PolicyOutput(
            mode=mode,
            interval_s=INTERVAL[mode],
            mq_heater=heater,
            trigger=trig,
            confidence=min(1.0, 0.3 + 0.25 * n),
            expected_information_gain=eig,
            estimated_energy_cost=0.3 if heater else 0.12,
            selected_sensor=SENSOR_MQ if heater and n == 1 else SENSOR_ALL,
        )


class InformationEnergyPolicy(Policy):
    name = "INFORMATION_ENERGY"

    def decide(self, inp: PolicyInput, current: OperatingMode) -> PolicyOutput:
        bme_shift = inp.bme_gas is not None and inp.bme_gas < 90
        pm_shift = inp.pm25 is not None and inp.pm25 > 30
        eig_mq = 0.75 if bme_shift and not inp.mq_heater_on else (0.4 if pm_shift else 0.08)
        energy = 0.18
        score = eig_mq / max(1e-6, energy)
        heater = score > 2.0 and inp.soc > 0.2
        if inp.soc < 0.15:
            mode = OperatingMode.LOW_BATTERY
            heater = False
            trig = TRIGGER_BATTERY
        elif heater:
            mode = OperatingMode.EVENT_CONFIRMATION
            trig = TRIGGER_VOI
        else:
            mode = OperatingMode.NORMAL
            trig = TRIGGER_MQ_OFF if not heater else TRIGGER_FIXED
        return PolicyOutput(
            mode=mode,
            interval_s=INTERVAL[mode],
            mq_heater=heater,
            trigger=trig,
            confidence=min(1.0, score / 6.0),
            expected_information_gain=eig_mq,
            estimated_energy_cost=energy if heater else 0.07,
            selected_sensor=SENSOR_MQ if heater else SENSOR_PMS,
        )


POLICIES = {
    "FIXED_RATE": FixedRatePolicy,
    "BATTERY_AWARE": BatteryAwarePolicy,
    "THRESHOLD_ADAPTIVE": ThresholdAdaptivePolicy,
    "CROSS_MODAL_ADAPTIVE": CrossModalAdaptivePolicy,
    "INFORMATION_ENERGY": InformationEnergyPolicy,
}


def get_policy(name: str) -> Policy:
    key = name.upper().replace("-", "_")
    if key not in POLICIES:
        raise ValueError(f"unknown policy {name}; choose from {sorted(POLICIES)}")
    return POLICIES[key]()


def mode_code(mode: OperatingMode) -> int:
    return MODE_CODES[mode.value]

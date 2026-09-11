"""Sensor quality engine (CF04 §9). Quality ≠ event confidence."""

from __future__ import annotations

from gateway.contracts import (
    FLAG_BATT_LOW,
    FLAG_BME_FAULT,
    FLAG_PM_FAULT,
    FLAG_SAMPLE_INVALID,
    FLAG_SCD_FAULT,
    MqHeaterState,
    Observation,
    SensorQuality,
)


class QualityEngine:
    def assess(self, obs: Observation) -> SensorQuality:
        flags: list[str] = []
        pms = 1.0
        scd = 1.0
        bme = 1.0
        mq = 1.0

        if obs.quality_flags & FLAG_PM_FAULT or obs.pm25 is None:
            pms = 0.0
            flags.append("PMS_FAULT_OR_MISSING")
        elif obs.pm25 is not None and (obs.pm25 < 0 or obs.pm25 > 1000):
            pms = 0.2
            flags.append("PMS_RANGE")

        if obs.quality_flags & FLAG_SCD_FAULT or obs.co2 is None:
            scd = 0.0
            flags.append("SCD41_FAULT_OR_MISSING")
        elif obs.co2 is not None and (obs.co2 < 350 or obs.co2 > 10000):
            scd = 0.35
            flags.append("SCD41_RANGE")

        if obs.quality_flags & FLAG_BME_FAULT or obs.bme688_gas_feature is None:
            bme = 0.0
            flags.append("BME688_FAULT_OR_MISSING")

        heater = obs.mq_heater_state
        if heater == MqHeaterState.FAULT or not obs.mq_present:
            mq = 0.0
            flags.append("MQ135_FAULT_OR_MISSING")
        elif heater in (MqHeaterState.OFF, MqHeaterState.COOLING):
            mq = 0.15
            flags.append("MQ135_HEATER_OFF")
        elif heater == MqHeaterState.WARMING:
            mq = 0.35
            flags.append("HEATER_RECENTLY_ACTIVATED")
        elif obs.mq_warmup_s < 12:
            mq = min(mq, 0.45)
            flags.append("MQ135_WARMUP")

        if obs.quality_flags & FLAG_BATT_LOW:
            flags.append("BATTERY_LOW")
        if obs.quality_flags & FLAG_SAMPLE_INVALID:
            flags.append("SAMPLE_INVALIDATED")
            pms *= 0.4
            scd *= 0.4
            bme *= 0.4
            mq *= 0.4

        # Respect caller-supplied quality floors (virtual sensor already applied faults).
        pms = min(pms, obs.quality.pms)
        scd = min(scd, obs.quality.scd41)
        bme = min(bme, obs.quality.bme688)
        mq = min(mq, obs.quality.mq135)

        return SensorQuality(
            pms=max(0.0, min(1.0, pms)),
            scd41=max(0.0, min(1.0, scd)),
            bme688=max(0.0, min(1.0, bme)),
            mq135=max(0.0, min(1.0, mq)),
            flags=flags + list(obs.quality.flags),
        )

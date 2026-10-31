"""Sensor quality engine (CF04 §9). Quality ≠ event confidence."""

from __future__ import annotations

from typing import Optional

from gateway.contracts import (
    SENSOR_BME688,
    SENSOR_MQ135,
    SENSOR_PMS,
    SENSOR_SCD41,
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
        fitted = obs.installed_sensors
        # None = sensor not fitted on this node: no score, no fault flag, no sensor_states row.
        pms: Optional[float] = 1.0 if SENSOR_PMS in fitted else None
        scd: Optional[float] = 1.0 if SENSOR_SCD41 in fitted else None
        bme: Optional[float] = 1.0 if SENSOR_BME688 in fitted else None
        mq: Optional[float] = 1.0 if SENSOR_MQ135 in fitted else None

        if pms is not None:
            if obs.quality_flags & FLAG_PM_FAULT or obs.pm25 is None:
                pms = 0.0
                flags.append("PMS_FAULT_OR_MISSING")
            elif obs.pm25 is not None and (obs.pm25 < 0 or obs.pm25 > 1000):
                pms = 0.2
                flags.append("PMS_RANGE")

        if scd is not None:
            if obs.quality_flags & FLAG_SCD_FAULT or obs.co2 is None:
                scd = 0.0
                flags.append("SCD41_FAULT_OR_MISSING")
            elif obs.co2 is not None and (obs.co2 < 350 or obs.co2 > 10000):
                scd = 0.35
                flags.append("SCD41_RANGE")

        if bme is not None and (obs.quality_flags & FLAG_BME_FAULT or obs.bme688_gas_feature is None):
            bme = 0.0
            flags.append("BME688_FAULT_OR_MISSING")

        heater = obs.mq_heater_state
        if mq is not None:
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
            pms = None if pms is None else pms * 0.4
            scd = None if scd is None else scd * 0.4
            bme = None if bme is None else bme * 0.4
            mq = None if mq is None else mq * 0.4

        # Respect caller-supplied quality floors (virtual sensor already applied faults).
        def floor(score: Optional[float], supplied: Optional[float]) -> Optional[float]:
            if score is None:
                return None
            if supplied is not None:
                score = min(score, supplied)
            return max(0.0, min(1.0, score))

        return SensorQuality(
            pms=floor(pms, obs.quality.pms),
            scd41=floor(scd, obs.quality.scd41),
            bme688=floor(bme, obs.quality.bme688),
            mq135=floor(mq, obs.quality.mq135),
            flags=flags + list(obs.quality.flags),
        )

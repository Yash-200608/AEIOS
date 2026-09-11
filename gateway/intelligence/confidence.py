"""Transparent, replaceable confidence composition (CF04 §10–17).

sensor_quality stays separate from environment_event_confidence,
sensor_fault_confidence, and uncertain_confidence.
"""

from __future__ import annotations

from dataclasses import dataclass

from gateway.contracts import SensorQuality
from gateway.intelligence.features import FeatureVector


@dataclass
class ConfidenceBreakdown:
    sensor_quality: float
    environment_event_confidence: float
    sensor_fault_confidence: float
    uncertain_confidence: float
    event_confidence: float
    agreement: float
    disagreement: float
    missing: float
    reason: str


class ConfidenceEngine:
    """Weighted evidence aggregator. Replace this class without touching ingest."""

    def combine(
        self,
        quality: SensorQuality,
        features: FeatureVector,
        *,
        pm_high: bool,
        co2_high: bool,
        bme_high: bool,
        mq_high: bool,
        persist: bool,
    ) -> ConfidenceBreakdown:
        q = quality.combined()
        flags = [pm_high, co2_high, bme_high, mq_high]
        n_high = sum(1 for x in flags if x)
        present = sum(
            1
            for val, ok in (
                (features.pm25, quality.pms > 0.3),
                (features.co2, quality.scd41 > 0.3),
                (features.bme_gas, quality.bme688 > 0.3),
                (features.mq_index, quality.mq135 > 0.3),
            )
            if val is not None and ok
        )
        missing = max(0.0, 1.0 - present / 4.0)
        agreement = n_high / 4.0
        disagreement = 0.0
        if n_high == 1:
            disagreement = 0.85
        elif n_high == 2:
            disagreement = 0.35

        env = 0.0
        fault = 0.0
        if n_high >= 3 and persist:
            env = min(1.0, 0.35 * n_high + 0.2 * q + 0.15)
            fault = 0.05
            reason = "cross-modal persistent rise"
        elif n_high == 2 and persist and not (mq_high and not bme_high and not pm_high and not co2_high):
            env = min(1.0, 0.28 * n_high + 0.25 * q)
            fault = 0.12
            reason = "two-modality agreement"
        elif n_high == 1 and persist:
            if mq_high and quality.mq135 < 0.7:
                env = 0.12
                fault = 0.72
                reason = "single-sensor MQ135 spike"
            elif mq_high:
                env = 0.18
                fault = 0.62
                reason = "MQ135-only anomaly candidate"
            else:
                env = 0.45 if pm_high or co2_high else 0.22
                fault = 0.28
                reason = "unimodal persistent deviation"
        else:
            env = 0.05 * n_high
            fault = 0.08 * n_high
            reason = "insufficient persistence or agreement"

        env = max(0.0, min(1.0, env * (0.6 + 0.4 * q)))
        fault = max(0.0, min(1.0, fault))
        remain = max(0.0, 1.0 - env - fault)
        uncertain = min(1.0, remain * (0.4 + missing))
        # Keep a proper 3-way distribution (not one opaque score).
        total = env + fault + uncertain
        if total <= 0:
            env, fault, uncertain = 0.05, 0.05, 0.90
            total = 1.0
        env, fault, uncertain = env / total, fault / total, uncertain / total
        event = env  # replaceable: event_confidence currently tracks environment class

        return ConfidenceBreakdown(
            sensor_quality=q,
            environment_event_confidence=env,
            sensor_fault_confidence=fault,
            uncertain_confidence=uncertain,
            event_confidence=event,
            agreement=agreement,
            disagreement=disagreement,
            missing=missing,
            reason=reason,
        )

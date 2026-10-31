"""SIMULATION RESULT metrics: ground truth vs AEIOS output. Not field accuracy."""

from __future__ import annotations

from dataclasses import dataclass, field

from simulation.scenarios.catalog import GroundTruthEvent

COMPAT = {
    "PARTICULATE_EVENT": {"PARTICULATE_EVENT", "MULTIMODAL_ENVIRONMENTAL_EVENT"},
    "GAS_RESPONSE_EVENT": {"GAS_RESPONSE_EVENT", "MULTIMODAL_ENVIRONMENTAL_EVENT"},
    "CO2_EVENT": {"CO2_EVENT", "MULTIMODAL_ENVIRONMENTAL_EVENT"},
    "MULTIMODAL_ENVIRONMENTAL_EVENT": {
        "MULTIMODAL_ENVIRONMENTAL_EVENT",
        "PARTICULATE_EVENT",
        "GAS_RESPONSE_EVENT",
        "CO2_EVENT",
    },
    "SENSOR_ANOMALY": {"SENSOR_ANOMALY"},
    "SENSOR_FAULT": {"SENSOR_ANOMALY"},
    "REGIONAL_EVENT": {"REGIONAL_EVENT"},
    "LOW_POWER_EVENT": {"LOW_POWER_EVENT"},
    "COMMUNICATION_EVENT": {"COMMUNICATION_EVENT"},
    "MISSING_NODE": set(),
    "GATEWAY_RESTART": set(),
}


@dataclass
class EvalResult:
    label: str = "SIMULATION RESULT"
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    # Deprecated alias: this has always been FP / (TP + FP), i.e. the false discovery rate, not a true
    # false-positive rate (FP / negatives). Kept so existing callers keep working; use the two fields below.
    false_positive_rate: float = 0.0
    false_discovery_rate: float = 0.0
    false_alerts_per_day: float | None = None
    detection_latency_s: float | None = None
    matched: int = 0
    false_positives: int = 0
    false_negatives: int = 0
    details: list[dict] = field(default_factory=list)


def evaluate(
    ground_truth: list[GroundTruthEvent],
    detected: list[dict],
    *,
    match_window_s: float = 40.0,
    duration_s: float | None = None,
) -> EvalResult:
    """Compare GT environment/sensor events to detector output.

    Operational GT (missing node, restart, radio) is scored separately by tests.
    """
    scored = [
        g
        for g in ground_truth
        if g.event_type
        in (
            "PARTICULATE_EVENT",
            "GAS_RESPONSE_EVENT",
            "CO2_EVENT",
            "MULTIMODAL_ENVIRONMENTAL_EVENT",
            "SENSOR_ANOMALY",
            "REGIONAL_EVENT",
        )
    ]
    used = set()
    matches = []
    for g in scored:
        allowed = COMPAT.get(g.event_type, {g.event_type})
        best = None
        best_dt = 1e9
        for i, d in enumerate(detected):
            if i in used:
                continue
            if d.get("event_type") not in allowed:
                continue
            dt = float(d["started_at"]) - g.start_time
            if dt < -match_window_s:
                continue
            if d.get("ended_at") is not None and d["ended_at"] < g.start_time:
                continue
            if abs(dt) < best_dt:
                best_dt = abs(dt)
                best = i
        if best is None:
            continue
        used.add(best)
        matches.append(best_dt if detected[best]["started_at"] >= g.start_time else 0.0)
        for i, d in enumerate(detected):
            if i in used:
                continue
            if d.get("event_type") not in allowed and d.get("event_type") != "REGIONAL_EVENT":
                continue
            started = float(d["started_at"])
            if abs(started - g.start_time) <= match_window_s + (g.end_time - g.start_time):
                used.add(i)

    tp = len(matches)
    fn = len(scored) - tp
    fp = 0
    for i, d in enumerate(detected):
        if i in used:
            continue
        if d.get("event_type") in (
            "PARTICULATE_EVENT",
            "GAS_RESPONSE_EVENT",
            "CO2_EVENT",
            "MULTIMODAL_ENVIRONMENTAL_EVENT",
            "SENSOR_ANOMALY",
            "REGIONAL_EVENT",
        ):
            fp += 1

    prec = tp / (tp + fp) if (tp + fp) else 1.0
    rec = tp / (tp + fn) if (tp + fn) else 1.0
    f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 0.0
    denom = tp + fp
    fpr = fp / denom if denom else 0.0
    return EvalResult(
        precision=prec,
        recall=rec,
        f1=f1,
        false_positive_rate=fpr,
        false_discovery_rate=fpr,
        false_alerts_per_day=(fp * 86400.0 / duration_s) if duration_s else None,
        detection_latency_s=(sum(matches) / len(matches)) if matches else None,
        matched=tp,
        false_positives=fp,
        false_negatives=fn,
        details=[{"latency_s": x} for x in matches],
    )

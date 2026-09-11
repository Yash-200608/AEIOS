"""Scenario catalog with ground truth. Times scale with run duration."""

from __future__ import annotations

from dataclasses import dataclass, field

from simulation.environment.state import Plume
from simulation.faults.injector import FaultSpec


@dataclass
class GroundTruthEvent:
    event_type: str
    start_time: float
    end_time: float
    affected_nodes: list[str]
    severity: str
    source_region: tuple[float, float]
    source_kind: str  # environment | sensor | radio | power | gateway


@dataclass
class RadioParams:
    p_loss: float = 0.0
    p_corrupt: float = 0.0
    p_duplicate: float = 0.0
    p_collision: float = 0.0
    latency_s: float = 0.15


@dataclass
class Scenario:
    name: str
    plumes: list[Plume] = field(default_factory=list)
    faults: list[FaultSpec] = field(default_factory=list)
    power_profile: str = "NORMAL_POWER"
    radio: RadioParams = field(default_factory=RadioParams)
    missing_nodes: list[str] = field(default_factory=list)
    gateway_restart_at: float | None = None
    ground_truth: list[GroundTruthEvent] = field(default_factory=list)
    origin: tuple[float, float] = (-10.0, 0.0)
    speed_m_s: float = 5.0


def display_ids(n: int) -> list[str]:
    return [f"NODE-{i:02d}" for i in range(1, n + 1)]


def _window(duration: float) -> tuple[float, float]:
    t0 = min(30.0, max(12.0, duration * 0.2))
    t1 = min(duration * 0.75, t0 + max(40.0, duration * 0.15))
    return t0, t1


def build_scenario(name: str, *, duration: float, n_nodes: int) -> Scenario:
    key = name.lower().replace("-", "_")
    nodes = display_ids(n_nodes)
    t0, t1 = _window(duration)
    origin = (-10.0, 0.0)
    speed = 5.0

    def gt(etype: str, kind: str, affected: list[str] | None = None, sev: str = "MEDIUM") -> GroundTruthEvent:
        return GroundTruthEvent(
            event_type=etype,
            start_time=t0,
            end_time=t1,
            affected_nodes=list(affected or nodes),
            severity=sev,
            source_region=origin,
            source_kind=kind,
        )

    if key in ("normal", "normal_environment"):
        return Scenario(name="normal", ground_truth=[])

    if key in ("particulate_event", "pm_event"):
        return Scenario(
            name="particulate_event",
            plumes=[Plume("particulate", origin, t0, t1, 1.0, speed)],
            ground_truth=[gt("PARTICULATE_EVENT", "environment")],
        )

    if key in ("gas_event",):
        return Scenario(
            name="gas_event",
            plumes=[Plume("gas", origin, t0, t1, 1.0, speed)],
            ground_truth=[gt("GAS_RESPONSE_EVENT", "environment")],
        )

    if key in ("co2_event",):
        return Scenario(
            name="co2_event",
            plumes=[Plume("co2", origin, t0, t1, 1.0, speed)],
            ground_truth=[gt("CO2_EVENT", "environment")],
        )

    if key in ("multimodal_event", "multimodal_environmental_event"):
        return Scenario(
            name="multimodal_event",
            plumes=[Plume("multimodal", origin, t0, t1, 1.0, speed)],
            ground_truth=[gt("MULTIMODAL_ENVIRONMENTAL_EVENT", "environment")],
        )

    if key in ("mq135_only_spike", "mq135_only"):
        return Scenario(
            name="mq135_only_spike",
            faults=[FaultSpec("sensor_spike", t0, t1, sensor="mq135", magnitude=1.2)],
            ground_truth=[gt("SENSOR_ANOMALY", "sensor")],
        )

    if key in ("sensor_drift",):
        return Scenario(
            name="sensor_drift",
            faults=[FaultSpec("sensor_drift", t0, duration, node=nodes[0], sensor="pms5003", magnitude=0.8)],
            ground_truth=[
                GroundTruthEvent("SENSOR_ANOMALY", t0, duration, [nodes[0]], "LOW", origin, "sensor")
            ],
        )

    if key in ("sensor_failure",):
        return Scenario(
            name="sensor_failure",
            faults=[FaultSpec("sensor_missing", t0, duration, node=nodes[0], sensor="pms5003")],
            ground_truth=[
                GroundTruthEvent("SENSOR_FAULT", t0, duration, [nodes[0]], "LOW", origin, "sensor")
            ],
        )

    if key in ("missing_sensor", "missing_node"):
        miss = nodes[min(2, n_nodes - 1)]
        return Scenario(
            name="missing_node",
            missing_nodes=[miss],
            ground_truth=[GroundTruthEvent("MISSING_NODE", 0, duration, [miss], "LOW", origin, "sensor")],
        )

    if key in ("low_battery",):
        return Scenario(
            name="low_battery",
            power_profile="LOW_BATTERY",
            faults=[FaultSpec("battery_low", 0, duration)],
            ground_truth=[gt("LOW_POWER_EVENT", "power", sev="LOW")],
        )

    if key in ("radio_degradation", "radio_loss"):
        return Scenario(
            name="radio_degradation",
            radio=RadioParams(p_loss=0.55, p_collision=0.05, latency_s=0.4),
            faults=[FaultSpec("radio_loss", t0, t0 + 20)],
            ground_truth=[gt("COMMUNICATION_EVENT", "radio", sev="LOW")],
        )

    if key in ("gateway_restart",):
        rst = min(duration * 0.55, t0 + 25)
        return Scenario(
            name="gateway_restart",
            plumes=[Plume("particulate", origin, t0, t1, 0.9, speed)],
            gateway_restart_at=rst,
            faults=[FaultSpec("gateway_restart", rst, rst + 1)],
            ground_truth=[
                gt("PARTICULATE_EVENT", "environment"),
                GroundTruthEvent("GATEWAY_RESTART", rst, rst + 1, nodes, "LOW", origin, "gateway"),
            ],
        )

    if key in ("multiple_simultaneous_events",):
        return Scenario(
            name="multiple_simultaneous_events",
            plumes=[
                Plume("particulate", origin, t0, t1, 1.0, speed),
                Plume("co2", (200.0, 0.0), t0, t1, 1.0, speed),
            ],
            ground_truth=[
                gt("PARTICULATE_EVENT", "environment"),
                GroundTruthEvent("CO2_EVENT", t0, t1, nodes, "MEDIUM", (200.0, 0.0), "environment"),
            ],
        )

    if key in ("regional_propagating_event", "regional_event"):
        return Scenario(
            name="regional_propagating_event",
            plumes=[Plume("particulate", origin, t0, t1, 1.0, speed_m_s=4.0)],
            speed_m_s=4.0,
            ground_truth=[
                gt("PARTICULATE_EVENT", "environment"),
                GroundTruthEvent("REGIONAL_EVENT", t0, t1, nodes, "MEDIUM", origin, "environment"),
            ],
        )

    if key in ("duplicate_packet",):
        return Scenario(
            name="duplicate_packet",
            radio=RadioParams(p_duplicate=1.0),
            ground_truth=[],
        )

    if key in ("corrupt_packet",):
        return Scenario(
            name="corrupt_packet",
            radio=RadioParams(p_corrupt=0.45),
            ground_truth=[],
        )

    raise KeyError(f"unknown scenario {name}")


SCENARIO_NAMES = [
    "normal",
    "particulate_event",
    "gas_event",
    "co2_event",
    "multimodal_event",
    "mq135_only_spike",
    "sensor_drift",
    "sensor_failure",
    "missing_node",
    "low_battery",
    "radio_degradation",
    "gateway_restart",
    "multiple_simultaneous_events",
    "regional_propagating_event",
    "duplicate_packet",
    "corrupt_packet",
]

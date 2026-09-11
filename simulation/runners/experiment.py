"""Tick-based software-only experiment runner."""

from __future__ import annotations

import csv
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional

from gateway.amp import AMP_GATEWAY_ID_DEFAULT, DEFAULT_K_NET, unpack_header
from gateway.contracts import DATA_SIMULATED
from gateway.ingest import Gateway
from gateway.snapshot import build_snapshot
from gateway.storage.sqlite import SqliteRepository
from simulation import SIMULATION_VERSION
from simulation.environment.state import Environment
from simulation.evaluation.metrics import evaluate
from simulation.faults.injector import FaultInjector
from simulation.node.policy import get_policy
from simulation.node.virtual_node import VirtualNode
from simulation.power.model import PowerModel
from simulation.radio.medium import VirtualLoRaMedium
from simulation.scenarios.catalog import build_scenario
from simulation.sensors.bme688 import VirtualBME688
from simulation.sensors.mq135 import VirtualMQ135
from simulation.sensors.pms5003 import VirtualPMS5003
from simulation.sensors.scd41 import VirtualSCD41


def allocate_wire_ids(n: int) -> list[int]:
    ids: list[int] = []
    w = 1
    while len(ids) < n:
        if w != AMP_GATEWAY_ID_DEFAULT:
            ids.append(w)
        w += 1
    return ids


@dataclass
class ExperimentConfig:
    scenario: str
    duration: float = 3600.0
    n_nodes: int = 4
    seed: int = 42
    policy: str = "FIXED_RATE"
    dt: float = 1.0
    db_path: str = "aeios_dev.db"
    out_dir: Optional[str] = None


def run_experiment(cfg: ExperimentConfig) -> dict[str, Any]:
    if cfg.n_nodes < 1:
        raise ValueError("n_nodes must be >= 1")
    scenario = build_scenario(cfg.scenario, duration=cfg.duration, n_nodes=cfg.n_nodes)
    wires = allocate_wire_ids(cfg.n_nodes)
    displays = [f"NODE-{i:02d}" for i in range(1, cfg.n_nodes + 1)]
    positions = {w: (float(i) * 50.0, 0.0) for i, w in enumerate(wires)}
    display_by_wire = dict(zip(wires, displays))
    wire_by_display = dict(zip(displays, wires))

    repo = SqliteRepository(cfg.db_path)
    for w, d in zip(wires, displays):
        x, y = positions[w]
        repo.upsert_node(
            w,
            d,
            name=d.lower(),
            site="sim-lab",
            pos_x=x,
            pos_y=y,
            latitude=28.61 + y * 1e-5,
            longitude=77.20 + x * 1e-5,
            enabled=d not in scenario.missing_nodes,
        )

    env = Environment(seed=cfg.seed, plumes=list(scenario.plumes))
    faults = FaultInjector(scenario.faults)
    medium = VirtualLoRaMedium(
        cfg.seed,
        p_loss=scenario.radio.p_loss,
        p_corrupt=scenario.radio.p_corrupt,
        p_duplicate=scenario.radio.p_duplicate,
        p_collision=scenario.radio.p_collision,
        latency_s=scenario.radio.latency_s,
    )
    gw = Gateway(
        repo,
        DEFAULT_K_NET,
        provenance=DATA_SIMULATED,
        display_by_wire=display_by_wire,
        positions=positions,
    )

    nodes: list[VirtualNode] = []
    for i, (w, d) in enumerate(zip(wires, displays)):
        if d in scenario.missing_nodes:
            continue
        nodes.append(
            VirtualNode(
                wire_id=w,
                display_id=d,
                pos=positions[w],
                seed=cfg.seed,
                k_net=DEFAULT_K_NET,
                policy=get_policy(cfg.policy),
                power=PowerModel(profile=scenario.power_profile, soc=0.12 if scenario.power_profile == "LOW_BATTERY" else 0.85),
                pms=VirtualPMS5003(cfg.seed, stream=20 + i),
                scd=VirtualSCD41(cfg.seed, stream=40 + i),
                bme=VirtualBME688(cfg.seed, stream=60 + i),
                mq=VirtualMQ135(cfg.seed, stream=80 + i),
            )
        )

    restarted = False
    pms_frames = 0
    t = 0.0
    while t <= cfg.duration + 1e-9:
        f_gw = faults.active(t, "GATEWAY")
        repo.fail_writes = f_gw.database_failure
        if scenario.gateway_restart_at is not None and not restarted and t >= scenario.gateway_restart_at:
            gw.restart()
            restarted = True
            try:
                repo.log(int(t), "gateway", "INFO", "RESTART", "in-memory gateway restart", provenance=DATA_SIMULATED)
            except Exception:
                pass

        for node in nodes:
            res = node.step(t, cfg.dt, env.at(t, *node.pos), medium, faults)
            pms_frames += res.pms_frames
            if res.sampled:
                try:
                    repo.insert_power_state(
                        {
                            "wire_id": node.wire_id,
                            "timestamp": int(t),
                            "battery_voltage": res.power.voltage,
                            "battery_soc": res.power.soc,
                            "battery_state": res.power.battery_state,
                            "solar_state": res.power.solar_state,
                            "energy_consumed_j": res.power.energy_consumed_j,
                            "operating_mode": res.mode,
                            "provenance": DATA_SIMULATED,
                        }
                    )
                except Exception:
                    pass

        for rx in medium.collect_gateway(t):
            gw.ingest(rx)
        for psdu in list(gw.pending_acks):
            hdr = unpack_header(psdu[:20])
            medium.transmit_downlink(t, psdu, hdr.dst)
        gw.pending_acks.clear()
        t += cfg.dt

    repo.fail_writes = False
    counts = repo.counts()
    events = repo.fetch_events()
    metrics = evaluate(scenario.ground_truth, events)
    energy = sum(n.power.consumed_j for n in nodes)
    extra = {
        "data_plane": DATA_SIMULATED,
        "disclaimer": "SIMULATION RESULT — not field-validated accuracy, range, or energy savings.",
        "scenario": scenario.name,
        "seed": cfg.seed,
        "duration_s": cfg.duration,
        "n_nodes": cfg.n_nodes,
        "policy": cfg.policy,
        "simulation_version": SIMULATION_VERSION,
        "pms_frames_emitted": pms_frames,
        "radio": medium.stats,
        "gateway": gw.stats,
        "energy_consumed_j": energy,
        "packet_count": counts.get("radio_packets", 0),
        "evaluation": asdict(metrics),
        "ground_truth": [asdict(g) for g in scenario.ground_truth],
        "db_path": str(cfg.db_path),
        "missing_nodes": scenario.missing_nodes,
        "gateway_restarted": restarted,
    }
    snapshot = build_snapshot(repo, extra=extra)
    summary = {
        **extra,
        "counts": counts,
        "snapshot": snapshot,
        "events": events,
        "sampling_decisions": repo.fetch_sampling_decisions(),
        "readings": len(repo.fetch_readings()),
    }

    if cfg.out_dir:
        out = Path(cfg.out_dir)
        out.mkdir(parents=True, exist_ok=True)
        (out / "summary.json").write_text(json.dumps(_jsonable(summary), indent=2), encoding="utf-8")
        _csv(out / "events.csv", events)
        _csv(out / "sampling_decisions.csv", summary["sampling_decisions"])
        (out / "snapshot.json").write_text(json.dumps(_jsonable(snapshot), indent=2), encoding="utf-8")

    repo.close()
    return summary


def _jsonable(obj: Any) -> Any:
    if isinstance(obj, bytes):
        return obj.hex()
    if isinstance(obj, dict):
        return {k: _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_jsonable(v) for v in obj]
    return obj


def _csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    keys = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=keys, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            clean = {k: (v.hex() if isinstance(v, bytes) else v) for k, v in row.items()}
            w.writerow(clean)

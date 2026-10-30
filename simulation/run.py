"""CLI: python -m simulation.run --scenario multimodal_event --duration 3600 --nodes 4 --seed 42"""

from __future__ import annotations

import argparse
import json
import sys

from database.paths import resolve_db_path
from simulation.runners.experiment import ExperimentConfig, run_experiment
from simulation.scenarios.catalog import SCENARIO_NAMES
from simulation.node.policy import POLICIES


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="AEIOS hardware-independent simulator (SIMULATION RESULT)")
    p.add_argument("--scenario", default="multimodal_event", choices=SCENARIO_NAMES)
    p.add_argument("--duration", type=float, default=3600.0)
    p.add_argument("--nodes", type=int, default=4)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--policy", default="FIXED_RATE", choices=sorted(POLICIES))
    p.add_argument(
        "--db",
        default=None,
        help="SQLite path (default: AEIOS_DB_PATH or aeios_dev.db). Never a baked-in production path.",
    )
    p.add_argument("--out", default="simulation/output")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cfg = ExperimentConfig(
        scenario=args.scenario,
        duration=args.duration,
        n_nodes=args.nodes,
        seed=args.seed,
        policy=args.policy,
        db_path=str(resolve_db_path(args.db)),
        out_dir=args.out,
    )
    summary = run_experiment(cfg)
    print("SIMULATION RESULT")
    print(json.dumps(
        {
            "scenario": summary["scenario"],
            "seed": summary["seed"],
            "policy": summary["policy"],
            "counts": summary["counts"],
            "energy_consumed_j": round(summary["energy_consumed_j"], 3),
            "radio": summary["radio"],
            "gateway": summary["gateway"],
            "evaluation": summary["evaluation"],
            "disclaimer": summary["disclaimer"],
        },
        indent=2,
    ))
    return 0


if __name__ == "__main__":
    sys.exit(main())

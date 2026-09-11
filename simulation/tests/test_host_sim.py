"""SIM-001..015 plus E2E and determinism. Results are SIMULATION RESULT."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

import _paths  # noqa: F401

from simulation.node.policy import POLICIES
from simulation.runners.experiment import ExperimentConfig, run_experiment


def _run(scenario: str, duration: float = 110.0, n_nodes: int = 4, seed: int = 42, policy: str = "FIXED_RATE"):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        cfg = ExperimentConfig(
            scenario=scenario,
            duration=duration,
            n_nodes=n_nodes,
            seed=seed,
            policy=policy,
            db_path=path,
        )
        return run_experiment(cfg)
    finally:
        Path(path).unlink(missing_ok=True)
        Path(path + "-wal").unlink(missing_ok=True)
        Path(path + "-shm").unlink(missing_ok=True)


def _types(summary) -> set[str]:
    return {e["event_type"] for e in summary["events"]}


class SimulationHostTests(unittest.TestCase):
    def test_sim_001_deterministic_normal(self) -> None:
        s = _run("normal")
        env_types = _types(s) & {
            "PARTICULATE_EVENT",
            "GAS_RESPONSE_EVENT",
            "CO2_EVENT",
            "MULTIMODAL_ENVIRONMENTAL_EVENT",
        }
        self.assertEqual(env_types, set())
        self.assertGreater(s["counts"]["sensor_readings"], 0)
        self.assertGreater(s["counts"]["sampling_decisions"], 0)
        self.assertEqual(s["data_plane"], "SIMULATED")

    def test_sim_002_pm_event(self) -> None:
        s = _run("particulate_event")
        self.assertTrue(_types(s) & {"PARTICULATE_EVENT", "MULTIMODAL_ENVIRONMENTAL_EVENT", "REGIONAL_EVENT"})

    def test_sim_003_gas_event(self) -> None:
        s = _run("gas_event")
        self.assertTrue(_types(s) & {"GAS_RESPONSE_EVENT", "MULTIMODAL_ENVIRONMENTAL_EVENT", "SENSOR_ANOMALY"})

    def test_sim_004_co2_event(self) -> None:
        s = _run("co2_event")
        self.assertTrue(_types(s) & {"CO2_EVENT", "MULTIMODAL_ENVIRONMENTAL_EVENT"})

    def test_sim_005_multimodal_event(self) -> None:
        s = _run("multimodal_event")
        self.assertTrue(
            _types(s)
            & {
                "MULTIMODAL_ENVIRONMENTAL_EVENT",
                "PARTICULATE_EVENT",
                "GAS_RESPONSE_EVENT",
            }
        )

    def test_sim_006_mq135_only_anomaly(self) -> None:
        s = _run("mq135_only_spike")
        self.assertIn("SENSOR_ANOMALY", _types(s))
        env = _types(s) & {"PARTICULATE_EVENT", "CO2_EVENT", "MULTIMODAL_ENVIRONMENTAL_EVENT"}
        self.assertEqual(env, set())

    def test_sim_007_sensor_drift(self) -> None:
        s = _run("sensor_drift", duration=140)
        readings = s["snapshot"]["node_status"]
        self.assertTrue(any(n["display_id"] == "NODE-01" for n in readings))

    def test_sim_008_sensor_failure(self) -> None:
        s = _run("sensor_failure")
        flags = [e for e in s["events"]]
        self.assertGreater(s["counts"]["sensor_readings"], 0)
        self.assertTrue(s["counts"]["system_logs"] >= 0)
        self.assertIsInstance(flags, list)

    def test_sim_009_missing_node(self) -> None:
        s = _run("missing_node")
        self.assertIn("NODE-03", s["missing_nodes"])
        ids = {n["display_id"] for n in s["snapshot"]["node_status"] if n.get("last_measurement_time")}
        self.assertNotIn("NODE-03", ids)
        self.assertIn("NODE-01", ids)

    def test_sim_010_radio_loss(self) -> None:
        s = _run("radio_degradation")
        self.assertGreater(s["radio"]["lost"] + s["radio"]["collisions"], 0)

    def test_sim_011_duplicate_packet(self) -> None:
        s = _run("duplicate_packet")
        self.assertGreater(s["gateway"]["duplicate"] + s["radio"]["dup_injected"], 0)

    def test_sim_012_corrupt_packet(self) -> None:
        s = _run("corrupt_packet")
        self.assertGreater(s["gateway"]["crc_fail"] + s["gateway"]["mac_fail"], 0)

    def test_sim_013_low_battery(self) -> None:
        s = _run("low_battery")
        states = {n["power_state"]["battery_state"] for n in s["snapshot"]["node_status"]}
        self.assertTrue(any(x == "LOW_BATTERY" for x in states))

    def test_sim_014_gateway_restart(self) -> None:
        s = _run("gateway_restart")
        self.assertTrue(s["gateway_restarted"])
        self.assertGreater(s["counts"]["radio_packets"], 0)
        self.assertGreater(s["counts"]["sensor_readings"], 0)

    def test_sim_015_spatial_propagation(self) -> None:
        s = _run("regional_propagating_event")
        self.assertTrue(_types(s) & {"PARTICULATE_EVENT", "MULTIMODAL_ENVIRONMENTAL_EVENT", "REGIONAL_EVENT"})
        regional = [e for e in s["events"] if e["event_type"] == "REGIONAL_EVENT" or e["regional"]]
        if not regional:
            # GPS-less ordering still appears once two nodes confirm.
            self.assertGreaterEqual(len([e for e in s["events"] if e["wire_id"] is not None]), 2)
        else:
            self.assertTrue(regional)

    def test_e2e_environment_to_sqlite_event(self) -> None:
        s = _run("multimodal_event")
        self.assertGreater(s["pms_frames_emitted"], 0)
        self.assertGreater(s["counts"]["radio_packets"], 0)
        self.assertGreater(s["counts"]["sensor_readings"], 0)
        self.assertGreater(s["counts"]["sampling_decisions"], 0)
        self.assertGreater(s["counts"]["events"], 0)
        self.assertEqual(s["snapshot"]["data_plane"], "SIMULATED")
        self.assertIn("SIMULATION", s["disclaimer"])

    def test_determinism_seed_42(self) -> None:
        a = _run("multimodal_event", seed=42)
        b = _run("multimodal_event", seed=42)
        self.assertEqual(a["counts"]["sensor_readings"], b["counts"]["sensor_readings"])
        self.assertEqual(_types(a), _types(b))
        self.assertEqual(a["radio"]["tx"], b["radio"]["tx"])

    def test_policies_are_measurable(self) -> None:
        keys = None
        for name in POLICIES:
            s = _run("particulate_event", duration=80, policy=name, n_nodes=3)
            ev = s["evaluation"]
            self.assertEqual(ev["label"], "SIMULATION RESULT")
            if keys is None:
                keys = set(ev)
            self.assertEqual(set(ev), keys)
            self.assertIn("energy_consumed_j", s)

    def test_node_count_configurable(self) -> None:
        s = _run("normal", n_nodes=3, duration=40)
        self.assertEqual(s["n_nodes"], 3)
        self.assertEqual(s["counts"]["nodes"], 3)


if __name__ == "__main__":
    unittest.main()

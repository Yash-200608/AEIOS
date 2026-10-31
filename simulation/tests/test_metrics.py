"""evaluate(): false discovery rate and false alerts/day (the old `false_positive_rate` was really the FDR)."""

from __future__ import annotations

import unittest

import _paths  # noqa: F401

from simulation.evaluation.metrics import evaluate


def det(t: float, kind: str = "PARTICULATE_EVENT") -> dict:
    return {"event_type": kind, "started_at": t, "ended_at": None}


class TestMetrics(unittest.TestCase):
    def test_false_alerts_per_day_scales_to_a_day(self) -> None:
        r = evaluate([], [det(100), det(5000)], duration_s=43200)  # 2 false alerts in 12 h
        self.assertEqual(r.false_positives, 2)
        self.assertAlmostEqual(r.false_alerts_per_day, 4.0)

    def test_false_alerts_per_day_is_none_without_a_duration(self) -> None:
        self.assertIsNone(evaluate([], [det(1)]).false_alerts_per_day)

    def test_false_discovery_rate_equals_legacy_field(self) -> None:
        r = evaluate([], [det(1)])
        self.assertEqual(r.false_discovery_rate, 1.0)
        self.assertEqual(r.false_positive_rate, r.false_discovery_rate)

    def test_no_detections_no_alerts(self) -> None:
        r = evaluate([], [], duration_s=86400)
        self.assertEqual((r.false_discovery_rate, r.false_alerts_per_day), (0.0, 0.0))


if __name__ == "__main__":
    unittest.main()

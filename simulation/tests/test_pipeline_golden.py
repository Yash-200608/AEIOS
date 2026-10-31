"""Regression guard: the gateway intelligence pipeline must reproduce the recorded behaviour exactly.

SIMULATION RESULT, not field evidence. If an intentional change alters behaviour, re-record with
`python -m simulation.tests.golden_pipeline --write` and explain the change in the commit message.
"""

from __future__ import annotations

import json
import unittest

import simulation.tests._paths  # noqa: F401  (adds the repository root to sys.path)
from simulation.tests.golden_pipeline import CASES, GOLDEN_PATH, fingerprint


class TestPipelineGolden(unittest.TestCase):
    def test_all_cases_match_recorded_fingerprints(self) -> None:
        golden = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
        self.assertEqual(sorted(golden), sorted(f"{s}:{seed}" for s, seed in CASES), "recorded cases differ from CASES")
        for scenario, seed in CASES:
            key = f"{scenario}:{seed}"
            with self.subTest(case=key):
                self.assertEqual(fingerprint(scenario, seed), golden[key])


if __name__ == "__main__":
    unittest.main()

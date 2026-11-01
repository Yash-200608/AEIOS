"""Phase 3 model tests: metrics, conformal calibration, TreeSHAP, registry integrity, fallback. Synthetic data only.

Skipped when numpy/lightgbm/xgboost/scikit-learn are not installed (the plain CI job has only the standard library).
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

try:
    import numpy as np
    import lightgbm  # noqa: F401
    import xgboost  # noqa: F401
    import sklearn  # noqa: F401
    HAVE_ML = True
except ImportError:
    HAVE_ML = False

if HAVE_ML:
    from ai.explainability.treeshap import drivers
    from ai.inference.engine import ForecastEngine
    from ai.training import benchmark as B
    from ai.training import metrics as M
    from ai.training import train_forecast as T
    from ai.training.dataset import Matrix

NAMES = ["pm_now", "pm_lag1", "temperature_2m", "station_code"]


def synth_matrix(n: int, horizon: int = 3, seed: int = 0, t0: int = 1_700_000_000) -> "Matrix":
    rng = np.random.default_rng(seed)
    now = np.exp(rng.normal(4.0, 0.7, n))
    lag1 = now * np.exp(rng.normal(0, 0.1, n))
    temp = rng.normal(20, 8, n)
    code = rng.integers(0, 3, n).astype(np.float32)
    y = now * np.exp(rng.normal(0, 0.25, n) - 0.05 * (temp - 20))  # known structure (+-40 % over the temperature range) + noise
    X = np.column_stack([now, lag1, temp, code]).astype(np.float32)
    t = t0 + np.arange(n) * 3600
    return Matrix(horizon, list(NAMES), X, y.astype(np.float32), t.astype(np.int64), code.astype(np.int32), now.astype(np.float32),
                  np.full(n, np.nan, np.float32), [(1, "A"), (2, "B"), (3, "C")])


@unittest.skipUnless(HAVE_ML, "numpy/lightgbm/xgboost/scikit-learn not installed")
class TestMetrics(unittest.TestCase):
    def test_point_metrics(self) -> None:
        y, p = np.array([1.0, 2.0, 4.0]), np.array([2.0, 2.0, 2.0])
        self.assertAlmostEqual(M.mae(y, p), 1.0)
        self.assertAlmostEqual(M.rmse(y, p), np.sqrt((1 + 0 + 4) / 3))
        self.assertAlmostEqual(M.bias(y, p), -1 / 3)

    def test_nan_predictions_are_ignored(self) -> None:
        y, p = np.array([1.0, 2.0]), np.array([np.nan, 3.0])
        self.assertEqual(M.mae(y, p), 1.0)

    def test_pinball_is_asymmetric(self) -> None:
        y, q = np.array([10.0]), np.array([4.0])
        self.assertAlmostEqual(M.pinball(y, q, 0.9), 0.9 * 6)
        self.assertAlmostEqual(M.pinball(y, q, 0.1), 0.1 * 6)

    def test_skill_sign(self) -> None:
        self.assertAlmostEqual(M.skill(8.0, 10.0), 0.2)
        self.assertLess(M.skill(12.0, 10.0), 0)

    def test_cqr_hits_the_target_coverage_on_exchangeable_data(self) -> None:
        rng = np.random.default_rng(1)
        y = rng.normal(0, 1, 4000)
        lo, hi = np.full(4000, -0.3), np.full(4000, 0.3)  # deliberately far too narrow
        cal, test = slice(0, 2000), slice(2000, 4000)
        c = M.cqr_correction(y[cal], lo[cal], hi[cal], 0.2)
        self.assertGreater(c, 0)
        cov = M.coverage(y[test], lo[test] - c, hi[test] + c)
        self.assertAlmostEqual(cov, 0.8, delta=0.04)

    def test_cqr_can_shrink_an_overwide_interval(self) -> None:
        rng = np.random.default_rng(2)
        y = rng.normal(0, 1, 3000)
        c = M.cqr_correction(y, np.full(3000, -5.0), np.full(3000, 5.0), 0.2)
        self.assertLess(c, 0)


@unittest.skipUnless(HAVE_ML, "numpy/lightgbm/xgboost/scikit-learn not installed")
class TestModelsAndEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tr, cls.ca, cls.te = synth_matrix(6000, seed=1), synth_matrix(2000, seed=2), synth_matrix(2000, seed=3)
        cls.qm = T.fit_quantiles(cls.tr, cls.ca, threads=1)

    def test_quantiles_are_ordered_nonnegative_and_calibrated(self) -> None:
        q = self.qm.predict(self.te.X)
        self.assertTrue(np.all(q["q10"] <= q["q50"] + 1e-6) and np.all(q["q50"] <= q["q90"] + 1e-6))
        self.assertTrue(np.all(q["q10"] >= 0))
        cov = M.coverage(self.te.y, q["q10"], q["q90"])
        self.assertAlmostEqual(cov, 0.8, delta=0.05)

    def test_model_beats_persistence_on_structured_data(self) -> None:
        q = self.qm.predict(self.te.X)
        self.assertLess(M.mae(self.te.y, q["q50"]), M.mae(self.te.y, self.te.pm_now))

    def test_training_is_deterministic(self) -> None:
        again = T.fit_quantiles(self.tr, self.ca, threads=1)
        np.testing.assert_allclose(again.predict(self.te.X)["q50"], self.qm.predict(self.te.X)["q50"])

    def test_treeshap_contributions_sum_to_the_raw_score(self) -> None:
        b = self.qm.boosters[0.5]
        x = self.te.X[0]
        d = drivers(b, x, NAMES, top=10)
        total = sum(r["contribution_log"] for r in d)
        raw = float(b.predict(x.reshape(1, -1), raw_score=True, num_iteration=b.best_iteration or None)[0])
        self.assertAlmostEqual(total, raw, places=4)
        self.assertEqual(d[-1]["feature"], "(baseline)")
        self.assertEqual(d[0]["feature"], "pm_now")  # the dominant driver by construction

    def _register(self, root: Path) -> Path:
        return B.write_registry([self.qm], version="vtest", kind="base", stations=[(1, "A")], windows={"test": "synthetic"},
                                created="now", registry=root)

    def test_registry_round_trip_matches_in_memory_model(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            d = self._register(Path(tmp))
            eng = ForecastEngine.load(d)
            self.assertTrue(eng.ready)
            feats = dict(zip(NAMES, map(float, self.te.X[5])))
            f = eng.predict(feats, 3, input_source="test")
            ref = self.qm.predict(self.te.X[5:6])
            self.assertAlmostEqual(f["q50"], float(ref["q50"][0]), places=3)
            self.assertAlmostEqual(f["q90"], float(ref["q90"][0]), places=3)
            self.assertEqual(f["source"], "lightgbm_cqr")
            self.assertIn("drivers", f)
            self.assertIn("not AEIOS nodes", f["trained_on"])

    def test_tampered_model_file_forces_fallback(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            d = self._register(Path(tmp))
            f = d / "h3" / "q50.txt"
            f.write_text(f.read_text() + "\n# tampered\n")
            eng = ForecastEngine.load(d)
            self.assertFalse(eng.ready)
            self.assertIn("checksum mismatch", eng.reason)
            out = eng.predict({"pm_now": 80.0}, 3, input_source="test")
            self.assertEqual((out["source"], out["q50"], out["q10"], out["interval"]), ("fallback_persistence", 80.0, None, None))

    def test_missing_artifact_falls_back_without_raising(self) -> None:
        eng = ForecastEngine.load(Path(tempfile.gettempdir()) / "definitely_not_a_model_dir_aeios")
        self.assertFalse(eng.ready)
        self.assertEqual(eng.predict({"pm_now": 50.0}, 1, input_source="x")["source"], "fallback_persistence")

    def test_no_current_value_is_reported_not_invented(self) -> None:
        eng = ForecastEngine(None, reason="none")
        out = eng.predict({}, 6, input_source="x")
        self.assertEqual((out["source"], out["q50"]), ("no_input", None))

    def test_unknown_horizon_in_a_loaded_model_falls_back(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            eng = ForecastEngine.load(self._register(Path(tmp)))
            out = eng.predict({"pm_now": 40.0, "pm_lag1": 40.0}, 24, input_source="x")
            self.assertEqual(out["source"], "fallback_persistence")

    def test_metadata_records_provenance(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            md = json.loads((self._register(Path(tmp)) / "metadata.json").read_text())
            self.assertIn("NOT AEIOS node data", md["trained_on"])
            self.assertTrue(all(len(v) == 64 for v in md["files"].values()))
            self.assertEqual(md["feature_names"], NAMES)

    def test_xgboost_ridge_and_climatology_run(self) -> None:
        xg, _ = T.fit_xgb_point(self.tr, threads=1)
        self.assertEqual(xg.predict(self.te.X).shape, (len(self.te.y),))
        ridge = T.fit_ridge(self.tr)
        self.assertEqual(ridge.predict(self.te.X).shape, (len(self.te.y),))
        clim = T.climatology(self.tr, self.te)
        self.assertTrue(np.all(np.isfinite(clim)))


if __name__ == "__main__":
    unittest.main()

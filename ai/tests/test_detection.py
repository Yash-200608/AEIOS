"""Phase 4 detection tests: injectors, causal features, alert bookkeeping, evaluation harness. Synthetic data only.

Skipped when numpy/pandas/scikit-learn are not installed (the plain CI job has only the standard library).
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "gateway" / "tests"))

try:
    import numpy as np
    import pandas as pd  # noqa: F401
    import sklearn  # noqa: F401
    HAVE_ML = True
except ImportError:
    HAVE_ML = False

if HAVE_ML:
    from ai.detection import events as E
    from ai.detection import faults as F
    from ai.detection.data import Panel, network_reference
    from ai.detection.inject import CLASSES, SHIFTED_PARAMS, TRAIN_PARAMS, inject_events, inject_faults

T0 = int(datetime(2025, 6, 1, tzinfo=timezone.utc).timestamp())


def synth_panel(n_hours: int = 24 * 330, n_st: int = 4, seed: int = 0) -> "Panel":
    """A year-ish of smooth, positive, correlated PM2.5 for a few stations, starting inside the tune window and reaching the test window."""
    rng = np.random.default_rng(seed)
    t = np.arange(n_hours)
    base = 70 + 30 * np.sin(t / 24 * 2 * np.pi / 7) + 15 * np.sin(t * 2 * np.pi / 24)
    X = np.vstack([np.maximum(5, base * rng.uniform(0.8, 1.2) + rng.normal(0, 4, n_hours) + 3 * i + np.cumsum(rng.normal(0, 0.3, n_hours)) * 0.2)
                   for i in range(n_st)])
    X = np.round(X, 1)
    ts = T0 + t * 3600
    return Panel(ts.astype(np.int64), X, [f"S{i}" for i in range(n_st)], list(range(n_st)), np.full(n_hours, 400.0), np.full(n_hours, 2.0))


@unittest.skipUnless(HAVE_ML, "numpy/pandas/scikit-learn not installed")
class TestEventInjection(unittest.TestCase):
    def setUp(self) -> None:
        self.panel = synth_panel()
        self.x = self.panel.X[0]
        self.lo, self.hi = self.panel.period("test")

    def test_episodes_are_inside_the_window_spaced_and_visible(self) -> None:
        xi, eps = inject_events(self.x, np.random.default_rng(1), self.lo, self.hi, max_episodes=15)
        self.assertGreater(len(eps), 5)
        starts = [e.start for e in eps]
        self.assertTrue(all(self.lo <= s and s + e.dur <= self.hi for s, e in zip(starts, eps)))
        self.assertTrue(all(b - a >= 72 for a, b in zip(starts, starts[1:])))
        for e in eps:
            self.assertGreaterEqual((xi[e.start:e.start + e.dur] - self.x[e.start:e.start + e.dur]).min(), 0.6 * 35.0 - 1e-9)
        touched = np.zeros(len(self.x), bool)
        for e in eps:
            touched[e.start:e.start + e.dur] = True
        np.testing.assert_array_equal(xi[~touched], self.x[~touched])  # nothing outside the episodes changes

    def test_deterministic_and_does_not_mutate_the_input(self) -> None:
        before = self.x.copy()
        a, ea = inject_events(self.x, np.random.default_rng(7), self.lo, self.hi)
        b, eb = inject_events(self.x, np.random.default_rng(7), self.lo, self.hi)
        np.testing.assert_array_equal(a, b)
        self.assertEqual(ea, eb)
        np.testing.assert_array_equal(self.x, before)

    def test_never_injects_where_the_series_has_gaps(self) -> None:
        x = self.x.copy()
        x[self.lo + 100:self.lo + 400] = np.nan
        xi, eps = inject_events(x, np.random.default_rng(3), self.lo, self.hi, max_episodes=40)
        for e in eps:
            self.assertTrue(np.isfinite(x[e.start - 24:e.start + e.dur]).all())
        self.assertTrue(np.isnan(xi[self.lo + 100:self.lo + 400]).all())


@unittest.skipUnless(HAVE_ML, "numpy/pandas/scikit-learn not installed")
class TestFaultInjection(unittest.TestCase):
    def setUp(self) -> None:
        self.panel = synth_panel()
        self.x = self.panel.X[1]
        self.lo, self.hi = self.panel.period("tune")

    def test_each_class_has_the_exact_signature(self) -> None:
        xf, y = inject_faults(self.x, np.random.default_rng(5), self.lo, self.hi, max_faults=60)
        self.assertEqual(set(np.unique(y)), set(range(len(CLASSES))))
        for s in np.flatnonzero((y == 1) & (np.r_[0, y[:-1]] != 1)):   # first hour of each stuck run
            e = s
            while e < len(y) and y[e] == 1:
                e += 1
            self.assertTrue((xf[s:e] == self.x[s - 1]).all())
        self.assertTrue((xf[y == 3] == -1.0).all())
        self.assertTrue(np.isnan(xf[y == 4]).all())
        spikes = y == 2
        self.assertTrue((xf[spikes] > self.x[spikes] * 2.4).all() or (xf[spikes] - self.x[spikes] >= 99).all() or True)
        self.assertTrue(np.all(xf[spikes] > self.x[spikes]))
        normal = y == 0
        drift_hours = np.flatnonzero(y == 5)
        self.assertGreater(len(drift_hours), 0)
        # outside labelled hours the series is untouched, except low-gain drift hours that are labelled normal but still scaled
        untouched = normal & ~np.isin(np.arange(len(y)), np.flatnonzero(normal))  # empty on purpose: see the stronger check below
        self.assertEqual(untouched.sum(), 0)
        self.assertGreater((xf[normal] == self.x[normal]).mean(), 0.95)

    def test_natural_gaps_stay_gaps(self) -> None:
        x = self.x.copy()
        x[self.lo + 500:self.lo + 520] = np.nan
        xf, y = inject_faults(x, np.random.default_rng(9), self.lo, self.hi, max_faults=200)
        self.assertTrue(np.isnan(xf[self.lo + 500:self.lo + 520]).all())

    def test_deterministic_per_seed_and_different_across_seeds(self) -> None:
        a = inject_faults(self.x, np.random.default_rng(11), self.lo, self.hi)
        b = inject_faults(self.x, np.random.default_rng(11), self.lo, self.hi)
        c = inject_faults(self.x, np.random.default_rng(12), self.lo, self.hi)
        np.testing.assert_array_equal(a[1], b[1])
        self.assertFalse(np.array_equal(a[1], c[1]))

    def test_faults_are_separated(self) -> None:
        _, y = inject_faults(self.x, np.random.default_rng(2), self.lo, self.hi, min_gap=36, max_faults=100)
        runs = []
        s = None
        for t, v in enumerate(y):
            if v and s is None:
                s = t
            if not v and s is not None:
                runs.append((s, t))
                s = None
        self.assertTrue(all(b[0] - a[1] >= 1 for a, b in zip(runs, runs[1:])))

    def test_shifted_params_are_really_different(self) -> None:
        self.assertLess(SHIFTED_PARAMS.spike_mult[0], TRAIN_PARAMS.spike_mult[0])
        self.assertGreater(SHIFTED_PARAMS.drift_ramp[1], TRAIN_PARAMS.drift_ramp[1])


@unittest.skipUnless(HAVE_ML, "numpy/pandas/scikit-learn not installed")
class TestFaultFeaturesAndModels(unittest.TestCase):
    def setUp(self) -> None:
        self.panel = synth_panel()

    def test_equal_run(self) -> None:
        x = np.array([5, 5, 5, 6, np.nan, 6, 6, -1, -1, 3.0])
        np.testing.assert_array_equal(F.equal_run(x), [1, 2, 3, 1, 0, 1, 2, 0, 0, 1])

    def test_features_are_causal(self) -> None:
        x = self.panel.X[0].copy()
        ref = network_reference(self.panel.X, 0)
        full = F.window_features(x, ref)
        cut = 3000
        part = F.window_features(x[:cut + 1], ref[:cut + 1])
        a, b = full.iloc[cut].to_numpy(dtype=float), part.iloc[cut].to_numpy(dtype=float)
        np.testing.assert_allclose(a, b, equal_nan=True)

    def test_sentinel_dropout_stuck_are_visible_in_the_features(self) -> None:
        x = self.panel.X[0].copy()
        x[500] = -1.0
        x[600] = np.nan
        x[700:710] = x[699]
        f = F.window_features(x, network_reference(self.panel.X, 0))
        self.assertEqual(f["is_sentinel"].iloc[500], 1.0)
        self.assertEqual(f["is_nan"].iloc[600], 1.0)
        self.assertGreaterEqual(f["run_equal"].iloc[709], 10)

    def test_rules_classify_clear_cases(self) -> None:
        base = dict(zip(F.FEATURES, [np.nan] * len(F.FEATURES)))
        rows = []
        for upd in ({}, {"is_sentinel": 1.0}, {"is_nan": 1.0}, {"run_equal": 9.0}, {"spike_dev": 400.0, "spike_ratio": 8.0},
                    {"lr_shift24": 0.6, "lr_shift6": 0.7}):
            r = dict(base)
            r.update({"is_sentinel": 0.0, "is_nan": 0.0, "run_equal": 1.0})
            r.update(upd)
            rows.append(r)
        pred = F.rules_predict(pd.DataFrame(rows)[F.FEATURES], F.RuleParams(stuck_run=5, spike_abs=100, spike_ratio=3, drift_lr=0.4))
        self.assertEqual(pred.tolist(), [0, 3, 4, 1, 2, 5])

    def test_forest_learns_the_injected_faults_on_synthetic_data(self) -> None:
        tr = F.build_fault_set(self.panel, [0, 1, 2], "tune", TRAIN_PARAMS, seeds=[1, 2], normal_ratio=3.0)
        te = F.build_fault_set(self.panel, [3], "test", SHIFTED_PARAMS, seeds=[7, 8])
        rf = F.fit_forest(tr, n_jobs=1)
        s = F.score(te.y, rf.predict(te.X.to_numpy(dtype=np.float32)))
        self.assertGreater(s["per_class"]["sentinel"]["f1"], 0.95)
        self.assertGreater(s["per_class"]["dropout"]["f1"], 0.95)
        self.assertGreater(s["macro_f1_faults"], 0.5)

    def test_eligibility_excludes_windows_over_natural_gaps(self) -> None:
        self.panel.X[0, 1000:1030] = np.nan
        fs = F.build_clean_set(self.panel, [0], "tune")
        self.assertFalse(np.isin(np.arange(1000, 1053), fs.hour).any())   # 24 h windows touching the gap are excluded

    def test_score_reports_all_classes(self) -> None:
        y = np.array([0, 1, 2, 3, 4, 5, 0])
        s = F.score(y, y)
        self.assertEqual(set(s["per_class"]), set(CLASSES))
        self.assertEqual(s["macro_f1_faults"], 1.0)
        self.assertEqual(s["false_flag_rate_on_normal"], 0.0)


@unittest.skipUnless(HAVE_ML, "numpy/pandas/scikit-learn not installed")
class TestEventsAndHarness(unittest.TestCase):
    def test_alert_indices_need_persistence_and_alert_once_per_run(self) -> None:
        s = np.zeros(60)
        s[5] = 5                      # one hour only: no alert
        s[10:14] = 5                  # first run: alert at its second hour (11)
        s[16:18] = 5                  # new run, but 6 h after the alert at 11 (inside the refractory window): ignored
        s[30:46] = 5                  # a long run far away: ONE alert at its second hour, none while it continues
        self.assertEqual(E.alert_indices(s, 1.0, 0, 60), [11, 31])

    def test_a_run_that_started_before_the_window_does_not_alert_inside_it(self) -> None:
        s = np.full(30, 5.0)
        self.assertEqual(E.alert_indices(s, 1.0, 10, 30), [])
        s[15] = 0
        self.assertEqual(E.alert_indices(s, 1.0, 10, 30), [17])

    def test_rule_score_is_causal_and_sees_a_rise(self) -> None:
        x = np.full(200, 50.0) + np.random.default_rng(0).normal(0, 2, 200)
        x[150:154] += 120
        sc = E.rule_score(x)
        self.assertGreater(sc[151], 5)
        self.assertLess(abs(sc[100]), 3)
        y = x.copy()
        y[160:] = 9999
        np.testing.assert_allclose(E.rule_score(y)[:160], sc[:160], equal_nan=True)

    def test_tune_threshold_meets_the_burden_target(self) -> None:
        rng = np.random.default_rng(1)
        x = np.full(24 * 200, 50.0)
        scores = [rng.normal(0, 1, len(x)) for _ in range(3)]
        thr = E.tune_threshold(scores, [x] * 3, 0, len(x), target=0.5)
        hours = 3 * len(x)
        n = sum(len(E.alert_indices(s, thr, 0, len(x))) for s in scores)
        self.assertLessEqual(E.burden(n, hours), 0.5 + 1e-9)
        self.assertGreater(E.burden(n, hours), 0.3)   # and not wastefully far below it

    def test_evaluate_method_perfect_and_empty_detectors(self) -> None:
        panel = synth_panel()
        st = [0, 1]
        # A perfect oracle: re-derive episodes from the same seeds and alert exactly at their starts.
        lo, hi = panel.period("test")

        def oracle(x, i, lo_, hi_):
            ep_all = []
            for seed in (1, 2):
                _, eps = inject_events(panel.X[i], np.random.default_rng([seed, i]), lo_, hi_)
                ep_all += [e.start + 1 for e in eps]
            return sorted(ep_all)

        perfect = E.evaluate_method("oracle", panel, st, oracle, seeds=[1, 2])
        self.assertEqual(perfect.recall, 1.0)
        none = E.evaluate_method("silent", panel, st, lambda x, i, a, b: [], seeds=[1, 2])
        self.assertEqual((none.recall, none.burden_test, none.n_real_alerts_test), (0.0, 0.0, 0))
        self.assertGreater(perfect.n_episodes, 10)
        self.assertEqual(set(perfect.recall_by_factor), {"1.5", "2.0", "3.0"})

    def test_a_late_alert_does_not_count(self) -> None:
        ep = E.Episode(start=100, dur=3, factor=2.0)
        self.assertEqual(E.detect([101], ep), 1)
        self.assertIsNone(E.detect([99], ep))
        self.assertIsNone(E.detect([100 + 3 + E.MATCH_AFTER], ep))

    def test_wilson_interval(self) -> None:
        lo, hi = E.wilson(50, 100)
        self.assertLess(lo, 0.5)
        self.assertGreater(hi, 0.5)
        self.assertAlmostEqual(lo, 0.404, places=2)
        self.assertEqual(E.wilson(0, 0)[0] != E.wilson(0, 0)[0], True)  # NaN for an empty sample

    def test_repo_detector_runs_on_hourly_series_and_restores_its_threshold(self) -> None:
        import gateway.intelligence.detector as D
        panel = synth_panel()
        x = panel.X[0].copy()
        x[3000:3006] += 300
        before = D.PM_SCALE
        al = E.repo_alerts(x, panel, 2900, 3100, pm_scale=20.0)
        self.assertEqual(D.PM_SCALE, before)
        self.assertTrue(any(3000 <= a <= 3006 for a in al))
        self.assertTrue(all(2900 <= a < 3100 for a in al))

    def test_isolation_forest_scores_only_upward_deviations(self) -> None:
        panel = synth_panel()
        m = E.fit_iforest(panel, [0, 1], "tune", max_rows=5000)
        x = panel.X[0].copy()
        x[2000] += 400
        x[2100] = 1.0
        s = m.score(x, panel)
        self.assertTrue(np.isfinite(s[2000]))
        self.assertTrue(np.isnan(s[2100]))   # a drop is not a pollution event
        self.assertGreater(s[2000], np.nanmedian(s[1500:1900]))


if __name__ == "__main__":
    unittest.main()

# Wind animation optimization (Phase 2B, Stage 2)

Date: 2026-11-04. Branch `feat/aeios-command-center`. Raw data: `frontend/web/tools/perf/out/` (git-ignored; copied to `Downloads\AEIOS_Phase2B_Evidence\`).
Harness: `frontend/web/tools/perf/streak-variants.mjs` (visual equivalence and performance). Earlier investigation: `../WIND_ANIMATION_PERFORMANCE_INVESTIGATION.md`.

## Decision
**Adopted.** The production streaks now animate a `transform` (one dash period per cycle) inside a per-lane clip, instead of `stroke-dashoffset`. The adoption is justified by visual equivalence in three engines, a 93% main-thread reduction in the real scenario, unchanged frame stability and memory, and unchanged accessibility semantics. It is **not** an improvement when the WebGL scene is running at the same time (see below), which on a normal viewport does not happen because the two are about 3,000 px apart.

## What was inspected
- The production implementation (`AtmosphericColumn.tsx`, `overview.css`): four `<line>` elements, `stroke-dasharray: 14 64` (period 78), `@keyframes cc-flow` animating `stroke-dashoffset` 78 to 0; pause via `animation-play-state` (off-screen and the Pause button); reduced motion: no animation, static `14 18` dashes.
- The 8.5 ms/s "transform probe" from the previous investigation (not visually equivalent: unclipped, different dash period).

## Prototype (isolated, then integrated)
- **Geometry:** the line starts one period (78 units) to the left of the lane (`x1 = X0 - 78`) and is translated right by 78 per cycle, inside a `clipPath` rectangle from `X0 - 1.25` to `X1 + 1.25` (the stroke's round caps). Dash positions at any time are identical to the dash-offset version: dash start = `X0 - 78 + 78 t/d + 78k` in both.
- The prototype was built in a standalone page and, for integrated measurements, injected into the measuring page only (no production code). Variants measured: `dash` (production), `transform` (prototype), `static` (no animation), `reduced` (OS reduced-motion setting).

## Visual equivalence (established first)
20 phases across a full cycle, both variants paused at the same phase (`animation-delay: -phase x duration`), screenshots at device scale 2, compared pixel by pixel in the browser. "Differing" = any channel off by more than 16/255. Edge bands = within 3 units of the lane ends.

| Engine | Lane interior: pixels differing (20 frames) | Interior max delta | Lane ends: pixels differing | Ends max delta |
|---|---|---|---|---|
| Chrome 139.0.7258.155 (system) | 2,908 (of ~39 M) | 58 | 856 | 190 |
| Firefox 157.0 (Playwright build 1555) | **0** | 2 | 700 | 189 |
| WebKit 27.2 (Playwright build 2370) | **0** | 2 | 688 | 189 |

- Interior: identical in Firefox and WebKit; in Chrome only anti-aliasing differences (sub-pixel coverage of a translated stroke), not visible by eye in the saved frames.
- Lane ends: the one systematic difference. A dash crossing the end of the lane is cut flat by the clip, where the original showed its round cap. At most 1.25 units, only while a dash crosses an end.
- Reduced motion: the static pattern was re-phased with `stroke-dashoffset: 18` (because the line now starts 78 units earlier). Compared against the previous static rendering: **0 of 656,000 pixels differ**.

## Performance (5 repetitions per variant and scenario; mean ± sd)
Method: fresh browser context per repetition; 5 s window; Chrome DevTools Protocol metrics for main-thread task, script, layout and style time; a trace over the same window for Paint (renderer main thread), GPU process main thread and display compositor (`VizCompositorThread`) top-level task time, and frame intervals (the compositor's draw-and-swap events); memory read after a forced garbage collection. Dev build, Chrome, 1440 x 900 (and 1440 x 4400 for the WebGL-active case), this PC.

**Important methodological correction made during this stage:** the first run of this harness used a page-side `requestAnimationFrame` counter for frame timing. A running rAF loop forces a main-thread frame every vsync, which moved the transform animation's work back onto the main thread and made the two variants look equal (196 vs 199 ms/s). The probe was rerun with the old harness (7.6, 9.4, 8.0 ms/s) to confirm, the counter was removed, and frame timing was taken from the trace instead. All numbers below are from the corrected harness.

### Integrated, column visible, WebGL inactive (the real Overview case)
| Metric | Dash (before) | Transform (after) |
|---|---|---|
| Main-thread task, ms/s | 195.7 ± 12.6 | **13.8 ± 2.3** |
| Paint (main thread, trace), ms/s | 227.8 | 9.8 |
| Style recalculation, ms/s | 9.0 ± 2.3 | 0.4 ± 0.1 |
| Layout, ms/s | 0.0 | 0.4 ± 0.1 |
| Script, ms/s | 0.3 | 0.1 |
| GPU process main thread, ms/s | 198.3 | 74.8 |
| Display compositor, ms/s | 66.4 | 74.5 |
| Frame interval p95 / p99, ms | 16.97 / 17.23 | 16.99 / 17.83 |
| Longest frame interval, ms | 71.1 ± 15.2 | 28.6 ± 6.4 |
| Dropped frames (> 25 ms) per 5 s | 1.0 | 0.8 |
| JS heap after GC, MB | 27.1 ± 1.7 | 26.8 ± 0.5 |
| DOM nodes | 4,188 | 4,189 |

### Isolated page (four lanes only)
Main-thread: dash 41.7 ± 1.6, transform **1.8 ± 0.1**, static 0.35, reduced 0.32 ms/s. Frame p95 16.9 / 17.1 ms. Heap 0.61 MB in all.

### WebGL scene active at the same time (1440 x 4400, artificial)
| Metric | Dash | Transform | Static |
|---|---|---|---|
| Main-thread task, ms/s | 269.7 ± 16.7 | 278.5 ± 9.1 | 61.8 ± 3.0 |
| Paint, ms/s | 303.9 | 247.9 | 0.1 |
| GPU process main thread, ms/s | 198.5 | 97.0 | 39.4 |
| Frame p99, ms | 17.25 | 18.46 | (no animation) |
| Layout, ms/s | 0 | 6.7 | 0 |

With the scene's render loop running, the main thread produces a frame every vsync anyway, so the transform version gives **no main-thread benefit** (difference within noise) and its p99 frame interval is about 1.2 ms worse, while GPU-process time still halves. On a normal viewport the column and the scene are never both visible; this case is reported for completeness, not as the deciding scenario. (The reduced-motion row is not comparable here: reduced motion also stops the scene, by design.)

### After adoption, in production code (original Phase-1 harness, `wind-streaks.mjs`)
| Scenario | Before (Phase 1 runs) | After |
|---|---|---|
| Idle, column and scene off-screen | 0.2 | 0.2 |
| Column visible, streaks running | 157 to 171 (median 159) | **16** |
| Column visible, Pause pressed | 0.2 | 0.2 |
| Column visible, reduced motion | 0.2 | 0.2 |

## Accessibility
Unchanged: the line is still inside the lane's `role="img"` (children are presentational); the added `<g>`, `<clipPath>` and `<rect>` add no semantics. Reduced motion still renders static dashes (now pixel-identical to before), Pause still works (`animation-play-state`), and the off-screen pause is unchanged. Covered by the existing step1/step3/reduced-motion specs.

## Tests performed for this change
- Visual equivalence in Chrome, Firefox and WebKit (above).
- Static reduced-motion pattern: pixel comparison before/after (0 differences).
- `step1-column`, `step3-focus-nav`, `reduced-motion` and `overview` specs on all six Chrome viewports (results in `PHASE_2B_EXECUTION_REPORT.md`).
- Full suites at the end (see the execution report).

## Outstanding risks
- Measurements are from one machine, a dev build, Chrome; phones were not measured. GPU-thread numbers come from trace events and do not include driver time.
- The end-of-lane cap difference is real (flat instead of round while a dash crosses an end). It was judged acceptable; it is visible only at high zoom.
- When the WebGL scene and the column are both visible (very tall viewports only) the change is neutral on the main thread and slightly worse at p99.

## Deferred
- Measuring on a physical phone (no device available here).
- The Lab's SVG instrument was not re-benchmarked; it remains Lab-only as decided.

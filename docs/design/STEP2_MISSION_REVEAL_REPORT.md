# Step 2 report: Mission Reveal and status-label morph on the Overview

Date: 2026-11-04. Branch `feat/aeios-command-center`. **Uncommitted, undeployed.** Evidence: `Downloads\AEIOS_Step2_Evidence\screens\`.

## What changed

| File | Change |
|---|---|
| `src/motion/reveal.tsx` (new) | `RevealRoot`, `RevealGroup`, `RevealCell`, `RevealControls`. Motion 14.9, `m` components, shared animation controls, storyboard schedule. |
| `src/motion/MorphStateLabel.tsx` (new) | Wraps the existing `StateLabel` (unchanged, same props and markup) and animates only a real change of state value. |
| `src/motion/MotionReady.tsx` (new) | `LazyMotion` with the small `domAnimation` bundle, plus a flag so animating components fall back to plain markup when it is absent. |
| `src/components/overview/Overview.tsx` | `<div className="cc">` becomes `<RevealRoot className="cc">`; assessment, measured air, alerts and outlook wrapped in `RevealGroup`; Skip/Replay row. |
| `src/components/overview/SituationHeader.tsx` | Only the currency strip is wrapped (`RevealGroup`); the headline and detail are untouched. Node label uses `MorphStateLabel`. |
| `src/components/overview/SystemRail.tsx` | Cells use `RevealCell` (stagger); state labels use `MorphStateLabel`. |
| `src/components/overview/LocalObservations.tsx` | State label uses `MorphStateLabel`. |
| `src/components/overview/overview.css` | Skip/Replay and `.cc-morph` styles. |
| `src/motion-lab/StateMorph.tsx`, `MotionLab.tsx` | The Lab chip now uses the production `MorphStateLabel` and has a "Poll again (same state)" button. |
| `tests/e2e/step2-reveal.spec.ts` (new), `motion-lab.spec.ts`, `overview.spec.ts` | New tests; `overview.spec.ts` now waits for exactly one node label (see below). |

Not touched: `StateLabel` and every other design primitive, data selectors, labels, `WeatherScene`, backend. No new dependency (Motion was already installed). No GSAP in production.

## Behaviour (as approved)
- **Schedule:** currency 0.08 s, assessment 0.18, evidence 0.32, telemetry 0.46 + 0.045 per cell, outlook (alerts and ribbon) 0.62. The situation headline and detail are never wrapped, so they are visible from the first frame. Done in about 1.15 s; a failsafe forces the end state at 2.2 s.
- **Only opacity and a 8-12 px translate move.** Values, gauge marks and labels are always in their final form.
- **Once per session** (`sessionStorage`; if blocked it simply plays). **Skip** and **Replay** are always present.
- **Never blocks anything:** no `pointer-events`, `visibility` or focus changes. Under reduced motion there are no hidden start states at all.
- **No replay on polling:** the state lives in the component, not in the polled data.
- **Status morph:** the label swaps with opacity plus a 3 px blur for 120 ms, keyed on the state value. A poll that returns new objects with the same state renders in place and does nothing visible.

## A real bug found and fixed during testing
Three telemetry cells (gateway and node rows) mount after the reveal has finished, because their data loads late. They started hidden and stayed at opacity 0 permanently while the state said "done". The tests caught it. Fix: elements that mount after the reveal is no longer playing start visible, and finishing forces every subscribed element to its end state.

## Correction to my earlier claim
I had said the Lab's status chip also changed size. Measurement showed it did not: Motion's layout animation needs the larger feature bundle, so with `domAnimation` the width simply jumped (163.9 to 180.8 px). The shipped pattern is a **label morph only**, with no size animation, and the Lab and docs have been corrected.

## Tests actually executed
| Check | Result |
|---|---|
| `tsc -b` | pass |
| `npm test` | 26 node tests and 31 Vitest tests pass |
| `npm run lint`, `format:check`, `lint:css` (motion-phase surface) | no errors reported |
| `npm run build` | pass; GSAP, ScrollTrigger and Lab absent from `dist` |
| Step 2 spec (6 tests: timing, once per session, Skip/Replay, interaction while playing, reduced motion, no replay on data update and polling) | pass on desktop before the full run |
| Full browser suite, 6 viewports (1440, 1280, 1024, 768, 390, 360) | First run: **173 passed, 13 failed**. All 13 were the same thing: during the 120 ms morph the outgoing and incoming "Node" labels are both in the page, and the existing test's strict locator hit that moment. The test now waits for exactly one label. The 36 Overview fixture tests were then re-run on all six viewports: **36/36 pass**. The suite as a whole was not re-run in one go after that test fix; no application code changed in between. |
| Fixtures: normal, stale, noreading, gatewayoffline, alert, feederror | all pass on all six viewports (with axe: no serious or critical violations). "Cached" is the state all of them are in, since Open-Meteo is blocked and the seeded model run is old. |

The no-replay test changes the model hour (a real prop change that re-renders the Overview with new objects) and fast-forwards the page clock by 65 s of polling; the reveal state never returns to `playing` and the status-label nodes are never re-created.

## Bundle impact (production build, before to after)
| File | Before (after Step 1) | After | Change |
|---|---|---|---|
| `index-*.js` | 1,674,278 B (458,205 gz) | 1,772,863 B (493,965 gz) | **+98,585 B (+35,760 B gz, +7.8% gz)** |
| `index-*.css` | 100,865 B (22,869 gz) | 101,521 B (22,962 gz) | +656 B (+93 B gz) |

This is larger than I expected. Motion's `m`, `AnimatePresence` and animation controls come in with the `domAnimation` set and are loaded synchronously in the main bundle. Option for later, not done: load the Motion features in a separate chunk after first paint; that would shrink the main bundle but the reveal could then start a little later, so it needs its own review.

## Screenshots
Deterministic frames (page clock frozen and stepped) at 150, 450, 800 and 1500 ms after Replay, at 1440 and 390 px, plus a reduced-motion first frame: `Downloads\AEIOS_Step2_Evidence\screens\`. Sampled opacities match the schedule (for example at 450 ms: currency 1, assessment 0.99, evidence 0.91, outlook 0, all telemetry cells 0).

## Known limitations
- The main bundle grows by about 35 KB gzipped.
- On first load the node label morphs once from "checking" to its real state; that is a genuine state change, but it is visible activity at load.
- The outgoing label stays in the page for about 120 ms during a morph (not a live region; tests account for it).
- Skip/Replay are small quiet text buttons above the headline; they add about 30 px of height.
- Not tested: physical phone, screen readers, Firefox, Safari. Performance of the reveal itself was not profiled separately.

## Rollback
Revert `Overview.tsx`, `SituationHeader.tsx`, `SystemRail.tsx`, `LocalObservations.tsx` and `overview.css`; the `src/motion/*` files and tests can stay unused. `StateLabel` was never changed.

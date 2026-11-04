# Step 1 report: pause the Atmospheric Column's CSS wind streaks

Date: 2026-11-04. Branch `feat/aeios-command-center`. **Uncommitted, undeployed.** Evidence folder: `Downloads\AEIOS_Step1_Evidence\` (`perf_before.json`, `perf_after.json`, `screens\`).

## What changed

| File | Change |
|---|---|
| `frontend/web/src/components/overview/AtmosphericColumn.tsx` | An IntersectionObserver sets `data-offscreen` on the figure (written to the element directly, no React state, so scrolling never re-renders the column). The existing Pause button now shows a visible "Pause"/"Resume" label. Under reduced motion the button is replaced by the note "Wind animation off (reduced motion)". |
| `frontend/web/src/components/overview/overview.css` | `.cc-column[data-offscreen='true'] .cc-col-flow` joins the existing paused rule; styles for the labelled toggle and the note. |
| `frontend/web/tests/e2e/step1-column.spec.ts` (new) | 4 tests: pause off-screen and resume; Pause/Resume persistence and unchanged information; reduced motion; no overflow and no touch capture. |
| `frontend/web/playwright.config.ts` | Added a 1024 x 768 project (you asked for 1024; it was missing). |

Not touched: `WeatherScene.tsx`, data selectors, labels, the values table, or any Lab file. No new dependency. No Motion, GSAP or other animation library is involved: this step is CSS plus one IntersectionObserver.

## What was already there
The column already had a Pause button (`is-paused`) and CSS that turns the animation off under reduced motion. Step 1 added the off-screen pause, made the control visibly labelled, and made the reduced-motion state explicit.

## Performance (measured, Chrome 139-class, dev server, 1440 x 900, seeded cached model run, Open-Meteo blocked)
Method: CDP `Performance.getMetrics` over 3 samples of 6 s each per scenario; the median is shown. `document.getAnimations()` counts what is really running. The WebGL scene loop is already stopped when the scene is off-screen (earlier workstream), so it is not part of these numbers.

| Scenario | Running animations | Main-thread task, ms/s (before) | After |
|---|---|---|---|
| Off-screen, as shipped | 4 -> **0** | 119.2 | **0.1** |
| Off-screen, streak animation forced off (isolation) | 0 | 0.1 | 0.1 |
| Off-screen, **all** CSS animation and transitions forced off | 0 | 0.1 | 0.1 |
| In view, as shipped | 4 -> 4 | 165.5 | 172.9 |
| In view, streak animation forced off (isolation) | 0 | 0.2 | 0.1 |
| In view, paused with the button | 0 | 0.1 | 0.1 |
| In view, reduced motion (OS setting) | 0 | 0.2 | 0.1 |

**Attribution.** The "before" isolation runs show that, in this scenario, forcing only the four streak animations off removes essentially all of the idle cost (119 -> 0.1 ms/s off-screen; 165 -> 0.2 ms/s in view); forcing every other CSS animation off as well changed nothing further. So the CSS streaks were the cause of the idle main-thread cost measured here. This was verified by experiment, not assumed.

**Honest reading**
- Off-screen the cost is now about zero. That is the saving this step delivers.
- **In view the streaks still cost about 165-173 ms/s of main-thread time** because they keep running by design. The 'before' to 'after' difference there (165.5 -> 172.9) is run-to-run noise. This is a real cost for the visible column and is the number a future comparison (for example with the Lab's SVG instrument) should be judged against.
- Limits: one machine (an old GPU, software-heavy path), a dev build, headless Chrome, and only main-thread time was measured (GPU and compositor work were not). Numbers will differ on phones.
- **Follow-up:** the in-view cost was investigated separately and attributed to per-frame main-thread painting of a non-compositable animation; see `WIND_ANIMATION_PERFORMANCE_INVESTIGATION.md`.
- This does **not** touch the Three.js scene. The WebGL loop fixes are a separate workstream (see `MOTION_LAB_REPORT.md`).

## Tests actually executed
| Check | Result |
|---|---|
| `tsc -b` | pass |
| `npm test` (26 node tests, 31 Vitest tests) | pass |
| `npm run lint`, `format:check`, `lint:css` (motion-phase files) | no errors reported |
| `npm run build` | pass; GSAP, ScrollTrigger and Lab absent from `dist` |
| Step 1 spec on 1440, 1280, 1024, 768, 390, 360 | **24/24 pass** |
| Full browser suite, all six viewports (includes the six Overview fixtures with axe, reduced motion and the Lab) | **144/144 pass** |
| Accessibility (axe on the Overview fixtures normal, stale, noreading, gatewayoffline, alert, feederror) | no violations (part of the 144) |

Fixtures: healthy (`normal`), stale, no-reading, gateway-offline, alert and feed-error all pass the overview spec. "Cached" is the state every one of them is in, because the seeded model run is old and Open-Meteo is blocked. The Step 1 spec itself ran on the `normal` fixture.
Not tested: a physical phone (touch scrolling was checked by computed styles and emulated touch viewports, not by hand), screen readers, Firefox, Safari.

## Bundle impact (production build, before -> after)
| File | Before | After |
|---|---|---|
| `index-*.js` | 1,673,826 B (458,076 gz) | 1,674,278 B (458,205 gz): **+452 B (+129 B gz)** |
| `index-*.css` | 100,589 B (22,825 gz) | 100,865 B (22,869 gz): **+276 B (+44 B gz)** |

## Screenshots
Before (icon-only Pause button): Phase 2A captures in `Downloads\AEIOS_Phase2A_Screenshots\after_final\`. After: `Downloads\AEIOS_Step1_Evidence\screens\` (running, paused, paused with values table open, reduced motion, phone 390).

## Known limitations
- The streaks, when running in view, remain the most expensive thing on the Overview (see above).
- A user pause is respected across scrolling, but is not remembered across page reloads.
- Under reduced motion the streaks are static dashes: speed is carried by the printed values, as before.
- The Pause label is short text beside the icon; on very narrow columns the caption wraps to two lines.

## Rollback
Revert the changes to `AtmosphericColumn.tsx` and `overview.css` (two files); the new spec and the 1024 project can stay. Nothing else depends on them.

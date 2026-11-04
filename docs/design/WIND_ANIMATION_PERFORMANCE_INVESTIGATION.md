# Wind animation performance investigation

Date: 2026-11-04. Branch `feat/aeios-command-center`. **Investigation only: no production code was changed for performance, and no improvement is claimed.** The production CSS streaks are unchanged, as decided.
Script: `frontend/web/tools/perf/wind-streaks.mjs` (reproducible; output is git-ignored). Raw data from every run: `Downloads\AEIOS_Wind_Perf_Investigation\` (`first.json` ... `sixth.json` and the trace files).

## Question
Step 1 reported about 170 ms/s of main-thread time while the Atmospheric Column's CSS streaks are visible. What is the actual source, and how does the WebGL scene compare?

## Method
- Machine: the development PC (an old NVIDIA GT 730), Chrome stable driven by Playwright, Vite **dev** server, 1440 x 900, seeded cached model run, Open-Meteo blocked (no API quota used).
- Each scenario uses a fresh browser context. After load it waits 3 s, scrolls to the target, waits 2.5 s, then takes 3 samples of 6 s. The table shows the **median** sample.
- Metrics (Chrome DevTools Protocol `Performance.getMetrics`): cumulative main-thread `TaskDuration`, `ScriptDuration`, `RecalcStyleDuration`, `LayoutDuration`. The difference over a window divided by the window length is main-thread ms per second. `document.getAnimations()` counts running animations; requestAnimationFrame callbacks per second and the scene's own `data-scene-frames` counter give frames.
- Diagnostic variants inject CSS into the measuring page only (never shipped), to test one hypothesis at a time.
- Attribution: a separate **traced** run (tracing adds overhead, so it is never mixed into the medians) sums main-thread trace events by name.
- The scenarios were run several times on different runs; the run-to-run spread of the baseline (column visible, streaks running) was 157 to 171 ms/s, so differences below about 15% should be treated as noise.
- Limits: one machine, a dev build, Chrome only, **main-thread time only** (GPU, compositor and raster threads are not measured). Phone numbers will differ.

## Required scenarios (main-thread ms/s, median)
| Scenario | Result (runs) | Running CSS animations | rAF/s | Scene renders/s |
|---|---|---|---|---|
| A. Idle, column and scene both off-screen | **0.2** (4 runs, all 0.2) | 0 | 0 | 0 |
| B. Column visible, streaks running | **159** (157, 159, 159, 171) | 4 | 0 | 0 |
| C. Column visible, Pause pressed | **0.2** (4 runs: 0.1 to 0.2) | 0 | 0 | 0 |
| D. Column visible, reduced motion | **0.2** (4 runs, all 0.2) | 0 | 0 | 0 |
| E. WebGL scene visible and running (column off-screen) | **43** (43.4, 44.8, 43.2, 42.8) | 0 | 60 | 30 |
| F. WebGL scene visible, "Pause 3D scene" pressed | **0.2** (4 runs: 0.1 to 1.3) | 0 | 0 | 0 |

Runs for E and G in which the scene's own `data-scene-active` flag was not `true` are **excluded** (E: 1 of 5 runs; G: 4 of 5). In those runs the first sample was elevated and the rest near zero, which is consistent with the scene leaving the viewport because late content shifted the layout; I did not isolate this further. The one valid G run (all CSS animation and transitions forced off, scene active) gave 43.2 ms/s, the same as E, so **the CSS animation does not affect the scene's cost**, but that rests on one run.

**Reading:**
- The CSS streaks (B) cost about **159 ms/s** while visible and are free when off-screen (A), paused (C) or under reduced motion (D).
- The WebGL scene (E) costs about **43 ms/s** at 30 renders/s (about 1.4 ms per render) and is free when paused or off-screen. It is an order of magnitude cheaper than the streaks, and the two are independent: with the column visible the scene is off-screen and not rendering (rAF/s 0 in B).

## Where the streak time goes (traced run of scenario B, per second)
| Main-thread event | ms/s | events/s |
|---|---|---|
| Paint | 208 | 120 (two per frame) |
| UpdateLayoutTree | 11.6 | 60 |
| Layerize | 17.3 | 60 |
| Commit | 12.7 | 60 |
| PrePaint | 5.5 | 60 |
| Script (FunctionCall) | 0.2 | 3 |
| Layout | about 0 | 0 |
| RunTask (all tasks; tracing adds overhead) | 187 | 303 |

The work happens **every frame (60 Hz) on the main thread, and it is paint**, not script, layout or style. (The event sums slightly exceed the task total because trace events nest and tracing adds overhead; the point is the ranking, not the exact figures.) The idle trace (scenario A) is about 12 ms/s of unrelated housekeeping.

## Hypotheses tested (main-thread ms/s; baseline B was 157 to 171 in the same series)
| Variant (injected, diagnostic only) | Result | Conclusion |
|---|---|---|
| H. Streak animation forced off | 0.2 | The animation is the whole cost |
| I. SVG text hidden | 157 / 155 | Text is not the cost |
| J. Only one streak animated | 158 / 165 / 156 | Cost does **not** scale with the number of streaks (4 to 1) |
| O. Streak lines only (rest of the SVG hidden) | 160 / 179 | The rest of the SVG is not the cost |
| K. SVG `contain: paint` | 152 / 154 / 152 | At most a few percent; within noise |
| L. SVG on its own compositing layer (`will-change: transform`) | 156 / 151 / 162 | No effect |
| M. `backdrop-filter` removed page-wide | 161 / 165 | Not backdrop filters |
| N. Shadows and filters removed in the Overview | 161 / 184 | Not shadows/filters |
| P. Rest of the Overview hidden | 157 / 178 | Not the neighbouring Overview panels |
| Q. All other page sections hidden | 133 (baseline 157 in that run) | about 15% lower |
| R. Sidebar and top bar hidden | 180 | No reduction |
| U. All canvases hidden | 181 | Not the WebGL canvases |
| W. Everything else `visibility:hidden` (nothing else paints) | 95.5 (baseline 157 in that run) | about 40% lower |
| S. Four animated dashed lines on a **blank page** | 39 / 33 | The same animation costs about a quarter of this on an empty page |
| **X. Dash animation replaced by a `transform` animation** (same 4 animations running; not visually equivalent) | **8.5** | **about 95% lower** |

## Conclusion (what is established and what is not)
**Established by experiment:**
1. The cost is entirely the four CSS streak animations (H, C, D, A), measured as **main-thread painting every frame**, not script, layout or style.
2. It is **not** proportional to the number of streaks (J), not caused by text, filters, shadows, backdrop filters, canvases or the neighbouring panels, and not fixed by containment or a separate layer on the SVG (I, K, L, M, N, O, P, U).
3. The **animated property is the lever**: the streaks animate dash geometry (a non-compositable property), which forces a main-thread paint on every frame. Animating `transform` instead (X) keeps the same number of running animations at **8.5 ms/s**, because transform animations are handled by the compositor.
4. The surrounding page adds to the paint cost: with nothing else painting (W) the cost falls about 40%, and on an empty page (S) it is about a quarter, so roughly a third to a half of the in-app cost depends on what else the page paints, but the animation type determines the rest.

**Not established:** exactly why the same animation costs about four times more in the app than on a blank page (W narrows it but does not close it), and whether the compositor variant would also reduce GPU/raster work (not measured). The transform variant (X) is a measurement probe, not a design: it moves the line ends, so it is not visually equivalent to the dashed-flow encoding.

## Options for later (none applied; the production CSS streaks are unchanged)
- Re-express the flow as a compositor-driven animation: a pre-dashed pattern translated by exactly one dash period inside a fixed clip, so the line ends stay put. The probe suggests main-thread cost could fall by about an order of magnitude; it needs a visual-equivalence review and a before/after measurement before any claim.
- Keep the current behaviour (already free off-screen, paused and under reduced motion) and accept about 160 ms/s only while the column is visible.
- The Lab's SVG instrument does not address this: its cost was not measured here, so it should be compared with the same script before it is reconsidered.

## Reproduce
```bash
cd frontend/web
npm run dev -- --host 127.0.0.1 --port 5173
node tools/perf/wind-streaks.mjs mytag          # all scenarios, about 8 minutes
ONLY='^(B|X) ' node tools/perf/wind-streaks.mjs mytag   # a subset
```

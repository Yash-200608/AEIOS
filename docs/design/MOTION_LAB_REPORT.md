# Motion Lab report (Motion & Storytelling phase, steps 1–4 and the 3D fixes)

Date: 2026-11-01. Branch `feat/aeios-command-center`, base `159fb72` (Phase 2A). **Uncommitted. Nothing applied to the Overview yet.**
Spec: [ANIMATION_ARCHITECTURE.md](ANIMATION_ARCHITECTURE.md), [MOTION_STORYBOARD.md](MOTION_STORYBOARD.md), [MOTION_PERFORMANCE_AND_A11Y.md](MOTION_PERFORMANCE_AND_A11Y.md).

## What was built

| Area | Files | Summary |
|---|---|---|
| Motion foundation | `src/design/motion.ts`, `src/motion/useMotionPolicy.ts`, `useActiveLoop.ts`, `changes.ts` (+ tests) | Tokens mirroring the CSS tokens; one reduced-motion policy (OS query or `.aeios-force-reduced-motion`); a loop gate (on screen, tab visible, not reduced, not paused); value-based change detection (5 unit tests). |
| Motion Lab (dev only) | `src/motion-lab/*` (12 files), `/?motionlab` | A: Mission Reveal in Motion and in GSAP. B: Atmospheric Flow (SVG) + live 3D scene monitor. Change signals. C: Story Scroll (Motion `whileInView` and a ScrollTrigger variant). |
| 3D scene integrity + cost | `src/components/WeatherScene.tsx`, scene parts of `App.tsx`, `styles.css` | Mount once, update in place; loop runs only when allowed; time-based speed; no rain/cloud without data; no decorative sway; null stays null; `touch-action: pan-y`; Pause button; Reset without remount; altitude labels from the real 7 layers. |
| Tooling | `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `stylelint.config.mjs`, `playwright.config.ts`, `tests/e2e/*` | New scripts: `typecheck`, `lint`, `lint:all`, `format:check`, `lint:css`, `test:e2e`. Existing `dev`/`build`/`preview` unchanged; `test` extended with one file. |

## Packages

Dependencies: `motion` 14.9.0 (MIT), `gsap` 3.15.0 and `@gsap/react` 2.1.2 (GSAP Standard no-charge licence — **Lab only, pending owner approval for production**).
Dev dependencies: eslint 10.14, @eslint/js, typescript-eslint 8.72, eslint-plugin-react-hooks 7.1, globals, prettier 3.9, eslint-config-prettier, stylelint 17.16 + config-standard 40, @playwright/test 1.64, @axe-core/playwright 4.14.
Not installed: Lenis, Anime.js, Rive, dotLottie, React Three Fiber.

## Results

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc -b`) | pass |
| `npm test` | 26/26 pass |
| `npm run lint` (motion-phase surface) | pass |
| `npm run format:check` (motion-phase surface) | pass |
| `npm run lint:css` | pass |
| `npm run build` | pass; GSAP, ScrollTrigger and the Lab absent from `dist`; Motion not in `dist` (no production use yet) |
| Bundle | 1,608 KB / 437.9 KB gzip vs baseline ≈ 435 KB gzip (+≈3 KB, the scene rewrite) |
| `npm run test:e2e` | **85/85 pass** on desktop 1440, laptop 1280, tablet 768 (touch), phone 390 and 360 (touch) |
| axe (Overview, 6 fixtures) | 0 violations |

Baseline lint debt (recorded, not fixed, outside this phase): `eslint .` reports 62 errors / 2 warnings in 13 legacy files (App.tsx 28, api.ts 10, sim.ts 6, Overview.tsx 5, …). The Overview folder is outside the lint/format gate until patterns are applied there.

## Performance (dev server, 1440×900, seeded model cache, Open-Meteo blocked)

| Scenario | Baseline | After |
|---|---|---|
| Idle at top: rAF/s · script ms/s | 60 · 16 | **0 · 0** |
| 3D scene in view: renders/s · task ms/s | ≈30 · 224–298 | 29.9 · **201–212** (5 repeats) |
| Scene off-screen: rAF/s · task ms/s | 60 · 166 | **0 · 100–149** |
| Tab hidden | 1 · 4 | 1 · 4 |

Traces: `Downloads/AEIOS_Motion_Baseline/` and `Downloads/AEIOS_Motion_After/` (`after_metrics.json`, `inview_repeat.json`, two traces).
One "after" in-view sample read 359 ms/s directly after a scroll; five steady repeats read 201–212. The remaining ≈100 ms/s off-screen with zero script is mostly the Overview's CSS wind streaks in `AtmosphericColumn`, which still run off-screen (Overview not touched yet).

## Fixed during verification

- Test timing: the Motion reveal measured from before navigation; the reveal itself runs 1.15 s (1.34 s cold), on the 1.1 s storyboard. The test now times from Lab mount.
- Off-screen helper scrolled 40 px past the edge, inside `useActiveLoop`'s 100 px margin; now 200 px.
- Scene altitude caption wrapped onto the 500 hPa label; now one line with room above the list. On phones (≤560 px) the schematic labels are hidden: a 275 px scene cannot fit 7 labels and the legend, and the profile cards list every layer.

## Honest limitations

- Simulation and fixture data only for gateway, nodes and alerts in the Lab; weather is the cached real run (2026-10-31 21:49 IST). Not field evidence.
- Both reveals render the real Overview components, so heading ids repeat inside the Lab (axe was run on the Overview, not the Lab).
- Phone swipe behaviour on the 3D scene (`pan-y` + one-finger rotate) is verified by reading OrbitControls r171 and by automated touch-viewport runs, not on a physical device.
- Performance numbers come from a dev build on one machine (GT 730); production builds and phones will differ.
- The 6th viewport in the plan (an intermediate desktop) was folded into 1440/1280.

## Decision needed

Which Lab patterns go onto the Overview. Recommended: Mission Reveal (Motion engine), change signals, the 3D loop gating already shipped, and pausing the CSS streaks off-screen. Defer GSAP and ScrollTrigger (licence and size) and Story Scroll (the Overview is a dashboard, not a narrative page).

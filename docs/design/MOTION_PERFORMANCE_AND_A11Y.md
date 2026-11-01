# Motion: performance budget, accessibility and test plan

## 1. Baseline (before motion work, dev server, 1440x900, NVIDIA GT 730)

| Scenario | rAF callbacks / s | Main-thread task ms / s |
|---|---|---|
| Idle at top (3D scene off-screen) | 60 | 173 |
| 3D scene in view | 60 | 224 to 298 |
| Scrolled to bottom (scene off-screen) | 60 | 166 |
| Tab backgrounded (browser throttling only) | 1 | 4 |

Load: FCP about 0.9 to 1.5 s (dev server). Production: one JS chunk of 1,606,607 B (435 KB gzip). Traces: `Downloads/AEIOS_Motion_Baseline/`.

## 2. Budget

- 0 WebGL frames when the 3D scene is off-screen, paused, hidden or under reduced motion.
- No continuous rAF anywhere when nothing animates.
- The reveal adds no long task over 50 ms and finishes in about 1.1 s.
- Production bundle growth target: under 40 KB gzip for Motion (GSAP is Lab-only and must not appear in the production bundle).
- Animate `opacity` and `transform` only (exception: SVG `stroke-dashoffset` inside one paused-aware loop).

## 3. Accessibility

- `prefers-reduced-motion` and `.aeios-force-reduced-motion` honoured by CSS, Motion (`MotionConfig reducedMotion="user"` plus `useMotionPolicy`), GSAP (`gsap.matchMedia`), Three.js and JS smooth-scroll calls.
- Pause for every persistent motion; keyboard and touch operable; 24 px minimum targets (44 px preferred).
- Animations never move focus; reveals never hide content from assistive technology (no `visibility: hidden` end states).
- `aria-live="polite"` only for real state changes; never for decorative motion.
- No flashing; no infinite pulse.
- Every animated visual has a text or table alternative.

## 4. Test plan

| Area | Tool | Cases |
|---|---|---|
| Types | `tsc -b` | whole app |
| Unit | `node --test` | state model (existing 21) plus change-detection helpers |
| Lint | ESLint flat config (typescript-eslint, react-hooks) | new and touched files |
| Format | Prettier `--check` | new and touched files only |
| CSS | Stylelint | new CSS files |
| Browser | Playwright (system Chrome) | 1440, 1280, 1024, 768, 390, 360; healthy, stale, no reading, gateway offline, cached, feed error, alert; reduced motion on/off; Skip/Replay; interaction during reveal; Pause; off-screen 3D frame count; unmount/replay leak check (no orphan ScrollTriggers, RAF loops) |
| Accessibility | `@axe-core/playwright` | Overview and Lab, both themes of motion |
| Performance | CDP metrics + Chrome traces | same four scenarios as the baseline |

Open-Meteo rule: every browser test seeds the cached model run and blocks `open-meteo.com` so the free quota is never consumed.

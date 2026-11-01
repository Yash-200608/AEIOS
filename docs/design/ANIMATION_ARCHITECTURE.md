# Animation architecture

**Status:** approved plan (2026-11-01), implementation in progress on `feat/aeios-command-center` (base `159fb72`).
**Source:** `AEIOS_Motion_Storytelling_Implementation_Playbook.md` and the motion audit (repository, 3D scene, data flow, performance baseline).

## 1. Principles

1. **Motion explains state; it never decorates.** Every movement encodes a real transition (a reveal order, a new packet, a freshness change) or a real model variable (wind speed).
2. **Truth over flourish.** No number tweening, no count-ups, no pulse loops, no animation keyed on poll identity, no motion that makes a model profile look like a measurement.
3. **Interruptible and optional.** Nothing blocks scrolling, input or focus; every persistent motion has Pause; reduced motion renders the final state immediately.
4. **One engine per element and property.** Ownership is fixed in section 3 and enforced in code review.
5. **Zero cost when idle.** No animation loop runs when nothing is moving, off-screen or in a hidden tab.

## 2. Stack and versions

| Layer | Package | Scope |
|---|---|---|
| React UI motion | `motion` (imports from `motion/react`; `LazyMotion` + `m` + `domAnimation` to keep bundle small) | Production candidate |
| Choreographed timelines | `gsap` + `@gsap/react` (`useGSAP`, `contextSafe`), `ScrollTrigger` | **Motion Lab only** until the owner approves GSAP's proprietary "Standard no-charge" licence for production |
| Atmospheric scene | existing `three` 0.171 (`WeatherScene.tsx`) | Production; loop hygiene and integrity fixes |
| Simple polish | CSS transitions with `--aeios-dur-*` tokens | Production |

Not installed: Lenis, Anime.js, Rive, dotLottie, React Three Fiber (no prototype has shown a need).

## 3. Ownership matrix

| Target | Owner | Property | Notes |
|---|---|---|---|
| Overview reveal groups (`[data-reveal]`) | Motion (production) / GSAP (Lab comparison only) | `opacity`, `transform` | Never both on the same element in one build |
| State-change signals (new packet, freshness change, alert raised) | Motion | `opacity`, `background-color` on a highlight overlay | Keyed on real ids/timestamps, once |
| Story chapters (`[data-story-chapter]`) | Motion `whileInView` (default) / ScrollTrigger (Lab comparison) | `opacity`, `transform` | `once: true`, no pin, no snap |
| Atmospheric flow streaks | One `requestAnimationFrame` loop per instrument, writes SVG attributes directly (no React state) | `stroke-dashoffset` / transform | Paused by Pause, off-screen, hidden tab, reduced motion |
| 3D scene | Three.js render loop | WebGL | Paused off-screen, hidden tab, reduced motion |
| Hover, focus, drawer | CSS | colour, `transform` | Existing tokens |

## 4. Motion policy (single source)

- `src/design/motion.ts`: duration, easing and stagger tokens (seconds, for JS engines) mirroring `--aeios-dur-*`.
- `src/motion/useMotionPolicy.ts`: one hook returning `{ reduced }` from `prefers-reduced-motion` **or** the `.aeios-force-reduced-motion` class on `<html>`, updating live on change. Every JS animation consults it; `MotionConfig reducedMotion="user"` covers Motion; `gsap.matchMedia()` covers GSAP in the Lab.
- `src/motion/useActiveLoop.ts`: one helper that reports whether a loop may run (`!paused && onScreen && !document.hidden && !reduced`), using `IntersectionObserver` and `visibilitychange`.

## 5. Change detection (no fake liveness)

The AEIOS poll returns a new object every 30 s and alerts every 60 s even when nothing changed. Signals are therefore derived from values, not identity:

| Signal | Fires when |
|---|---|
| New packet | a node's `rx_utc` differs from the previous render's value for that node (not on first render, not on site or fixture switch) |
| Freshness change | `nodeFreshness()` / `gatewayOnline()` result differs from the previous value |
| Alert raised | `alertOutcome().alert.id` differs and kind is `active` |
| Alert cleared | kind changes from `active` to another kind |

The pure diffing lives in `src/motion/changes.ts` with Node tests.

## 6. Development-only Motion Lab

Mounted from `main.tsx` behind `import.meta.env.DEV && ?motionlab`, lazy-imported exactly like `?designlab`, so it is absent from production bundles (verified by string search of `dist/`). GSAP is imported only inside the Lab.

## 7. Three.js changes in scope

Loop hygiene: pause off-screen, hidden tab, reduced motion; time-based (frame-rate independent) particle speed; no full WebGL rebuild on data change. Integrity: no rain when none is forecast; no clouds at 0% cover; no decorative sway or wobble; calm wind stands still; missing values shown as missing, not 0. Architecture stays plain Three.js.

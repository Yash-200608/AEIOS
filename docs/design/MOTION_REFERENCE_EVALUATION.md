# Motion reference and component evaluation

Date: 2026-11-03. Status: **for review. Nothing here is applied to production components.** The demonstrations live in the dev-only Motion Lab (`/?motionlab`).
Rules that every selection had to pass: [ANIMATION_ARCHITECTURE.md](ANIMATION_ARCHITECTURE.md), [MOTION_STORYBOARD.md](MOTION_STORYBOARD.md), [MOTION_PERFORMANCE_AND_A11Y.md](MOTION_PERFORMANCE_AND_A11Y.md). In short: motion explains a change of state and never decorates; no number tweening, particles, pulses or scroll hijacking; reduced motion shows end states at once; provenance and freshness stay explicit.

Third-party stills are **not** in the repository (they belong to their creators). They are kept locally in `Downloads\AEIOS_Motion_References\`; each entry gives its URL. Screenshots of our own demonstrations are in `references/demos/`.

## How each source was used

| Source | What it actually is | Used for |
|---|---|---|
| prompt-motion.com | Gallery of AI-made motion **videos** with the prompts behind them. No code. | Sequencing, timing, composition ideas (product UI, charts, diagrams) |
| eyecannndy.com | Library of **film and camera techniques** with short definitions and clips. No code. | Spatial ideas translated into restrained interface behaviour |
| reactbits.dev | Free animated **React components** (copy-paste). Licence: MIT + Commons Clause. | Patterns only. Nothing installed, nothing copied. |

Limits of this research: Prompt Motion entries are videos, so I judged them from the page text, the prompts and sampled frames, not from code. Eyecannndy shows a bot check to automated browsers (not bypassed); its technique pages were read through the app browser, where they carry only a short definition and clips, so only one still could be kept. React Bits was assessed from its public repository (licence, `package.json`, component imports and source), not from its demo pages.

## Selected examples

### 1. One element, never cut: state morph
- **Reference:** Prompt Motion, "Shape morphing through UI states", https://prompt-motion.com/twoclipping-5cba86 (stills: `pm-shape-morphing-ui-states-1..3.png`).
- **What makes it effective:** a single shape changes size, radius and colour while its content swaps with a very short blur, so the eye follows one object instead of re-finding a new one. Every change has a visible cause. The prompt behind it bans bouncy easing, glows and dead time, which matches our tone.
- **AEIOS translation:** status labels (node FRESH → STALE, gateway error) swap with a 120 ms blur when the state really changes. **Correction (Step 2):** I first described this as also changing the chip's size; measurement showed Motion's layout animation does not run with the light feature bundle (the width jumped), so the shipped pattern is a label morph only, with no size animation.
- **Technology:** Motion `AnimatePresence` (no `layout`; see correction above); colour from the state class in CSS. No overshoot.
- **Data:** state comes from the existing selectors; the animation conveys the change and shows no value.
- **Performance / accessibility:** layout is transform only; the 3 px blur is on one small element for 120 ms. The explanation line is `role="status"`; reduced motion swaps instantly; text and colour contrast are unchanged.
- **Built as:** Lab prototype A2 (`StateMorph.tsx`). Screens: `references/demos/A2_state_morph_*.png`.

### 2. Focal shift: the selected thing leads, the rest recede
- **References:** Eyecannndy "Focal shift", https://eyecannndy.com/technique/focal-shift (still: `ec-focal-shift.jpg`); Prompt Motion "Landing page 3D scroll", https://prompt-motion.com/twoclipping-d89be5 (stills: `pm-3d-scroll-1..3.png`), where non-focus layers soften while the focus layer is sharp.
- **What makes it effective:** attention is directed by relative emphasis, not by adding more things.
- **AEIOS translation:** (a) Atmospheric Flow: selecting a height lane quiets the other lanes' streaks (opacity 0.35); text is never dimmed. (b) Story Scroll: the chapter nearest the viewport centre gets a 3 px accent and its index link gets `aria-current`. I deliberately used a marker, not dimming or blur, so contrast never changes and nothing moves under the reader.
- **Technology:** CSS (`:has()`, one transition) and one IntersectionObserver. No library.
- **Data:** the lanes show real model values; the chapter marker is pure navigation feedback.
- **Performance / accessibility:** opacity and border colour only; observer disconnects on unmount; keyboard focus triggers the same state as hover; `aria-current` is announced by screen readers.
- **Built as:** Lab prototypes B and C. Screens: `B_flow_focal_shift.png`, `C_story_active_chapter.png`.

### 3. Build the diagram in reading order
- **Reference:** Prompt Motion, "Derivative concept explainer" (Manim), https://prompt-motion.com/linearuncle-5d2bae (stills: `pm-derivative-explainer-1..3.png`); the explanation is constructed step by step with each step on screen only when it is needed.
- **What makes it effective:** the order of appearance teaches the order of reasoning.
- **AEIOS translation:** the Mission Reveal already follows the reading order of the verdict: statement, currency, assessment, measured air, telemetry, outlook. The same principle sets the Atmospheric Flow's one entrance: the **mixing layer rises from the ground to its modelled height once**, before the wind lanes are read. A shape reaches its final value; no number is tweened.
- **Technology:** CSS `transform: scaleY` with a data attribute; Motion for the Reveal (already built).
- **Data:** real (mixing height, wind); the entrance itself is presentation only and is skipped under reduced motion.
- **Performance / accessibility:** transform only, once per page view; no entrance exists when reduced motion is on.
- **Built as:** Lab prototype B (`data-enter`).

### 4. Parallax: already present, honestly
- **Reference:** Eyecannndy "Parallax", https://eyecannndy.com/technique/parallax.
- **Finding:** parallax means layers moving at different rates read as depth. In the Atmospheric Flow the height lanes already move at different rates **because the modelled wind speed differs with height**. That is real differential motion, so a pointer-driven or scroll-driven parallax would add a false cue. **Not adopted.**

### 5. Dolly and tracking: proposals that need a scene prop
- **References:** Eyecannndy "Dolly" https://eyecannndy.com/technique/dolly-shot and "Tracking" https://eyecannndy.com/technique/tracking.
- **AEIOS translation:** (a) a single slow push-in (about 8% of camera distance over 1.2 s) the first time the 3D scene enters view, then control passes to the user; (b) a "Follow layer" control that moves the orbit target to the selected height, instead of snapping.
- **Technology:** Three.js camera and `OrbitControls` (both already in the scene).
- **Data:** camera only; the weather it shows is unchanged.
- **Status:** **not built.** Both need an optional prop on `WeatherScene.tsx`, which is a production component. Included in the implementation proposals.
- **Performance / accessibility:** both run only inside the existing loop gate; skipped under reduced motion; neither may trap touch scrolling.

### 6. Match motion and scale shift
- **References:** Eyecannndy "Match motion" https://eyecannndy.com/technique/match-motion and "Scale Shift" https://eyecannndy.com/technique/scale-shift.
- **AEIOS translation:** match motion is realised by example 1 (the same chip continues through a state change). Scale shift (zoom from overview into detail) would suit "Open the full 48-hour analysis"; that needs a route-like transition the app does not have, so it is **deferred**.

## React Bits: candidate evaluation

Licence of the repository: **MIT + Commons Clause**. We may use components in our product, including commercially; we may not sell or redistribute the components themselves. That is workable for copying a few files into AEIOS, but each copied file must keep its notice, and the licence needs owner sign-off (same gate as GSAP).
Compatibility baseline: React Bits' own `package.json` targets **React 19 and Motion 12**; AEIOS is on **React 18.3 and Motion 14.9**. Components that use only `motion/react` hooks should run on 18, but none was run here.
Imports below were read from each component's source file.

| Component | Actual dependencies | Scientific relevance | Accessibility | Performance / bundle | Motion or CSS equivalent? | Verdict |
|---|---|---|---|---|---|---|
| TrueFocus | `motion/react` (`useReducedMotion`) | Moving focus frame between items: a focal shift | Frame is `aria-hidden`, so it carries no information; honours reduced motion | Light | Yes: the lane/chapter markers above | **Pattern only.** Not copied. |
| AnimatedList | `@hugeicons/react` (extra icon library) | Sliding selection indicator in a list: fits the alert log | Checks reduced motion; indicator is spring-driven in a custom loop. Keyboard behaviour not verified | Extra icon dependency; custom physics loop | Yes: Motion `layoutId` indicator | **Pattern only**, for the alert list (proposal) |
| GradualBlur | none (CSS backdrop-filter layers) | Edge fade for scroll areas | Decorative | `backdrop-filter` stacks are costly on weak GPUs | Partly (a CSS mask fade) | **Reject** for the dashboard (cost, no meaning) |
| BlurText | `motion/react` | Blur-in headline | Hides text during animation | Light | Yes | **Reject**: the situation statement must be visible at first paint |
| CountUp, Counter | `motion/react` / none | Animates intermediate numbers | Screen readers may read steps | Light | n/a | **Reject**: looks like extra measured samples (storyboard rule) |
| FadeContent, AnimatedContent | **GSAP + ScrollTrigger** | Scroll reveal | Fine | Pulls in GSAP | Yes: Motion `whileInView` | **Reject**: duplicate of Motion; GSAP licence unresolved |
| ScrollStack | none (own scroll logic) | Stacked scroll cards | Scroll-linked pinning and inner scrolling | Heavy scroll handlers | Not needed | **Reject**: scroll hijack rule |
| TiltedCard, Magnet | none | Pointer tilt / pull | Pointer-only; no touch equivalent | Per-pointer-move updates | CSS | **Reject**: decorative |
| Stepper | `@hugeicons/react` | Multi-step flow | Not reviewed | Extra icon library | n/a | **Not relevant** to the Overview |

Result: **no React Bits file is adopted.** Two patterns (moving focus indicator, selection indicator in a list) are reproduced with Motion or CSS already in the project, so nothing is installed or copied. React Bits remains a source of ideas for a future public page, which is out of scope here.

## Demonstration summary

| Demo | Lab location | New this round | Test |
|---|---|---|---|
| A. Mission Reveal | Prototype A | Status label morph (A2) | `status label morph: each state swaps the label` |
| B. Atmospheric Flow | Prototype B | Mixing-layer rise; focal-shift on lane selection | `atmospheric flow: the mixing layer rises once; selecting a lane quiets the others` |
| C. Story Scroll | Prototype C | Active-chapter accent and `aria-current` | `story scroll: the chapter in the middle of the viewport is marked...` |

Implementation proposals for the Overview: [MOTION_OVERVIEW_PROPOSALS.md](MOTION_OVERVIEW_PROPOSALS.md).

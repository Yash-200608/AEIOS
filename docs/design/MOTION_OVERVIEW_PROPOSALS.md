# Overview implementation proposals (for review)

Date: 2026-11-03. **Proposals only.** No production component has been changed for this round. Everything below has a working Lab demonstration unless marked otherwise. Evidence and sources: [MOTION_REFERENCE_EVALUATION.md](MOTION_REFERENCE_EVALUATION.md).
Common rules for every proposal: one engine per element (Motion or CSS, never both); no GSAP in production; opacity, transform and (one tiny) blur only; reduced motion renders end states at once; no scroll hijacking, snapping or pinning; no animation moves focus or blocks input; provenance, freshness and cached/stale labels stay visible while and after anything animates.

## A. Mission Reveal (+ state morph)

| | |
|---|---|
| Change | Wrap the Overview groups in `data-reveal` containers using the Motion schedule already proven in the Lab (currency 0.08 s, assessment 0.18, evidence 0.32, telemetry 0.46 with 0.045 stagger, outlook 0.62; done at about 1.1 s). Situation statement never animates. Plays once per session; Skip and Replay in a small control. Status labels swap with a short blur when a real state changes (label morph only; no size animation, see the correction in MOTION_REFERENCE_EVALUATION.md). |
| Files | `Overview.tsx` (wrappers only), new `src/motion/Reveal.tsx`, small additions to `overview.css`; `StatusChip` behaviour via the existing `StateLabel` (wrapper, no change to its API). |
| Libraries | `motion` 14.9 (`LazyMotion` + `m`), already installed. Bundle cost is **not yet measured**: Motion is currently only in the dev-only Lab, so it must be measured on a real build before and after. |
| Data impact | None. Values render in their final form from the first frame; only opacity and position move. |
| Risks | Hidden start states must not render when no reveal will play (solved in the Lab with a pre-paint decision); the reveal must not run again on 30 s polls (key it on the first load only); cached/stale notices must not appear after the content they qualify (they animate first, at 0.08 s). |
| Tests | Reuse the Lab specs against the Overview: reaches done within 2.5 s of mount, Skip and Replay, scroll and focus work during play, reduced motion shows all at opacity 1, no re-run after a poll. Axe on all six fixtures. |
| Rollback | One wrapper component; removing it restores the static Overview. |

## B. Atmospheric Flow

| | |
|---|---|
| Change | Three independent items. (1) **Pause the existing CSS wind streaks when off-screen or paused**, plus a visible Pause button on the Atmospheric Column (today they run forever). (2) **Focal shift** on lanes: selecting a height quiets the other streaks. (3) **Mixing layer rises once** on first view. Optional: replace the CSS streaks with the Lab's time-based SVG instrument (calm and saturated labelling, per-lane readout); decision below. |
| Files | `AtmosphericColumn.tsx`, `overview.css` (state attributes and transitions). Optional swap: `AtmosFlow` moved out of the Lab into `src/components/overview/`. |
| Libraries | None for (1) to (3) (CSS plus one IntersectionObserver). The optional swap uses the already-written rAF loop and `useActiveLoop`. |
| Data impact | None. Streak rate stays proportional to modelled wind speed; direction stays printed text; calm and saturated stay labelled. |
| Risks | Today's streaks encode speed with CSS animation durations; the swap changes the encoding to a measured rate, so it needs a side-by-side review before replacing. The pause must not remove the information (values stay in text and table). |
| Measured effect | Off-screen, the Overview currently spends about 100 ms/s of main-thread time with no script running (see MOTION_LAB_REPORT.md). The CSS streaks are the likely cause, but this has not been isolated; step 1 should include a before/after measurement. Pausing them is the largest remaining saving. |
| Tests | Streak animation state is `paused` when off-screen, when the button is pressed and under reduced motion; lane selection quiets the other lanes; mixing band reaches its final transform once. |
| Rollback | Attribute and CSS only for (1) to (3). |

### B+. Scene camera ideas (needs a production prop)
- **Dolly entry:** one 8% push-in the first time `WeatherScene` enters view, then user control. **Follow layer:** orbit target eases to the selected height.
- Needs one optional prop on `WeatherScene.tsx` (for example `cameraIntro` and `focusLayer`), inside the existing loop gate, off for reduced motion, never adding touch capture.
- Not built because the brief excludes production changes at this stage. Cost: roughly 60 lines plus a Lab demo.

## C. Story Scroll

| | |
|---|---|
| Change | Keep the Overview a dashboard (all sections reachable at once). Adopt only the safe parts: the active-section accent and `aria-current` in the page navigation, and `whileInView` entrance (once, 16 px, opacity) for the long lower sections such as Regional context and Destinations. **No pinning, snapping, forced order or scroll-linked scrubbing.** |
| Files | `App.tsx` section navigation (active state), `overview.css`; entrance wrappers around lower sections. |
| Libraries | CSS plus one IntersectionObserver; Motion `whileInView` if entrances are wanted. **No ScrollTrigger.** |
| Data impact | None. |
| Risks | Check whether the existing navigation already marks the current section; the new marker must not conflict with that logic. Lower sections that load data must not animate in again when data arrives. |
| Tests | One active section at a time; `aria-current` follows scroll; document `scroll-snap-type` stays `none`; all sections visible at opacity 1 after scrolling. |
| Decision | The Lab shows a six-chapter story page. I recommend **not** turning the Overview into a story page. |

## Order of work if approved
1. B(1): pause CSS streaks off-screen, plus Pause button (largest measured saving, smallest risk).
2. A: Mission Reveal and state morph on the Overview.
3. B(2), B(3), C marker.
4. B+ scene camera prop (separate approval; touches `WeatherScene.tsx`).

Each step ships on its own with the browser tests, lint and build gates used so far, and is deployed only on your instruction.

## Decisions needed from you
1. Approve steps 1 to 3 above (or choose a subset).
2. Replace the CSS streaks with the Lab's time-based SVG instrument, or keep the CSS streaks and only pause them?
3. Allow the optional prop on `WeatherScene.tsx` for dolly entry and follow layer?
4. React Bits licence (MIT + Commons Clause): no component is proposed, so no sign-off is needed now.

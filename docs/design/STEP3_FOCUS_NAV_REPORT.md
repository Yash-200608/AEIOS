# Step 3 report: lane focus, mixing-layer rise, scroll-following navigation

Date: 2026-11-04. Branch `feat/aeios-command-center`. **Uncommitted, undeployed.** Evidence: `Downloads\AEIOS_Step3_Evidence\screens\`.

## What changed

| File | Change |
|---|---|
| `src/components/overview/AtmosphericColumn.tsx` | **B(2)** each wind height is a focusable lane (`tabIndex=0`, labelled, hover / focus / click selects, Escape clears). **B(3)** `data-enter` (`pending` until the column is first on screen, then `done`) via the IntersectionObserver added in Step 1. The SVG root changed from `role="img"` to `role="group"` (its summary label is kept) so the lanes can be focusable. |
| `src/components/overview/overview.css` | Lane highlight, quieting of the other lanes' streaks, mixing-layer rise (transform and opacity only), reduced-motion guards. |
| `src/motion/useActiveSection.ts` (new) | Scroll-following navigation: one passive, rAF-throttled scroll listener; reports exactly one section id; never scrolls, snaps or pins. |
| `src/App.tsx` | Uses the hook; nav items carry `aria-current="location"` (in-page items; the breadcrumb keeps `"page"`); added the missing `twin` entry to `NAV_LABEL` (the 3D dispersion twin, previously absent from the breadcrumb map); nav scrolling now respects reduced motion (`scrollBehavior()`). |
| `src/motion/reveal.tsx` | `EnterOnce`: one-time entrance (opacity and 16 px) for a long lower section. |
| `src/components/overview/Overview.tsx` | `EnterOnce` around **Regional context** and **Investigate further** only. |
| `tests/e2e/step3-focus-nav.spec.ts` (new) | 9 tests (list below). |

Not touched: `WeatherScene.tsx` (no camera props), the CSS streak implementation (kept, as decided), the Lab's SVG instrument (kept in the Lab), any data selector, label or value. No new dependency; no GSAP; no scroll snapping, pinning, scrubbing or forced order.

## Behaviour
- **Focal shift:** selecting or focusing a height highlights its lane (band and border; the focus ring is visible for keyboard) and drops the other lanes' **streaks** to 35% opacity. Wind labels, colours and the values table are not touched; the test compares their text, computed fill and opacity before and during selection and they are identical, so text contrast is unchanged. Works with keyboard (Tab/focus, Escape), mouse and touch (tap).
- **Mixing-layer rise:** on the first time the column is on screen, the band grows from the ground (transform) while its top line and label fade in (opacity, 0.3 s delay). The band's geometry is always the real model height; the test asserts that the rectangle's `y` and `height` never change. It is a visual introduction only and shows nothing evolving. Data refreshes never re-run it (it is keyed on the first view, per mount). Not run at all under reduced motion.
- **Navigation:** the nav highlight follows the section actually being read (the last section whose top has passed 35% of the viewport; the last section at the page end). Exactly one item has `aria-current="location"` and the breadcrumb matches. Clicking a destination highlights it at once and keeps it highlighted while the scroll travels. **This was revised after review: see the addendum at the end (the fixed 2.5 s timeout described in the first version of this report was replaced).**
- **Entrances:** only Regional context and Destinations, once, 16 px and opacity, when 20% is visible, and only when the intro played this session (so a reload shows them plainly). Data loading later cannot retrigger it (`once`). Not applied to the main band, alerts or telemetry rail.

## Bug found and fixed during testing
Clicking a lane with a mouse first selected it (hover/focus) and my click handler then toggled it off again, so a pointer click deselected. Click now simply selects.

## Tests actually executed
| Check | Result |
|---|---|
| `tsc -b` | pass |
| `npm test` | 26 node tests and 31 Vitest tests pass |
| `npm run lint`, `format:check`, `lint:css` (motion-phase surface) | no errors reported |
| `npm run build` | pass; GSAP, ScrollTrigger and Lab absent from `dist` |
| Step 3 spec, 9 tests on 6 viewports | pass. Tests: focal shift (keyboard focus, values/colours unchanged); pointer selection replaces the previous one; mixing layer ends at the real geometry and only transform/opacity animate; reduced motion; nav follows 5 sections with one `aria-current`; last section active at the page end; click-to-destination without flicker and no scroll snapping; entrances occur once, only on the two sections, no repeat on re-scroll or a model-hour change; second visit shows no entrance. One test needed a fix for phones (the two lower sections are a screen apart). |
| Full browser suite, 6 viewports (1440, 1280, 1024, 768, 390, 360), run in one go | **240 passed, 0 failed.** Includes the six Overview fixtures (normal, stale, noreading, gatewayoffline, alert, feederror) with axe: no serious or critical violations; the Step 1 and Step 2 specs; the Lab specs. |

Fixtures: all six pass on all six viewports. "Cached" is the state all of them are in (Open-Meteo is blocked and the seeded run is old).
Not tested: a physical phone (touch was exercised in emulated touch viewports), screen readers (the `group`/`img` lane semantics are untested with real assistive technology), Firefox, Safari, performance of the nav listener (it is one passive, rAF-throttled handler; not profiled).

## Bundle impact (production build, Step 2 to Step 3)
| File | Before | After | Change |
|---|---|---|---|
| `index-*.js` | 1,772,863 B (493,965 gz) | 1,775,176 B (494,785 gz) | **+2,313 B (+820 B gz)** |
| `index-*.css` | 101,521 B (22,962 gz) | 102,914 B (23,222 gz) | **+1,393 B (+260 B gz)** |

Cumulative since the deployed build (Steps 1 to 3): JS +101,350 B raw / +36,709 B gz (almost all of it Motion from Step 2), CSS +2,325 B raw / +397 B gz.

## Known limitations
- Lane semantics changed (`role="group"` with labelled `role="img"` lanes). It passes axe, but I have not heard it in a screen reader.
- Quieting reduces the other lanes' streaks to 35% opacity; they are not hidden. Streak motion itself is unchanged and still costs about 170 ms/s in view (Step 1 report).
- (Superseded: the 2.5 s navigation lock was replaced; see the addendum.)
- Entrances only occur in the first visit of a session, by design.

## Rollback
- Focal shift and mixing rise: revert `AtmosphericColumn.tsx` and the Step 3 block at the end of `overview.css`.
- Navigation: revert `App.tsx` (the hook, `aria-current`, `NAV_LABEL` addition, `scrollBehavior`) and delete `useActiveSection.ts`.
- Entrances: revert `Overview.tsx` and remove `EnterOnce` from `reveal.tsx`.
Each is independent of the other two.

## Addendum (2026-11-04, after review): navigation to a distant section
**Problem investigated.** The first version released the click's highlight lock after a fixed 2.5 s. Reproducing a click on the farthest link ("Review the station network") showed a second, real defect underneath: while the long smooth scroll travels, late-loading content below the start grows the page (measured: `scrollHeight` 11,109 to 12,006 px on desktop, 18,357 to 20,034 px at 390 px), so the browser's scroll settled about 960 px short of the destination and the highlight ended on "Simulation lab".

**Fix** (`src/motion/useActiveSection.ts`): there is no fixed timeout any more.
- The destination is highlighted immediately (`setNav` on click) and stays highlighted until it becomes the section being read.
- The click's alignment check ends when scrolling has **settled** (the browser's `scrollend`, or no scroll event for 200 ms; a scroll that is still moving keeps producing events, so a long scroll is never cut short) or nothing started moving within 400 ms, or the user takes over (wheel, touch, key).
- If the scroll settled short of where `scrollIntoView` rests a section (its scroll-margin plus the page's scroll-padding: 22 + 84 = 106 px here), it scrolls again, up to 6 times, unless the page cannot scroll further (a short last section). The corrective scroll uses the same reduced-motion-aware behaviour as the click.
- Reduced motion keeps the instant jump; the highlight still moves to the destination at once and stays.

**Tests** (`tests/e2e/step3-nav-distance.spec.ts`, 4 tests on all six viewports): farthest section from the top (highlight immediate; only Overview then the destination is ever highlighted; the page arrives at the destination's resting position); a deliberately slow 4 s scroll (longer than the old 2.5 s lock) with no intermediate section taking over; after a nearer click the lock is released and the next scroll follows the reading position again; reduced motion. While writing them the mistaken first assumption (that the destination ends at the page end, or 0 px from the top) was corrected: the resting offset is 106 px.

Not tested: a real keyboard-driven click on a physical phone, and very slow networks where content keeps growing for longer than six corrective scrolls.

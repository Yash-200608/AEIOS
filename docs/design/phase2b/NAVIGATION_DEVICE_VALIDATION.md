# Navigation validation (Phase 2B, Stage 1)

Date: 2026-11-04. Branch `feat/aeios-command-center`. Code: `frontend/web/src/motion/useActiveSection.ts`. Tests: `frontend/web/tests/e2e/nav-validation.spec.ts` (new, 12 tests), `step3-nav-distance.spec.ts`, `step3-focus-nav.spec.ts`.

## Device availability (stated first)
**No physical device was available.** No Android phone or iPhone is connected to this machine and `adb` is not installed. Every "phone" and "tablet" result below is **Chrome device emulation** (viewport, `isMobile`, `hasTouch`) or, for touch input, Chrome DevTools Protocol touch events. That is not physical-device verification. A manual script for a real Android/iOS device is at the end of this file.

## What was inspected
- The click flow: `navigate()` in `App.tsx` highlights the destination (`setNav`), calls the hook's lock, then `scrollIntoView` (instant under reduced motion).
- The lock: released by settle detection, user input (wheel, touch, key), with up to 6 corrective scrolls when content growth made the scroll land short.
- The offset: sections rest 106 px below the viewport top = `scroll-padding-top: 84px` (on `html`) + `scroll-margin-top: 22px` (on `.page-section`). **Finding:** there is no sticky or fixed header on any layout (the top bar is in normal flow, the sidebar is sticky but beside the content), so the 106 px is reading space, not header clearance. It was preserved as instructed; nothing covers a section's top (asserted).

## Diagnostic instrumentation added
Development-only (`import.meta.env.DEV`, stripped from production builds; verified absent from `dist`): `window.__aeiosNav.lock()` (the current lock) and `window.__aeiosNav.log` (the hook's decisions: `lock`, `superseded`, `reached`, `fix`, `settled`, `settled-elsewhere`, `settled-at-end`, `exhausted`, `user-<event>`, `ignored-stale-scrollend`, `unmount`). Tests use it to prove that no lock is left behind and no corrective scroll followed a user action.

## Defects found and fixed
| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | rapid-navigation test (desktop and tablets) | Interrupting a smooth scroll with a new request made the browser report `scrollend` for the interrupted scroll; the hook treated it as "the new scroll has settled" and issued a corrective scroll for an intermediate destination. | A `scrollend` arriving before our own scroll has moved, within 120 ms of the request, is ignored (logged as `ignored-stale-scrollend`). |
| 2 | rapid-navigation logs | A busy main thread withheld scroll events for several hundred ms while the browser's smooth scroll kept moving (measured gap: about 500 ms), so the 200 ms idle timer fired mid-travel and released the lock; in one run the destination ended at 340 px instead of 106 px. | "Settled" now means the position stayed still for a further 150 ms; if it moved, the settle timer is re-armed. |
| 3 | headed probe on this machine | (risk check) Would a scrollbar drag be fought by a corrective scroll? | **Verified not a defect in Chrome:** a real scrollbar drag in headed Chrome on Windows fires `pointerdown` and `mousedown` (scrollbar 15 px), and `pointerdown` was added to the user-input events that release the lock. Test passes headed. |
| 4 | investigation | A correction was made whenever the page was misaligned at settle, even if something else (not content growth) had moved it. | A correction is made only if the destination itself moved on the page since we last aimed at it; otherwise the lock is released as `settled-elsewhere`. |

### Tried and rejected (with evidence)
A "scrolling away from the destination means the user took over" rule (to catch scrolls that send no input event). Measured on this page, our own travel steps backwards by 90-160 px (78 ms and about 820-850 ms after the command) while content loads, and an interrupted smooth scroll carries its momentum about 4,400 px past a new destination before reversing. No threshold separated these from a user, and the rule produced false releases in 1 of 4 runs, so it was removed.

## Tests (Chrome, six viewports: 1440, 1280, 1024 touch, 768 touch, 390 touch, 360 touch)
| Case | Test | Result |
|---|---|---|
| Rapid repeated navigation (3 requests 150 ms apart): latest wins, no correction or highlight for earlier ones | `nav-validation` | pass on all 6 |
| Ten requests 80 ms apart: ends on the last, no lock left | `nav-validation` | pass on all 6 |
| Clicking the section you are on: no movement, no lock left | `nav-validation` | pass on all 6 |
| Wheel during the smooth scroll: user wins, no correction afterwards | `nav-validation` | pass on the 2 desktop projects; skipped on touch projects (not a touch input) |
| Page Up during the smooth scroll: user wins | `nav-validation` | pass on all 6 |
| Touch swipe (CDP touch events) during the scroll: user wins | `nav-validation` | pass on the 4 touch projects; skipped on desktop |
| Scrollbar drag: user wins | `nav-validation` | **pass headed** (real scrollbar, desktop); skipped headless (no classic scrollbar in headless Chrome) |
| Content growing for 3.6 s (12,000 px) during the scroll: at most 6 corrections, lock released, highlight not stale | `nav-validation` | pass on all 6 |
| Alignment: section rests at 106 px; nothing covers its top | `nav-validation` | pass on all 6 |
| No automatic scrolling at rest or after an ordinary user scroll | `nav-validation` | pass on all 6 |
| Keyboard activation of a nav item | `nav-validation` | pass on the 2 desktop projects; skipped on the 4 touch projects (sidebar is a drawer there) |
| Reduced motion, rapid requests: instant, last wins | `nav-validation` | pass on all 6 |
| Farthest section, 4 s slow scroll, release after settling, reduced motion | `step3-nav-distance` | pass on all 6 |

Navigation specs together (nav-validation, step3-nav-distance, step3-focus-nav) on all six Chrome viewports: **134 passed, 0 failed, 16 skipped** (skips listed above are input types that do not apply to that project). Cross-engine results (Firefox, WebKit) are in `CROSS_BROWSER_VALIDATION.md`; final full-suite numbers are in `PHASE_2B_EXECUTION_REPORT.md`.

## Acceptance
- No stuck locks: every scenario ends with `__aeiosNav.lock() === null` (asserted).
- No stale highlights: after every scenario the highlight equals the section the reading rule says is being read, or the requested destination (asserted).
- No incorrect destinations: the latest request always wins (asserted), including under reduced motion.
- No unwanted automatic scrolling: the page does not move by itself at rest, after a user scroll, or after a user interruption (asserted, 1.2-2 s windows).

## Outstanding risks
- **Scrolls with no input event at all** (some assistive-technology scrolling, find-in-page highlighting after the keydown) while content is still growing can still receive a corrective scroll, at most 6. Not verifiable without a screen reader; see `ACCESSIBILITY_AUDIT.md`.
- Firefox and WebKit scrollbar drags were not probed headed (see the cross-browser report for what was run).
- Physical Android/iOS touch, momentum scrolling and the iOS rubber-band effect are untested.

## Manual device script (for a real Android phone or iPhone)
1. Open the Overview (`/?preview&fixture=normal` on a dev build, or the deployed site), wait for the reveal to finish.
2. Open the drawer, tap "Station network". Expected: the item highlights at once; the page travels to Station network and stops with its heading visible; the highlight stays on Station network.
3. Tap "Station network", and within half a second swipe down firmly. Expected: the page follows your finger and is not pulled back.
4. Tap "Forecast", then quickly "AEIOS model". Expected: ends on AEIOS model, never jumps back to Forecast.
5. With the system "Reduce motion" setting on, tap "Station network". Expected: an instant jump.
6. Rotate the phone during a long scroll. Expected: the page settles on the destination or wherever you left it, never keeps scrolling by itself.

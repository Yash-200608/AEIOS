# Command Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AEIOS dashboard a desktop-only shell and a one-screen, motion-rich landing view (the command deck) without changing how any value is calculated.

**Architecture:** The data block of `Overview.tsx` is extracted into one hook, `useOverviewModel`, consumed by both the existing Overview (now the "Briefing" view) and the new deck. The shell (`Rail`, `TopBar`, `DesktopGate`) replaces the sidebar and drawer in `App.tsx`. The deck reuses `globeEngine.ts` and `AtmosphericColumn` unchanged; all animation timing lives in small pure functions with unit tests, wrapped by thin React hooks.

**Tech Stack:** React 18, TypeScript 5.7, Vite 6, `motion` 14 (`motion/react`), `three` 0.171, CSS with `--aeios-*` tokens. Unit tests: `node --test` on `.ts` files. End-to-end: Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-command-deck-design.md`

All paths below are relative to `frontend/web/` unless they start with `docs/`.

## Global Constraints

- No new dependencies. GSAP stays development-only.
- No change to `src/lib/*`, `src/components/overview/model.ts`, thresholds, or Supabase.
- Designed for 1280 x 720 to 2560 x 1440; reference 1440 x 900. Width 1024-1279: same layout scaled to fit. Width under 1024: notice only. Height under 720: the deck may scroll vertically.
- A "live" pulse plays only when `nodeFreshness(rx) === 'fresh'`. Stale, never and unavailable are dim and still.
- Source labels (measured / regional / model / simulation) stay on every value that has one today.
- Reduced motion (`useMotionPolicy().reduced`): every animation renders its end state at once; no loops; no boot sequence.
- Loops stop when `document.hidden`.
- Every control is usable from the first frame; the boot sequence is skipped by any key or pointer press.
- Colours only through `--aeios-*` tokens; no new hex values outside `tokens.css`.
- Commit after each task; end commit messages with the repository's current attribution line.

## Review Focus

1. Gateway data fails to load (`aeios.error` set, `data === null`): the station card says the reading is unknown, not zero, and nothing counts up from 0. (Task 5)
2. `hourly.time` is empty (weather load failed): the scrubber renders disabled and dragging does not call `onSelectHour`. (Task 5)
3. A value changes from a number to `null` mid count-up: the card shows the missing-value text at once, never `NaN`. (Task 3)
4. The window is resized across 1024 px while the deck is open: the notice appears and the globe loop stops; widening restores the deck without a reload. (Task 2)
5. The site is switched while the boot sequence is still playing: the boot ends at once and the globe shows the new site. (Task 4)

---

### Task 1: Shared overview model and the Briefing view

**Files:**
- Create: `src/deck/useOverviewModel.ts`
- Create: `src/views/BriefingView.tsx`
- Modify: `src/components/overview/Overview.tsx` (replace the derivation block, lines 41-141, with the hook)
- Modify: `src/shell/viewRegistry.ts` (add `briefing`), `src/App.tsx` (`renderView` case)

**Interfaces:**
- Produces: `useOverviewModel(p: OverviewProps): OverviewModel` where `OverviewModel` has exactly the names the current `Overview` body computes: `loadState, loaded, failed, reading, observation, packetAgo, values, headline, stationState, cls, evidence, limits, health, outcome, outlookRows, column, feeds, feed, aqiNumber, modelHour, vc, wind, inv, fixtureName`. `OverviewProps` moves here and is re-exported from `Overview.tsx`.
- Produces: view id `'briefing'` (group `MONITOR`, label `Briefing`, placed directly after `overview`); `BriefingView({ overview }: { overview: OverviewProps })` renders `<ViewRoot id="briefing"><Overview {...overview} /></ViewRoot>`.

- [ ] **Step 1:** Run `npm ci` then `npm run test` and `npm run typecheck`. Expected: both pass. This is the baseline.
- [ ] **Step 2:** Move the derivation block into `useOverviewModel` unchanged (same expressions, same `useMemo` dependency lists); `Overview` destructures the result. Change the overview registry entry's label to `Command deck`; add the `briefing` entry and its `renderView` case.
- [ ] **Step 3:** Run `npm run test && npm run typecheck`. Expected: pass, with no test edited.
- [ ] **Step 4:** Commit: `Extract useOverviewModel; add the Briefing view`.

### Task 2: Desktop-only shell

**Files:**
- Create: `src/shell/deskMode.ts`, `src/shell/deskMode.test.ts`, `src/shell/DesktopGate.tsx`, `src/shell/Rail.tsx`, `src/shell/TopBar.tsx`, `src/shell/shell.css`
- Modify: `src/App.tsx` (remove `COMPACT_QUERY`, `compact`, `drawerOpen`, the drawer refs and effects, `trapDrawer`, `closeDrawerForNavigation`, the `<aside>` and `<header>` markup), `src/main.tsx` (wrap the app in `DesktopGate`), `src/motion/MotionReady.tsx` (`domAnimation` to `domMax`), `src/design/shell.css` and `src/styles.css` (delete shell rules under `max-width: 980px` and narrower: `.sidebar`, `.drawer-*`, `.menu-button`, `.topbar`), `package.json` (`test:unit` gains the new test files as they are added)

**Interfaces:**
- Produces: `deskMode(width: number): { mode: 'full' | 'scaled' | 'blocked'; scale: number }` with `MIN_WIDTH = 1024`, `DESIGN_WIDTH = 1280`.
- Produces: `DesktopGate({ children })`: renders the notice when blocked (children unmounted), otherwise children with `--desk-scale` set on `<html>`; listens to `resize`.
- Produces: `Rail({ view, onOpen }: { view: ViewId; onOpen(id: ViewId): void })`: 72 px, expands to 248 px on hover or focus-within as an overlay; `m.span layoutId="rail-active"` marks the current item; items keep `aria-current="page"`.
- Produces: `TopBar({ view, site, onSite, loading, onRefresh, userEmail, onSignOut })`: breadcrumb, site switch (`role="radiogroup"`, two `role="radio"` buttons, thumb `layoutId="site-thumb"`), IST clock (`HH:mm` updated each minute from `Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata' })`), refresh, account button.

- [ ] **Step 1: Failing test** `src/shell/deskMode.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { deskMode } from './deskMode.ts';

test('blocked under 1024', () => assert.equal(deskMode(1023).mode, 'blocked'));
test('scaled from 1024 to 1279', () => {
  assert.deepEqual(deskMode(1024), { mode: 'scaled', scale: 0.8 });
  assert.equal(deskMode(1279).mode, 'scaled');
});
test('full from 1280', () => assert.deepEqual(deskMode(1280), { mode: 'full', scale: 1 }));
```

- [ ] **Step 2:** Run `node --test src/shell/deskMode.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `deskMode` (`scale = width / 1280` in scaled mode), `DesktopGate` (notice text exactly: heading `AEIOS Sentinel is built for desktop screens`, body `Open this dashboard on a computer, or widen this window to at least 1024 pixels.`), `Rail`, `TopBar`; rewire `App.tsx`; the scaled mode applies `zoom: var(--desk-scale)` on `.app-shell`.
- [ ] **Step 4:** Run `node --test src/shell/deskMode.test.ts && npm run typecheck && npm run build`. Expected: pass. Record the main bundle's gzip size before and after the `domMax` change.
- [ ] **Step 5:** Commit: `Desktop-only shell: rail, top bar, desktop gate; drop the drawer`.

### Task 3: Motion primitives

**Files:**
- Create: `src/deck/motionMath.ts`, `src/deck/motionMath.test.ts`, `src/deck/useCountUp.ts`, `src/deck/DecodeText.tsx`

**Interfaces:**
- Produces: `countFrame(from: number, to: number, t: number): number` (t in 0..1, ease-out cubic, clamped); `decodeFrame(target: string, t: number, rand: () => number): string` (characters left of `floor(t * length)` are final, the rest are drawn from `'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'`, spaces are kept, same length as `target`).
- Produces: `useCountUp(value: number | null, opts?: { duration?: number; digits?: number }): string | null`: returns `null` at once when `value` is `null`; tweens from the previous number over 0.6 s; returns the final text at once under reduced motion.
- Produces: `DecodeText({ text, className }: { text: string; className?: string })`: decodes over 0.7 s when `text` changes; the real text is always in an `aria-label`, the animated span is `aria-hidden`.

- [ ] **Step 1: Failing test** `src/deck/motionMath.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { countFrame, decodeFrame } from './motionMath.ts';

test('countFrame ends exactly on the target', () => {
  assert.equal(countFrame(10, 153, 0), 10);
  assert.equal(countFrame(10, 153, 1), 153);
  assert.equal(countFrame(10, 153, 2), 153);
});
test('countFrame is monotonic', () => assert.ok(countFrame(0, 100, 0.5) > countFrame(0, 100, 0.25)));
test('decodeFrame keeps length and spaces, and ends on the target', () => {
  const r = () => 0.5;
  assert.equal(decodeFrame('Poor dispersion', 0, r).length, 15);
  assert.equal(decodeFrame('Poor dispersion', 0, r)[4], ' ');
  assert.equal(decodeFrame('Poor dispersion', 1, r), 'Poor dispersion');
  assert.ok(decodeFrame('Poor dispersion', 0.5, r).startsWith('Poor di'));
});
```

- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the two functions and the two wrappers (one `requestAnimationFrame` loop each, cancelled on unmount and when `document.hidden`).
- [ ] **Step 4:** Run `node --test src/deck/motionMath.test.ts && npm run typecheck`. Expected: pass.
- [ ] **Step 5:** Commit: `Deck motion primitives: count-up and decode text`.

### Task 4: Deck stage (globe with a timed fly-in)

**Files:**
- Create: `src/deck/boot.ts`, `src/deck/boot.test.ts`, `src/deck/DeckStage.tsx`
- Modify: `src/components/globe/GlobeHero.tsx` (delete), `src/views/OverviewView.tsx` (delete), `src/components/globe/globe.css` (keep only rules `DeckStage` uses)

**Interfaces:**
- Consumes: `createGlobeEngine(options)`, `GlobeEngine.setDescent(d)`, `.setSite`, `.skip`, `.showFinalFrame`, `.start`, `.stop`, `.dispose` from `globeEngine.ts`; `decodeLandDots` from `landDots.ts`.
- Produces: `bootDescent(elapsedMs: number): number` (1 at 0 ms, 0 at and after `BOOT_MS = 2500`, ease-in-out); `shouldBoot(seen: boolean, reduced: boolean): boolean`.
- Produces: `DeckStage({ site, verdict, tone, booted, onBooted }: { site: GlobeSite; verdict: string; tone: 'good' | 'fair' | 'poor' | 'unknown'; booted: boolean; onBooted(): void })`. Session flag: `sessionStorage['aeios.deck.booted'] = '1'`. Host element carries `data-deck-boot="playing" | "done"`. Cursor parallax moves the canvas wrapper by at most 8 px (CSS transform).

- [ ] **Step 1: Failing test** `src/deck/boot.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootDescent, shouldBoot, BOOT_MS } from './boot.ts';

test('descent runs from 1 to 0 over BOOT_MS', () => {
  assert.equal(bootDescent(0), 1);
  assert.equal(bootDescent(BOOT_MS), 0);
  assert.equal(bootDescent(BOOT_MS * 3), 0);
  assert.ok(bootDescent(1250) > 0 && bootDescent(1250) < 1);
});
test('boot is skipped once seen or under reduced motion', () => {
  assert.equal(shouldBoot(false, false), true);
  assert.equal(shouldBoot(true, false), false);
  assert.equal(shouldBoot(false, true), false);
});
```

- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement `boot.ts` and `DeckStage`: the engine is lazy-imported as `GlobeHero` does today; a key or pointer press, or a change of `site`, during the boot calls `engine.setDescent(0)` and `onBooted()`; the verdict is a `DecodeText` in an `<h1 tabIndex={-1} data-view-heading>`; coordinates use the existing `formatLatLon`.
- [ ] **Step 4:** Run `node --test src/deck/boot.test.ts && npm run test:unit && npm run typecheck`. Expected: pass (`globeMath.test.ts` still passes untouched).
- [ ] **Step 5:** Commit: `Deck stage: globe with a timed fly-in`.

### Task 5: Deck cards and the outlook scrubber

**Files:**
- Create: `src/deck/scrub.ts`, `src/deck/scrub.test.ts`, `src/deck/StationCard.tsx`, `src/deck/AirCard.tsx`, `src/deck/WeatherCard.tsx`, `src/deck/AlertsCard.tsx`, `src/deck/OutlookScrubber.tsx`, `src/deck/StatusLamps.tsx`, `src/deck/DeckCard.tsx`

**Interfaces:**
- Consumes: `OverviewModel` (Task 1), `useCountUp` (Task 3), `gaugePosition`, `aqiCategory`, `ribbonCells` from `model.ts`, `SourceLabel` from `design/primitives`.
- Produces: `scrubIndex(x: number, width: number, count: number): number | null` (`null` when `count <= 0` or `width <= 0`; otherwise the nearest index, clamped to `0..count-1`); `lampState(state: HealthState | OperationalState): 'pulse' | 'steady' | 'dim'` (`pulse` only for `fresh` and `online`).
- Produces: `DeckCard({ title, source, children, className })` (hover lift and a cursor-following highlight via `--mx`, `--my`); `StationCard({ model })`, `AirCard({ aqi, pm25, warning, available })`, `WeatherCard({ current })`, `AlertsCard({ outcome, onNavigate })`, `StatusLamps({ feeds, rows })`, `OutlookScrubber({ rows, poorAt, index, baseIndex, disabled, onSelect }: { ...; onSelect(hourIndex: number): void })`.

- [ ] **Step 1: Failing test** `src/deck/scrub.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubIndex, lampState } from './scrub.ts';

test('scrubIndex maps a position to the nearest hour, clamped', () => {
  assert.equal(scrubIndex(0, 470, 48), 0);
  assert.equal(scrubIndex(470, 470, 48), 47);
  assert.equal(scrubIndex(-20, 470, 48), 0);
  assert.equal(scrubIndex(9999, 470, 48), 47);
  assert.equal(scrubIndex(235, 470, 48), 24);
});
test('scrubIndex is null with no hours or no width', () => {
  assert.equal(scrubIndex(10, 470, 0), null);
  assert.equal(scrubIndex(10, 0, 48), null);
});
test('only fresh or online states pulse', () => {
  assert.equal(lampState('fresh'), 'pulse');
  assert.equal(lampState('online'), 'pulse');
  assert.equal(lampState('stale'), 'dim');
  assert.equal(lampState('nodata'), 'dim');
  assert.equal(lampState('error'), 'dim');
  assert.equal(lampState('checking'), 'steady');
});
```

- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement. `StationCard` shows `model.headline.title` and no numbers when `model.failed` or there is no packet, and carries `data-station-state={model.stationState}`. The scrubber is an SVG area of `rows[].vc` with the `poorAt` line, a thumb, pointer drag (pointer capture), Left/Right keys, step buttons and a play button that advances one hour every 600 ms and stops at the end; it calls `onSelect(baseIndex + i)`; with `disabled` it renders `aria-disabled="true"` and ignores input. The AQI arc is drawn with `stroke-dashoffset` from `gaugePosition(aqi, { min: 0, max: 500, scale: 'linear' })`.
- [ ] **Step 4:** Run `node --test src/deck/scrub.test.ts && npm run typecheck`. Expected: pass.
- [ ] **Step 5:** Commit: `Deck cards, status lamps and the outlook scrubber`.

### Task 6: Deck assembly, view transition and ambient layer

**Files:**
- Create: `src/deck/CommandDeck.tsx`, `src/deck/deck.css`, `src/shell/ambient.css`
- Modify: `src/App.tsx` (`renderView('overview')` renders `CommandDeck`), `src/shell/ViewStage.tsx` (frame variants only), `src/shell/views.css`

**Interfaces:**
- Consumes: everything from Tasks 1, 3, 4, 5; `AtmosphericColumn({ blh, temps, winds, validLabel })`.
- Produces: `CommandDeck({ overview, onSelectHour }: { overview: OverviewProps; onSelectHour(i: number): void })`, root `<ViewRoot id="overview">` with `data-testid="command-deck"`.

- [ ] **Step 1:** Implement the layout from the spec's section 7 as a CSS grid sized `calc(100vh - 56px)` with `min-height: 664px`: columns `220px 1fr 340px`, rows `1fr 190px`. Panels enter with a 75 ms stagger after `onBooted`. A "Full briefing" button calls `overview.onNavigate('briefing')`.
- [ ] **Step 2:** `ViewStage` variants become: exit `{ opacity: 0, scale: 0.97, filter: 'blur(6px)' }` in 0.26 s; enter from `{ opacity: 0, scale: 1.02, filter: 'blur(8px)' }` to rest in 0.5 s. Direction, focus, `data-view-state` and the reduced-motion branch are unchanged.
- [ ] **Step 3:** `ambient.css`: one fixed layer behind `.app-shell` with a drifting dot grid (60 s loop) and one radial glow whose colour is `--deck-tone` (set on `<html>` by `CommandDeck` from the verdict tone: good `--aeios-status-good`, fair `--aeios-status-warning`, poor `--aeios-status-critical`, unknown `--aeios-border-strong`). `animation-play-state: paused` under `.aeios-force-reduced-motion`, `prefers-reduced-motion`, and `html[data-tab-hidden]`.
- [ ] **Step 4:** Run `npm run test && npm run typecheck && npm run build`. Expected: pass.
- [ ] **Step 5:** Start `npm run dev`, open `/?preview` at 1440 x 900 and 1280 x 720, and each `&fixture=` state. Check: no page scroll, no overlap, stale station dim and still. Fix what is found.
- [ ] **Step 6:** Commit: `Command deck: assembly, cinematic view transition, ambient layer`.

### Task 7: End-to-end tests and documentation

**Files:**
- Create: `tests/e2e/deck.spec.ts`
- Modify: `playwright.config.ts` and `playwright.cross.config.ts` (remove the `tablet-landscape`, `tablet`, `phone-390`, `phone-360` projects; add `desktop-hd` at 1920 x 1080), `tests/e2e/support.ts`, `tests/e2e/overview.spec.ts`, `step1-column.spec.ts`, `step2-reveal.spec.ts`, `step3-focus-nav.spec.ts`, `reduced-motion.spec.ts`, `a11y-audit.spec.ts`, `views.spec.ts` (open `#/briefing` where they opened the old landing; drop drawer and narrow-viewport cases), `tests/e2e/globe.spec.ts` and `scroll-takeover.spec.ts` (delete the globe-descent cases; keep the `ViewHero` pin cases)
- Modify: `docs/design/ANIMATION_ARCHITECTURE.md` (append "Command deck exception" with the spec's section 3 table)

- [ ] **Step 1:** Write `deck.spec.ts` with these tests, each on `/?preview`:
  - `fits the viewport`: `document.documentElement.scrollHeight <= window.innerHeight` at 1280 x 720, 1440 x 900, 1920 x 1080.
  - `boot can be skipped`: `[data-deck-boot]` is `playing`, press a key, it is `done` within 300 ms.
  - `scrubber changes the hour`: ArrowRight on the thumb changes the hour label text.
  - `stale station does not pulse` (`&fixture=` a stale state): no element under `[data-station-state="stale"]` has a running animation (`getAnimations().length === 0`).
  - `gateway failure shows unknown, not zero` (failure fixture): the station card contains `Local data unavailable` and no digit.
  - `reduced motion is static` (`reducedMotion: 'reduce'`): `[data-deck-boot="done"]` on first paint; `document.getAnimations()` has no running animation.
  - `narrow window shows the notice`: at 1000 x 800 the heading `AEIOS Sentinel is built for desktop screens` is visible and `[data-testid="command-deck"]` is absent; resizing to 1300 shows the deck.
- [ ] **Step 2:** Run `npx playwright install chromium` then `npm run test:e2e`. Expected: pass. If the browser download fails, record that the end-to-end suite was not run.
- [ ] **Step 3:** Run `npm run lint && npm run format:check`. Fix findings in files this plan touched.
- [ ] **Step 4:** Commit: `Deck end-to-end tests; desktop-only test projects; motion rules exception`.

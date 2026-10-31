# AEIOS Sentinel: Visual Foundation (Phase 01)

**Status:** Proposed for owner review. Frontend-only; no production page has been redesigned.
**Branch:** `feat/aeios-design-foundation` (from `aeios-v0-consolidation` at `23d0637`).
**Source brief:** `AEIOS_Visual_Foundation_Planner_Brief.md` (planner brief, Phase 01).
**Review it live:** `cd frontend/web && npm run dev`, then open `http://127.0.0.1:5173/?designlab` (development build only).

This document is a design specification, not a controlled document. It changes no frozen Gate A-C artifact, ADR, data contract, threshold or source logic.

---

## 1. Product statement and the four questions

> AEIOS turns environmental observations into explainable situational awareness and adaptive decisions.

Every major screen should answer, in order:

1. What is happening in the environment?
2. How current and trustworthy is the information?
3. How confident is AEIOS in its interpretation, and what evidence supports or contradicts it?
4. What should happen next?

Raw metrics and charts support those answers; they do not compete with them.

## 2. Current implementation inventory (what this phase found)

| Topic | Finding |
|---|---|
| Stack | React 18.3, TypeScript 5.7, Vite 6, Recharts, Leaflet/react-leaflet, three.js, lucide-react, Supabase JS. No animation library, no UI framework. |
| Styling | One global stylesheet, `src/styles.css` (about 460+ lines, around 200 hard-coded hex values), imported by `src/main.tsx`. Legacy CSS variables (`--bg`, `--panel`, `--mint`, `--amber`, ...). No CSS modules or CSS-in-JS. |
| Components | `App.tsx` owns the shell, sidebar, overview, forecast, air quality, simulation and station sections. Panels live in `src/components/`. Existing small primitives: `MetricCard`, `SectionTitle` (in `App.tsx`), `.source-badge`, `.status-chip`, `.fresh-badge`, `.state-box`, `.provenance-tag`. |
| State logic | `src/lib/freshness.ts` (freshness, gateway online, model maturity, shared `useAeios()` poll) and `src/lib/derived.ts` (dispersion). Not touched in this phase. |
| Dev guard | `src/main.tsx` uses `import.meta.env.DEV` plus a query flag (`?preview`) and Vite removes the branch in production. The Design Lab follows the same pattern with `?designlab`. |
| Tests / lint | `package.json` has only `dev`, `build` (`tsc -b && vite build`) and `preview`. There is no test or lint script. |

### Conflicts between the brief and the repository

1. **Remote fonts already ship.** `src/styles.css` line 1 imports Google Fonts (Cormorant Garamond, DM Mono, DM Sans, Manrope). The brief forbids adding remote font dependencies. This phase adds none, and the new tokens use local font stacks only. The existing import was **not** removed because production pages are out of scope; removing or self-hosting fonts is a Phase 02 decision (see section 14).
2. **Inter and IBM Plex Mono are not bundled.** The token stacks name them first and fall back to Segoe UI / system-ui and Cascadia Code / Consolas. Self-hosting needs a licence and file-size decision and was not made unilaterally.
3. **No test or lint scripts exist.** Verification used `tsc -b`, `npm run build`, scripted DOM audits and manual browser checks; this is recorded honestly in section 12.

## 3. Visual direction

**Midnight scientific instrument panel.** Deep graphite surfaces, cool off-white text, one restrained teal accent for interaction, distinct data-source colours, thin structural rules and minimal elevation. Aerospace mission-control clarity, geospatial intelligence and editorial restraint. Not neon, not glassmorphism, not a generic IoT template, no repeated purple glow.

## 4. Tokens

Single source of truth: `frontend/web/src/design/tokens.css`, imported by `src/main.tsx`. All names are `--aeios-*`, so they cannot collide with legacy variables, and importing the file changes nothing on existing pages. No hex values are written anywhere else in the new design layer.

### 4.1 Colour

| Token | Hex | Purpose |
|---|---|---|
| `--aeios-canvas` | `#080D13` | Application canvas |
| `--aeios-surface-1` | `#101820` | Primary panel |
| `--aeios-surface-2` | `#141F29` | Raised / selected |
| `--aeios-surface-3` | `#1B2935` | Stronger grouping |
| `--aeios-text-primary` | `#E8EEF3` | Text and values |
| `--aeios-text-secondary` | `#B3C0CC` | Supporting text |
| `--aeios-text-tertiary` | `#91A1AF` | Metadata that must stay readable |
| `--aeios-accent` | `#42D9D0` | Focus, selection, primary action |
| `--aeios-on-accent` | `#080D13` | Text on accent fills |
| `--aeios-source-live` | `#42D9D0` | Live station measurement |
| `--aeios-source-regional` | `#8DAEFF` | Regional model estimate |
| `--aeios-source-model` | `#A6D98C` | AEIOS model output |
| `--aeios-source-simulation` | `#C1A0FF` | Scenario / simulation |
| `--aeios-status-good` | `#63D4A1` | Healthy |
| `--aeios-status-warning` | `#E8B65A` | Caution / watch |
| `--aeios-status-critical` | `#FF6B67` | Critical |
| `--aeios-border-subtle` | `#263440` | Decorative divider only |
| `--aeios-border-strong` | `#61798B` | Control boundary |

Tints (`--aeios-tint-*`), a scrim and the focus ring (`--aeios-focus-ring`, equal to the accent) are derived in the same file.

### 4.2 Computed contrast (WCAG relative luminance)

Ratios were calculated from the actual token values against all four surfaces. Normal text needs 4.5:1; large text and non-text 3:1.

| Token | Canvas | Surface 1 | Surface 2 | Surface 3 |
|---|---:|---:|---:|---:|
| text-primary | 16.67 | 15.30 | 14.28 | 12.69 |
| text-secondary | 10.52 | 9.65 | 9.01 | 8.00 |
| text-tertiary | 7.35 | 6.75 | 6.30 | 5.60 |
| accent | 11.20 | 10.28 | 9.59 | 8.53 |
| source-regional | 8.94 | 8.21 | 7.66 | 6.81 |
| source-model | 12.00 | 11.01 | 10.28 | 9.13 |
| source-simulation | 9.04 | 8.30 | 7.74 | 6.88 |
| status-good | 10.64 | 9.77 | 9.11 | 8.10 |
| status-warning | 10.46 | 9.60 | 8.96 | 7.96 |
| status-critical | 7.01 | 6.43 | 6.00 | 5.34 |
| border-strong (non-text) | 4.28 | 3.93 | 3.67 | 3.26 |
| border-subtle (non-text) | 1.53 | 1.40 | 1.31 | 1.16 |

- Dark `on-accent` text on the accent fill: 11.20:1. Dark text on the critical colour: 7.01:1.
- `border-subtle` is **below** 3:1 on purpose and is therefore never the only boundary of a control, only a decorative divider.
- These are computed ratios for token pairs. Hover, disabled, tooltip, chart-stroke-on-image and map-overlay states were **not** all measured; see open questions.

### 4.3 Typography

Local stacks only, no remote font service:

```css
--aeios-font-ui: Inter, 'Segoe UI', system-ui, sans-serif;
--aeios-font-mono: 'IBM Plex Mono', 'Cascadia Code', Consolas, monospace;
```

| Token | Size | Use |
|---|---|---|
| `--aeios-text-display` | clamp(32px, ..., 52px) | Page titles and headline conditions only |
| `--aeios-text-xl` | 28px | Headline readouts |
| `--aeios-text-lg` | 20px | Panel and section titles |
| `--aeios-text-md` | 16px | Body explanations |
| `--aeios-text-base` | 14px | Default interface text |
| `--aeios-text-sm` | 13px | Notes, timestamps |
| `--aeios-text-xs` | 12px | Floor for any essential label |

Monospace is for telemetry, coordinates, IDs and timestamps, with tabular numerals. No essential information uses a size below 12px; the lab audit confirms zero text under 12px at every viewport.

### 4.4 Spacing, radius, elevation, layout

- Spacing, 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 (`--aeios-space-1..16`).
- Radius: 6, 10, 14, 18 px (`--aeios-radius-sm..xl`).
- Elevation: `--aeios-shadow-raised` and `--aeios-shadow-overlay` only for things that genuinely sit above the canvas (drawers, popovers). No glow on ordinary panels; group with surface change, spacing and rules rather than a border around every tile.
- Layout targets: sidebar 248px (72px collapsed), top bar 60px, content max 1440px, 12-column grid on wide desktop collapsing progressively. Drawer navigation below 960px. Touch target 44px preferred, 24px floor.

## 5. Data-source grammar

| Data class | Colour | Text label | Icon | Border pattern |
|---|---|---|---|---|
| Live station measurement | Teal | `LIVE · STATION` | Radio tower | Solid |
| Regional model estimate | Blue | `REGIONAL MODEL` | Globe | Double |
| AEIOS model prediction | Sage green | `AEIOS MODEL` | CPU | Dotted |
| Scenario / simulation | Violet | `SIMULATION` | Flask | Dashed + hatched fill |

Rules: a source label always travels with a timestamp or freshness where applicable (live), with source name and resolution where known (regional), with a maturity caveat (model), and persistently (simulation). Severity colours are never provenance colours and vice versa. Colour is never the only cue: text, icon and border pattern each independently identify the class.

## 6. Truth model: six dimensions that never collapse

| Dimension | Question it answers | Design handling |
|---|---|---|
| Provenance | Where did the value come from? | `SourceLabel` |
| Freshness | When was it observed; is the node current, not just the gateway? | `StateLabel` (fresh, stale, no data) with scope (Gateway, Node) |
| Sensor quality / state | Valid, warming, calibrating, degraded, faulted? | `StateLabel` |
| Model maturity | Has the model seen enough real data? | `StateLabel` (warming) plus a `SourceLabel` detail |
| Event confidence | How sure is AEIOS, with what evidence for and against? | `InsightPanel`, `EventItem` field |
| Severity and lifecycle | How serious, and where in its life? | Separate `EventItem` fields |

"LIVE" is not a synonym for "online". High confidence never implies high sensor quality. A missing value is never rendered as zero (`Readout` takes `value={null}` and explains why).

## 7. Component grammar

Implemented as the smallest useful set in `src/design/primitives.tsx` (+ `primitives.css`), used by the lab and ready for Phase 02. Existing equivalents (`MetricCard`, `.source-badge`, `.status-chip`, `.fresh-badge`, `.state-box`) were inspected first; they are **not** replaced in this phase, and Phase 02 should migrate them to these primitives.

| Primitive | Purpose |
|---|---|
| `SourceLabel` | Provenance, four kinds |
| `StateLabel` | Operational state with optional scope (Gateway, Node N1, Local model) |
| `Panel` | Surface with eyebrow, title and aside |
| `Readout` | Value, unit, interpretation, source, observation time; explicit missing state |
| `InsightPanel` | Conclusion, confidence, supporting and contradicting evidence, next action, caveat |
| `EventItem` | Lifecycle, severity, event confidence and sensor quality as separate fields |
| `ChartFrame` | Title, takeaway, units, legend with line style or marker, source label, and a "view data as a table" alternative |
| `EmptyState` | Six kinds: not run, no result, unavailable, stale, loading, error, each with a different icon and border style |
| Controls | `.ax-btn` (primary, secondary, quiet), `.ax-segmented`, `.ax-select`, one 3px focus ring |

Not yet built (later phases): tooltip/popover, a production drawer, a page heading, collapsible nav groups.

## 8. Chart, map and atmosphere rules

- A stable semantic series palette; regional blue, AEIOS-model green (dashed), live teal (point markers). Purple is not a default chart colour.
- Every chart: axis titles with units, a visible legend that uses line style or marker as well as colour, a one-sentence takeaway, and a data-table alternative.
- Thresholds are drawn only when the data supports them and are labelled directly on the chart.
- Regional model values stay visibly distinct from local station values.
- Satellite overlays go in a labelled selector; empty imagery is explained as no detection, no pass or cloud, never "nothing happened".
- 3D atmosphere: motion must represent the model data, with pause/reset and a static fallback. Phase 01 does not change the three.js model.
- Back-trajectories keep "pathway estimate, not source confirmation".

## 9. Motion

- Durations: micro 150 ms, state 200 ms, navigation 260 ms (`--aeios-dur-*`), easing `cubic-bezier(0.2, 0, 0, 1)`.
- CSS transitions only. **Motion for React was not added**: React is 18.3.1 and no animation library exists, but nothing in this phase needs gesture or layout animation.
- Under `prefers-reduced-motion: reduce` the duration tokens collapse to about 0 and spinners stop. The lab offers a "force reduced motion" switch that applies the same tokens, so the behaviour can be reviewed without changing OS settings.
- No pulses, scan lines, sweeping glows or ambient particle loops on ordinary surfaces. Essential status never depends on animation.

## 10. Accessibility baseline (WCAG 2.2 AA target)

- Contrast: computed in 4.2; every text and semantic colour is at least 5.34:1 on all four surfaces.
- Focus: one 3px teal ring with 2px offset on every interactive element in the design layer; a skip link; the drawer moves focus in, traps Tab, closes on Escape and returns focus to its trigger; the rest of the page is `aria-hidden` while it is open.
- Target size: buttons, segmented controls, selects and nav links are 44px; the smallest pointer target measured in the lab is 24px or larger.
- Semantics: real buttons/links, labelled groups, a captioned contrast table with `scope` headers, `role="alert"` only on the error state.
- Non-colour cues: text + icon + pattern for source and state.
- Reflow: no horizontal overflow from 1440px down to 360px, and at 640px CSS width (an emulation of 200% zoom on a 1280px window).

## 11. Design System Lab (`/?designlab`, development only)

- Entry: `src/main.tsx` lazy-loads `src/design/DesignLab.tsx` only when `import.meta.env.DEV` and `?designlab` are both true. Vite drops the branch from production builds; verified that neither the lab strings nor its CSS (`aeios-lab`, `ax-panel`) appear in `dist/`.
- It never reads Supabase or dashboard state, never touches authentication, and every number on it is labelled illustrative static preview data.
- Demonstrates: truth model, swatches with live-read token values, computed contrast table, type/space/radius scales, controls and focus, source and state labels, readouts, an insight panel and event items, a chart frame, all six empty/stale/loading/error kinds, the eight required truth-state examples, the mobile drawer, the collapsible sidebar and the reduced-motion switch.

## 12. Verification record

| Check | Result |
|---|---|
| `npm ci` | Pass (132 packages, from the existing lockfile; no dependency changes) |
| Baseline `npm run build` before changes | Pass |
| `npx tsc -b` / `npm run build` after changes | Pass |
| Test / lint scripts | None exist in `package.json` |
| Lab absent from production bundle | Pass (string and CSS search of `dist/`) |
| Horizontal overflow at 1440, 1280, 1024, 390, 360 and at 640 (200% zoom emulation) | None |
| Interactive targets under 24px | None (after fixing a skip link, a 20px checkbox) |
| Text under 12px | None (after fixing inline code at 11.96px and `<small>` at 11.67px) |
| Drawer: opens, focus enters, Escape closes, focus returns, page hidden while open | Pass |
| Focus stolen on first load | Found and fixed |
| Reduced-motion durations with the lab switch | 150 ms to 0.01 ms |
| `git diff --check` | See the hand-off report |

**Not verified, stated plainly:**
- **Screenshots are not saved as files.** The lab was inspected visually in the desktop app's browser pane at 1440, 1280, 1024, 390 and 360 widths (wide sizes through CSS zoom because the pane is 800px wide), but headless capture to disk failed in this environment. Run `npm run dev` and open `/?designlab` to review it live; capturing committed screenshots (for example with Playwright) is a follow-up.
- The real OS-level `prefers-reduced-motion` setting was not toggled; the media query uses the same tokens as the lab switch.
- Hover, disabled and tooltip states were designed to the token pairs above but their contrast was not individually measured in the rendered UI.
- No screen-reader testing was done.
- Chart strokes were checked visually, not measured, for 3:1 against the surface.
- The tested browser is the desktop app's built-in Chromium and headless Edge; Firefox and Safari were not tested.
- Touch interaction was not tested on a physical device.

## 13. Decisions and open questions

**Decisions (proposed, pending owner approval)**

1. Neutral graphite base replaces purple surfaces and glow; teal is the only interaction accent.
2. Four-way source grammar with text + icon + border pattern.
3. One namespaced token file as the single source of truth; legacy variables stay until pages migrate.
4. A development-only lab as the review surface; no production routes added.
5. CSS-only motion; no new dependency.

**Open questions for the owner**

1. Self-host Inter and IBM Plex Mono (licences are permissive, but it adds about 100-200 KB), or keep the system stacks? And when do we drop the existing Google Fonts import?
2. Is the serif display face (Cormorant Garamond) kept as an editorial accent for page titles, or retired? The brief proposes one sans plus one mono.
3. Should the sidebar collapse to 72px by default on 1024-1279px screens?
4. Are the teal "live" and the teal accent allowed to be the same hue? They are today (`--aeios-source-live` equals `--aeios-accent`), which risks confusing "interactive" with "live". An alternative is a slightly different accent.
5. Do we want an automated accessibility check (for example axe) in CI? It would be a new dev dependency and was not added.

## 14. Recommended Phase 02

Redesign the flagship Overview on this foundation, in this order:

1. Migrate shared pieces: replace `.source-badge`, `.status-chip`, `.fresh-badge`, `MetricCard` and the audit's `SiteStatus` panels with the primitives, keeping behaviour identical (including freshness and "no reading" handling).
2. First viewport: site and time context with gateway and node freshness; one situation statement only when real data supports it; separate confidence explanation; strongest supporting and contradicting evidence; next action only if a real policy exists; a compact regional context visual; a station/network strip.
3. Retire the purple surfaces on migrated pages; decide fonts (open question 1) and self-host.
4. Add per-page tests for `freshness.ts` and `derived.ts`, and an accessibility check.

The Overview intelligence content in item 2 is a design hypothesis; today the system does not yet produce situation statements or next-action policy, so those slots must stay empty or hidden until data supports them.

## 15. Files changed in Phase 01

| File | Why |
|---|---|
| `docs/design/AEIOS_VISUAL_FOUNDATION.md` | This specification |
| `frontend/web/src/design/tokens.css` | Semantic token source |
| `frontend/web/src/design/primitives.tsx`, `primitives.css` | Smallest useful primitive set |
| `frontend/web/src/design/DesignLab.tsx`, `lab.css` | Development-only review surface |
| `frontend/web/src/main.tsx` | Import tokens; DEV-guarded lazy route for the lab |

No firmware, gateway, database, simulation, edge, backend, Supabase, deployment or Pi files were changed. No packages were added.

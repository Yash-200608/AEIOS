# Phase 2A: refinement report

**Branch:** `feat/aeios-command-center` · **HEAD:** `61ceed4` (Phase 2) · **Working tree:** all Phase 2A changes, plus the earlier duplicate-chart fix, **uncommitted**.
**Not done (by instruction):** no commit, merge, reset, push or deploy.
**Companion documents:** `PHASE_2A_VISUAL_INTERPRETATION.md` (design decisions, written before code), `PHASE_2A_VISUAL_AUDIT.md` (screenshot findings and defect register).

## 1. Verdict: CONDITIONAL PASS

Every criterion that could be tested from this machine passes. Three cannot be tested by an agent here and are listed as unverified, not as passed: authenticated real data, screen readers on real assistive technology, and Firefox, Safari and physical touch devices. One owner decision is open (self-hosting fonts).

| Area | Result | Evidence |
|---|---|---|
| Product identity | **Pass** | The atmospheric column, criteria gauges, telemetry strip and outlook ribbon carry the Hybrid Intelligence direction; no neon, glow or decorative motion. |
| Hierarchy | **Pass** | The situation sentence is the h1; the site is metadata; the assessment instrument is the centre of gravity. |
| Data semantics | **Pass** | Provenance (`MEASURED · AEIOS STATION`, `REGIONAL MODEL`) and freshness (`Node N1 · STALE`) are always separate labels; nothing fabricated (section 3). |
| Duplicate chart | **Pass** | One canonical chart in Pollution dispersion; the Overview shows a categorical 48 h ribbon with a link. |
| Design coherence | **Pass** | Shell and legacy sections share the token palette; purple glow and serif headings are gone; remote fonts removed. |
| Mobile | **Pass** | Six viewports, no horizontal overflow, nothing under 12 px or 24 px. |
| Accessibility | **Partial** | Keyboard, focus visibility, target size, text size, contrast pairs and reduced motion verified; screen reader not tested. |
| Real data | **Unverified** | Needs the owner's sign-in; agents may not enter credentials. |
| Regression | **Pass** | `tsc -b`, 21 unit tests, production build, `git diff --check`. |
| Safety | **Pass** | Only `frontend/web/` and `docs/design/` changed; nothing committed or deployed. |

## 2. What changed

### 2.1 The Command Center (Overview)

| Component | Status | What it does |
|---|---|---|
| `SituationHeader.tsx` | new (replaces `SituationMasthead`) | The h1 is the situation ("Dispersion is limited at SGT University."), severity icon, one-line reason; beneath it, currency: regional model with feed status and valid time, and station provenance with the node's freshness as a separate label. |
| `AtmosphericColumn.tsx` | new | Model-derived profile of the lowest 200 m: mixing layer (clamped with a marker when deeper), temperature with height (the inversion lid is visible as a line leaning right), wind at 10, 80, 120 and 180 m with flow streaks whose speed is the modelled wind speed and an arrow pointing downwind. Pause button; static under reduced motion; `role="img"` summary and a values table. |
| `EnvironmentalAssessment.tsx` | rebuilt | The column beside four bullet gauges (ventilation on a log scale against 6,000 m²/s, mean wind against the 10 km/h calm limit, inversion around 0 °C, mixing height). Each gauge states value, threshold and meaning in text. |
| `LocalObservations.tsx` | refined | Provenance and freshness labels separate; a missing reading is stated calmly (no display-size "No reading"). |
| `SystemRail.tsx` | new (replaces `OperationalHealth`) | Telemetry strip: weather model, air-quality model, gateway, every registry node, local model; each with its own state, age and a coloured top rule backed by text. |
| `OutlookRibbon.tsx` | new (replaces `OutlookSummary`) | 48 hourly cells: adequate (solid), poor (hatched), unknown (dashed outline), inversion (top tick); windows of adequate ventilation listed in text; link to the canonical chart. |
| `AlertSummary.tsx`, `RegionalContext.tsx` | kept | Same five alert outcomes; regional estimates labelled. |
| `OverviewDestinations.tsx` | refined | Verb-led ("Analyse dispersion", "Inspect satellite layers"…), Satellite added. |
| `model.ts` | extended | Pure: `gaugePosition`, `mixingLayer`, `profileDomain`, `flowDuration`, `ribbonCells`, `ventilationWindows`, `situationStatement`. |

### 2.2 Shell and coherence

- `design/shell.css`: sidebar and top bar on the token palette (graphite, hairlines, cyan active marker without glow); legacy sections harmonised by CSS only (graphite panels, no purple glow, sans headings, token text colours, accent-coloured selected controls); a "Specialist analysis" divider where the Command Center ends; the desktop sidebar scrolls on its own.
- `styles.css`: the remote Google Fonts import is removed; `--mono` and `--serif` now point at the local token stacks.
- `App.tsx`: removed the sidebar's permanently pulsing dot and static "SYNC" pip (decorative status lights with no data behind them); added the divider.
- `design/primitives.*`: provenance wording `MEASURED · AEIOS STATION` and `SIMULATION ONLY`; source labels use one hairline border and a 12% tint (text and icon remain the non-colour cues).

### 2.3 Files

Modified: `App.tsx`, `styles.css`, `design/primitives.tsx`, `design/primitives.css`, `design/shell.css`, `components/DispersionPanel.tsx`, `components/overview/{EnvironmentalAssessment,LocalObservations,Overview,OverviewDestinations,RegionalContext}.tsx`, `components/overview/{model,model.test,format}.ts`, `components/overview/overview.css`, three Phase 2 docs.
Added: `components/overview/{AtmosphericColumn,OutlookRibbon,SituationHeader,SystemRail}.tsx`, `components/VentilationChart.tsx` (moved from `overview/EnvironmentalOutlook.tsx`), `docs/design/PHASE_2A_*.md`.
Deleted: `components/overview/{SituationMasthead,OperationalHealth}.tsx` (and the never-committed `OutlookSummary.tsx`).
Unchanged: `freshness.ts`, `derived.ts`, `trajectory.ts`, `api.ts`, `SmokeAlerts.tsx`, `AeiosPanel.tsx`, every backend, gateway, firmware, database, Supabase, Pi and deployment file, `package.json`, `package-lock.json`. Freshness and maturity thresholds are untouched.

## 3. Source mapping for every visible Overview value

| Visible value | Source (unchanged contract) |
|---|---|
| Situation sentence and icon | `dispersionClass(ventilation(), meanLowWind(), inversion())` from `derived.ts`, worded by `situationStatement()` |
| Reason line | `dispersionClass().detail` |
| Model valid time, fetched time, feed status | `hourly.time[selectedHour]`, `lastUpdated`, `feedStatus(loadState, forecastMeta.stale)` |
| Node and freshness in the header | `siteReading(data, site)` + `nodeFreshness()` (`freshness.ts`) |
| Column: mixing layer | `hourly.boundary_layer_height[selectedHour]` |
| Column: temperature line | `hourly.temperature_{2m,80m,120m,180m}[selectedHour]` |
| Column: wind lanes, speeds, arrows | `hourly.wind_speed_{10m,80m,120m,180m}`, `hourly.wind_direction_{...}`; `compass()` for the "from" text |
| Gauges | `ventilation()`, `meanLowWind()`, `inversion()`, boundary layer height; thresholds `VENTILATION_POOR`, `CALM_WIND_KMH` |
| Measured air | `siteReading()`, `packetValues()` (PM `null` for negative sentinel), packet `rx_utc` |
| Telemetry strip | weather: `loadState`/`forecastMeta`; air quality: `aq`, `aqWarning`; gateway: `gatewayOnline()`; nodes: `data.nodes` + `data.latest` + `nodeFreshness()`; model: `modelWarmingUp()`, `totalPackets`, `MODEL_MATURE_PACKETS` |
| Alerts | `useAlerts()` + `alertOutcome()` |
| Outlook ribbon | `ventilation()` and `inversion()` for the next 48 hourly steps, `ribbonCells()`, `ventilationWindows()` |
| Regional context | `weather.current`, `aq.current.us_aqi`, `aq.current.pm2_5` |

Nothing on the page is computed from a new formula; the instruments only re-encode values the existing selectors already return.

## 4. Verification log

| Check | Result |
|---|---|
| `npx tsc -b` | exit 0 |
| `npm test` | 21 / 21 pass (7 new tests for the instrument scales, windows and statement) |
| `npm run build` | pass |
| Fixtures, Design Lab, Google Fonts in `dist/` | none |
| `git diff --check` | clean |
| Paths changed outside `frontend/web/` and `docs/design/` | 0 |
| Six native viewports x two fixtures | no overflow, no target < 24 px, no text < 12 px, column text 12.8 to 18.2 px |
| Twelve state fixtures | correct, distinct wording for normal, stale, no reading, no packet, gateway offline, warming, alert, alert while stale, alert error, loading, gateway error, weather-feed error |
| Keyboard (33 real Tab presses at 1440 x 900) | every stop focusable, in view and with a visible ring (3 px token ring; the chart surface uses Chrome's own 5 px ring) |
| Reduced motion (Chrome emulating the OS preference) | flow animation `none`; with no preference it runs and the pause button sets `paused` and `aria-pressed="true"` |
| Contrast (computed from tokens) | all text and label pairs, including tints, hover surfaces and focus ring, at least 5.13:1; control borders at least 3.26:1 |

## 5. Not verified, stated plainly

1. **Authenticated real data.** The preview runs without sign-in, so gateway, node and alert values came from development fixtures. To review real data, the owner signs in locally (`npm run dev`, open `http://127.0.0.1:5173/` without `?preview`) and the agent reads the page read-only.
2. **Screen readers.** Landmarks, headings, names, `role="img"` summaries and table alternatives exist, but no assistive technology was run.
3. **Firefox, Safari, physical touch devices.** Only Chrome was used (desktop and mobile emulation with touch).
4. **Real operating-system reduced-motion setting.** Verified through Chrome's emulation of the same media feature, not by changing the Windows setting.
5. **Open-Meteo quota.** Repeated captures exhausted Open-Meteo's free daily quota for this network ("Daily API request limit exceeded"). Until it resets, the dashboard on this network shows its cached model run (or "unavailable" where nothing is cached). The final captures therefore show the honest "Cached model run" state; earlier `after_v2` captures show the connected state.

## 6. Open decisions for the owner

1. **Fonts.** Remote fonts are gone; the UI now uses the local stack (Inter if installed, else Segoe UI). Self-hosting Inter and IBM Plex Mono needs a dependency such as `@fontsource` and a licence note.
2. **Ribbon.** Is a categorical 48 h ribbon acceptable as the Overview's compact outlook, with the values in the canonical chart?
3. **Thresholds.** The 30 min stale and 10,000-packet maturity values remain unvalidated assumptions.
4. **Commit.** Phase 2A and the duplicate-chart fix are uncommitted, awaiting approval.

## 7. Recommended next phase

Real-data acceptance first (sign in, review gateway, node and alert states against actual packets, then validate the freshness thresholds). Then decide fonts, and carry the instrument language into Pollution dispersion and Air quality, which today are only harmonised in colour.

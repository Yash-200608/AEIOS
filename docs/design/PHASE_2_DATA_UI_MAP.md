# Phase 2 data to UI map (Overview)

**Status:** Gate 1 audit, written before any UI code.
**Branch:** `feat/aeios-command-center` (from `19a2ff7`, the committed Phase 1 foundation).
**Scope:** `frontend/web/` Overview only. No change to `freshness.ts`, `derived.ts`, `trajectory.ts`, `api.ts` semantics, Supabase, gateway, Pi or firmware.

## 1. Baseline findings

| Item | Finding |
|---|---|
| Phase 1 present | Yes: `docs/design/AEIOS_VISUAL_FOUNDATION.md`, `src/design/tokens.css`, `primitives.tsx/.css`, dev-only `DesignLab.tsx` (`/?designlab`). Reused, not replaced. |
| Stack | React 18.3, TypeScript 5.7, Vite 6, Recharts 2.15 (resolved version recorded in the implementation report), Leaflet, three.js, lucide-react. No animation library. |
| Test framework | **None.** `package.json` scripts: `dev`, `build`, `preview`. See the test strategy in section 6. |
| Recharts accessibility | Recharts 2.x has an opt-in `accessibilityLayer` prop (keyboard and ARIA on the chart); it is not on by default (that is Recharts 3). It is enabled explicitly, and a table alternative is provided regardless. No upgrade. |
| Shell gap | `styles.css` collapses the sidebar to an icon rail at 980 px and sets `.sidebar { display: none }` at 680 px. On phones there is currently **no navigation at all**. Phase 2 adds an accessible drawer. |
| Legacy dispersion/weather state | Lives in `App.tsx` (`weather`, `loadState`, `forecastMeta`, `aq`, `hourIndex`), loaded once per site by `load()`. Reused as props, not re-fetched. |
| Shared polling | `useAeios()` (30 s) in `freshness.ts` and `useAlerts()` (60 s) in `SmokeAlerts.tsx`. Overview consumes both; **no new polling**. |

## 2. Field-by-field map

| UI element | Existing source | Truth rule enforced in the UI |
|---|---|---|
| Site title, subtitle, coordinates | `SITES` constant in `App.tsx` | Coordinates are configured site anchors, not GNSS measurements. |
| Masthead "as of" (model) | `forecastMeta.cached/stale/source`, `lastUpdated` (`fetched_at`), selected hour (`hourly.time[hourIndex]`) | Labelled as regional weather-model run time. A cached or stale model feed is stated as such. |
| Masthead "as of" (station) | `siteReading().packet.rx_utc` via `ago()` | Shows the last packet time or "no packet yet". Never inferred from the gateway heartbeat. |
| Dispersion verdict | `dispersionClass(vc, wind, inv)` from `derived.ts` using `ventilation()`, `meanLowWind()`, `inversion()` | The returned `label`, `tone`, `detail` are shown as-is. The formula is **not** duplicated. `Unknown` renders as "Model fields unavailable". Source: REGIONAL MODEL (Open-Meteo). |
| Verdict evidence rows | The same three numbers, plus `boundary_layer_height` via the hourly series | Ventilation vs `VENTILATION_POOR`, mean wind vs `CALM_WIND_KMH`, inversion sign. Thresholds are passed in from `derived.ts`, not re-typed. A null input shows "not available", never 0. |
| "What this cannot tell you" | `siteReading().freshness` | Shown only when there is no fresh local reading: the verdict is a model interpretation and local PM2.5 cannot confirm it. Deterministic, no AI wording. |
| Local PM2.5 | `siteReading(data, site)`: `pm25` is `null` when absent or negative (firmware sentinel for "no PMS frame") | `null` is "No reading", never 0. Value shown only when freshness is `fresh`. Unit µg/m³, node id, packet time. |
| Other local values (PM10, temp, RH, pressure) | Latest packet fields `pm10`, `temp`, `rh`, `pressure` | Same rule: negative PM10 is "No reading". Shown as current only when fresh. |
| MQ135 | Packet `mq_mv` | Shown in **mV** as "relative gas response", never ppm, never as a concentration. |
| Stale last values | Same packet when `freshness === 'stale'` | Inside a collapsed "Last recorded values (not current)" block with its age. Never in the headline readout. |
| Gateway state | `gatewayOnline(data)`, `data.gateway.last_seen` | Own row: ONLINE or OFFLINE plus last-seen age. Says nothing about nodes. |
| Node state (one row per node) | `data.nodes`, `data.latest`, `nodeFreshness()` | Own row per node: FRESH / STALE / NO DATA, with last-packet age. A fresh gateway never upgrades a stale node. |
| Local-model maturity | `modelWarmingUp(data)`, `data.totalPackets`, `MODEL_MATURE_PACKETS` | "WARMING UP, not validated" below the threshold, with the packet count and the threshold. Predictions are not shown on the Overview. |
| Smoke alert state | `useAlerts()`: `alerts`, `error`; rows filtered to the site code and the last 12 h, `TEST ROW` excluded | Four distinct outcomes plus loading/error: **active** (WATCH/WARNING with the gateway's own message and time), **none raised**, **cannot assess** (no alerts and node inputs not fresh), **error**. "No alerts" never implies "no risk". |
| Fire-match caveat | Static, from the existing smoke-origin copy | "Air-mass pathway estimate, not source confirmation." Shown wherever an alert is shown. |
| Weather context (temp, humidity, wind, pressure, UV) | `weather.current` | Labelled REGIONAL MODEL (Open-Meteo), secondary band. |
| Regional air quality | `aq.current.us_aqi`, `aq.current.pm2_5`, `aqWarning` | Labelled REGIONAL MODEL (CAMS, about 45 km, 3-hourly), "not measured at this site". Kept visually apart from the local PM2.5. US AQI is labelled "US AQI". |
| Outlook chart | `ventilation(hourly, i)` for the next 48 hours, `VENTILATION_POOR` | One series, REGIONAL MODEL. Takeaway sentence from counts of hours below the threshold. Axis titles, units, threshold label, data-table alternative, `accessibilityLayer`. |
| Destination links | Existing section ids in `App.tsx` | Navigation only. No invented actions. |

## 3. Deliberately **not** shown (and why)

| Candidate | Reason |
|---|---|
| A global "AEIOS confidence %" | No source field with that meaning exists on the frontend. Sensor quality, event confidence and forecast uncertainty are different concepts. |
| DEGRADED node/sensor state | The node payload has no sensor-state field. Only the PMS "no frame" sentinel is observable, and it is described as "No PM reading in the latest packet". |
| "AEIOS recommends..." / autonomous next action | No `sampling_decisions` or policy output reaches the frontend. Navigation prompts only. |
| AEIOS model predictions | They remain on the AEIOS model section; the Overview shows only model **maturity**. |
| Scenario / simulation output | Stays on the Simulation lab, labelled SIMULATION there. |
| Satellite imagery | Stays on the Satellite page; the Overview only links to it and, in the alert, to Smoke origin. |
| 3D scene | Not mounted on the Overview (performance policy). |
| Any gas value as ppm | Not permitted for MQ135 or BME gas. |

## 4. State matrix the Overview must handle

| Dimension | States | Notes |
|---|---|---|
| Model feed (weather) | loading, ready, error, ready+cached/stale | From `loadState` and `forecastMeta`. |
| Regional air quality | ready, unavailable (`aqWarning`/null) | Optional band; its failure never blocks the page. |
| Gateway | not seen yet, online, offline, load error | `data === null` while loading vs `error` set. |
| Node | fresh, stale, no data (no packet), none configured for the site | One row per node. |
| Local PM2.5 | valid, no reading (sentinel), stale, no packet | Never zero. |
| Model maturity | warming up, active | Threshold from `freshness.ts`. |
| Alerts | loading, active, none raised, cannot assess, error | `alerts === null` is loading. |
| Outlook | data, no data | Chart absent shows an explicit empty state, not an empty frame. |

## 5. Existing thresholds and their provenance

| Constant | Value | File | Provenance |
|---|---|---|---|
| `GATEWAY_ONLINE_MS` | 120 s | `freshness.ts` | Existing. |
| `NODE_STALE_MS` | 30 min | `freshness.ts` | Introduced in the earlier UI/UX audit session as an **assumption**; not validated against the real packet interval. Not changed here. |
| `MODEL_MATURE_PACKETS` | 10,000 | `freshness.ts` | Same: assumes about one packet per minute for a week. Not changed here. |
| `VENTILATION_POOR`, `CALM_WIND_KMH` | 6,000 m²/s, 10 km/h | `derived.ts` | IMD criterion, existing. |
| Alert window | 12 h | `SmokeAlerts.tsx` (`BANNER_HOURS`) | Existing. |
| WATCH / WARNING | 5 fires or 10 MW / 20 fires or 50 MW, or WATCH + node PM2.5 above 90 µg/m³ | `edge/v0/smoke_watch.py` | Existing, unchanged, described in the alert copy only. |

## 6. Test strategy (no framework exists)

- No test runner is installed and the brief forbids new dependencies without a recorded need. Phase 2 therefore moves every state decision into a **pure module with no runtime imports** (`src/components/overview/model.ts`) and tests it with Node's built-in runner (`node --test`, native TypeScript stripping on Node 22.18+/24). This adds one npm script and **no dependency**.
- Test files are excluded from `tsc -b`.
- Presentational components cannot be rendered under that runner (TSX and CSS imports). Their states are exercised in the browser through development-only fixtures (`/?preview&fixture=<name>`, removed from production builds) and recorded in the implementation report.

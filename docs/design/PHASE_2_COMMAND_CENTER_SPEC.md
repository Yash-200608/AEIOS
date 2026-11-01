# Phase 2: Command Center (flagship Overview) specification

**Status:** Gate 2 spec, written before implementation and checked against `PHASE_2_DATA_UI_MAP.md`.
**Foundation:** Phase 1 (`docs/design/AEIOS_VISUAL_FOUNDATION.md`, `src/design/tokens.css`, `primitives.tsx`). Nothing here creates a competing palette or component system.

## 1. Purpose

Within seconds, an operator can answer: what is happening at the selected site, what supports that, how current the evidence is, whether the gateway **and each node** are reporting, and what to inspect next. It is a UI and information-architecture change over existing data. It adds no scoring, no inference, no data source and no contract change.

## 2. Information order

1. **Situation masthead.** Site, coordinates, two separate "as of" lines (model run, last station packet), refresh state.
2. **Environmental assessment.** The existing dispersion verdict, the evidence behind it, and what the evidence cannot tell you.
3. **Local observations.** AEIOS station measurement strip: PM2.5 first, then PM10, temperature, humidity, pressure, MQ135 relative response; node, unit, timestamp, state.
4. **Operational health.** Gateway, each node and local-model maturity as three separate dimensions.
5. **Alerts.** Active alert, "No alerts raised", or "Cannot assess"; with the not-source-confirmation caveat.
6. **Outlook.** One regional-model series: ventilation for the next 48 hours, with takeaway, axes, threshold and a data table.
7. **Regional context.** Weather and CAMS air quality, labelled regional estimates, visually secondary.
8. **Next destinations.** Links into the deeper existing sections.

The first desktop viewport (1440 x 900) carries items 1 to 4.

## 3. Wireframes

### Desktop (12-column grid, `minmax(0, 1fr)` tracks)

```text
+------------------------------------------------------------------------------+
| OVERVIEW · SGT UNIVERSITY                                                    |
| SGT University                                    Model run 14:00 · Open-Meteo|
| Budhera campus, Gurugram · 28.478 N 76.904 E      Station: last packet 3 d ago|
+---------------------------------------------------+--------------------------+
| ENVIRONMENTAL ASSESSMENT   [REGIONAL MODEL]       | OPERATIONAL HEALTH       |
| (!) UNFAVOURABLE dispersion                       | Gateway   ONLINE  seen 8 s|
| Low mixing, calm wind and an inversion lid        | Node N1   STALE   3 d ago |
| Evidence                  Cannot tell you         | Local model WARMING UP    |
|  Ventilation 4,100 m2/s   No current local PM2.5  |  14 / 10,000 packets      |
|  Mean wind 1.7 m/s                                |                          |
|  Inversion +1.8 C                                 | [Open Station network]    |
| [Open Pollution dispersion]                       |                          |
+---------------------------------------------------+--------------------------+
| LOCAL OBSERVATIONS  [LIVE · STATION]  Node N1 · STALE                         |
| PM2.5   PM10   Temp   Humidity   Pressure   MQ135 (relative response, mV)     |
| No reading ...   (Last recorded values, not current: expandable)              |
+----------------------------------+-------------------------------------------+
| SMOKE ALERT  [AEIOS EDGE]        | OUTLOOK  [REGIONAL MODEL]                 |
| No alerts raised                 | Ventilation poor for 48 of 48 h           |
| Cannot assess (node stale)       | [chart, axis titles, threshold]           |
| Not source confirmation          | View data as a table                      |
+----------------------------------+-------------------------------------------+
| REGIONAL CONTEXT  [REGIONAL MODEL]  weather strip · CAMS US AQI / PM2.5       |
+------------------------------------------------------------------------------+
| NEXT: Air quality · Pollution dispersion · Forecast · Smoke origin · Stations |
+------------------------------------------------------------------------------+
```

### Mobile (single column)

```text
Masthead + verdict summary line
Environmental assessment
Local observation (or No reading / Stale)
Operational health
Alerts
Outlook (chart + table alternative)
Regional context
Destinations
```

Breakpoints: two columns of panels from about 1100 px of content width; single column below. Intermediate widths use `auto-fit` tracks so nothing clips.

## 4. Component inventory

| Component | New / reused | Role |
|---|---|---|
| `Overview.tsx` | New, thin | Composes the sections from props and the two existing shared hooks. No fetching. |
| `model.ts` | New, pure | Every state decision (observation state, health rows, alert outcome, outlook summary, evidence rows). Zero runtime imports. Unit-tested with `node --test`. |
| `SituationMasthead.tsx` | New | Title block and the two "as of" lines. |
| `EnvironmentalAssessment.tsx` | New, uses Phase 1 `SourceLabel`, `StateLabel` | Verdict, evidence, limitations, link. |
| `LocalObservations.tsx` | New, uses `Readout`, `SourceLabel`, `StateLabel` | Measurement strip and stale disclosure. |
| `OperationalHealth.tsx` | New, uses `StateLabel`, `Panel` | Gateway, nodes, model maturity as separate rows. |
| `AlertSummary.tsx` | New, uses `EmptyState`, `SourceLabel`, `StateLabel` | Four outcomes plus loading/error, with the caveat. Reuses `useAlerts()` data. |
| `EnvironmentalOutlook.tsx` | New, uses Phase 1 `ChartFrame` | 48 h ventilation chart and table. |
| `RegionalContext.tsx` | New, uses `Readout` | Weather and CAMS readouts, regional labels. |
| `OverviewDestinations.tsx` | New | Link list. |
| `fixtures.dev.ts` | New, **development only** | Named states for visual verification. Loaded behind `import.meta.env.DEV`. |
| `shell.css` + drawer logic in `App.tsx` | New / minimal edit | Accessible drawer; restores navigation on phones. |
| `StateLabel` | Phase 1, one addition | Adds an `offline` state so a gateway that is not seen is not labelled "no data". |
| `SiteStatus.tsx` | **Removed** | Fully replaced by the Overview composition. All of its behaviour is preserved (verdict, local PM2.5 with stale/no-reading handling, alert state). |
| `AeiosPanel`, `SmokeAlerts`, `DispersionPanel`, `freshness.ts`, `derived.ts` | Reused untouched | The AEIOS model section, alert history/banner and the dispersion section remain below the Overview. |

## 5. States (each is distinct, none is zero)

- **Loading:** skeleton text rows with an `aria-busy` region; never a blank panel.
- **Error:** weather feed unavailable shows an `EmptyState` of kind error with Retry; alerts error shows its own error row.
- **Stale node:** the headline readout says "No current reading", the packet age is stated, the old values sit in a collapsed block labelled not current.
- **No packet / no node for the site:** "No local reading", with the reason.
- **Insufficient data:** no alert rows and nodes not fresh produces "Cannot assess", not "No alerts".
- **Model warming up:** "WARMING UP, not validated", with the packet count and threshold.
- **Cached or stale model feed:** stated beside the model "as of" line.

## 6. Visual and interaction rules applied

- Phase 1 tokens only (`--aeios-*`); no new hex values; no purple glow; hairline separators over borders; tabular numerals for measurements; icons plus text for every state.
- Source grammar from Phase 1: teal LIVE · STATION, blue REGIONAL MODEL, sage AEIOS MODEL (not shown on the Overview except as maturity), violet SIMULATION (not shown).
- Varied surfaces: the masthead is unboxed (typography on canvas), the assessment is the one raised, accented surface, the observation strip is a ruled table-like band, health is a ruled list. Not a grid of identical cards.
- Motion: CSS transitions of 150 to 200 ms on hover and focus only. No pulsing, count-up, sweep or looping effects. Collapses to about zero under `prefers-reduced-motion` through the Phase 1 duration tokens.
- No three.js on the Overview.

## 7. App shell changes (minimal)

- A menu button in the top bar, visible at 980 px and below, with an accessible name and `aria-expanded`/`aria-controls`.
- Below 980 px the sidebar becomes an off-canvas drawer with full labels (the legacy icon-rail hack and the `display: none` at 680 px are overridden). Focus enters the drawer on open, Tab is trapped, Escape closes, focus returns to the menu button, the page behind is `aria-hidden`, and the drawer closes on navigation.
- The top bar breadcrumb shows the current section name instead of a fixed string.
- Desktop sidebar, grouping and navigation semantics are unchanged.

## 8. Accessibility checklist for this page

Contrast from Phase 1 token pairs; visible 3px focus ring; 44 px controls; a skip link to main content; landmarks (`main`, labelled `section`s with headings in order); chart `accessibilityLayer` plus a table alternative; status never by colour alone; reduced motion; 360 px reflow without horizontal scroll.

## 9. Out of scope (unchanged)

Air quality, Dispersion, Forecast, Smoke origin, Satellite, 3D atmosphere, Simulation lab, AEIOS model and Station network sections; all data contracts; deployment.

## 10. Implementation deltas (what changed between this spec and the built page)

| Spec said | Built | Why |
|---|---|---|
| Two-column band of assessment (8) and health (4), observations as a full-width strip below | **Named-area band**: assessment and alerts on the left; observations then health stacked in one right-hand column; outlook full width below | At 1440 x 900 the full-width strip fell below the fold and left empty space inside stretched panels. DOM order is still assessment, observations, health, alerts, outlook, so keyboard and phone order match the brief. |
| Observations as a measurement strip of `Readout`s | One large PM2.5 `Readout` plus a compact definition list (`dl`) of the other values | A dense, aligned, screen-reader-friendly list reads better in a 5/12 column than six equal cells. |
| Container breakpoint at 940 px | 760 px | At 1280 px viewport the content column is 930 px wide; the earlier threshold stacked the page too soon. |
| Outlook heading "Can the air clear pollution?" | "Ventilation outlook" | The legacy dispersion section directly below uses the former heading. |
| `StateLabel` gains `offline` | Gains `offline`, `active`, `checking`, `unavailable` | Gateway offline, model active, loading and "data could not be loaded" each need a distinct, honest label. |
| (not specified) | When the gateway data **fails to load**, local observations say "Local data unavailable" and the node label reads UNAVAILABLE | An error must not read as "the node has not sent a packet". |
| (not specified) | Topbar icon buttons gain accessible names; times use 24-hour IST | Accessibility and consistency with the model hour. |
| Tests with "the existing test framework" | `node --test` on the pure `model.ts` (14 tests) | No framework existed; no dependency was added (see the data map, section 6). |
| `EnvironmentalOutlook` drew a 48 h ventilation chart on the Overview | Removed. The Overview has `OutlookSummary` (words, two counts, link); the one canonical chart is `VentilationChart`, mounted in the Pollution dispersion section and replacing its legacy chart | The same series was drawn twice (Overview and Dispersion). The legacy chart was the only place showing the 48 h inversion series, so the canonical chart carries both series. |

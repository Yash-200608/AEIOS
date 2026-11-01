# Phase 2A: visual interpretation (written before implementation)

**Direction:** Concept C, Hybrid Intelligence (mission-control structure about 60%, scientific and spatial visualization about 25%, editorial character about 15%).
**Branch:** `feat/aeios-command-center` (HEAD `61ceed4`; the duplicate-chart fix is in the working tree, uncommitted).
**Source:** `AEIOS_Creative_Direction_and_Phase_2A_Playbook` (md/pdf/docx), the two embedded concept wireframes, the nine Phase 2 screenshots, and **new native screenshots** of the current state (`Downloads\AEIOS_Phase2A_Screenshots\before\`, 27 files, six viewports, healthy and stale).

## 1. The idea in one paragraph

The current Overview answers the operator's questions with text inside rounded cards. A command center for the atmosphere should instead **show the atmosphere**. The centre of gravity becomes an *atmospheric column*: a model-derived vertical profile of the lowest 200 m above the site, showing the mixing layer, the temperature profile (and therefore the inversion lid) and the wind at four heights, with flow streaks whose speed is the modelled wind speed. Beside it, the verdict's criteria become calibrated instruments (value against threshold), not sentences. Measured local air sits in its own instrument. Operational health becomes a mission-style telemetry strip. Everything else recedes. Nothing is invented: every mark is drawn from an existing Open-Meteo field, gateway packet or alert row, and labelled as such.

## 2. What the references taught, and what was transferred

| Reference | Lesson | Transferred as |
|---|---|---|
| Earth Nullschool | The data is the interface; thin flow lines encode real wind; chrome recedes. | Flow streaks in the atmospheric column, speed driven by modelled wind at each height; minimal chrome around the instrument. |
| Quindar mission operations | A dominant physical view, then compact status tables with explicit columns and timestamps. | The operational telemetry strip: one cell per subsystem with state and age in tabular mono. Alerts as an event log. |
| NASA Worldview | Time and layers are explicit; imagery is its own evidence class. | The 48 h outlook ribbon with a time axis; satellite stays a destination, never mixed with station data. |
| Exurbia / EarthEye | A dominant canvas with a compact adjacent data panel. | Assessment instrument (canvas) beside the measured-air panel. |
| Editorial design | One strong typographic statement; whitespace instead of boxes. | The headline is the **situation**, not the site name; the site becomes metadata. |

Not transferred: neon, glows, globe imagery, third-party layouts or assets, and decorative motion.

## 3. Composition

### Desktop (12-column, `minmax(0, 1fr)`)

```text
SITE META (small)                                              [Refresh]
DISPERSION IS LIMITED.  <- situation statement, display size, severity colour + icon
Shallow mixing layer.  Model valid 23:00 IST · Station N1 STALE, last packet 3 d ago
---------------------------------------------------------------------------
ASSESSMENT INSTRUMENT (8)                         | MEASURED AIR (4)
  [atmospheric column SVG] [criteria gauges x4]   |  PM2.5 lead, then aligned rows
  what this cannot tell you · open dispersion      |  freshness and provenance separate
---------------------------------------------------------------------------
OPERATIONAL TELEMETRY (12): Weather model | Air-quality model | Gateway | Node N1 | Node N2 | Local model
---------------------------------------------------------------------------
EVENT LOG / ALERTS (5)                            | 48 h OUTLOOK RIBBON (7)
REGIONAL CONTEXT (12, unboxed, secondary)
INSPECT NEXT (12, verb-led destinations)
```

DOM order: situation, assessment, measured air, operational health, alerts, outlook, regional context, inspect next. This is the playbook's priority order, so keyboard and phone reading order follow it.

### Mobile

Same order in one column. The situation statement is 28 to 32 px, not the full display size. Currency chips wrap. The column instrument scales to width. The four gauges sit in a two-column grid. The telemetry strip becomes a two-column grid of compact cells. No provenance or freshness is hidden to save space.

## 4. Components

| Component | Change | Data source (unchanged) |
|---|---|---|
| `SituationHeader` (replaces `SituationMasthead`) | Headline is the verdict sentence; site name, campus and coordinates become a metadata line; currency line keeps provenance and freshness as separate chips | `dispersionClass()`, `SITES`, `feedStatus()`, `siteReading()` |
| `AtmosphericColumn` (new) | SVG profile, 0 to 200 m: ground, mixing-layer band (clamped with an "above chart" marker when deeper), temperature line through 2, 80, 120, 180 m, wind arrows and flow streaks at 10, 80, 120, 180 m. Pause control; static under reduced motion. Text alternative table. | `hourly.boundary_layer_height`, `temperature_{2m,80m,120m,180m}`, `wind_speed_*`, `wind_direction_*` at the selected hour |
| `CriteriaGauges` (inside `EnvironmentalAssessment`) | Four bullet gauges: ventilation (log scale, threshold 6,000), mean wind (threshold 10 km/h), inversion (diverging around 0 °C), mixing height (log). Value, threshold and verdict in text. | `ventilation()`, `meanLowWind()`, `inversion()`, `VENTILATION_POOR`, `CALM_WIND_KMH` |
| `LocalObservations` | Calmer missing state (no giant "No reading"), provenance chip "MEASURED · AEIOS STATION", freshness chip separate | `siteReading()`, `packetValues()` |
| `SystemRail` (replaces `OperationalHealth`) | One cell per subsystem: weather model, air-quality model, gateway, each registry node, local model | `feedStatus()`, `aq`, `gatewayOnline()`, `nodeFreshness()`, `modelWarmingUp()` |
| `AlertSummary` | Event-log treatment; same five outcomes | `useAlerts()`, `alertOutcome()` |
| `OutlookRibbon` (replaces `OutlookSummary`) | 48 hourly cells: poor or adequate ventilation (fill plus pattern), inversion hours marked; windows of adequate ventilation listed in text; link to the canonical chart | `ventilation()`, `inversion()` |
| `RegionalContext`, `OverviewDestinations` | Tighter; destinations are verbs and include Satellite | unchanged |

The canonical 48 h ventilation and inversion chart stays only in Pollution dispersion (`VentilationChart`). The ribbon is a categorical summary of when ventilation is adequate, not a second plot of the same values. It states its threshold and links to the chart.

## 5. Provenance and freshness labels

- Provenance (where it came from): `MEASURED · AEIOS STATION`, `REGIONAL MODEL · Open-Meteo`, `REGIONAL MODEL · CAMS`, `AEIOS MODEL`, `SIMULATION ONLY`.
- Freshness and state (how current or healthy): `NODE N1 · FRESH / STALE / NO DATA`, `GATEWAY · ONLINE / OFFLINE`, `LOCAL MODEL · WARMING UP`.
- They are always separate chips. "LIVE" is retired as a provenance word.
- Treatment: a single 1 px border and a 12% tint (replacing Phase 1's double, dotted and dashed borders, which read as noise). The non-colour cue is the text plus the icon.

## 6. Palette: playbook vs Phase 1

| Intent | Playbook | Phase 1 token | Decision |
|---|---|---|---|
| Surfaces, text, cyan, amber, coral, model green | same values | same | No change |
| Signal Blue (regional model) | `#648CFF` (5.74:1 on surface 1) | `#8DAEFF` (8.21:1) | **Keep Phase 1**: same hue family, more contrast |
| Simulation Violet | `#B79BFF` (7.79:1) | `#C1A0FF` (8.30:1) | **Keep Phase 1**; difference is imperceptible |

Interaction states measured (WCAG): every label on its 12% tint is at least 5.13:1; secondary text on the hover surface is 8.00:1; the focus ring against surface 2 is 9.59:1; and disabled text is about 5.22:1 (disabled controls are exempt anyway).

## 7. Typography

- Display and interface: the `--aeios-font-ui` stack (Inter if installed, then Segoe UI or system-ui). Monospace (`--aeios-font-mono`, IBM Plex Mono then Cascadia Code or Consolas) only for numbers, coordinates, times and counts.
- **Decision:** the legacy Google Fonts import (Cormorant Garamond, DM Sans, DM Mono, Manrope) is removed and the legacy `--mono` / `--serif` variables point at the token stacks. This removes the remote runtime font dependency the brief forbids, and the serif and sans mix the playbook warns against, across the whole page.
- **Open:** self-hosting Inter and IBM Plex Mono needs a new package (for example `@fontsource`) and a licence note. Not added; it needs owner approval.

## 8. Shell and transition coherence

- Sidebar and topbar move to the token palette: graphite surfaces, hairline dividers, a cyan active marker without glow, sans labels.
- The legacy sections below the Overview get a light harmonisation through CSS only: graphite panels, no purple glow, sans headings, token text colours. Their layout and charts are not rebuilt. A "Specialist analysis" divider marks where the Command Center ends.

## 9. Motion

| Motion | Meaning | Guardrail |
|---|---|---|
| Flow streaks in the column | Modelled wind speed at that height (duration inversely proportional to speed) | Labelled "model field, valid HH:MM"; Pause button; none under `prefers-reduced-motion`; never implies measurement |
| Hover and focus | Affordance | 150 ms; nothing hover-only |
| Drawer | Navigation | Existing, unchanged |

Nothing pulses, nothing counts up, and there is no ambient animation.

## 10. Accessibility plan

- The column SVG has `role="img"` with a text summary, plus a "View values" table; the gauges are text-first, with each graphic carrying `aria-hidden` and a text equivalent beside it.
- The ribbon has a text list of adequate-ventilation windows and an `aria-label` summary.
- The pause control is a real button with `aria-pressed`.
- Contrast pairs are as section 6; 44 px controls; focus ring unchanged; checks at all six viewports plus 200% zoom emulation.

## 11. Screenshot-by-screenshot findings (input to the audit)

| Evidence | Finding |
|---|---|
| fig01/fig02, native `*_1440x900_fold` | Site name is the largest element; the verdict is second. Cards everywhere. Masthead right cluster is crowded. No visualization. |
| native `normal_1440x900_overview_full` | Empty stretched space inside the assessment and alert cards; regional context reads as a flat list; "Inspect next" reads like a footer. |
| fig03 | Legacy purple section and duplicate chart (the duplicate is fixed in the working tree; purple remains). |
| fig04/fig05 | Zoom-era evidence; superseded by native captures. |
| fig06, native `*_390x844_fold` | The masthead fills the whole first phone screen before any assessment. |
| native `stale_390x844_fold`, `stale_768x1024_fold` | With the weather feed failing (a capture artefact: every fresh context re-fetched Open-Meteo), the header shows "Fetched — · values for —". It should say the feed is unavailable and omit empty values. |
| fig07 | Drawer acceptable; legacy purple glow on the active item. |
| fig08/fig09 | 360 px: double-border chips wrap awkwardly; "No reading" at display size is louder than a real value. |

## 12. Unresolved decisions (for the owner)

1. Self-host Inter and IBM Plex Mono (adds a dependency), or keep system stacks?
2. Is a categorical 48 h ribbon on the Overview acceptable as the "compact summary", given that the canonical chart is in Pollution dispersion?
3. The 30 min stale and 10,000-packet maturity thresholds remain unvalidated (not changed here).
4. Authenticated real-data review needs the owner to sign in; agents may not enter credentials.

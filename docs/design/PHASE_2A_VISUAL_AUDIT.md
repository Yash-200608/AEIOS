# Phase 2A: visual audit and defect register

**Evidence:** native Chrome captures (no CSS zoom) at 1440x900, 1280x800, 1024x768, 768x1024, 390x844 and 360x800, healthy (`normal`) and `stale` fixtures, stored outside the repository in `Downloads\AEIOS_Phase2A_Screenshots\`:

| Folder | What it is |
|---|---|
| `before\` (27 files) | The Phase 2 Overview as found, plus the duplicate-chart fix. |
| `after_v1\`, `after_v2\` | Intermediate states during the redesign; kept as evidence of defects found and fixed. |
| `after_final\` (27 files) | The final Phase 2A state. |
| `verify_log.json` | Scripted checks per viewport, state fixture, motion and keyboard. |

Capture method: `playwright-core` driving the installed Chrome in new headless mode, installed in a scratchpad outside the project (no project dependency). Each file is a `*_fold.png` (first viewport) and an `*_overview_full.png` (the whole Overview); `*_dispersion.png` shows the canonical chart section.

## 1. Before: findings on the existing Overview

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| A-01 | High | The site name ("SGT University") was the largest element; the verdict was second. The playbook requires the situation to outrank the site. | `before/*_1440x900_fold.png` |
| A-02 | High | A page of separate rounded cards, which the playbook explicitly rules out. | `before/normal_1440x900_overview_full.png` |
| A-03 | High | No scientific or spatial visualization on the flagship; the evidence was a text table. | same |
| A-04 | Medium | Masthead right-hand cluster crowded (chips, currency lines and a large Refresh button). | `before/*_1440x900_fold.png` |
| A-05 | High | On phones the masthead filled the whole first screen before any assessment. | `before/*_390x844_fold.png` |
| A-06 | Medium | Source labels used double, dotted and dashed borders; noisy, especially when wrapping at 360 px. | `before/*_360x800_*` |
| A-07 | Medium | "LIVE · STATION" mixed provenance with freshness wording. | all |
| A-08 | Medium | Empty stretched space inside the assessment and alert panels. | `before/normal_1440x900_overview_full.png` |
| A-09 | Low | "No reading" set at display size: absence shouted louder than a real value. | `before/stale_*` |
| A-10 | Medium | With the weather feed unavailable, the header printed "Fetched — · values for —". | `before/stale_390x844_fold.png`, `before/stale_768x1024_fold.png` |
| A-11 | High | Shell and legacy sections used the old purple identity with glow; serif headings; a remote Google Fonts import. | `before/normal_1440x900_dispersion.png` |
| A-12 | High | The sidebar's "Local edge node" card showed a permanently pulsing dot and a static "SYNC" pip: decorative status lights tied to no real state. | `App.tsx`, all captures |
| A-13 | Medium | The duplicate ventilation chart (fixed just before Phase 2A; verified absent). | `before/normal_1440x900_dispersion.png` |

## 2. Defects found and fixed during Phase 2A verification

| ID | Found in | Defect | Fix |
|---|---|---|---|
| V-01 | `after_v1` 1440 | Atmospheric column stretched to the full panel width; labels ballooned; wind labels collided with arrows. | Capped the SVG width, widened the label gutter, gave the assessment its own container query. |
| V-02 | `after_v2` 1440 | Column rendered at ~320 px with labels at about 9 px. | Tighter viewBox, 17 px SVG type; at narrow panels 20 px type and the height prefix dropped. Measured minimum now 12.8 px (360 wide) to 18.2 px. |
| V-03 | Scripted audit | "How this is calculated" toggle 19 px tall (below 24 px). | `summary` elements in Command Center components get a 24 px minimum. |
| V-04 | Real Tab presses | Sidebar links reported a 0 px outline on focus: a legacy `transition: all` animated the outline in. | Transition only colours and surfaces. |
| V-05 | Real Tab presses | At 1440 x 900, "Chandu village" in the sidebar could not be brought into view: the sticky full-height sidebar had no scroll of its own (pre-existing). | Desktop sidebar scrolls independently. |
| V-06 | Captures | Mobile captures failed with "Model feed unavailable". Cause: Open-Meteo's free daily quota was exhausted by repeated captures (HTTP 429, "Daily API request limit exceeded"). | Captures now replay a real cached model run and block Open-Meteo; see section 4. |
| V-07 | Final review | Two refresh buttons (top bar and situation header). | Kept the global top-bar control only. |

## 3. After: final state per viewport (`verify_log.json`)

| Viewport | Page overflow | Targets < 24 px | Text < 12 px | Column text (min) | Assessment / band layout |
|---|---|---|---|---|---|
| 1440 x 900 | 0 | none | none | 13.1 px | column + gauges side by side; 8/4 band |
| 1280 x 800 | 0 | none | none | 18.2 px | stacked inside a 2-column band |
| 1024 x 768 | 0 | none | none | 12.9 px | column + gauges; band stacked |
| 768 x 1024 | 0 | none | none | 13.6 px | column + gauges; band stacked |
| 390 x 844 | 0 | none | none | 14.2 px | single column |
| 360 x 800 | 0 | none | none | 12.8 px | single column |

Same results for the `normal` and `stale` fixtures at every size.

## 4. Capture caveats (read before judging the images)

- Every image is native resolution: no zoom, no cropping of page width.
- The final images show the amber notice "Weather model feed is a cached run" and the label "Cached model run". That is **true**: Open-Meteo refused requests from this network for the rest of the day, so the captures replay the real model run cached at 21:49 IST on 31 Oct. The timestamp was not altered. In normal operation that notice is absent (see `after_v2/` desktop captures, taken while the feed was still connected).
- Gateway, node, packet and alert values are **development fixtures**, labelled as such on screen.

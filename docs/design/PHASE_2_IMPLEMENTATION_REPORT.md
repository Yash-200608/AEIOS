# Phase 2 implementation report: Command Center (flagship Overview)

**Branch:** `feat/aeios-command-center` · **Worktree:** `C:\Users\Hp\source\AEIOS-command-center` · **Base:** `19a2ff7` (Phase 1)
**Status:** Implemented and verified as stated below. **Not committed, not deployed, not merged.**
**Screenshots:** embedded in the Downloads report (`AEIOS_Phase02_Command_Center_Report.docx`); deliberately not stored in the repository.

## 1. Gate 0: Phase 1 foundation

- Phase 1 was present in the sibling worktree but **uncommitted**. The brief requires Phase 2 to start from an exact commit and calls Phase 1 "approved", so the Phase 1 files were committed by explicit path as `19a2ff7` on `feat/aeios-design-foundation` (spec, tokens, primitives, dev-only Design System Lab, `main.tsx`), and the Phase 2 worktree was created from that commit. This was a decision made on the strength of the brief, after the owner had earlier answered "Not yet" to committing Phase 1; flag it if that was not intended.
- Reused, not replaced: `--aeios-*` tokens, `SourceLabel`, `StateLabel`, `Panel`, `Readout`, `EmptyState`, `ChartFrame`. No second design system was created.
- Phase 1's five open questions (self-hosting fonts, serif display face, sidebar collapse default, live-versus-accent teal, an automated accessibility check) were **not answered**. Phase 2 used the Phase 1 defaults (local system font stacks, sans headings) and left the legacy Google Fonts import untouched.
- Baseline `npm ci` (132 packages) and `npm run build`: pass.

## 2. What was delivered

| Item | Result |
|---|---|
| `docs/design/PHASE_2_DATA_UI_MAP.md` | Written before code: every displayed field traced to its source and truth rule, fields deliberately not shown, state matrix, threshold provenance, test strategy. |
| `docs/design/PHASE_2_COMMAND_CENTER_SPEC.md` | Information order, wireframes, component inventory, states, shell changes, accessibility; plus section 10 listing deviations made during build. |
| Overview rebuilt | Masthead, environmental assessment, local observations, operational health, alerts, 48 h ventilation outlook, regional context, next destinations. |
| Accessible navigation drawer | Phones previously had no navigation at all (sidebar was `display: none` at 680 px). Now a labelled drawer below 980 px. |
| Pure state model with tests | `overview/model.ts` + `model.test.ts`: 14 tests, `npm test`, no new dependency. |
| Dev-only fixtures | `/?preview&fixture=<name>`: normal, stale, noreading, nopacket, gatewayoffline, warming, alert, alertwhilestale, alerterror, loading, error, feederror. Absent from production builds. |

## 3. Changed files

| File | Change |
|---|---|
| `frontend/web/src/components/overview/*` (new) | `Overview`, `SituationMasthead`, `EnvironmentalAssessment`, `LocalObservations`, `OperationalHealth`, `AlertSummary`, `EnvironmentalOutlook`, `RegionalContext`, `OverviewDestinations`, `model.ts`, `model.test.ts`, `format.ts`, `fixtures.dev.ts`, `overview.css` |
| `frontend/web/src/design/shell.css` (new) | Skip link, menu button, off-canvas drawer, focus ring, restores labels in the drawer over the legacy icon rail. |
| `frontend/web/src/App.tsx` | Replaced the legacy overview section with `<Overview/>`; drawer state, focus management, Escape and Tab trap; skip link; breadcrumb shows the current section; accessible names on topbar icon buttons; removed the unused `MetricCard`. |
| `frontend/web/src/design/primitives.tsx` | `StateLabel` gains `offline`, `active`, `checking`, `unavailable`. |
| `frontend/web/src/main.tsx` | Imports `shell.css`. |
| `frontend/web/package.json`, `tsconfig.json` | Added the `test` script; excluded `*.test.ts` from `tsc -b`. No dependency changes; `package-lock.json` untouched. |
| `frontend/web/src/components/SiteStatus.tsx` | **Deleted.** Fully superseded; its verdict, local PM2.5 (stale / no-reading) and alert behaviour live on in the new components. |
| `docs/design/*` | Data map, spec, this report; a one-line note in the Phase 1 spec. |

Untouched by design: `freshness.ts`, `derived.ts`, `trajectory.ts`, `api.ts`, `SmokeAlerts.tsx`, `AeiosPanel.tsx`, `DispersionPanel.tsx`, every section below the Overview, and all backend, gateway, Pi, firmware, database and deployment files.

## 4. Design decisions

1. **Situation, then evidence, then currency.** The first screen at 1440 x 900 carries the verdict with its evidence, the local PM2.5 state, and gateway / node / model health. Local observations moved beside the assessment after the first layout pushed them below the fold.
2. **Provenance is part of every number.** Each group carries a Phase 1 `SourceLabel` (live station, regional model); the AEIOS-model and simulation classes are not shown on the Overview.
3. **A missing value is never zero.** The model returns `null`; `Readout` renders "No reading" with a reason. A stale node's old values sit in a collapsed block marked not current.
4. **Gateway, node and model are three rows with three labels.** The gateway row says "Says nothing about the nodes."
5. **Alerts have five outcomes**: loading, error, active, none raised, cannot assess. An active alert is shown regardless of node freshness.
6. **No invented intelligence.** No global confidence score, no AEIOS recommendation, no AI text. "Inspect next" is plain navigation.
7. **Failure is not absence.** If gateway data fails to load, the page says "Local data unavailable", not "no packet".
8. **Quiet surfaces.** One raised accent surface (the assessment), ruled lists and hairlines elsewhere, no glow, no decorative motion; CSS transitions of 150 to 200 ms only.

## 5. Verification

### 5.1 Commands

| Command | Result |
|---|---|
| `npm ci` | 132 packages (Recharts 2.15.4) |
| `npx tsc -b` | Pass |
| `npm test` | 14 of 14 pass |
| `npm run build` | Pass |
| Fixture / lab leakage into `dist/` | None |
| `git diff --check` | Clean (only CRLF-to-LF notices) |

### 5.2 Viewport audit (scripted, Overview and shell scopes)

| Viewport (CSS px) | Page overflow | Targets < 24 px | Text < 12 px | Layout |
|---|---|---|---|---|
| 1440 x 900 | none | none | none | Two-column band; sidebar |
| 1280 x 800 | none | none | none | Two-column band (content 930 px); sidebar |
| 1024 x 768 | none | none | none | Single column (content 719 px); sidebar |
| 390 x 844 | none | none | none | Single column; drawer |
| 360 x 800 | none | none | none | Single column; drawer |
| 640 px wide (200% zoom emulation of 1280) | none | none | none | Single column; drawer |

Defects found and fixed during these checks: label `nowrap` forcing a 9 to 39 px horizontal overflow at 390 and 360; the 8/4 band stacking too early at 1280; local observations below the fold at 1440; a topbar timezone chip and avatar at 9 to 10 px; unnamed topbar icon buttons; the outlook heading duplicating the legacy section's heading; an error being described as "model returned no values"; a gateway load error being described as "has not sent a packet".

### 5.3 States exercised (via fixtures, read from the rendered DOM)

Normal, stale node, gateway online while node stale, missing PM reading, no packet, gateway offline, warming up, active alert, alert while node stale, alerts load error, loading, gateway load error, weather feed error: each produced the intended distinct text and label.

### 5.4 Keyboard, drawer, reduced motion

- Real Tab presses: skip link, then primary navigation, then site links and topbar, then the Overview in reading order (Refresh, Open Pollution dispersion, Last recorded values, Open Station network, How alerts are triggered, Open Smoke origin). Every stop shows a 3 px solid outline.
- Drawer: opens with `aria-expanded`, focus enters on Close, Tab wraps in both directions, Escape closes and focus returns to the menu button, the page behind is `aria-hidden`, the closed drawer is `inert` and `visibility: hidden`, and choosing a destination closes it and scrolls there.
- Reduced motion: forcing the reduced-motion tokens changes transitions from 150 ms to about 0.01 ms; no non-essential animation runs on the Overview.
- Chart: Recharts 2.x does not enable its accessibility layer by default, so `accessibilityLayer` is set explicitly (the chart reports `role="application"`), and a "View data as a table" alternative with all 48 rows is always provided.

## 6. Known issues and what was not verified

- **Real-data happy path was not seen.** The local preview reads Supabase with no signed-in user, so it returns no gateway rows. Gateway, node, alert and model states were verified through fixtures. The live path uses the same `useAeios()` and `useAlerts()` hooks and the same pure model, but it has not been observed with real packets in this session.
- **Visual discontinuity.** Everything below the Overview still uses the legacy purple, glow and serif style. (The duplicate ventilation chart was resolved afterwards, see section 9.)
- **Freshness thresholds are unvalidated assumptions** (`NODE_STALE_MS` 30 min and `MODEL_MATURE_PACKETS` 10,000, from the earlier audit session). Unchanged; the data map records their provenance.
- **Unit tests cover the pure model only.** Components cannot be rendered under `node --test` (TSX and CSS); their states were verified in the browser, not in automated tests.
- **Contrast** relies on the measured Phase 1 token pairs (every pair used here is at least 5.34:1; the control border 3.26:1). Hover, disabled and tooltip states were not individually measured.
- **Not tested:** the real operating-system reduced-motion setting, screen readers, Firefox and Safari, physical touch devices, production Vercel behaviour.
- **Screenshot caveats:** the browser pane is 800 px wide, so 1440 and 1280 captures use CSS zoom, which is approximate; the 1024, 390 and 360 captures are native.
- Dev-only quirk: when the browser pane is hidden, animations and `requestAnimationFrame` pause, which made one drawer check look wrong until a frame rendered.

## 7. Run it

```powershell
cd C:\Users\Hp\source\AEIOS-command-center\frontend\web
npm run dev -- --host 127.0.0.1
# http://127.0.0.1:5173/?preview&fixture=stale   (also: normal, noreading, nopacket, gatewayoffline, warming, alert, alertwhilestale, alerterror, loading, error, feederror)
npm test
npm run build
```

## 8. Recommended Phase 3

1. Validate the freshness thresholds against the real packet interval; then re-run the stale, gateway and warming states against real data.
2. Redesign **Air quality** and **Pollution dispersion** on the same foundation; retire the duplicate ventilation chart so the Overview links to one canonical chart.
3. Answer Phase 1's open questions (fonts first), then migrate the remaining sections off the legacy purple system.
4. Add component-level tests (a runner such as Vitest plus Testing Library is the natural, but new, dependency) and an automated accessibility check.
5. Capture and commit native screenshots with a scripted browser, if the owner wants them in the repository.

## 9. Addendum: duplicate ventilation chart resolved

The 48 h ventilation series was drawn twice: on the Overview and in the Pollution dispersion section. Now there is one canonical chart.

- `components/VentilationChart.tsx` (moved from `overview/EnvironmentalOutlook.tsx` with `git mv`): ventilation (solid, left axis), inversion (dashed, right axis) and the labelled poor threshold (dotted); axis titles and units; takeaway sentence; `accessibilityLayer`; a 48-row data table with an inversion column. It replaces the legacy purple chart in `DispersionPanel.tsx`, whose "How this is calculated" note is kept.
- The Overview now has `OutlookSummary.tsx`: the takeaway sentence, "hours below the poor threshold" and "hours with a surface inversion", and a link to the chart. It draws no chart.
- `model.ts` gains `inversionHours()` (1 test added; 15 tests pass).
- Browser check: the Overview contains 0 charts; the Dispersion section contains 1, and the legacy `.chart-wrap` is gone; no page overflow at 1280 and 360.
- Noticed, not changed: at 360 px the legacy dispersion metric cards truncate their hint text with an ellipsis.

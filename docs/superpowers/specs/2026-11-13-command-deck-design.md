# Command deck: desktop-only landing screen and shell

Date: 2026-11-13. Branch: `feat/command-deck` (from `master` at `d3b53aa`). Scope: `frontend/web` only.
Status: proposed, awaiting owner approval. Nothing here is built yet.

## 1. Intent

The owner asked for "a more refined and motion invested UI dashboard for PC screens only, not phone or tablets", and chose
to loosen the project's motion rules. The dashboard already has a motion system, but its written rules
(`docs/design/ANIMATION_ARCHITECTURE.md`) forbid decoration, and a large share of the layout work serves phones and
tablets. This change gives the dashboard a landing screen designed for a wide monitor and a shell that moves, without
touching how any value is calculated.

Items marked **(call)** are the author's decisions, not the owner's. The owner can overrule any of them.

## 2. Goals, non-goals, anti-goals

**Goals**
- A new landing view, the command deck, that fits one desktop screen with no page scroll and reads at a glance.
- A new shell (navigation rail, top bar, view transitions, ambient background) around all 12 existing views.
- Decorative and cinematic motion is allowed: count-ups, ambient loops, parallax, cursor-reactive effects, a boot sequence.
- Desktop only. Phone and tablet layouts are removed from the shell.

**Non-goals**
- Redesigning the inside of the other 11 views. They get the new shell and transition only.
- New data sources, new calculations, alert subscriptions, or any change to Supabase or the Pi.
- Changing thresholds, selectors or derivations in `src/lib` and `src/components/overview/model.ts`.

**Anti-goals** (the result fails if any of these happen, even if it looks good)
- Fake liveness. A "live" pulse plays only when the latest packet is fresh (`nodeFreshness() === 'fresh'`, under 30 minutes).
  Stale or missing data is drawn dim and still.
- Modelled data shown without its source label. The measured / regional / model / simulation labels stay.
- Motion that blocks input. Every control is usable from the first frame; the boot sequence is skippable.
- Loops that run when nobody can see them. All loops stop in a hidden tab and under reduced motion.

## 3. Rules that change, rules that stay

| Rule in `ANIMATION_ARCHITECTURE.md` | After this change |
|---|---|
| "Motion explains state; it never decorates" | Relaxed: decoration is allowed on the deck and shell |
| "No number tweening, no count-ups, no pulse loops" | Relaxed: count-ups on first appearance and on real value change; pulse only on fresh data |
| "No animation keyed on poll identity" | **Kept.** Signals are still derived from values and ids (`src/motion/changes.ts`) |
| Reduced motion renders the final state | **Kept.** OS setting and `.aeios-force-reduced-motion` both honoured |
| Zero cost when idle | Relaxed to: ambient loops are allowed while the deck is visible; they stop when the tab is hidden |
| "Not neon, not glassmorphism" (visual foundation) | Relaxed **(call)**: soft glow and translucent panels are allowed where cards sit over the globe. Palette and tokens stay |

The architecture document gets a short "Command deck exception" section recording this table.

## 4. Approaches considered

1. **Command deck (chosen by the owner).** New landing screen plus new shell; other views keep their inner layout.
   Biggest visual jump where people land; other views look less finished until a later round.
2. **Polish all views.** Keep every view's structure, replace the shell, add motion everywhere. Even, but no screen looks new.
3. **Rebuild every view.** Most consistent, far larger, highest risk to how data is shown.

## 5. Screen support **(call)**

- Designed for 1280 x 720 up to 2560 x 1440. The reference size is 1440 x 900.
- Window width 1024 to 1279 px: the same layout, scaled down to fit (a small desktop window is still a PC).
- Window width under 1024 px: a full-screen notice, "AEIOS Sentinel is built for desktop screens", with the site's name
  and no dashboard. Signing in still works.
- Window height under 720 px: the deck is allowed to scroll vertically instead of clipping.
- Removed from the shell: the slide-out drawer, its focus trap, the `compact` state and the shell's narrow-width CSS.
  Narrow-width rules inside individual views are left alone; they can no longer trigger.

## 6. The shell (all views)

```
┌────┬────────────────────────────────────────────────────────────┐
│    │ AEIOS / Command deck      [SGT | Chandu]   14:32 IST  ⟳  Y │  top bar, 56 px
│ r  ├────────────────────────────────────────────────────────────┤
│ a  │                                                            │
│ i  │                     current view                           │
│ l  │                                                            │
└────┴────────────────────────────────────────────────────────────┘
 72 px, expands to 248 px over the content on hover or keyboard focus
```

- **Navigation rail (call):** 72 px of icons, expanding to 248 px as an overlay on hover or focus, so the stage keeps
  its width. The four groups and 12 views stay. An accent bar slides between items when the view changes.
- **Top bar:** breadcrumb, a site switch with a sliding thumb (replaces the two sidebar site buttons), a ticking IST
  clock, refresh, and the account button.
- **View transition:** the outgoing view scales back slightly, dims and blurs; the incoming view's panels enter in a
  stagger. The existing direction logic, focus handling and `data-view-state` contract in `ViewStage.tsx` are kept.
- **Ambient background:** a slow drifting dot grid and one soft glow, CSS only, tinted by the current verdict colour.

## 7. The command deck (replaces the landing view)

```
┌────┬───────────────────────────────────────────────┬──────────────────┐
│    │ top bar                                       │                  │
│    ├──────────┬────────────────────────────────────┤  LOCAL STATION   │
│    │ atmos.   │                                    │  PM2.5  PM10     │
│ r  │ column   │         dot-matrix globe           │  temp   RH       │
│ a  │ (wind    │   site pin · verdict headline      ├──────────────────┤
│ i  │ streaks) │   "Poor dispersion"                │  REGIONAL AIR    │
│ l  │          │   SGT University · 28.4782° N      │  AQI arc · PM2.5 │
│    │          │                                    ├──────────────────┤
│    ├──────────┴────────────────────────────────────┤  WEATHER NOW     │
│    │ ◀ ▶  48-hour ventilation outlook              │  wind compass    │
│    │ ───────●──────────────────────────────  hour  ├──────────────────┤
│    │ gateway ● N1 ○ N2 ○  weather ● air ●          │  ALERTS          │
└────┴───────────────────────────────────────────────┴──────────────────┘
```

**Stage (centre).** The existing dot-matrix globe (`globeEngine.ts`) is the permanent centrepiece. Its fly-in, which is
driven by scroll today (`setDescent`), is driven by a timed sequence instead. Over the globe: the dispersion verdict as
the headline, the site name and its coordinates.

**Left inset.** The existing `AtmosphericColumn` (wind streaks, mixing layer) for the selected hour, reused as is.

**Right column, four cards.**
1. Local station: PM2.5, PM10, temperature, humidity from the latest packet; node id; freshness state and age.
2. Regional air: CAMS US AQI as an arc gauge, plus PM2.5. Labelled as modelled.
3. Weather now: temperature, humidity, pressure, UV, and a compass needle for wind direction.
4. Alerts: the smoke WATCH / WARNING outcome for the last 12 hours.

**Bottom band.** The 48-hour ventilation outlook as an area chart with a draggable scrubber. Moving it sets the selected
hour (`setHourIndex` in `App.tsx`), and the verdict, column and stage update. Step buttons and a play button advance it.
Under it, a strip of status lamps: gateway, each node, weather feed, air-quality feed.

**All values come from the existing selectors.** The deck calls the same functions the current Overview calls
(`siteReading`, `observationState`, `ventilation`, `dispersionClass`, `healthRows`, `alertOutcome`, `feedStatus`). To avoid
two copies drifting apart, that block of `Overview.tsx` is extracted into one hook, `useOverviewModel(props)`, used by both.

**The current Overview is kept as a "Briefing" view (call).** The deck shows the headline; the evidence, limits and
criteria behind it stay available at `#/briefing`, opened from a "Full briefing" button on the deck and from the rail.
It is the existing `Overview` component without the globe landing above it. `#/overview` opens the deck.

## 8. Motion inventory

| Moment | Motion | Runs when |
|---|---|---|
| Boot | Globe spins up and flies to the site (about 2.5 s); panels enter in a stagger; coordinates type out | Once per browser session; any key or click skips it |
| Site switch | Globe flies from one site to the other; cards cross-fade | On switch |
| Numbers | Count up from the previous value over about 0.6 s | First appearance and real value change only |
| Verdict headline | Characters decode into the new text | When the verdict changes |
| AQI arc, outlook chart | Arc sweeps to its value; chart line draws in | First appearance |
| Scrubber | Thumb follows with a spring; play mode advances an hour at a time | While dragging or playing |
| Cards | Lift and a cursor-following highlight on hover | On hover |
| Stage | Globe drifts slowly; a small parallax follows the cursor | While the deck is visible and the tab is active |
| Status lamps | Fresh: soft pulse. Stale, never, unavailable: dim and still | Tied to real freshness |
| View change | Section 6 | On navigation |

Reduced motion: every row above renders its end state at once, with no loops and no boot sequence.

## 9. How it gets built

- **Stack (call):** what the app already ships: React 18, the `motion` library, `three`, CSS with the `--aeios-*` tokens.
  No new dependencies. GSAP stays development-only; its licence question is not reopened here.
- `MotionReady` moves from `domAnimation` to `domMax`, which layout animations (the sliding rail bar and site thumb) need.
  This adds to the bundle; the amount is measured and reported.
- New files under `src/deck/` (the deck and its cards, `useOverviewModel.ts`, `useCountUp.ts`, `DecodeText.tsx`,
  `deck.css`) and `src/shell/` (`Rail.tsx`, `TopBar.tsx`, `DesktopGate.tsx`, `ambient.css`).
- `App.tsx` loses the drawer logic and renders the new rail and top bar. `viewRegistry.ts` gains `briefing`.
- `GlobeHero.tsx`'s scroll scene is retired; the engine, maths and land dots are reused unchanged.
- The live site is not touched. Deploying is a separate decision after the owner has seen it.

## 10. Tests and checks

- Existing unit tests (`npm run test`) and `tsc -b` must stay green.
- Playwright: the phone and tablet projects are removed from `playwright.config.ts`. Specs that open the old landing
  (`overview`, `step1` to `step3`, `scroll-takeover`, `globe`, `reduced-motion`, `a11y-audit`, `views`) are pointed at
  `#/briefing` or rewritten for the deck; `scroll-takeover`'s globe-descent cases are removed with the scroll scene.
- New `deck.spec.ts`: no page scroll at 1280 x 720, 1440 x 900 and 1920 x 1080; the boot sequence can be skipped; the
  scrubber changes the selected hour; a stale station shows no pulse; reduced motion is static; a window under 1024 px
  shows the notice.
- Looked at by hand in the dev build (`/?preview`, including the `fixture=` states) before it is called done.
- Playwright needs its browsers downloaded on this machine. If that fails, the Playwright part is reported as not run.

## 11. Left to the builder

Exact sizes, easing curves and durations within the token set; the internal layout of each card; the decode effect's
character set; how the scaled 1024 to 1279 px mode is implemented (CSS `zoom` or a transform).

## 12. Risks

- **Frame rate.** The globe, wind streaks and ambient layer run together on the deck. The earlier wind-streak study found
  that combination costly. The deck is profiled at 1920 x 1080, and the ambient layer is the first thing cut if it drops frames.
- **Stale reality.** Both nodes have been silent since 3 November. The deck's station card will show the stale state on
  day one. It must look deliberate, not broken.
- **Test churn.** About ten end-to-end specs change. Coverage of the old phone and tablet behaviour is deleted on purpose.

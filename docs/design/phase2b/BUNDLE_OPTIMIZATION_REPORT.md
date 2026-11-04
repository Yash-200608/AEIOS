# Bundle optimization report (Phase 2B, Stage 5)

Date: 2026-11-04. **Outcome: investigated; no bundle change made.** The evidence shows no low-risk way to remove a meaningful part of the Motion cost while keeping the approved behaviour; the one large saving requires replacing Motion on the Overview, which is a design decision, not a tuning step.

## What was inspected
- Production imports of `motion` (v14.9.0): `src/motion/reveal.tsx` (`m`, `useAnimationControls`, variants), `src/motion/MotionReady.tsx` (`LazyMotion`, `domAnimation`), `src/motion/MorphStateLabel.tsx` (`AnimatePresence`, `m`, `useIsPresent`). The Lab and GSAP are absent from production (verified by searching `dist`).
- Tree-shaking: each subset of the imported symbols was bundled on its own with esbuild 0.25.12 (the version Vite uses here), React external, minified, gzip -9.
- Code splitting and lazy loading: whether Motion or its feature bundle can load after first paint.
- Simpler CSS alternatives.

## Measurements
### Production bundle (Vite build)
| Build | JS raw | JS gzip | CSS raw | CSS gzip |
|---|---|---|---|---|
| Deployed before the motion steps (`b7dfe9a`) | 1,673,826 | 458,076 | 100,589 | 22,825 |
| Phase 2B start (`7011fcc`) | 1,775,958 | 494,983 | 102,914 | 23,222 |
| Phase 2B end, merged and deployed (`3f3cd3a`) | 1,777,727 | 495,678 | 102,964 | 23,224 |

The Phase 2B delta (+1,769 B raw, +695 B gzip JS) includes the navigation fixes, the streak change, the accessibility fix and the merged node-first forecast changes from `aeios-v0-consolidation`. The dev-only diagnostics (`__aeiosNav`) are not in `dist`.

### Where the Motion cost comes from (each subset bundled alone; gzip)
| Imported subset | gzip |
|---|---|
| Everything production imports today | **32.8 KB** |
| The same without `domAnimation` (for example lazy-loaded features) | 25.2 KB |
| `domAnimation` alone | 27.6 KB |
| `useAnimationControls` alone | 18.8 KB |
| `m` + `LazyMotion` alone | 5.4 KB |
| `AnimatePresence` + `useIsPresent` alone | 3.3 KB |
| `motion/react-mini` `useAnimate` (for comparison) | 3.4 KB |

Reading: the subsets overlap. The weight is Motion's animation engine, which both `domAnimation` and `useAnimationControls` pull in. Removing or deferring one of them leaves the engine in place.

## Options evaluated
| Option | Saving (gzip) | Behaviour risk | Verdict |
|---|---|---|---|
| Lazy-load `domAnimation` (`LazyMotion features={() => import(...)}`) | about 7.6 KB from the main bundle | The reveal needs the engine at first paint. Until the chunk arrives, `m` elements stay in their hidden start state; the 2.2 s failsafe would then show everything without the reveal. Worse on slow networks. | Rejected |
| Code-split the Overview's motion code | 0 for first load | The Overview is the landing view, so the code is needed immediately | Rejected |
| Replace `useAnimationControls` with state-driven variants | about 0 | Still needs `domAnimation` (27.6 KB) | Rejected |
| `motion/react-mini` | up to about 29 KB | No `m` components, variants or `AnimatePresence`: a rewrite of Step 2 | Same as the next row |
| Replace Motion on the Overview with CSS animations / the Web Animations API (reveal schedule via custom properties and `animation-delay`; Skip/Replay via `Animation.finish()`/replay; morph via a two-span cross-fade) | about 33 KB (about 6.6% of the main bundle) | Rewrites the approved Step 2 and its once-per-session, failsafe, late-mount and reduced-motion behaviour; needs full re-verification in three engines | **Deferred for an explicit decision** |

## What was changed
Nothing in the bundle configuration or the Motion imports.

## Tests performed
esbuild subset bundles (above); production builds at the three commits (above); `dist` searched for `GreenSock`, `ScrollTrigger`, `__motionLab`, `__aeiosNav` (none found).

## Outstanding risks / deferred work
- The 33 KB gzip CSS/WAAPI replacement remains available. It is maintainable (no dependency) but carries regression risk for an approved, tested feature; recommended only if first-load size becomes a measured problem (no field data exists yet).
- No real-network or phone load-time measurement was made.

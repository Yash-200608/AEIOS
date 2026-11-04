import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m, type Variants } from 'motion/react';
import MotionReady from '../motion/MotionReady';
import { useMotionPolicy } from '../motion/useMotionPolicy';
import { motionTokens } from '../design/motion';
import { focusViewHeading } from './focusHeading';

/*
 * The stage that holds exactly one view and plays the transition between views.
 *
 *  - Outgoing view: fades and drifts away (opacity, y 16 px, scale 0.985) in 220 ms. Incoming view: rises 28 px into place in
 *    420 ms on the enter curve. Direction follows the navigation order: moving down the list slides up, moving up slides down.
 *    Only opacity and transform move; nothing is blurred and no value inside a view is animated by the stage.
 *  - A brief accent "scan" line sweeps across the top of the stage (transform and opacity only, once per change).
 *  - The new view starts at its top (instant scroll) and focus moves to its heading without scrolling. Neither happens on the
 *    first load, so a landing never steals focus or fights the browser.
 *  - Reduced motion (OS setting or .aeios-force-reduced-motion): an instant swap, no sweep, no hidden start state. Whether a
 *    change animates is decided when the navigation happens, so turning reduced motion on or off while a view is open never
 *    remounts that view (which would rebuild its maps and WebGL, and send the reader back to its top and heading).
 *  - Nothing blocks input: the incoming view is interactive from its first frame and no pointer-events or focus traps are set.
 *  - data-view-state is "entering" from the navigation until the incoming view has settled (or a failsafe), then "idle".
 */
type Phase = 'entering' | 'idle';

const EXIT_S = 0.22;
const ENTER_S = motionTokens.duration.reveal; // 0.42 s
const SCAN_S = motionTokens.duration.sequence; // 0.72 s, spans the exit and the entrance
const RISE_PX = 28;
const DRIFT_PX = 16;
const EXIT_SCALE = 0.985;
const FAILSAFE_MS = 1500; // "idle" even if an animation never reports completion (hidden tab, interrupted transition)

const frameVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, y: RISE_PX * dir, scale: 1 }),
  center: { opacity: 1, y: 0, scale: 1, transition: { duration: ENTER_S, ease: [...motionTokens.ease.enter] } },
  exit: (dir: number) => ({
    opacity: 0,
    y: -DRIFT_PX * dir,
    scale: EXIT_SCALE,
    transition: { duration: EXIT_S, ease: [...motionTokens.ease.exit] },
  }),
};

/** One mounted view. `seq` is the navigation count: 0 for the view shown on first load. */
function ViewFrame({ seq, children }: { seq: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (seq === 0) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); // before the first paint of the new view
  }, [seq]);
  useEffect(() => {
    if (seq === 0) return;
    focusViewHeading(ref.current);
  }, [seq]);
  return (
    <div ref={ref} className="view-stage__content">
      {children}
    </div>
  );
}

export default function ViewStage({ view, order, children }: { view: string; order: readonly string[]; children: ReactNode }) {
  const { reduced } = useMotionPolicy();
  const [nav, setNav] = useState(() => ({ view, dir: 1, seq: 0, animated: !reduced }));
  const [phase, setPhase] = useState<Phase>('idle');
  if (nav.view !== view) {
    // Derived from the previous view during render (no extra commit), so the outgoing view already exits in this direction.
    const from = order.indexOf(nav.view);
    const to = order.indexOf(view);
    setNav({ view, dir: to < from ? -1 : 1, seq: nav.seq + 1, animated: !reduced });
    setPhase(reduced ? 'idle' : 'entering');
  }
  const animate = nav.animated && !reduced;
  const seqRef = useRef(nav.seq);
  useLayoutEffect(() => {
    seqRef.current = nav.seq;
  }, [nav.seq]);

  useEffect(() => {
    if (phase !== 'entering') return;
    const timer = window.setTimeout(() => setPhase('idle'), FAILSAFE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, nav.seq]);

  const settled = (seq: number) => (definition: unknown) => {
    if (definition === 'center' && seq === seqRef.current) setPhase('idle');
  };

  return (
    <MotionReady>
      <div className="view-stage" data-testid="view-stage" data-view={view} data-view-state={animate ? phase : 'idle'}>
        {animate && nav.seq > 0 && (
          <div className="view-stage__scanbar" aria-hidden="true">
            <m.span
              key={nav.seq}
              className="view-stage__scan"
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: '100%', opacity: [0, 1, 1, 0] }}
              transition={{
                x: { duration: SCAN_S, ease: [...motionTokens.ease.standard] },
                opacity: { duration: SCAN_S, times: [0, 0.12, 0.7, 1], ease: 'linear' },
              }}
            />
          </div>
        )}
        {!nav.animated ? (
          <div key={view} className="view-stage__frame">
            <ViewFrame seq={nav.seq}>{children}</ViewFrame>
          </div>
        ) : (
          // `initial` only counts when AnimatePresence mounts: off on the first load, on when the first animated change follows
          // reduced-motion ones (so that view still rises in).
          <AnimatePresence mode="wait" initial={nav.seq > 0} custom={nav.dir}>
            <m.div
              key={view}
              className="view-stage__frame"
              custom={nav.dir}
              variants={frameVariants}
              initial="enter"
              animate="center"
              exit="exit"
              onAnimationComplete={settled(nav.seq)}
            >
              <ViewFrame seq={nav.seq}>{children}</ViewFrame>
            </m.div>
          </AnimatePresence>
        )}
      </div>
    </MotionReady>
  );
}

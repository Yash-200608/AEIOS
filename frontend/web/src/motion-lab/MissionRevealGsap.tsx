import { useEffect, useRef, useState } from 'react';
import { gsapEase, revealSchedule } from '../design/motion';
import { prefersReducedMotion, useMotionPolicy } from '../motion/useMotionPolicy';
import { gsap, useGSAP } from './gsap';
import RevealBoard, { cellSpec, GROUP_SPEC } from './RevealBoard';
import { markPlayed, playedThisSession, type LabModel } from './labModel';
import RevealControls from './RevealControls';

/*
 * Prototype A (2): the same Mission Reveal with GSAP, for comparison only (Lab only; GSAP is not approved for production).
 * useGSAP with a scope ref; one gsap.timeline per run built inside gsap.matchMedia (reduced motion builds nothing);
 * contextSafe() handlers; revertOnUpdate so each Replay reverts the previous run, and useGSAP reverts everything on unmount.
 * Same schedule and contract as the Motion twin: opacity and y only, nothing hidden from input or assistive technology.
 */
const SESSION_KEY = 'aeios-motionlab:reveal-gsap';
const REDUCED = '(prefers-reduced-motion: reduce)';
const FULL = '(prefers-reduced-motion: no-preference)';
const TIMELINE_ID = 'ml-reveal-gsap'; // handlers find the live run with gsap.getById (no ref read from render-time closures)
const liveTimeline = () => gsap.getById(TIMELINE_ID) as gsap.core.Timeline | undefined;

export default function MissionRevealGsap({ model }: { model: LabModel }) {
  const scope = useRef<HTMLDivElement>(null);
  const { reduced } = useMotionPolicy();
  // run 0 = do not play (already played this session, or reduced motion); every Replay increments it.
  const [run, setRun] = useState(() => (!prefersReducedMotion() && !playedThisSession(SESSION_KEY) ? 1 : 0));
  const [state, setState] = useState<'playing' | 'done'>(run ? 'playing' : 'done');

  const { contextSafe } = useGSAP(
    () => {
      if (run === 0) return;
      const finish = () => {
        setState('done');
        markPlayed(SESSION_KEY);
      };
      const mm = gsap.matchMedia();
      mm.add(
        { full: FULL, reduce: REDUCED },
        (ctx) => {
          if (ctx.conditions?.reduce || prefersReducedMotion()) {
            finish();
            return;
          }
          const tl = gsap.timeline({ id: TIMELINE_ID, onComplete: finish });
          for (const [g, s] of Object.entries(GROUP_SPEC)) {
            tl.fromTo(
              `[data-reveal="${g}"]`,
              { opacity: s.opacity, y: s.y },
              { opacity: 1, y: 0, duration: s.duration, ease: gsapEase.enter },
              s.delay,
            );
          }
          const cell = cellSpec(0);
          tl.fromTo(
            '[data-reveal="telemetry"] .cc-rail__cell',
            { opacity: cell.opacity, y: cell.y },
            { opacity: 1, y: 0, duration: cell.duration, ease: gsapEase.enter, stagger: cellSpec(1).delay - cell.delay },
            revealSchedule.telemetry,
          );
        },
        scope.current ?? undefined,
      );
      return () => mm.revert();
    },
    { scope, dependencies: [run], revertOnUpdate: true },
  );

  // Reduced motion forced on mid-play (the Lab toggle is a class, not a media query): jump the timeline to its end.
  useEffect(() => {
    if (reduced) liveTimeline()?.progress(1);
  }, [reduced]);

  const skip = contextSafe(() => {
    liveTimeline()?.progress(1); // renders the end state (onComplete fires); a finished run is no longer registered
    setState('done');
    markPlayed(SESSION_KEY);
  });
  const replay = contextSafe(() => {
    if (prefersReducedMotion()) {
      skip();
      return;
    }
    setState('playing');
    setRun((r) => r + 1);
  });

  const shown = reduced ? 'done' : state;
  return (
    <div className="ml-reveal" data-testid="reveal-gsap" data-reveal-state={shown} ref={scope}>
      <RevealControls
        state={shown}
        engine="GSAP"
        skipLabel="Skip GSAP reveal"
        replayLabel="Replay GSAP reveal"
        onSkip={skip}
        onReplay={replay}
      />
      <RevealBoard
        m={model}
        headingId="ml-rail-gsap"
        group={(g, className, children) => (
          <div className={className} data-reveal={g}>
            {children}
          </div>
        )}
        cell={(_i, className, children) => <li className={className}>{children}</li>}
      />
    </div>
  );
}

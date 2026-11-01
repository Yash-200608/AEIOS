import { useCallback, useEffect, useRef, useState } from 'react';
import { m, useAnimationControls, type Variants } from 'motion/react';
import { motionTokens } from '../design/motion';
import { prefersReducedMotion, useMotionPolicy } from '../motion/useMotionPolicy';
import RevealBoard, { cellSpec, GROUP_SPEC, type GroupSpec } from './RevealBoard';
import { markPlayed, playedThisSession, type LabModel } from './labModel';
import RevealControls from './RevealControls';

/*
 * Prototype A (1): Mission Reveal with Motion. LazyMotion + m components (the provider is in MotionLab), one shared
 * animation-controls object subscribed by every animated group and telemetry cell, each carrying its own timing as `custom`.
 * The situation statement is a plain element (visible from the first frame). Only opacity and y animate; values never tween.
 * Plays once per session; Skip sets the end state at once; Replay sets the start state and plays again.
 * Nothing here touches pointer events, visibility or focus, so the page stays scrollable, clickable and focusable throughout.
 */
const SESSION_KEY = 'aeios-motionlab:reveal-motion';

const variants: Variants = {
  hidden: (g: GroupSpec) => ({ opacity: g.opacity, y: g.y }),
  shown: (g: GroupSpec) => ({ opacity: 1, y: 0, transition: { delay: g.delay, duration: g.duration, ease: [...motionTokens.ease.enter] } }),
};

export default function MissionRevealMotion({ model }: { model: LabModel }) {
  const { reduced } = useMotionPolicy();
  // Decided once, before the first paint, so hidden start states are rendered only when a reveal will really play.
  const [startHidden] = useState(() => !prefersReducedMotion() && !playedThisSession(SESSION_KEY));
  const [state, setState] = useState<'playing' | 'done'>(startHidden ? 'playing' : 'done');
  const controls = useAnimationControls();
  const runToken = useRef(0); // invalidates the completion of a superseded run (Skip, Replay, unmount)

  const finish = useCallback(() => {
    setState('done');
    markPlayed(SESSION_KEY);
  }, []);
  const toEnd = useCallback(() => {
    runToken.current += 1;
    controls.stop();
    controls.set('shown');
  }, [controls]);

  const play = useCallback(() => {
    const token = ++runToken.current;
    controls.stop();
    controls.set('hidden');
    void controls.start('shown').then(() => {
      if (runToken.current === token) finish();
    });
  }, [controls, finish]);

  useEffect(() => {
    if (startHidden) play();
    return () => {
      runToken.current += 1;
      controls.stop();
    };
  }, [startHidden, play, controls]);

  // Reduced motion switched on mid-play (OS setting or the Lab's force toggle): jump to the end state. The DOM side runs in
  // an effect; the state side is adjusted during render (React's pattern for state derived from a changed input).
  useEffect(() => {
    if (reduced) toEnd();
  }, [reduced, toEnd]);
  const [seenReduced, setSeenReduced] = useState(reduced);
  if (reduced !== seenReduced) {
    setSeenReduced(reduced);
    if (reduced) setState('done');
  }

  const skip = () => {
    toEnd();
    finish();
  };
  const replay = () => {
    if (prefersReducedMotion()) {
      skip();
      return;
    }
    setState('playing');
    play();
  };

  const shown = reduced ? 'done' : state;
  return (
    <div className="ml-reveal" data-testid="reveal-motion" data-reveal-state={shown}>
      <RevealControls state={shown} engine="Motion" skipLabel="Skip reveal" replayLabel="Replay reveal" onSkip={skip} onReplay={replay} />
      <RevealBoard
        m={model}
        headingId="ml-rail-motion"
        group={(g, className, children) =>
          g === 'situation' || g === 'telemetry' ? (
            <div className={className} data-reveal={g}>
              {children}
            </div>
          ) : (
            <m.div
              className={className}
              data-reveal={g}
              custom={GROUP_SPEC[g]}
              variants={variants}
              initial={startHidden ? 'hidden' : false}
              animate={controls}
            >
              {children}
            </m.div>
          )
        }
        cell={(i, className, children) => (
          <m.li className={className} custom={cellSpec(i)} variants={variants} initial={startHidden ? 'hidden' : false} animate={controls}>
            {children}
          </m.li>
        )}
      />
    </div>
  );
}

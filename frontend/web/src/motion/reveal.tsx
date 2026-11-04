import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { inView, m, useAnimationControls, type HTMLMotionProps, type Variants } from 'motion/react';
import { RotateCcw, SkipForward } from 'lucide-react';
import { motionTokens, revealSchedule } from '../design/motion';
import MotionReady from './MotionReady';
import { RevealOnScroll } from './scroll';
import { prefersReducedMotion, useMotionPolicy } from './useMotionPolicy';

/*
 * Overview Mission Reveal (Step 2). Spec: docs/design/MOTION_STORYBOARD.md.
 *
 * The situation statement is never wrapped here, so it is visible from the first frame. Currency, assessment, measured air,
 * telemetry cells and the alert/outlook band fade in on the storyboard schedule (done in about 1.1 s). Only opacity and a short
 * translate move; values, gauge marks and labels are always rendered in their final form, never tweened.
 *
 * Safety rules, all enforced here:
 *  - Hidden start states exist only when a reveal will really play (decided once, before first paint): not under reduced motion,
 *    not after it has played this session (sessionStorage; blocked storage just means it plays).
 *  - Nothing sets pointer-events, visibility or focus, so scrolling, clicking and keyboard use work throughout.
 *  - The state lives in this component, not in the polled data, so a 30 s poll can never replay it.
 *  - A failsafe forces the end state at 2.2 s, so content can never stay hidden if an animation does not complete.
 *  - Skip and Replay are always present; Skip is never disabled because that would drop keyboard focus.
 *
 * Start: `start="mount"` (default) plays on mount. `start="visible"` (the Overview under the globe landing) keeps the same hidden
 * start state, decided the same way before first paint, but plays when the root's top edge has risen 20 % into the viewport
 * (IntersectionObserver, margin-based so a root taller than the viewport, the Overview on a phone, still triggers). The failsafe
 * counts from that moment; without IntersectionObserver it plays at once. While it waits, data-reveal-state is "playing" and
 * data-reveal-start is "waiting"; Skip ends it and Replay plays it immediately, both cancelling the wait.
 */
const SESSION_KEY = 'aeios:overview-reveal:v1';
const FAILSAFE_MS = 2200;
const VISIBLE_MARGIN = '0px 0px -20% 0px';

type Spec = { opacity: number; y: number; delay: number; duration: number };
export type RevealGroupName = 'currency' | 'assessment' | 'evidence' | 'outlook';
const GROUP_SPEC: Record<RevealGroupName, Spec> = {
  currency: { opacity: 0.6, y: 0, delay: revealSchedule.currency, duration: motionTokens.duration.fast },
  assessment: { opacity: 0, y: motionTokens.distance.reveal, delay: revealSchedule.assessment, duration: motionTokens.duration.reveal },
  evidence: { opacity: 0, y: 10, delay: revealSchedule.evidence, duration: 0.36 },
  outlook: { opacity: 0, y: 0, delay: revealSchedule.outlook, duration: motionTokens.duration.standard },
};
const cellSpec = (i: number): Spec => ({
  opacity: 0,
  y: motionTokens.distance.small,
  delay: revealSchedule.telemetry + i * motionTokens.stagger.compact,
  duration: motionTokens.duration.standard,
});

const variants: Variants = {
  hidden: (s: Spec) => ({ opacity: s.opacity, y: s.y }),
  shown: (s: Spec) => ({ opacity: 1, y: 0, transition: { delay: s.delay, duration: s.duration, ease: [...motionTokens.ease.enter] } }),
};

type RevealState = 'playing' | 'done';
type Ctx = {
  startHidden: boolean;
  controls: ReturnType<typeof useAnimationControls>;
  state: RevealState;
  skip: () => void;
  replay: () => void;
};
const RevealContext = createContext<Ctx | null>(null);

/** The reveal context, or null outside <RevealRoot> (components then render plain, static elements). */
export const useReveal = () => useContext(RevealContext);

function playedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}
function markPlayed(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* storage blocked: the reveal will play again next visit, which is harmless */
  }
}

export function RevealRoot({
  className,
  children,
  start = 'mount',
}: {
  className?: string;
  children: ReactNode;
  start?: 'mount' | 'visible';
}) {
  const { reduced } = useMotionPolicy();
  const [startHidden] = useState(() => !prefersReducedMotion() && !playedThisSession());
  const [startMode] = useState(start); // fixed at mount: changing it later must not replay the reveal
  const [waiting, setWaiting] = useState(() => startHidden && startMode === 'visible' && typeof IntersectionObserver !== 'undefined');
  const [state, setState] = useState<RevealState>(startHidden ? 'playing' : 'done');
  const controls = useAnimationControls();
  const rootRef = useRef<HTMLDivElement>(null);
  const stopWaiting = useRef<(() => void) | null>(null);
  const token = useRef(0); // a superseded run (Skip, Replay, unmount) must not finish the current one
  const failsafe = useRef<number | undefined>(undefined);

  const finish = useCallback(() => {
    window.clearTimeout(failsafe.current);
    controls.set('shown'); // also reaches cells that mounted while it played (their data arrived late): nothing may stay hidden
    setState('done');
    markPlayed();
  }, [controls]);
  const toEnd = useCallback(() => {
    token.current += 1;
    window.clearTimeout(failsafe.current);
    controls.stop();
    controls.set('shown');
  }, [controls]);

  const play = useCallback(() => {
    const mine = ++token.current;
    window.clearTimeout(failsafe.current);
    controls.stop();
    controls.set('hidden');
    void controls.start('shown').then(() => {
      if (token.current === mine) finish();
    });
    failsafe.current = window.setTimeout(() => {
      if (token.current === mine) {
        toEnd();
        finish();
      }
    }, FAILSAFE_MS);
  }, [controls, finish, toEnd]);

  const cancelWait = useCallback(() => {
    stopWaiting.current?.();
    stopWaiting.current = null;
  }, []);

  // The hidden start state, applied before the first paint. `initial="hidden"` on the groups is not enough on its own: under the
  // view stage's <AnimatePresence initial={false}> (the first load) Motion skips every initial state, and the groups would show
  // and then vanish when the reveal starts. Runs after the groups subscribed to `controls` (child layout effects run first).
  useLayoutEffect(() => {
    if (startHidden && !prefersReducedMotion()) controls.set('hidden');
  }, [startHidden, controls]);

  useEffect(() => {
    const el = rootRef.current;
    if (startHidden) {
      if (startMode === 'visible' && el && typeof IntersectionObserver !== 'undefined') {
        stopWaiting.current = inView(
          el,
          () => {
            cancelWait();
            setWaiting(false);
            if (prefersReducedMotion()) {
              toEnd();
              finish();
            } else {
              play();
            }
          },
          { margin: VISIBLE_MARGIN, amount: 0 },
        );
      } else {
        play();
      }
    }
    return () => {
      cancelWait();
      token.current += 1;
      window.clearTimeout(failsafe.current);
      controls.stop();
    };
  }, [startHidden, startMode, play, toEnd, finish, cancelWait, controls]);

  // Reduced motion switched on mid-play or while waiting: jump to the end state (DOM in an effect, state during render).
  useEffect(() => {
    if (reduced) {
      cancelWait();
      toEnd();
    }
  }, [reduced, toEnd, cancelWait]);
  const [seenReduced, setSeenReduced] = useState(reduced);
  if (reduced !== seenReduced) {
    setSeenReduced(reduced);
    if (reduced) setState('done');
  }

  const skip = useCallback(() => {
    cancelWait();
    setWaiting(false);
    toEnd();
    finish();
  }, [toEnd, finish, cancelWait]);
  const replay = useCallback(() => {
    if (prefersReducedMotion()) {
      skip();
      return;
    }
    cancelWait();
    setWaiting(false);
    setState('playing');
    play();
  }, [play, skip, cancelWait]);

  const shown: RevealState = reduced ? 'done' : state;
  return (
    <MotionReady>
      <RevealContext.Provider value={{ startHidden, controls, state: shown, skip, replay }}>
        <div
          ref={rootRef}
          className={className}
          data-reveal-state={shown}
          data-reveal-start={waiting && shown === 'playing' ? 'waiting' : 'started'}
        >
          {children}
        </div>
      </RevealContext.Provider>
    </MotionReady>
  );
}

type DivProps = Omit<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'variants' | 'custom'>;
/** An element that mounts after the reveal has finished (late data) must start visible: nobody will animate it in. */
const hiddenAtMount = (ctx: Ctx) => ctx.startHidden && ctx.state === 'playing';

/** One reveal group. Outside <RevealRoot> it is a plain div. */
export function RevealGroup({ group, ...rest }: { group: RevealGroupName } & DivProps) {
  const ctx = useReveal();
  if (!ctx) return <div {...(rest as object)} />;
  return (
    <m.div
      {...rest}
      data-reveal={group}
      custom={GROUP_SPEC[group]}
      variants={variants}
      initial={hiddenAtMount(ctx) ? 'hidden' : false}
      animate={ctx.controls}
    />
  );
}

type LiProps = Omit<HTMLMotionProps<'li'>, 'initial' | 'animate' | 'variants' | 'custom'>;
/** One telemetry cell, staggered by its index. Outside <RevealRoot> it is a plain li. */
export function RevealCell({ index, ...rest }: { index: number } & LiProps) {
  const ctx = useReveal();
  if (!ctx) return <li {...(rest as object)} />;
  return (
    <m.li {...rest} custom={cellSpec(index)} variants={variants} initial={hiddenAtMount(ctx) ? 'hidden' : false} animate={ctx.controls} />
  );
}

/**
 * One-time scroll entrance for a long lower section. Used only for Regional context and Destinations, never per card. It is the
 * same entrance every other view uses (RevealOnScroll: opacity and 24 px when its top edge comes into view, once, never hidden
 * when it cannot run), so the Overview and the views move alike. Because it is once, data arriving later cannot trigger it again.
 * It exists only when the intro played this session (same once-per-session rule) and never under reduced motion; otherwise a plain div.
 */
export function EnterOnce({ className, children }: { className?: string; children: ReactNode }) {
  const ctx = useReveal();
  const { reduced } = useMotionPolicy();
  if (!ctx || !ctx.startHidden || reduced) return <div className={className}>{children}</div>;
  return (
    <RevealOnScroll className={className} data-enter-once="">
      {children}
    </RevealOnScroll>
  );
}

/** Skip and Replay. Real buttons; the state is exposed as data-reveal-state on the root, not as a live region. */
export function RevealControls() {
  const ctx = useReveal();
  if (!ctx) return null;
  return (
    <div className="cc-reveal-controls" role="group" aria-label="Introduction animation">
      <button type="button" className="cc-reveal-btn" aria-label="Skip introduction animation" onClick={ctx.skip}>
        <SkipForward size={13} aria-hidden="true" /> Skip
      </button>
      <button type="button" className="cc-reveal-btn" aria-label="Replay introduction animation" onClick={ctx.replay}>
        <RotateCcw size={13} aria-hidden="true" /> Replay
      </button>
    </div>
  );
}

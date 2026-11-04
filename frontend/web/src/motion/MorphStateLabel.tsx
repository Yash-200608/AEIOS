import type { ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { StateLabel, type OperationalState } from '../design/primitives';
import { motionTokens } from '../design/motion';
import { useMotionPolicy } from './useMotionPolicy';
import { useMotionReady } from './MotionReady';

/*
 * Status label with a label morph. It renders the existing <StateLabel> unchanged (same props, same markup, same colours); only
 * the swap between two states is animated: opacity plus a 3 px blur for 120 ms on this one small element.
 *
 * Only a genuine change animates: the swap is keyed on the state VALUE, so a poll that returns a new object with the same state
 * re-renders in place and does nothing visible. The first render never animates (initial={false}); changing only the scope text
 * (for example a site switch) does not animate either. No size animation: Motion's layout animation needs the larger feature
 * bundle, which is not worth it for a label this small.
 *
 * Outside <MotionReady> (no LazyMotion provider; <RevealRoot> includes it) it is the plain <StateLabel>. Reduced motion swaps instantly.
 */
export default function MorphStateLabel({ state, scope, children }: { state: OperationalState; scope?: string; children?: ReactNode }) {
  const ready = useMotionReady();
  const { reduced } = useMotionPolicy();
  if (!ready || reduced)
    return (
      <StateLabel state={state} scope={scope}>
        {children}
      </StateLabel>
    );
  const t = { duration: motionTokens.duration.instant, ease: [...motionTokens.ease.standard] as [number, number, number, number] };
  return (
    <span className="cc-morph">
      <AnimatePresence initial={false} mode="popLayout">
        <m.span
          key={state}
          initial={{ opacity: 0, filter: 'blur(3px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, filter: 'blur(3px)' }}
          transition={t}
        >
          <StateLabel state={state} scope={scope}>
            {children}
          </StateLabel>
        </m.span>
      </AnimatePresence>
    </span>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useMotionPolicy } from '../motion/useMotionPolicy';
import { countFrame } from './motionMath';

const text = (v: number, digits: number) => v.toFixed(digits);

/*
 * A number that counts up to its value. It tweens from the value it last showed, only when the value really changes (a
 * new poll with the same value never re-plays it), over `duration` ms (default 600).
 *  - `null` in, `null` out, at once: a missing value is never drawn as 0 or NaN, and a value that becomes missing mid-count
 *    stops the count and shows the missing state immediately.
 *  - Reduced motion and a hidden tab show the final text with no tween; on first appearance (`intro`, default on) it counts up from 0.
 */
export function useCountUp(value: number | null, opts: { duration?: number; digits?: number; intro?: boolean } = {}): string | null {
  const { duration = 600, digits = 0, intro = true } = opts;
  const { reduced } = useMotionPolicy();
  const valid = value !== null && Number.isFinite(value) ? value : null;
  // On first appearance the number counts up from 0 (a decoration of a value that is already current, never of a missing one).
  const start0 = intro && !reduced && valid !== null;
  const [shown, setShown] = useState<number | null>(start0 ? 0 : valid);
  const target = useRef<number | null>(start0 ? 0 : valid); // the value the last tween was heading to
  const shownRef = useRef<number | null>(start0 ? 0 : valid); // the number on screen right now

  useEffect(() => {
    const show = (v: number | null) => {
      shownRef.current = v;
      setShown(v);
    };
    if (valid === null || shownRef.current === null || reduced || document.hidden || valid === target.current) {
      target.current = valid;
      show(valid);
      return;
    }
    const from = shownRef.current; // retarget from what is on screen, not from the previous target, so a change mid-count does not jump
    target.current = valid;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / duration;
      show(countFrame(from, valid, t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valid, reduced, duration]);

  // `shown ?? valid`: on the first render after null becomes a number there is no frame that says "no reading".
  return valid === null ? null : text(shown ?? valid, digits);
}

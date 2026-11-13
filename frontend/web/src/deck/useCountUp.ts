import { useEffect, useRef, useState } from 'react';
import { useMotionPolicy } from '../motion/useMotionPolicy';
import { countFrame } from './motionMath';

const text = (v: number, digits: number) => v.toFixed(digits);

/*
 * A number that counts up to its value. It tweens from the value it last showed, only when the value really changes (a
 * new poll with the same value never re-plays it), and over `duration` ms (default 600).
 *  - `null` in, `null` out, at once: a missing value is never drawn as 0 or NaN, and a value that becomes missing mid-count
 *    stops the count and shows the missing state immediately.
 *  - Reduced motion, a hidden tab and the very first render show the final text with no tween.
 */
export function useCountUp(value: number | null, opts: { duration?: number; digits?: number } = {}): string | null {
  const { duration = 600, digits = 0 } = opts;
  const { reduced } = useMotionPolicy();
  const valid = value !== null && Number.isFinite(value) ? value : null;
  const [shown, setShown] = useState<number | null>(valid);
  const last = useRef<number | null>(valid);

  useEffect(() => {
    if (valid === null || last.current === null || reduced || document.hidden || valid === last.current) {
      last.current = valid;
      setShown(valid);
      return;
    }
    const from = last.current;
    last.current = valid;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / duration;
      setShown(countFrame(from, valid, t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valid, reduced, duration]);

  return valid === null || shown === null ? null : text(shown, digits);
}

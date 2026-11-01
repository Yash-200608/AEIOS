import { useEffect, useState, type RefObject } from 'react';
import { useMotionPolicy } from './useMotionPolicy';

/*
 * Whether a continuous animation loop may run: not paused by the user, on screen, document visible, and motion not reduced.
 * Loops must stop scheduling requestAnimationFrame entirely when this is false (zero cost when idle).
 */
export function useActiveLoop(ref: RefObject<Element | null>, paused: boolean): boolean {
  const { reduced } = useMotionPolicy();
  const [onScreen, setOnScreen] = useState(false);
  const [visible, setVisible] = useState(() => (typeof document === 'undefined' ? true : !document.hidden));

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setOnScreen(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { rootMargin: '100px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return !paused && onScreen && visible && !reduced;
}

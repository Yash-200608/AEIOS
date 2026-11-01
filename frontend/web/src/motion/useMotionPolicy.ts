import { useSyncExternalStore } from 'react';

/*
 * One reduced-motion policy for every JS animation (Motion, GSAP, rAF loops, Three.js).
 * Reduced when the OS asks for it OR the page sets .aeios-force-reduced-motion on <html> (used by the labs to demonstrate it).
 */
const QUERY = '(prefers-reduced-motion: reduce)';
const FORCE_CLASS = 'aeios-force-reduced-motion';

function read(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(QUERY).matches || document.documentElement.classList.contains(FORCE_CLASS);
}

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => {
    mq.removeEventListener('change', onChange);
    mo.disconnect();
  };
}

export function prefersReducedMotion(): boolean {
  return read();
}

export function useMotionPolicy(): { reduced: boolean } {
  const reduced = useSyncExternalStore(subscribe, read, () => false);
  return { reduced };
}

/** Smooth scrolling for JS scrollIntoView calls that respects the policy (CSS scroll-behavior rules do not cover JS). */
export function scrollBehavior(): ScrollBehavior {
  return read() ? 'auto' : 'smooth';
}

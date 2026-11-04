import { useCallback, useEffect, useRef } from 'react';
import { scrollBehavior } from './useMotionPolicy';

/*
 * Scroll-following navigation. Reports the id of the page section that is currently "the one being read": the last section (in
 * document order) whose top has passed 35% of the viewport height, or the last section when the page is scrolled to its end.
 * Exactly one id is reported at a time, so exactly one nav item can carry aria-current.
 *
 * It is read-only: it never scrolls, snaps, pins or reorders anything. One passive scroll listener, throttled with
 * requestAnimationFrame, and a state update only when the section really changes (callers pass a state setter, which ignores
 * repeats).
 *
 * Click-to-navigate: the caller highlights the destination at once and calls the returned lock function. While the smooth scroll
 * travels, the highlight stays on the destination instead of flickering through the sections on the way. There is NO fixed timeout:
 * the highlight lock ends when the destination becomes the section being read, and the click's alignment check ends only when
 *   1. scrolling has settled: the browser's `scrollend` event, or no scroll event for SETTLE_MS (a scroll that is still moving
 *      keeps producing events, so a long scroll can never be cut short), or
 *   2. nothing started moving within START_MS of the click (the target was already in view), or
 *   3. the user takes over with the wheel, a touch or a key.
 * Content can grow while a long smooth scroll is travelling (late-loading panels below the starting point), so the browser's
 * scroll can settle short of the destination (measured: about 960 px short on the Station network link). When the scroll settles
 * and the destination is not at the top of the viewport, we scroll to it again, at most MAX_FIXES times, unless the page cannot
 * scroll any further (a short last section). Only then is the lock released, and the clicked item stays highlighted until the
 * next scroll.
 */
const LINE = 0.35;
const SETTLE_MS = 200; // no scroll event for this long after the last one: scrolling has settled
const START_MS = 400; // no scroll event at all this long after the click: nothing is travelling
const MAX_FIXES = 6; // corrective scrolls after a scroll settled short of the destination
const ALIGN_TOL = 24; // px: a destination this close to its resting position counts as aligned

/** Where scrollIntoView({ block: 'start' }) rests a section: the page's sticky offset (scroll-padding plus scroll-margin). */
function restingTop(el: Element): number {
  const px = (v: string) => Number.parseFloat(v) || 0;
  return px(getComputedStyle(el).scrollMarginTop) + px(getComputedStyle(document.documentElement).scrollPaddingTop);
}

export function useActiveSection(ids: readonly string[], onChange: (id: string) => void): (id: string) => void {
  const lock = useRef<{ id: string; timer: number; fixes: number; reached: boolean } | null>(null);
  const settleRef = useRef<() => void>(() => undefined); // the effect's settle(), so a click can arm the "nothing started moving" timer
  const idsKey = ids.join('|');

  const unlock = useCallback(() => {
    if (lock.current) window.clearTimeout(lock.current.timer);
    lock.current = null;
  }, []);

  useEffect(() => {
    let raf = 0;
    const arm = (ms: number) => {
      if (!lock.current) return;
      window.clearTimeout(lock.current.timer);
      lock.current.timer = window.setTimeout(settle, ms);
    };
    // Scrolling has settled (or never started) while the click's lock is still held. If the destination is not at the top of the
    // viewport (the scroll landed short because content grew on the way), scroll to it again, a few times at most.
    const settle = () => {
      const l = lock.current;
      if (!l) return;
      const el = document.getElementById(l.id);
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (el && !atEnd && l.fixes < MAX_FIXES && Math.abs(el.getBoundingClientRect().top - restingTop(el)) > ALIGN_TOL) {
        l.fixes += 1;
        el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
        arm(START_MS);
        return;
      }
      unlock();
    };
    settleRef.current = settle;
    const compute = () => {
      raf = 0;
      const els = idsKey
        .split('|')
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null)
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      if (!els.length) return;
      const line = window.innerHeight * LINE;
      let cur = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top <= line) cur = el.id;
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atEnd && window.scrollY > 0 && !lock.current) cur = els[els.length - 1].id;
      if (lock.current && !lock.current.reached) {
        if (cur !== lock.current.id) return; // still travelling to the clicked target: keep the destination highlighted
        lock.current.reached = true; // the highlight is released; the lock stays until the scroll settles so it can still align
      }
      onChange(cur);
    };
    const onScroll = () => {
      arm(SETTLE_MS); // still moving: push the "settled" deadline back
      if (!raf) raf = requestAnimationFrame(compute);
    };
    const onScrollEnd = () => settle();
    const onUser = () => unlock();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scrollend', onScrollEnd, { passive: true });
    for (const t of ['wheel', 'touchstart', 'keydown'] as const) window.addEventListener(t, onUser, { passive: true });
    raf = requestAnimationFrame(compute); // a reload can restore a scroll position
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', onScrollEnd);
      for (const t of ['wheel', 'touchstart', 'keydown'] as const) window.removeEventListener(t, onUser);
      if (raf) cancelAnimationFrame(raf);
      unlock();
    };
  }, [idsKey, onChange, unlock]);

  return useCallback(
    (id: string) => {
      unlock();
      lock.current = { id, timer: window.setTimeout(() => settleRef.current(), START_MS), fixes: 0, reached: false };
    },
    [unlock],
  );
}

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
 *   3. the user takes over with the wheel, a touch, a key or a pointer press.
 * A scroll with no input event (a scrollbar drag in some browsers, assistive technology, find-in-page) is never fought either,
 * because a correction is only made when the destination itself moved on the page (see below).
 * A newer request always replaces the older one, so the latest destination wins; a `scrollend` reported for the interrupted
 * scroll is ignored.
 * Content can grow while a long smooth scroll is travelling (late-loading panels below the starting point), so the browser's
 * scroll can settle short of the destination (measured: about 960 px short on the Station network link). When the scroll settles
 * misaligned AND the destination has moved on the page since we aimed at it, we scroll to it again, at most MAX_FIXES times, unless
 * the page cannot scroll any further. A misalignment without the destination moving was caused by something else (the user), so
 * the lock is released without correcting. The clicked item stays highlighted until the next scroll.
 */
const LINE = 0.35;
const SETTLE_MS = 200; // no scroll event for this long after the last one: scrolling has settled
const START_MS = 400; // no scroll event at all this long after the click: nothing is travelling
const MAX_FIXES = 6; // corrective scrolls after a scroll settled short of the destination
const ALIGN_TOL = 24; // px: a destination this close to its resting position counts as aligned
const STABLE_MS = 150; // "settled" means the position stayed still for this long (the main thread can pause scroll events)
const STALE_END_MS = 120; // a scrollend this soon after a new request, before our scroll moved, belongs to the interrupted scroll

/** The element's top in document coordinates (independent of the current scroll position). */
const docTop = (el: Element) => el.getBoundingClientRect().top + window.scrollY;

/** Where scrollIntoView({ block: 'start' }) rests a section: the page's sticky offset (scroll-padding plus scroll-margin). */
function restingTop(el: Element): number {
  const px = (v: string) => Number.parseFloat(v) || 0;
  return px(getComputedStyle(el).scrollMarginTop) + px(getComputedStyle(document.documentElement).scrollPaddingTop);
}

/*
 * Development-only diagnostics (stripped from production builds by the import.meta.env.DEV guard): the current lock and a short
 * log of what the hook decided, so browser tests can assert that no lock is left behind and no corrective scroll fought the user.
 */
type NavLogEntry = { t: number; event: string; id?: string; detail?: string };
type NavDebug = { lock: () => { id: string; fixes: number; reached: boolean } | null; log: NavLogEntry[] };
function navLog(event: string, id?: string, detail?: string) {
  if (!import.meta.env.DEV) return;
  const w = window as unknown as { __aeiosNav?: NavDebug };
  if (!w.__aeiosNav) return;
  w.__aeiosNav.log.push({ t: Math.round(performance.now()), event, id, detail });
  if (w.__aeiosNav.log.length > 200) w.__aeiosNav.log.shift();
}

export function useActiveSection(ids: readonly string[], onChange: (id: string) => void): (id: string) => void {
  const lock = useRef<{
    id: string;
    timer: number;
    fixes: number;
    reached: boolean;
    lastY: number;
    moved: boolean;
    t0: number;
    docY: number | null; // where the destination was on the page when we last scrolled to it
  } | null>(null);
  const settleRef = useRef<() => void>(() => undefined); // the effect's settle(), so a click can arm the "nothing started moving" timer
  const idsKey = ids.join('|');

  const unlock = useCallback((why = 'unlock') => {
    if (lock.current) {
      navLog(why, lock.current.id);
      window.clearTimeout(lock.current.timer);
    }
    lock.current = null;
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __aeiosNav?: NavDebug };
    w.__aeiosNav = {
      lock: () => (lock.current ? { id: lock.current.id, fixes: lock.current.fixes, reached: lock.current.reached } : null),
      log: [],
    };
    return () => {
      delete w.__aeiosNav;
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const arm = (ms: number) => {
      if (!lock.current) return;
      window.clearTimeout(lock.current.timer);
      lock.current.timer = window.setTimeout(settle, ms);
    };
    // Scrolling has settled (or never started) while the click's lock is still held. A correction is justified only when the
    // destination itself MOVED on the page after we aimed at it (content grew on the way, so the browser aimed at a stale position).
    // If it did not move and we are still not aligned, something else moved the page (most likely the user: a scrollbar drag or
    // assistive technology sends no input event), so we release without correcting: never fight the user.
    const settle = () => {
      const l = lock.current;
      if (!l) return;
      // Confirm that the page has really stopped: a busy main thread can withhold scroll events for several hundred ms while the
      // browser's smooth scroll keeps moving, and an interrupted scroll can report a late scrollend (both measured).
      const y = window.scrollY;
      window.clearTimeout(l.timer);
      l.timer = window.setTimeout(() => {
        if (lock.current !== l) return;
        if (Math.abs(window.scrollY - y) > 1) {
          arm(SETTLE_MS);
          return;
        }
        decide(l);
      }, STABLE_MS);
    };
    const decide = (l: NonNullable<typeof lock.current>) => {
      const el = document.getElementById(l.id);
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const misaligned = el !== null && Math.abs(el.getBoundingClientRect().top - restingTop(el)) > ALIGN_TOL;
      const targetMoved = el !== null && l.docY !== null && Math.abs(docTop(el) - l.docY) > ALIGN_TOL;
      if (el && !atEnd && misaligned && targetMoved && l.fixes < MAX_FIXES) {
        l.fixes += 1;
        l.docY = docTop(el);
        navLog('fix', l.id, String(l.fixes));
        el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
        arm(START_MS);
        return;
      }
      unlock(!misaligned ? 'settled' : atEnd ? 'settled-at-end' : l.fixes >= MAX_FIXES ? 'exhausted' : 'settled-elsewhere');
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
        navLog('reached', cur);
      }
      onChange(cur);
    };
    const onScroll = () => {
      const l = lock.current;
      if (l) {
        // Only record that the page moved since the request (the stale-scrollend check below needs it). Direction is NOT used to
        // guess that the user took over: measured on this page, our own travel steps back by 90-160 px while content loads.
        if (window.scrollY !== l.lastY) l.moved = true;
        l.lastY = window.scrollY;
      }
      arm(SETTLE_MS); // still moving: push the "settled" deadline back
      if (!raf) raf = requestAnimationFrame(compute);
    };
    const onScrollEnd = () => {
      const l = lock.current;
      // Interrupting a smooth scroll with a new request makes the browser report the END of the interrupted scroll. Before our own
      // scroll has moved, that event says nothing about our destination; the 200 ms settle timer still covers a scroll that stops.
      if (l && !l.moved && performance.now() - l.t0 < STALE_END_MS) {
        navLog('ignored-stale-scrollend', l.id);
        return;
      }
      settle();
    };
    const onUser = (e: Event) => unlock(`user-${e.type}`);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scrollend', onScrollEnd, { passive: true });
    for (const t of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.addEventListener(t, onUser, { passive: true });
    raf = requestAnimationFrame(compute); // a reload can restore a scroll position
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', onScrollEnd);
      for (const t of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) window.removeEventListener(t, onUser);
      if (raf) cancelAnimationFrame(raf);
      unlock('unmount');
    };
  }, [idsKey, onChange, unlock]);

  return useCallback(
    (id: string) => {
      const target = document.getElementById(id);
      unlock('superseded');
      navLog('lock', id);
      lock.current = {
        id,
        timer: window.setTimeout(() => settleRef.current(), START_MS),
        fixes: 0,
        reached: false,
        lastY: window.scrollY,
        moved: false,
        t0: performance.now(),
        docY: target ? docTop(target) : null,
      };
    },
    [unlock],
  );
}

import { useEffect } from 'react';
import { prefersReducedMotion } from './useMotionPolicy';

/*
 * Gliding mouse-wheel scrolling for the whole page (no library). A wheel notch sets a target and the window eases toward it,
 * so the pinned scenes driven by scroll (the Overview globe descent) move continuously instead of in 100 px steps.
 *
 * Only the wheel is taken over, and only when it is safe to:
 *  - fine pointer and motion allowed (reduced motion, touch and coarse pointers keep native scrolling; re-checked live);
 *  - never for ctrl/meta + wheel (browser zoom, pinch on touchpads), mostly horizontal deltas, events another handler already
 *    consumed (defaultPrevented: Leaflet zoom, OrbitControls), anything inside [data-native-wheel], or a wheel over an element
 *    that can itself still scroll in that direction (tables, lists, the drawer).
 * Keyboard, scrollbar, find-in-page, focus and scrollIntoView stay native: every frame checks that the window is still where this
 * loop last put it, and anything else moving it stops the glide at once (divergence guard). An idle scroll resyncs the target.
 *
 * Marker: <html data-smooth-wheel="on" | "off">.
 */

const TAU_S = 0.085; // easing time constant: ~63 % of the remaining distance per 85 ms
const SETTLE_PX = 0.5;
const GUARD_PX = 2;
const LINE_PX = 16;
const ATTR = 'data-smooth-wheel';

function canScrollY(el: Element, dy: number): boolean {
  if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight + 1) return false;
  const overflow = getComputedStyle(el).overflowY;
  if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'overlay') return false;
  return dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
}

/** True when the wheel belongs to something other than the window. */
function ownedElsewhere(target: EventTarget | null, dy: number): boolean {
  let el = target instanceof Element ? target : null;
  const root = document.scrollingElement ?? document.documentElement;
  while (el && el !== root && el !== document.body) {
    if (el.hasAttribute('data-native-wheel')) return true;
    if (canScrollY(el, dy)) return true;
    el = el.parentElement;
  }
  return false;
}

export function installSmoothWheel(): () => void {
  const html = document.documentElement;
  const fine = window.matchMedia('(pointer: fine)');
  let enabled = false;
  let target = window.scrollY;
  let written = window.scrollY; // the window position this loop last applied (divergence guard)
  let pos = window.scrollY; // eased float position
  let raf = 0;
  let last = 0;

  const maxScroll = () => Math.max(0, (document.scrollingElement ?? html).scrollHeight - window.innerHeight);

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    sync();
  };

  const sync = () => {
    target = window.scrollY;
    written = target;
    pos = target;
  };

  const step = (now: number) => {
    raf = 0;
    const y = window.scrollY;
    if (Math.abs(y - written) > GUARD_PX) {
      stop(); // keyboard, scrollbar, scrollIntoView or a view change moved the page: theirs now
      return;
    }
    target = Math.min(Math.max(0, target), maxScroll());
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const remaining = target - pos;
    pos = Math.abs(remaining) <= SETTLE_PX ? target : pos + remaining * (1 - Math.exp(-dt / TAU_S));
    window.scrollTo({ top: pos, behavior: 'instant' });
    written = window.scrollY; // what the browser applied (it may round); the float position carries the easing
    if (Math.abs(target - pos) > SETTLE_PX) raf = requestAnimationFrame(step);
  };

  const onWheel = (event: WheelEvent) => {
    if (!enabled || event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const unit = event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? window.innerHeight : 1;
    const dy = event.deltaY * unit;
    if (!dy || ownedElsewhere(event.target, dy)) return;
    const max = maxScroll();
    if (!raf) sync();
    // At an end already: let the browser have it (overscroll effects, nothing to glide to).
    if ((dy < 0 && target <= 0) || (dy > 0 && target >= max)) return;
    event.preventDefault();
    target = Math.min(Math.max(0, target + dy), max);
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(step);
    }
  };

  const onScroll = () => {
    if (!raf) sync();
  };

  const update = () => {
    const next = fine.matches && !prefersReducedMotion();
    if (next === enabled) return;
    enabled = next;
    if (!enabled) stop();
    html.setAttribute(ATTR, enabled ? 'on' : 'off');
  };

  html.setAttribute(ATTR, 'off');
  update();
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  fine.addEventListener('change', update);
  reducedQuery.addEventListener('change', update);
  const mo = new MutationObserver(update); // .aeios-force-reduced-motion on <html>
  mo.observe(html, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    stop();
    fine.removeEventListener('change', update);
    reducedQuery.removeEventListener('change', update);
    mo.disconnect();
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('scroll', onScroll);
    html.removeAttribute(ATTR);
  };
}

/** Mount once at the app root. */
export function useSmoothWheel(): void {
  useEffect(() => installSmoothWheel(), []);
}

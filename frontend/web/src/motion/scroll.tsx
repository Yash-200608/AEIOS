import { Fragment, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { inView, m, useAnimationControls, useMotionValue, useSpring, type MotionValue, type Variants } from 'motion/react';
import { motionTokens } from '../design/motion';
import MotionReady, { useMotionReady } from './MotionReady';
import { prefersReducedMotion, useMotionPolicy } from './useMotionPolicy';
import './scroll.css';

/*
 * Scroll-linked motion primitives shared by every view. Motion (`motion/react`, LazyMotion + `m`) owns every property animated
 * here, except the children of a staggered RevealOnScroll, which use the Web Animations API on the CSS `translate` property (so
 * no inline style is left behind and the children's own `transform` is never overwritten).
 *
 *  - <ScrollProgress />: a 3 px accent bar stuck to the top of the content area; scaleX = how far the window is scrolled (0..1),
 *    with a light spring. It is information, so it stays under reduced motion and simply follows the scroll without smoothing.
 *    A page that cannot scroll shows no bar. It is re-measured when the content height changes, not only on scroll.
 *  - <RevealOnScroll>: content rises in (opacity 0 -> 1, 24 px) the first time its top edge passes 12 % above the bottom of the
 *    viewport. Height-independent on purpose: an `amount` threshold can never be reached by a block taller than the viewport
 *    divided by that amount (a long panel on a phone), and would leave it blank on screen.
 *    It never leaves content hidden: no hidden state at all under reduced motion, without IntersectionObserver, outside
 *    <MotionReady>, inside another RevealOnScroll (the outer one owns the entrance), or when it mounts already on screen once the
 *    view has settled (late data). A failsafe forces the end state if an entrance does not report completion.
 *    Marker: data-reveal-on-scroll="pending" | "shown" ("shown" once the entrance has finished or when none will run).
 *  - <ViewHero>: the header band of every non-overview view: kicker, <h1 tabIndex={-1} data-view-heading>, subtitle, right slot.
 *    Entrance once per mount (kicker slides, accent rule draws, title words rise out of a mask, subtitle and slot follow). Then a
 *    pinned scene: the band stays at the top while the view's content scrolls up over it, and its exit is scrubbed by the scroll
 *    (see useHeroScene). Markers: track data-testid="view-hero-track" data-pinned, band data-hero-progress. Reduced motion: static,
 *    nothing pins.
 *
 * Nothing here sets pointer-events, visibility or focus, so input is never blocked; the only scroll write is the hero's return to
 * a covered band when focus enters it. Values are never tweened.
 */

const ATTR = 'data-reveal-on-scroll';
const ease = [...motionTokens.ease.enter] as [number, number, number, number];
const REVEAL_Y = 24;
const REVEAL_S = 0.5;
const REVEAL_MARGIN = '0px 0px -12% 0px';
/** After this long in a view, a block that mounts already on screen is shown as is (its data arrived late). */
const SETTLE_MS = 1200;
/** Reveals that start within this window of each other cascade by CASCADE_STEP_S each (a view entrance, a fast scroll). */
const CASCADE_WINDOW_MS = 140;
const CASCADE_STEP_S = 0.08;
const CASCADE_MAX = 4;
const FAILSAFE_EXTRA_MS = 900;

// ------------------------------------------------------------------------------------------------------------ ScrollProgress

/** The reading-progress bar. Renders its own <MotionReady>, so it works anywhere in the tree. */
export function ScrollProgress() {
  return (
    <MotionReady>
      <ScrollProgressBar />
    </MotionReady>
  );
}

/**
 * Window scroll progress (0..1; 0 when the page cannot scroll). Measured once per frame at most, and only when something can have
 * changed it: a scroll, a resize, or the document changing height (a view swap, late data). Motion's useScroll re-measures on
 * scroll and resize only, so it would show a stale value after content grows, unless it polls the size every frame.
 */
function useWindowScrollProgress(): MotionValue<number> {
  const progress = useMotionValue(0);
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const root = document.scrollingElement ?? document.documentElement;
      const max = root.scrollHeight - root.clientHeight;
      progress.set(max > 1 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0);
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    ro?.observe(document.documentElement); // <html> is height: auto, so this fires when the content height changes
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro?.disconnect();
    };
  }, [progress]);
  return progress;
}

function ScrollProgressBar() {
  const { reduced } = useMotionPolicy();
  const progress = useWindowScrollProgress();
  const smooth = useSpring(progress, { stiffness: 240, damping: 36, mass: 0.35, restDelta: 0.0005 });
  return (
    <m.div data-testid="scroll-progress" className="scroll-progress" aria-hidden="true" style={{ scaleX: reduced ? progress : smooth }} />
  );
}

// ------------------------------------------------------------------------------------------------------------ RevealOnScroll

export type RevealOnScrollProps = {
  children: ReactNode;
  as?: 'div' | 'section';
  className?: string;
  /** Extra delay in seconds before the entrance (added to the automatic cascade). */
  delay?: number;
  id?: string;
  /** Seconds between the entrances of the direct children; the block itself then does not move, its children do. */
  stagger?: number;
} & { [data: `data-${string}`]: string | undefined };

/** First time a RevealOnScroll was seen in each view root (or the document), to tell a view entrance from late data. */
const viewEpoch = new WeakMap<Element, number>();
function epochOf(el: Element): number {
  const scope = el.closest('[data-view-id]') ?? document.documentElement;
  let t = viewEpoch.get(scope);
  if (t === undefined) {
    t = performance.now();
    viewEpoch.set(scope, t);
  }
  return t;
}

let cascadeAt = Number.NEGATIVE_INFINITY;
let cascadeSlot = 0;
function cascadeDelay(): number {
  const now = performance.now();
  cascadeSlot = now - cascadeAt < CASCADE_WINDOW_MS ? Math.min(cascadeSlot + 1, CASCADE_MAX) : 0;
  cascadeAt = now;
  return cascadeSlot * CASCADE_STEP_S;
}

function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

/** Whether this block gets a hidden start state. Decided once, before the first paint. */
function shouldWait(el: HTMLElement): boolean {
  const epoch = epochOf(el); // registered even when the answer is no, so the view's clock starts with its first block
  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return false;
  if (el.parentElement?.closest(`[${ATTR}]`)) return false;
  return !(performance.now() - epoch > SETTLE_MS && onScreen(el));
}

/** Hidden start state for the direct children of a staggered block: paused Web Animations held on their first keyframe. */
function holdChildren(el: HTMLElement): Animation[] {
  return Array.from(el.children)
    .filter((c): c is HTMLElement => c instanceof HTMLElement && typeof c.animate === 'function')
    .map((child) => {
      const a = child.animate(
        [
          { opacity: 0, translate: `0 ${REVEAL_Y}px` },
          { opacity: 1, translate: '0 0' },
        ],
        {
          duration: REVEAL_S * 1000,
          easing: `cubic-bezier(${ease.join(', ')})`,
          fill: 'backwards', // shows the first keyframe while delayed; nothing is kept once it has finished
        },
      );
      a.pause();
      a.currentTime = 0;
      return a;
    });
}

/**
 * Content that rises in the first time it scrolls into view. Outside <MotionReady> it is a plain element, shown.
 * Pass `data-*` attributes to mark the element (they are forwarded).
 */
export function RevealOnScroll(props: RevealOnScrollProps) {
  const ready = useMotionReady();
  if (!ready) {
    const Tag = props.as ?? 'div';
    return (
      <Tag {...dataAttributes(props)} id={props.id} className={props.className} data-reveal-on-scroll="shown">
        {props.children}
      </Tag>
    );
  }
  return <MotionReveal {...props} />;
}

function dataAttributes(props: RevealOnScrollProps): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('data-'))) as Record<string, string | undefined>;
}

function MotionReveal({ children, as = 'div', className, delay = 0, id, stagger, ...data }: RevealOnScrollProps) {
  const ref = useRef<HTMLElement>(null);
  const controls = useAnimationControls();
  const { reduced } = useMotionPolicy();
  const finishRef = useRef<(() => void) | null>(null);
  const hiddenRef = useRef(false); // Motion values were set to the hidden state by an earlier run (StrictMode re-mount)

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = (s: 'pending' | 'shown') => el.setAttribute(ATTR, s);
    if (!shouldWait(el)) {
      if (hiddenRef.current) controls.set({ opacity: 1, y: 0 });
      hiddenRef.current = false;
      mark('shown');
      return;
    }

    let alive = true;
    let settled = false;
    let timer: number | undefined;
    let stopWatching = () => {};
    const held = stagger ? holdChildren(el) : [];
    if (!stagger) {
      controls.set({ opacity: 0, y: REVEAL_Y });
      hiddenRef.current = true;
    }
    mark('pending');

    const finish = () => {
      if (!alive || settled) return;
      settled = true;
      stopWatching();
      window.clearTimeout(timer);
      held.forEach((a) => a.cancel()); // a cancelled effect leaves the element exactly as its own CSS draws it
      if (!stagger) {
        controls.stop();
        controls.set({ opacity: 1, y: 0 });
        hiddenRef.current = false;
      }
      mark('shown');
    };
    finishRef.current = finish;

    const play = () => {
      const start = delay + cascadeDelay();
      let total = start + REVEAL_S;
      if (stagger) {
        held.forEach((a, i) => {
          a.effect?.updateTiming({ delay: (start + i * stagger) * 1000 });
          a.play();
        });
        total += stagger * Math.max(0, held.length - 1);
        void Promise.all(held.map((a) => a.finished)).then(finish, finish);
      } else {
        void controls.start({ opacity: 1, y: 0, transition: { delay: start, duration: REVEAL_S, ease } }).then(finish, finish);
      }
      timer = window.setTimeout(finish, total * 1000 + FAILSAFE_EXTRA_MS);
    };

    stopWatching = inView(el, () => play(), { margin: REVEAL_MARGIN, amount: 0 }); // returning nothing makes it once
    return () => {
      alive = false;
      stopWatching();
      window.clearTimeout(timer);
      held.forEach((a) => a.cancel());
      controls.stop(); // controls.set is not allowed once Motion has unmounted the controls; a re-mount resets the values
      finishRef.current = null;
    };
  }, [controls, delay, stagger]);

  // Reduced motion switched on while waiting or entering: show the end state now.
  useEffect(() => {
    if (reduced) finishRef.current?.();
  }, [reduced]);

  // The marker is rendered once with a constant value (so an inner block can see this one before effects run) and is then owned
  // by the effect above: React never rewrites an attribute whose rendered value does not change.
  const common = { ...data, id, className, [ATTR]: 'pending', initial: false as const, animate: controls };
  return as === 'section' ? (
    <m.section ref={ref} {...common}>
      {children}
    </m.section>
  ) : (
    <m.div ref={ref as RefObject<HTMLDivElement>} {...common}>
      {children}
    </m.div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ ViewHero

export type ViewHeroProps = { kicker: string; title: string; subtitle?: ReactNode; right?: ReactNode };

const kickerV: Variants = {
  hidden: { opacity: 0, x: -16 },
  shown: { opacity: 1, x: 0, transition: { delay: 0.04, duration: 0.5, ease } },
};
const ruleV: Variants = {
  hidden: { scaleX: 0 },
  shown: { scaleX: 1, transition: { delay: 0.1, duration: motionTokens.duration.sequence, ease } },
};
const wordV: Variants = {
  hidden: { opacity: 0, y: '110%' },
  shown: (i: number) => ({ opacity: 1, y: '0%', transition: { delay: 0.14 + i * 0.07, duration: 0.7, ease } }),
};
const subtitleV: Variants = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: { delay: 0.36, duration: 0.55, ease } },
};
const rightV: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { delay: 0.44, duration: 0.5, ease } },
};
const glowV: Variants = {
  hidden: { opacity: 0, scale: 0.86 },
  shown: { opacity: 1, scale: 1, transition: { duration: 1.4, ease } },
};

/** The view's header band and its one <h1>. Outside <MotionReady> it is the same markup without motion. */
export function ViewHero(props: ViewHeroProps) {
  return useMotionReady() ? <MotionViewHero {...props} /> : <StaticViewHero {...props} />;
}

function StaticViewHero({ kicker, title, subtitle, right }: ViewHeroProps) {
  return (
    <header className="view-hero">
      <div className="view-hero__backdrop" aria-hidden="true">
        <div className="view-hero__grid" />
        <div className="view-hero__glow">
          <span className="view-hero__glow-core" />
        </div>
      </div>
      <div className="view-hero__main">
        <div className="view-hero__kicker">
          <span className="view-hero__rule" />
          <span>{kicker}</span>
        </div>
        <h1 tabIndex={-1} data-view-heading="" className="view-hero__title">
          {title}
        </h1>
        {subtitle && <p className="view-hero__subtitle">{subtitle}</p>}
      </div>
      {right && <div className="view-hero__right">{right}</div>}
    </header>
  );
}

/** Gap between the pinned band and the top of the viewport. */
const HERO_PIN_TOP = 12;

/**
 * The pinned scene (motion allowed): the band is sticky inside a track whose runway is as long as the band itself (plus the gap
 * under it), and the track's negative bottom margin pulls the view's content back up to where it was, so the content scrolls up
 * over the pinned band like a sheet. Progress through the runway (0..1) is written once per frame as --vp on the band; scroll.css
 * derives the exit from it (title words sink back into their masks, the subtitle fades, the rule stretches, the glow drifts).
 * Focus entering a covered band scrolls back to it.
 */
function useHeroScene(track: RefObject<HTMLDivElement | null>, band: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const trackEl = track.current;
    const bandEl = band.current;
    if (!trackEl || !bandEl) return;
    let raf = 0;
    let last = -1;
    const write = (p: number) => {
      if (Math.abs(p - last) < 0.0005) return;
      last = p;
      bandEl.style.setProperty('--vp', p.toFixed(4));
      bandEl.dataset.heroProgress = p.toFixed(2);
    };
    const progressNow = () => {
      const runway = trackEl.querySelector<HTMLElement>('.view-hero-track__runway')?.offsetHeight ?? 0;
      const top = trackEl.getBoundingClientRect().top;
      return runway > 1 ? Math.min(1, Math.max(0, (HERO_PIN_TOP - top) / runway)) : 0;
    };
    const measure = () => {
      raf = 0;
      write(enabled ? progressNow() : 0);
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    const layout = () => {
      trackEl.style.setProperty('--vh-h', `${bandEl.offsetHeight}px`);
      schedule();
    };
    // Only for focus a user moves (Tab to a control in the band). The heading is focused by the shell with preventScroll while
    // it manages the scroll itself, so it is left alone. Measured now, not from the last frame.
    const onFocusIn = (event: FocusEvent) => {
      if (!enabled || (event.target instanceof Element && event.target.closest('[data-view-heading]'))) return;
      if (progressNow() < 0.2) return;
      window.scrollTo({ top: window.scrollY + trackEl.getBoundingClientRect().top - HERO_PIN_TOP, behavior: 'instant' });
    };
    layout();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layout);
    ro?.observe(bandEl);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', layout);
    bandEl.addEventListener('focusin', onFocusIn);
    return () => {
      window.cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', layout);
      bandEl.removeEventListener('focusin', onFocusIn);
    };
  }, [track, band, enabled]);
}

function MotionViewHero({ kicker, title, subtitle, right }: ViewHeroProps) {
  const { reduced } = useMotionPolicy();
  const controls = useAnimationControls();
  const trackRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLElement>(null);
  const pinned = !reduced;
  useHeroScene(trackRef, bandRef, pinned);
  const words = title.split(/\s+/).filter(Boolean);

  // The entrance: hidden start state set before the first paint, then played. Driven by controls rather than `initial`, so it also
  // plays on the first load, where the view stage's <AnimatePresence initial={false}> would otherwise skip every initial state.
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return; // no hidden start state at all under reduced motion
    controls.set('hidden');
    void controls.start('shown');
    return () => controls.stop(); // controls.set is not allowed in a cleanup; a re-mount (StrictMode) sets the values again
  }, [controls]);
  // Reduced motion switched on mid-entrance: the end state at once.
  useEffect(() => {
    if (!reduced) return;
    controls.stop();
    controls.set('shown');
  }, [reduced, controls]);

  return (
    <div ref={trackRef} className="view-hero-track" data-testid="view-hero-track" data-pinned={pinned ? 'true' : 'false'}>
      <m.header ref={bandRef} className="view-hero" initial={false} animate={controls}>
        <div className="view-hero__backdrop" aria-hidden="true">
          <div className="view-hero__grid" />
          <div className="view-hero__glow">
            <m.span className="view-hero__glow-core" variants={glowV} />
          </div>
        </div>
        <div className="view-hero__main">
          <m.div className="view-hero__kicker" variants={kickerV}>
            <m.span className="view-hero__rule" variants={ruleV} />
            <span>{kicker}</span>
          </m.div>
          <h1 tabIndex={-1} data-view-heading="" className="view-hero__title">
            {words.map((word, i) => (
              <Fragment key={i}>
                {i > 0 && ' '}
                <span className="view-hero__word" style={{ '--i': i } as CSSProperties}>
                  <m.span className="view-hero__word-inner" custom={i} variants={wordV}>
                    {word}
                  </m.span>
                </span>
              </Fragment>
            ))}
          </h1>
          {subtitle && (
            <m.p className="view-hero__subtitle" variants={subtitleV}>
              {subtitle}
            </m.p>
          )}
        </div>
        {right && (
          <m.div className="view-hero__right" variants={rightV}>
            {right}
          </m.div>
        )}
      </m.header>
      {pinned && <div className="view-hero-track__runway" aria-hidden="true" />}
    </div>
  );
}

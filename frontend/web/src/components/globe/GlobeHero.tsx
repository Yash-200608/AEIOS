import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useActiveLoop } from '../../motion/useActiveLoop';
import { prefersReducedMotion, useMotionPolicy } from '../../motion/useMotionPolicy';
import type { GlobeEngine } from './globeEngine';
import { formatLatLon, haversineKm, type FrameBox } from './globeMath';
import './globe.css';

/*
 * The Overview landing hero: a WebGL dot-matrix Earth that flies in to the observation site, then hands over to the
 * command center. The three.js engine (globeEngine.ts) and the land mask (landDots.ts) are loaded lazily, so neither is
 * in the main bundle.
 *
 * Intro (about 4.3 s, once per browser session via sessionStorage 'aeios:globe-intro:v1'): the globe starts small over the
 * Americas, the camera travels east and dollies in to centre on the site, the reticle closes on it, the title and chips
 * rise in and the letterbox bars retract; then data-globe-intro="done" and onIntroDone() fires (once per mount, also when
 * skipped, already seen, or under reduced motion). Skip jumps to the final frame; Replay restarts it.
 *
 * The intro is never left frozen part-way: if its loop stops (Pause, scrolled away, hidden tab, reduced motion turned on)
 * it jumps to the final frame, and a failsafe completes it if it has not started 2.5 s after it was requested (engine still
 * loading, hero off-screen). After the intro a slow sway keeps the site in view; Pause stops it.
 *
 * Scroll descent (motion allowed and WebGL ready): the hero is sticky inside a tall track. Scrolling the track's runway flies
 * the camera from the resting globe down to the site (engine.setDescent), fades the copy out, cross-fades three captions and,
 * at the end, lets the hero recede as the command center scrolls up over it. Scroll progress is written once per frame as the
 * CSS property --gp on the hero (globe.css derives every opacity and transform from it) and to the engine; React never
 * re-renders on scroll. Scrolling while the intro plays ends it (scroll takes over). Focus moving into the copy while it is
 * faded out scrolls back to the start of the track, so a keyboard user never lands on an invisible control.
 *
 * Reduced motion: one static final frame focused on the site, no loop, intro "done" immediately, no transitions, no runway
 * (nothing pins), and the Skip/Replay/Pause controls are not rendered (there is nothing to control). No WebGL: the same,
 * over a static fallback disc.
 *
 * Integrity: decorative geography only. Natural Earth outlines and the site location; nothing here is a measurement.
 *
 * Test contract:
 *  - root: data-testid="globe-hero", data-globe-intro="playing" | "done" (also data-globe-copy, data-globe-status)
 *  - canvas host: data-testid="globe-canvas-host", data-globe-active="true" | "false", data-globe-frames (int)
 *  - buttons: "Skip globe intro" / "Replay globe intro" (one button whose name follows the state), and
 *    "Pause globe rotation" / "Resume globe rotation" with aria-pressed
 *  - the title is an <h2> (the Overview's <h1> remains the situation statement)
 *  - descent: track data-testid="globe-track" data-globe-pinned="true" | "false"; on the hero data-globe-descent (track
 *    progress 0..1, 2 dp) and data-globe-chapter (0 resting, 1 region, 2 site, 3 command center)
 */
export type GlobeSite = { name: string; lat: number; lon: number };
export type GlobeCaption = { name: string; detail?: string };
export type GlobeHeroProps = {
  primary: GlobeSite; // the selected observation site (marker the camera flies to)
  secondary?: GlobeSite; // the other site (shares the marker: the two are far closer than the globe's resolution)
  kicker?: string;
  title: ReactNode;
  children?: ReactNode; // chips / call to action rendered under the title
  onIntroDone?: () => void; // called once when the intro completes, is skipped, or immediately under reduced motion
  region?: GlobeCaption; // descent caption 1: the region around the sites
  closing?: GlobeCaption; // descent caption 3: what follows the globe
};

type IntroState = 'playing' | 'done';
type EngineStatus = 'loading' | 'ready' | 'fallback';

const SESSION_KEY = 'aeios:globe-intro:v1';
const FAILSAFE_MS = 2500;
const PIN_GAP = 12; // px between the pinned hero and the viewport edges
/** Track progress -> descent: the camera starts moving after DESCENT_FROM and reaches the site at DESCENT_TO. */
const DESCENT_FROM = 0.06;
const DESCENT_TO = 0.78;
/** Chapter boundaries in track progress (globe.css uses the same windows for the caption cross-fades). */
const CHAPTERS = [0.14, 0.44, 0.72] as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const chapterAt = (p: number) => CHAPTERS.filter((edge) => p >= edge).length;

function introSeen(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === 'done';
  } catch {
    return false; // storage blocked: play the intro
  }
}

function rememberIntro(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, 'done');
  } catch {
    /* storage blocked: the intro may play again on the next mount */
  }
}

/** The resting globe's box (the frame element's area) in fractions of the hero, which the canvas covers. */
function measureRestBox(hero: HTMLElement | null, frameEl: HTMLElement | null): FrameBox {
  const whole = { x: 0, y: 0, w: 1, h: 1 };
  if (!hero || !frameEl) return whole;
  const h = hero.getBoundingClientRect();
  const f = frameEl.getBoundingClientRect();
  if (h.width < 1 || h.height < 1 || f.width < 1 || f.height < 1) return whole;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r((f.left - h.left) / h.width), y: r((f.top - h.top) / h.height), w: r(f.width / h.width), h: r(f.height / h.height) };
}

const order = (i: number) => ({ '--i': i }) as CSSProperties;

export default function GlobeHero({ primary, secondary, kicker, title, children, onIntroDone, region, closing }: GlobeHeroProps) {
  const { reduced } = useMotionPolicy();
  const titleId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GlobeEngine | null>(null);
  const [initiallyDone] = useState(() => prefersReducedMotion() || introSeen());
  const [intro, setIntro] = useState<IntroState>(initiallyDone ? 'done' : 'playing');
  const [copyShown, setCopyShown] = useState(initiallyDone);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<EngineStatus>('loading');
  const [run, setRun] = useState(0); // increments on Replay (re-arms the failsafe)
  const active = useActiveLoop(hostRef, paused);

  const introState: IntroState = reduced ? 'done' : intro;
  const copyVisible = reduced || copyShown;

  // Latest values for callbacks that outlive a render (engine callbacks, the async engine load, the scroll handler).
  const introRef = useRef(introState);
  const onIntroDoneRef = useRef(onIntroDone);
  const siteRef = useRef({ lat: primary.lat, lon: primary.lon });
  useEffect(() => {
    introRef.current = introState;
    onIntroDoneRef.current = onIntroDone;
  });

  const finish = useCallback(() => {
    setCopyShown(true);
    setIntro('done');
    rememberIntro();
  }, []);

  // onIntroDone: once per mount, the first time the intro reaches "done" (StrictMode re-runs effects, the ref persists).
  const notified = useRef(false);
  useEffect(() => {
    if (introState !== 'done' || notified.current) return;
    notified.current = true;
    onIntroDoneRef.current?.();
  }, [introState]);

  // Engine: loaded lazily, created once, disposed fully (StrictMode-safe: a cancelled load never creates an engine).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let engine: GlobeEngine | null = null;
    Promise.all([import('./globeEngine'), import('./landDots')])
      .then(([{ createGlobeEngine }, { decodeLandDots }]) => {
        if (cancelled) return;
        const done = introRef.current === 'done' || prefersReducedMotion();
        engine = createGlobeEngine({
          host,
          label: labelRef.current,
          site: siteRef.current,
          land: decodeLandDots(1),
          introDone: done,
          restBox: measureRestBox(heroRef.current, frameRef.current),
          onReveal: () => setCopyShown(true),
          onDone: finish,
        });
        engineRef.current = engine;
        if (done) finish();
        setStatus('ready');
      })
      .catch(() => {
        // No WebGL (or the chunk failed to load): keep the static fallback and never hold the copy back.
        if (cancelled) return;
        setStatus('fallback');
        finish();
      });
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, [finish]);

  // Site change (site switcher): move the marker in place, no rebuild.
  useEffect(() => {
    siteRef.current = { lat: primary.lat, lon: primary.lon };
    engineRef.current?.setSite(siteRef.current);
  }, [primary.lat, primary.lon]);

  // Loop: runs only while useActiveLoop allows it (zero rAF otherwise). A stopped intro jumps to its final frame.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (reduced) {
      engine.stop();
      engine.skip(); // the static final frame; fires onDone if the intro was part-way
      return;
    }
    if (active) engine.start();
    else {
      if (engine.introStarted) engine.skip();
      engine.stop();
    }
  }, [active, reduced, status]);

  // Failsafe: an intro that has not started FAILSAFE_MS after it was requested (visible time) completes instead.
  useEffect(() => {
    if (introState !== 'playing') return;
    let timer = 0;
    const check = () => {
      timer = 0;
      const engine = engineRef.current;
      if (!engine) finish();
      else if (!engine.running) engine.skip();
    };
    const arm = () => {
      if (!timer && !document.hidden) timer = window.setTimeout(check, FAILSAFE_MS);
    };
    arm();
    document.addEventListener('visibilitychange', arm);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', arm);
    };
  }, [introState, run, finish]);

  // ---- scroll descent: progress -> --gp, data attributes and the engine, once per frame at most ----
  const pinned = !reduced && status === 'ready';
  useEffect(() => {
    const track = trackRef.current;
    const hero = heroRef.current;
    const frameEl = frameRef.current;
    if (!track || !hero || !frameEl) return;
    let raf = 0;
    let pinTop = PIN_GAP;
    let lastP = -1;
    let lastChapter = -1;

    const write = (p: number) => {
      if (Math.abs(p - lastP) < 0.0005) return;
      lastP = p;
      hero.style.setProperty('--gp', p.toFixed(4));
      hero.dataset.globeDescent = p.toFixed(2);
      const chapter = chapterAt(p);
      if (chapter !== lastChapter) {
        lastChapter = chapter;
        hero.dataset.globeChapter = String(chapter);
      }
      const engine = engineRef.current;
      if (!engine) return;
      if (p > 0.015 && introRef.current === 'playing') engine.skip(); // scrolling takes over from the intro
      engine.setDescent(clamp01((p - DESCENT_FROM) / (DESCENT_TO - DESCENT_FROM)));
    };

    const progressNow = () => {
      const rect = track.getBoundingClientRect();
      const runway = rect.height - hero.offsetHeight;
      return runway > 1 ? clamp01((pinTop - rect.top) / runway) : 0;
    };
    const measure = () => {
      raf = 0;
      write(pinned ? progressNow() : 0);
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };

    // A hero taller than the viewport (short phones) pins once its bottom edge is in view.
    const layout = () => {
      pinTop = Math.min(PIN_GAP, window.innerHeight - hero.offsetHeight - PIN_GAP);
      hero.style.setProperty('--globe-pin-top', `${pinTop}px`);
      engineRef.current?.setRestBox(measureRestBox(hero, frameEl));
      schedule();
    };

    // Keyboard focus entering the faded-out copy: back to the start of the track, where it is visible.
    // Only for focus a user moves (Tab to the call to action or a control). Measured now, not from the last frame.
    const onFocusIn = (event: FocusEvent) => {
      if (!pinned || progressNow() < 0.05) return;
      const t = event.target;
      if (!(t instanceof Element) || !t.closest('.globe-hero__copy, .globe-hero__controls')) return;
      if (t.closest('[data-view-heading]')) return; // focused by the shell with preventScroll; it manages the scroll itself
      window.scrollTo({ top: window.scrollY + track.getBoundingClientRect().top - pinTop, behavior: 'instant' });
    };

    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(hero);
    ro.observe(frameEl);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', layout);
    hero.addEventListener('focusin', onFocusIn);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', layout);
      hero.removeEventListener('focusin', onFocusIn);
    };
  }, [pinned, status]);

  const skip = () => {
    const engine = engineRef.current;
    if (engine) engine.skip();
    else finish();
  };

  const replay = () => {
    setPaused(false);
    setCopyShown(false);
    setIntro('playing');
    setRun((n) => n + 1);
    engineRef.current?.replay();
  };

  const names = secondary ? `${primary.name} · ${secondary.name}` : primary.name;
  const coords = formatLatLon(primary);
  const apartKm = secondary ? haversineKm(primary, secondary) : null;
  const detail = apartKm == null ? coords : `${coords} · ${apartKm < 10 ? apartKm.toFixed(1) : Math.round(apartKm)} km apart`;
  const showControls = !reduced && status !== 'fallback';
  const playing = introState === 'playing';

  return (
    <div ref={trackRef} className="globe-track" data-testid="globe-track" data-globe-pinned={pinned ? 'true' : 'false'}>
      <section
        ref={heroRef}
        className="globe-hero"
        data-testid="globe-hero"
        data-globe-intro={introState}
        data-globe-copy={copyVisible ? 'shown' : 'pending'}
        data-globe-status={status}
        data-reduced={reduced ? 'true' : undefined}
        aria-labelledby={titleId}
      >
        {/* Full-bleed visual (the canvas covers the whole hero); the empty frame reserves the resting globe's area. */}
        <div className="globe-hero__visual">
          <div className="globe-hero__stage" role="img" aria-label={`Globe locating ${names}, ${detail}`}>
            {status === 'fallback' && <div className="globe-hero__fallback" />}
            <div
              ref={hostRef}
              className="globe-hero__canvas"
              data-testid="globe-canvas-host"
              data-globe-active="false"
              data-globe-frames="0"
            />
            <div ref={labelRef} className="globe-hero__label" aria-hidden="true">
              <div className="globe-hero__label-inner">
                <span className="globe-hero__label-name">{names}</span>
                <span className="globe-hero__label-detail">{detail}</span>
              </div>
            </div>
          </div>
          <div className="globe-hero__letterbox" aria-hidden="true" />
          <p className="globe-hero__caption">Natural Earth outlines · site locations</p>
        </div>
        <div ref={frameRef} className="globe-hero__frame" aria-hidden="true" />

        <div className="globe-hero__copy">
          {kicker && <p className="globe-hero__kicker">{kicker}</p>}
          {/* data-view-heading: a view change into the Overview focuses this visible landing title, not the h1 below the fold. */}
          <h2 id={titleId} className="globe-hero__title globe-reveal" style={order(0)} data-view-heading>
            {title}
          </h2>
          {children && (
            <div className="globe-hero__body globe-reveal" style={order(1)}>
              {children}
            </div>
          )}
        </div>

        {/* A grid item of its own: under the copy on desktop, over the bottom edge of the globe frame on phones (so Skip is
            on the first screen while the copy is still rising in). */}
        {showControls && (
          <div className="globe-hero__controls">
            <button type="button" className="globe-hero__control" onClick={playing ? skip : replay}>
              {playing ? <SkipForward size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}
              <span>{playing ? 'Skip globe intro' : 'Replay globe intro'}</span>
            </button>
            <button type="button" className="globe-hero__control" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
              {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
              <span>{paused ? 'Resume globe rotation' : 'Pause globe rotation'}</span>
            </button>
          </div>
        )}

        {/* Descent captions: decorative restatements of facts shown elsewhere on this page (the stage's label carries them). */}
        {pinned && (
          <div className="globe-hero__chapters" aria-hidden="true">
            <div className="globe-chapter" data-chapter="1">
              <span className="globe-chapter__kicker">01 · Region</span>
              <span className="globe-chapter__title">{region?.name ?? 'Approaching the site'}</span>
              {region?.detail && <span className="globe-chapter__detail">{region.detail}</span>}
            </div>
            <div className="globe-chapter" data-chapter="2">
              <span className="globe-chapter__kicker">02 · Site</span>
              <span className="globe-chapter__title">{primary.name}</span>
              <span className="globe-chapter__detail globe-chapter__detail--mono">{detail}</span>
            </div>
            <div className="globe-chapter" data-chapter="3">
              <span className="globe-chapter__kicker">03 · Command center</span>
              <span className="globe-chapter__title">{closing?.name ?? 'Command center'}</span>
              {closing?.detail && <span className="globe-chapter__detail">{closing.detail}</span>}
            </div>
            <div className="globe-hero__hint">
              <span>Scroll</span>
              <span className="globe-hero__hint-line" />
            </div>
          </div>
        )}
      </section>
      {pinned && <div className="globe-track__runway" aria-hidden="true" />}
    </div>
  );
}

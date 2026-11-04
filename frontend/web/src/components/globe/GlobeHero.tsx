import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useActiveLoop } from '../../motion/useActiveLoop';
import { prefersReducedMotion, useMotionPolicy } from '../../motion/useMotionPolicy';
import type { GlobeEngine } from './globeEngine';
import { formatLatLon, haversineKm } from './globeMath';
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
 * Reduced motion: one static final frame focused on the site, no loop, intro "done" immediately, no transitions, and the
 * Skip/Replay/Pause controls are not rendered (there is nothing to control).
 *
 * Integrity: decorative geography only. Natural Earth outlines and the site location; nothing here is a measurement.
 *
 * Test contract:
 *  - root: data-testid="globe-hero", data-globe-intro="playing" | "done" (also data-globe-copy, data-globe-status)
 *  - canvas host: data-testid="globe-canvas-host", data-globe-active="true" | "false", data-globe-frames (int)
 *  - buttons: "Skip globe intro" / "Replay globe intro" (one button whose name follows the state), and
 *    "Pause globe rotation" / "Resume globe rotation" with aria-pressed
 *  - the title is an <h2> (the Overview's <h1> remains the situation statement)
 */
export type GlobeSite = { name: string; lat: number; lon: number };
export type GlobeHeroProps = {
  primary: GlobeSite; // the selected observation site (marker the camera flies to)
  secondary?: GlobeSite; // the other site (shares the marker: the two are far closer than the globe's resolution)
  kicker?: string;
  title: ReactNode;
  children?: ReactNode; // chips / call to action rendered under the title
  onIntroDone?: () => void; // called once when the intro completes, is skipped, or immediately under reduced motion
};

type IntroState = 'playing' | 'done';
type EngineStatus = 'loading' | 'ready' | 'fallback';

const SESSION_KEY = 'aeios:globe-intro:v1';
const FAILSAFE_MS = 2500;

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

const order = (i: number) => ({ '--i': i }) as CSSProperties;

export default function GlobeHero({ primary, secondary, kicker, title, children, onIntroDone }: GlobeHeroProps) {
  const { reduced } = useMotionPolicy();
  const titleId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
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

  // Latest values for callbacks that outlive a render (engine callbacks, the async engine load).
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
    <section
      className="globe-hero"
      data-testid="globe-hero"
      data-globe-intro={introState}
      data-globe-copy={copyVisible ? 'shown' : 'pending'}
      data-globe-status={status}
      data-reduced={reduced ? 'true' : undefined}
      aria-labelledby={titleId}
    >
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

      {/* A grid item of its own: under the copy on desktop, over the bottom edge of the globe band on phones (so Skip is
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
    </section>
  );
}

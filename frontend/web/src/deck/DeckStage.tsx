import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { GlobeEngine } from '../components/globe/globeEngine';
import { formatLatLon } from '../components/globe/globeMath';
import { useActiveLoop } from '../motion/useActiveLoop';
import { useMotionPolicy } from '../motion/useMotionPolicy';
import { bootSeen, rememberBoot, shouldBoot } from './boot';
import DecodeText from './DecodeText';

/*
 * The deck's centre stage: the dot-matrix globe (globeEngine, unchanged) with the dispersion verdict over it.
 *
 * Boot: the engine's own fly-in plays once per browser session (see boot.ts) and any key or pointer press skips it, as does
 * switching site. data-deck-boot is "playing" until the fly-in has ended, then "done". The globe drifts slowly afterwards and
 * the canvas follows the cursor by at most PARALLAX_PX; both stop in a hidden tab, off-screen and under reduced motion.
 */
const PARALLAX_PX = 8;

export type GlobeSite = { name: string; lat: number; lon: number };

export default function DeckStage({ site, verdict, tone, note, onBooted }: {
  site: GlobeSite; verdict: string; tone: 'good' | 'fair' | 'poor' | 'unknown'; note?: string; onBooted?: () => void;
}) {
  const { reduced } = useMotionPolicy();
  const hostRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GlobeEngine | null>(null);
  const siteRef = useRef({ lat: site.lat, lon: site.lon });
  const skipAsked = useRef(false); // a key press or site switch that arrived before the engine existed
  const [playBoot] = useState(() => shouldBoot(bootSeen(), reduced));
  const [boot, setBoot] = useState<'playing' | 'done'>(playBoot ? 'playing' : 'done');
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const active = useActiveLoop(hostRef, paused);

  const onBootedRef = useRef(onBooted);
  useEffect(() => { onBootedRef.current = onBooted; });
  const notified = useRef(false);
  const finish = useCallback(() => {
    setBoot('done');
    rememberBoot();
    if (!notified.current) {
      notified.current = true;
      onBootedRef.current?.();
    }
  }, []);

  // Engine: lazy, created once, disposed fully (a cancelled load never creates one).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let engine: GlobeEngine | null = null;
    Promise.all([import('../components/globe/globeEngine'), import('../components/globe/landDots')])
      .then(([{ createGlobeEngine }, { decodeLandDots }]) => {
        if (cancelled) return;
        engine = createGlobeEngine({
          host, label: labelRef.current, site: siteRef.current, land: decodeLandDots(1),
          introDone: !playBoot || skipAsked.current, onReveal: () => undefined, onDone: finish,
        });
        engineRef.current = engine;
        engine.setDescent(0);
        if (!playBoot || skipAsked.current) finish();
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return; // no WebGL: the static fallback shows and the boot ends at once
        setStatus('fallback');
        finish();
      });
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, [playBoot, finish]);

  // Site switch: the marker moves in place; a boot still playing ends at once.
  useEffect(() => {
    const changed = siteRef.current.lat !== site.lat || siteRef.current.lon !== site.lon;
    siteRef.current = { lat: site.lat, lon: site.lon };
    engineRef.current?.setSite(siteRef.current);
    if (changed) {
      if (engineRef.current) engineRef.current.skip();
      else skipAsked.current = true;
    }
  }, [site.lat, site.lon]);

  // Loop: runs only while allowed (visible, tab active, not paused, motion allowed). A stopped fly-in jumps to its end frame.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (reduced) {
      engine.stop();
      engine.skip();
      return;
    }
    if (active) engine.start();
    else {
      if (engine.introStarted) engine.skip();
      engine.stop();
    }
  }, [active, reduced, status]);

  // Any key or pointer press skips the boot (never blocks the input itself: listeners are passive and do not stop it).
  useEffect(() => {
    if (boot !== 'playing') return;
    const skip = () => {
      if (engineRef.current) engineRef.current.skip();
      else skipAsked.current = true;
    };
    window.addEventListener('keydown', skip, { passive: true });
    window.addEventListener('pointerdown', skip, { passive: true });
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [boot]);

  // Cursor parallax: transform only, at most PARALLAX_PX, written once per frame; off under reduced motion.
  useEffect(() => {
    const el = shiftRef.current;
    if (!el || reduced) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => { raf = 0; el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`; };
    const move = (e: PointerEvent) => {
      x = (e.clientX / window.innerWidth - 0.5) * 2 * -PARALLAX_PX;
      y = (e.clientY / window.innerHeight - 0.5) * 2 * -PARALLAX_PX;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = '';
    };
  }, [reduced]);

  const coords = formatLatLon(site);
  return (
    <section className="dk-stage" data-testid="deck-stage" data-deck-boot={boot} data-globe-status={status} data-tone={tone} aria-label={`Globe locating ${site.name}, ${coords}`}>
      <div ref={shiftRef} className="dk-stage__shift">
        {status === 'fallback' && <div className="dk-stage__fallback" aria-hidden="true" />}
        <div ref={hostRef} className="dk-stage__canvas" data-testid="globe-canvas-host" data-globe-active="false" data-globe-frames="0" />
        <div ref={labelRef} className="dk-stage__marker" aria-hidden="true">
          <div className="dk-stage__marker-inner">{site.name}</div>
        </div>
      </div>
      <div className="dk-stage__copy">
        <p className="dk-stage__kicker">AEIOS SENTINEL · {site.name.toUpperCase()}</p>
        <h1 tabIndex={-1} data-view-heading className="dk-stage__verdict">
          <DecodeText text={verdict} playOnMount={playBoot} />
        </h1>
        <p className="dk-stage__coords ax-mono"><DecodeText text={coords} playOnMount={playBoot} durationMs={1100} /></p>
        {note && <p className="dk-stage__note">{note}</p>}
      </div>
      {!reduced && status !== 'fallback' && (
        <button type="button" className="dk-stage__pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          <span>Pause globe</span>
        </button>
      )}
    </section>
  );
}

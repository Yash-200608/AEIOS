import { useEffect, useMemo, useState } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import '../components/overview/overview.css';
import './motionLab.css';
import { EmptyState } from '../design/primitives';
import { useMotionPolicy } from '../motion/useMotionPolicy';
import { FIXTURES } from '../components/overview/fixtures.dev';
import { gsap, ScrollTrigger } from './gsap';
import { buildModel, useWeatherRun, type Telemetry } from './labModel';
import MissionRevealMotion from './MissionRevealMotion';
import StateMorph from './StateMorph';
import MissionRevealGsap from './MissionRevealGsap';
import AtmosFlow from './AtmosFlow';
import SceneMonitor from './SceneMonitor';
import ChangeSignals from './ChangeSignals';
import StoryScroll from './StoryScroll';

/*
 * Motion Lab. DEVELOPMENT ONLY: main.tsx lazy-loads this module behind import.meta.env.DEV and ?motionlab, so it (and GSAP,
 * which is imported only under src/motion-lab) is absent from production bundles. Spec: docs/design/MOTION_STORYBOARD.md.
 *
 * Data: weather is the regional model run from api.forecast (localStorage cache first; the Lab never forces a refetch).
 * Gateway, node and alert values are the development fixtures in overview/fixtures.dev.ts. Nothing is read from Supabase.
 *
 * Debug hook (DEV only, this module only): window.__motionLab = { scrollTriggers(), gsapTweens() } for leak checks.
 */
declare global {
  interface Window {
    __motionLab?: { scrollTriggers(): number; gsapTweens(): number };
  }
}

const FORCE_CLASS = 'aeios-force-reduced-motion';
const SECTIONS = [
  ['ml-proto-a', 'A · Mission Reveal'],
  ['ml-proto-b', 'B · Atmospheric Flow'],
  ['ml-signals', 'Change signals'],
  ['ml-proto-c', 'C · Story Scroll'],
] as const;

export default function MotionLab() {
  const run = useWeatherRun();
  const { reduced } = useMotionPolicy();
  const [forced, setForced] = useState(() => document.documentElement.classList.contains(FORCE_CLASS));
  // The reveal boards and the story use the "normal" fixture; the change-signals panel owns its own snapshots.
  const [telemetry] = useState<Telemetry>(() => {
    const fx = FIXTURES.normal();
    return { aeios: fx.aeios, aeiosError: fx.aeiosError ?? '', alerts: fx.alerts, alertsError: fx.alertsError ?? '' };
  });
  const model = useMemo(() => buildModel(run, telemetry), [run, telemetry]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__motionLab = {
      scrollTriggers: () => ScrollTrigger.getAll().length,
      gsapTweens: () => gsap.globalTimeline.getChildren(true, true, true).length,
    };
    return () => {
      delete window.__motionLab;
    };
  }, []);

  // The Lab's reduced-motion toggle sets the same class useMotionPolicy and the CSS rules read; removed on unmount.
  useEffect(() => {
    document.documentElement.classList.toggle(FORCE_CLASS, forced);
  }, [forced]);
  useEffect(
    () => () => {
      document.documentElement.classList.remove(FORCE_CLASS);
    },
    [],
  );

  useEffect(() => {
    const previous = document.title;
    document.title = 'AEIOS Motion Lab (development)';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div className="ml" data-testid="motion-lab">
          <main className="ml-wrap">
            <div className="ml-banner" role="note">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                <strong>Motion Lab, development only; gateway/alert values are fixtures, weather is the cached regional model run.</strong>{' '}
                Not present in production builds. Links to dashboard sections are inert here.
              </span>
            </div>
            <h1 className="ml-title">Motion Lab</h1>
            <p className="ml-lede">
              Three motion prototypes on real selector outputs, per the approved storyboard. Motion explains state and never decorates: no
              number tweening, no pulse loops, nothing blocks scrolling, input or focus, and reduced motion renders every end state at once.
            </p>
            <div className="ml-controls ml-gap">
              <button type="button" className="ax-btn" aria-pressed={forced} onClick={() => setForced((v) => !v)}>
                Force reduced motion
              </button>
              <span className="ml-status">
                Motion policy: <b>{reduced ? 'reduced' : 'full'}</b>
                {reduced && !forced ? ' (from the operating system)' : ''}. Weather feed: <b>{model.feed.label}</b>
                {model.loadState === 'ready' ? `, valid ${model.modelHour}, fetched ${model.fetched}` : ''}.
              </span>
            </div>
            {model.warning && (
              <div className="ml-gap">
                <EmptyState kind="stale" title="Weather model feed is a cached run">
                  {model.warning}
                </EmptyState>
              </div>
            )}
            {model.loadState === 'error' && (
              <div className="ml-gap">
                <EmptyState kind="error" title="No regional model run available">
                  {model.error}
                </EmptyState>
              </div>
            )}
            <nav className="ml-gap" aria-label="Prototypes">
              <ul className="ml-index">
                {SECTIONS.map(([id, label]) => (
                  <li key={id}>
                    <a className="cc-link" href={`#${id}`}>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <section id="ml-proto-a" className="ml-section" aria-labelledby="ml-proto-a-h">
              <h2 id="ml-proto-a-h">Prototype A · Mission Reveal</h2>
              <p className="ml-p">
                The situation statement is visible from the first frame; currency, assessment, measured air, telemetry and outlook follow on
                the storyboard schedule (about 1.1 s). Plays once per session. Gauge marks and numbers are never tweened.
              </p>
              <h3>Motion (LazyMotion, m components)</h3>
              <MissionRevealMotion model={model} />
              <h3>GSAP twin (useGSAP timeline, comparison only)</h3>
              <MissionRevealGsap model={model} />
              <h3>Status label morph (production component)</h3>
              <p className="ml-p">
                The production status-label morph: the label swaps with a 120 ms blur only when the state really changes; polling again
                changes nothing. Reference: Prompt Motion, Shape morphing through UI states (label only, no size animation).
              </p>
              <StateMorph />
            </section>

            <section id="ml-proto-b" className="ml-section" aria-labelledby="ml-proto-b-h">
              <h2 id="ml-proto-b-h">Prototype B · Atmospheric Flow</h2>
              <p className="ml-p">
                The Overview column's model fields as a flow instrument. One requestAnimationFrame loop; it stops when paused, off-screen,
                in a hidden tab or under reduced motion.
              </p>
              <div className="ml-pair">
                <div>
                  <h3>Wind flow by height</h3>
                  <AtmosFlow
                    winds={model.column.winds}
                    temps={model.column.temps}
                    blh={model.column.blh}
                    validLabel={model.modelHour}
                    loadState={model.loadState}
                  />
                </div>
                <div>
                  <h3>3D scene monitor</h3>
                  <SceneMonitor weather={model.scene} validLabel={model.modelHour} />
                </div>
              </div>
            </section>

            <section id="ml-signals" className="ml-section" aria-labelledby="ml-signals-h">
              <h2 id="ml-signals-h">Change signals</h2>
              <p className="ml-p">
                One-shot signals derived from values, not object identity: a new packet highlights its timestamp once, a node going stale
                cross-fades its label, a raised alert enters once and stays.
              </p>
              <div className="cc ml-panel">
                <ChangeSignals />
              </div>
            </section>

            <section id="ml-proto-c" className="ml-section" aria-labelledby="ml-proto-c-h">
              <h2 id="ml-proto-c-h">Prototype C · Story Scroll</h2>
              <p className="ml-p">
                Six chapters in normal document flow. Each reveals once as it enters the viewport; no pinning, snapping or scroll hijacking.
              </p>
              <StoryScroll model={model} />
            </section>
          </main>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}

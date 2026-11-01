import { useRef, useState, type ReactNode } from 'react';
import { m } from 'motion/react';
import { Readout, SourceLabel } from '../design/primitives';
import { gsapEase, motionTokens } from '../design/motion';
import { prefersReducedMotion, useMotionPolicy } from '../motion/useMotionPolicy';
import AtmosphericColumn from '../components/overview/AtmosphericColumn';
import SystemRail from '../components/overview/SystemRail';
import { localSlot } from '../components/overview/format';
import { outlookSummary, ribbonCells, ventilationWindows } from '../components/overview/model';
import { gsap, useGSAP } from './gsap';
import { Currency, Statement } from './RevealBoard';
import type { LabModel } from './labModel';

/*
 * Prototype C: Story Scroll. Six chapters in normal document flow, built from the same values as the Overview.
 * Default engine: Motion whileInView (once, amount 0.2, opacity + y 16). Toggle: a GSAP ScrollTrigger variant (once,
 * start 'top 82%', no pin, no snap) created inside useGSAP and killed + reverted on toggle back and on unmount.
 * No scroll hijacking: the page scrolls natively; the chapter index is plain anchor links (not sticky).
 */
type Engine = 'motion' | 'scrolltrigger';
const CHAPTERS = ['Situation', 'Atmosphere', 'Evidence', 'Operations', 'Outlook', 'Investigate'] as const;
const noNav = () => {
  /* dashboard destinations are not mounted inside the Lab */
};

function chapterBody(i: number, mdl: LabModel): ReactNode {
  const v = mdl.obs.values;
  const current = mdl.obs.observation === 'valid' || mdl.obs.observation === 'no-reading';
  switch (i) {
    case 1:
      return (
        <>
          <Statement m={mdl} />
          <Currency m={mdl} />
        </>
      );
    case 2:
      return mdl.loadState === 'ready' ? (
        <AtmosphericColumn blh={mdl.column.blh} temps={mdl.column.temps} winds={mdl.column.winds} validLabel={mdl.modelHour} />
      ) : (
        <p className="cc-p">
          {mdl.loadState === 'loading' ? 'Reading the cached regional model run…' : 'The regional model run is unavailable.'}
        </p>
      );
    case 3:
      return (
        <>
          <p className="cc-p">
            {mdl.obs.headline.title}. {mdl.obs.headline.detail}
          </p>
          <div className="ml-readouts">
            <Readout
              label="PM2.5"
              value={mdl.obs.observation === 'valid' && v.pm25 !== null ? Math.round(v.pm25) : null}
              unit="µg/m³"
              source="live"
              missing="No current PM2.5 reading."
            />
            <Readout
              label="Temperature"
              value={current && v.temp !== null ? v.temp.toFixed(1) : null}
              unit="°C"
              source="live"
              missing="Not current."
            />
            <Readout
              label="Humidity"
              value={current && v.rh !== null ? Math.round(v.rh) : null}
              unit="%"
              source="live"
              missing="Not current."
            />
          </div>
        </>
      );
    case 4:
      return <SystemRail feeds={mdl.feedCells} rows={mdl.health} onNavigate={noNav} />;
    case 5: {
      const summary = outlookSummary(
        mdl.outlookRows.map((r) => r.vc),
        mdl.criteria.poorAt,
      );
      const windows = ventilationWindows(ribbonCells(mdl.outlookRows, mdl.criteria.poorAt));
      return (
        <>
          <SourceLabel kind="regional" detail="Open-Meteo" />
          <p className="cc-outlook__takeaway ml-gap">
            {mdl.loadState === 'ready' ? summary.takeaway : 'No outlook until the regional model run has loaded.'}
          </p>
          {mdl.loadState === 'ready' && (
            <p className="cc-p">
              {windows.length === 0
                ? `No hour reaches adequate ventilation in the next ${summary.hours} hours.`
                : `Adequate ventilation: ${windows.map((w) => `${localSlot(w.from)}${w.hours > 1 ? `–${localSlot(w.to)}` : ''} (${w.hours} h)`).join('; ')}.`}
            </p>
          )}
        </>
      );
    }
    default:
      return (
        <>
          <p className="cc-p">Investigate from here: each link scrolls natively to a prototype on this page.</p>
          <ul className="ml-index ml-gap">
            <li>
              <a className="cc-link" href="#ml-proto-a">
                Mission Reveal
              </a>
            </li>
            <li>
              <a className="cc-link" href="#ml-proto-b">
                Atmospheric Flow and 3D scene monitor
              </a>
            </li>
            <li>
              <a className="cc-link" href="#ml-signals">
                Change signals
              </a>
            </li>
          </ul>
        </>
      );
  }
}

export default function StoryScroll({ model }: { model: LabModel }) {
  const scope = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine>('motion');
  const { reduced } = useMotionPolicy();

  // ScrollTrigger variant: built only while selected; revertOnUpdate kills it when switching back, useGSAP reverts on unmount.
  useGSAP(
    () => {
      if (engine !== 'scrolltrigger' || reduced) return;
      const mm = gsap.matchMedia();
      mm.add(
        '(prefers-reduced-motion: no-preference)',
        () => {
          if (prefersReducedMotion()) return;
          for (const el of gsap.utils.toArray<HTMLElement>('[data-story-chapter]', scope.current)) {
            gsap.fromTo(
              el,
              { opacity: 0, y: 16 },
              {
                opacity: 1,
                y: 0,
                duration: motionTokens.duration.reveal,
                ease: gsapEase.enter,
                scrollTrigger: { trigger: el, start: 'top 82%', once: true }, // no pin, no snap, no scrub
              },
            );
          }
        },
        scope.current ?? undefined,
      );
      return () => mm.revert();
    },
    { scope, dependencies: [engine, reduced], revertOnUpdate: true },
  );

  const chapters = CHAPTERS.map((title, n) => {
    const i = n + 1;
    const body = (
      <>
        <div className="ml-chapter__head">
          <span className="ax-eyebrow">Chapter {i} of 6</span>
          <h3 id={`ml-story-h${i}`} className="cc-h2">
            {title}
          </h3>
        </div>
        {chapterBody(i, model)}
      </>
    );
    const common = { id: `ml-story-${i}`, className: 'ml-chapter', 'data-story-chapter': String(i), 'aria-labelledby': `ml-story-h${i}` };
    // Remount on engine or policy change so each engine starts from its own clean state.
    return engine === 'motion' ? (
      <m.section
        key={`motion-${reduced}-${i}`}
        {...common}
        initial={reduced ? false : { opacity: 0, y: 16 }}
        whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: motionTokens.duration.reveal, ease: [...motionTokens.ease.enter] }}
      >
        {body}
      </m.section>
    ) : (
      <section key={`st-${i}`} {...common}>
        {body}
      </section>
    );
  });

  return (
    <div className="cc ml-story" data-testid="story-scroll" data-engine={engine} ref={scope}>
      <div className="ml-controls">
        <button
          type="button"
          className="ax-btn"
          aria-label={engine === 'motion' ? 'Use ScrollTrigger' : 'Use Motion'}
          onClick={() => setEngine((e) => (e === 'motion' ? 'scrolltrigger' : 'motion'))}
        >
          {engine === 'motion' ? 'Use ScrollTrigger' : 'Use Motion'}
        </button>
        <span className="ml-status">
          Engine: <b>{engine === 'motion' ? 'Motion whileInView' : 'GSAP ScrollTrigger'}</b>
          {reduced ? ' (reduced motion: chapters render without animation)' : ''}
        </span>
      </div>
      <nav className="ml-gap" aria-label="Story chapters">
        <ol className="ml-index">
          {CHAPTERS.map((t, n) => (
            <li key={t}>
              <a className="cc-link" href={`#ml-story-${n + 1}`}>
                {n + 1}. {t}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {chapters}
    </div>
  );
}

import { Fragment, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, MapPin, ServerCrash, ShieldAlert } from 'lucide-react';
import { SourceLabel, StateLabel } from '../design/primitives';
import { motionTokens, revealSchedule } from '../design/motion';
import AlertSummary from '../components/overview/AlertSummary';
import EnvironmentalAssessment from '../components/overview/EnvironmentalAssessment';
import LocalObservations from '../components/overview/LocalObservations';
import OutlookRibbon from '../components/overview/OutlookRibbon';
import type { FeedCell } from '../components/overview/SystemRail';
import { situationStatement } from '../components/overview/model';
import { ALERT_WINDOW_HOURS, LAB_SITE, type LabModel } from './labModel';

/*
 * The Mission Reveal board shared by the Motion and GSAP twins, so both engines animate identical content.
 * Real Overview components carry the assessment, measured air, alerts and outlook. The situation header and telemetry strip
 * are composed here from the same model helpers and primitives as SituationHeader / SystemRail, because the storyboard
 * needs the statement and the currency row as separate groups, and each telemetry cell as its own (staggered) element.
 */

export type RevealGroup = 'situation' | 'currency' | 'assessment' | 'evidence' | 'telemetry' | 'outlook';
/** Start state and timing per animated group (storyboard, seconds). The situation group never animates. */
export type GroupSpec = { opacity: number; y: number; delay: number; duration: number };
export const GROUP_SPEC: Record<'currency' | 'assessment' | 'evidence' | 'outlook', GroupSpec> = {
  currency: { opacity: 0.6, y: 0, delay: revealSchedule.currency, duration: motionTokens.duration.fast },
  assessment: { opacity: 0, y: motionTokens.distance.reveal, delay: revealSchedule.assessment, duration: motionTokens.duration.reveal },
  evidence: { opacity: 0, y: 10, delay: revealSchedule.evidence, duration: 0.36 }, // storyboard values (between the reveal and small tokens)
  outlook: { opacity: 0, y: 0, delay: revealSchedule.outlook, duration: motionTokens.duration.standard }, // ribbon appears whole
};
/** Telemetry cells: one stagger step each from the telemetry start. */
export const cellSpec = (i: number): GroupSpec => ({
  opacity: 0,
  y: motionTokens.distance.small,
  delay: revealSchedule.telemetry + i * motionTokens.stagger.compact,
  duration: motionTokens.duration.standard,
});

const TONE_ICON = { good: CheckCircle2, fair: AlertTriangle, poor: ShieldAlert, unknown: CircleHelp } as const;
const FEED_ICON = { good: CheckCircle2, warning: AlertTriangle, critical: ServerCrash, neutral: Loader2 } as const;
const noNav = () => {
  /* dashboard destinations are not mounted inside the Lab */
};

/** The situation statement: dispersionClass() through situationStatement(), exactly as SituationHeader words it. */
export function Statement({ m }: { m: LabModel }) {
  const s = m.loadState === 'ready' ? situationStatement(m.cls) : { lead: '', tone: 'unknown' as const };
  const Icon = TONE_ICON[s.tone];
  return (
    <div className="cc-situation ml-situation">
      <div className="cc-situation__meta">
        <span className="cc-situation__site">
          <MapPin size={14} aria-hidden="true" /> <b>{LAB_SITE.title}</b> · {LAB_SITE.subtitle}
        </span>
        <span className="ax-mono cc-dim">
          {LAB_SITE.lat.toFixed(4)}° N, {LAB_SITE.lon.toFixed(4)}° E
        </span>
      </div>
      <p className={`cc-statement cc-statement--${s.tone}`}>
        {m.loadState === 'loading' && <span className="cc-dim">Reading the regional weather model…</span>}
        {m.loadState === 'error' && (
          <>
            <ServerCrash size={30} aria-hidden="true" /> <span>The weather model is unavailable, so dispersion cannot be assessed.</span>
          </>
        )}
        {m.loadState === 'ready' && (
          <>
            <Icon size={34} aria-hidden="true" />{' '}
            <span>
              {s.tone === 'unknown' ? (
                `Dispersion at ${LAB_SITE.title} cannot be assessed right now.`
              ) : (
                <>
                  {s.lead.replace(/\.$/, '')} <span className="cc-statement__site">at {LAB_SITE.title}.</span>
                </>
              )}
            </span>
          </>
        )}
      </p>
      {m.loadState === 'ready' && (
        <p className="cc-situation__detail">{m.cls.label === 'Unknown' ? m.cls.detail : `${m.cls.detail}.`} The evidence is below.</p>
      )}
    </div>
  );
}

/** Currency row: model validity and node freshness as separate labels (as in SituationHeader). */
export function Currency({ m }: { m: LabModel }) {
  const FeedIcon = FEED_ICON[m.feed.tone];
  return (
    <div className="cc-currency" role="group" aria-label="How current the evidence is">
      <div className="cc-currency__item">
        <SourceLabel kind="regional" detail="Open-Meteo" />
        <span className={`cc-feed cc-feed--${m.feed.tone}`}>
          <FeedIcon size={13} aria-hidden="true" className={m.feed.tone === 'neutral' ? 'ax-spin' : undefined} /> {m.feed.label}
        </span>
        {m.loadState === 'ready' && (
          <span className="cc-dim">
            valid <span className="ax-mono">{m.modelHour}</span> · fetched <span className="ax-mono">{m.fetched}</span>
          </span>
        )}
      </div>
      <div className="cc-currency__item">
        <SourceLabel kind="live" />
        <StateLabel state={m.obs.stationState} scope={m.obs.node ? `Node ${m.obs.node}` : 'Node'} />
        <span className="cc-dim">
          last packet <span className="ax-mono">{m.obs.loaded ? m.obs.packetAgo : 'checking…'}</span>
        </span>
      </div>
    </div>
  );
}

/** One telemetry cell, same markup as SystemRail. */
export function RailCell({ c }: { c: FeedCell }) {
  return (
    <>
      <span className="cc-rail__scope">{c.scope}</span>
      <span className="cc-rail__name">{c.name}</span>
      <StateLabel state={c.state} />
      <span className="cc-rail__detail">{c.detail}</span>
    </>
  );
}

type GroupRender = (group: RevealGroup, className: string, children: ReactNode) => ReactNode;
type CellRender = (index: number, className: string, children: ReactNode) => ReactNode;

/**
 * Renders the board; the engine decides what element wraps each group and each telemetry cell.
 * Every wrapper must carry data-reveal (groups) and keep its children in normal flow: the reveal only changes opacity and y.
 */
export default function RevealBoard({
  m,
  group,
  cell,
  headingId,
}: {
  m: LabModel;
  group: GroupRender;
  cell: CellRender;
  headingId: string;
}) {
  return (
    <div className="cc ml-board">
      {group('situation', 'ml-group', <Statement m={m} />)}
      {group('currency', 'ml-currency', <Currency m={m} />)}
      <div className="cc-band">
        {group(
          'assessment',
          'cc-band__main',
          <EnvironmentalAssessment
            loadState={m.loadState}
            evidence={m.evidence}
            limits={m.limits}
            hourLabel={m.modelHour}
            column={m.column}
            criteria={m.criteria}
            onNavigate={noNav}
            onRetry={noNav}
          />,
        )}
        {group(
          'evidence',
          'cc-band__side',
          <LocalObservations
            loaded={m.obs.loaded}
            failed={m.obs.failed}
            state={m.obs.observation}
            node={m.obs.node}
            headline={m.obs.headline}
            values={m.obs.values}
            last={m.obs.hasPacket ? m.obs.values : null}
            packetAgo={m.obs.packetAgo}
          />,
        )}
      </div>
      {group(
        'telemetry',
        'cc-rail',
        <>
          <div className="cc-rail__head">
            <h2 id={headingId} className="cc-h2">
              Operational health
            </h2>
            <p className="cc-p">Each system reports separately. A connected gateway does not mean a node is reporting.</p>
          </div>
          <ul className="cc-rail__cells" aria-labelledby={headingId}>
            {m.railCells.map((c, i) => (
              <Fragment key={c.id}>{cell(i, `cc-rail__cell cc-rail__cell--${c.state}`, <RailCell c={c} />)}</Fragment>
            ))}
          </ul>
        </>,
      )}
      {group(
        'outlook',
        'cc-band cc-band--b',
        <>
          <div className="cc-band__alerts">
            <AlertSummary outcome={m.outcome} windowHours={ALERT_WINDOW_HOURS} onNavigate={noNav} />
          </div>
          <div className="cc-band__outlook">
            <OutlookRibbon rows={m.outlookRows} poorAt={m.criteria.poorAt} loadState={m.loadState} onNavigate={noNav} />
          </div>
        </>,
      )}
    </div>
  );
}

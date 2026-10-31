import type { ReactNode } from 'react';
import {
  AlertTriangle, CheckCircle2, CircleHelp, Clock, Cpu, FlaskConical, Globe2, Hourglass, Loader2, Play,
  RadioTower, ServerCrash, ShieldAlert, WifiOff,
} from 'lucide-react';
import './primitives.css';

/* ---------- Source / provenance ---------- */
// Four data classes. Each carries a text label, an icon and a border pattern, so colour is never the only cue.
export type SourceKind = 'live' | 'regional' | 'model' | 'simulation';
const SOURCE: Record<SourceKind, { label: string; Icon: typeof RadioTower }> = {
  live: { label: 'LIVE · STATION', Icon: RadioTower },
  regional: { label: 'REGIONAL MODEL', Icon: Globe2 },
  model: { label: 'AEIOS MODEL', Icon: Cpu },
  simulation: { label: 'SIMULATION', Icon: FlaskConical },
};
export function SourceLabel({ kind, detail }: { kind: SourceKind; detail?: string }) {
  const { label, Icon } = SOURCE[kind];
  return (
    <span className={`ax-source ax-source--${kind}`}>
      <Icon size={13} aria-hidden="true" />
      <span>{label}</span>
      {detail && <span className="ax-source__detail">{detail}</span>}
    </span>
  );
}

/* ---------- Operational state ---------- */
// Connectivity, freshness, maturity and sensor state are separate dimensions; callers pass the one they mean.
export type OperationalState = 'online' | 'fresh' | 'stale' | 'nodata' | 'warming' | 'calibrating' | 'degraded' | 'fault';
const STATE: Record<OperationalState, { label: string; tone: 'good' | 'warning' | 'critical' | 'neutral'; Icon: typeof Clock }> = {
  online: { label: 'ONLINE', tone: 'good', Icon: CheckCircle2 },
  fresh: { label: 'FRESH', tone: 'good', Icon: CheckCircle2 },
  stale: { label: 'STALE', tone: 'warning', Icon: Clock },
  nodata: { label: 'NO DATA', tone: 'critical', Icon: WifiOff },
  warming: { label: 'WARMING UP', tone: 'warning', Icon: Hourglass },
  calibrating: { label: 'CALIBRATING', tone: 'warning', Icon: Hourglass },
  degraded: { label: 'DEGRADED', tone: 'warning', Icon: AlertTriangle },
  fault: { label: 'SENSOR FAULT', tone: 'critical', Icon: ShieldAlert },
};
export function StateLabel({ state, scope, children }: { state: OperationalState; scope?: string; children?: ReactNode }) {
  const { label, tone, Icon } = STATE[state];
  return (
    <span className={`ax-state ax-state--${tone}`}>
      <Icon size={13} aria-hidden="true" />
      {scope && <span className="ax-state__scope">{scope}</span>}
      <span>{label}</span>
      {children && <span className="ax-state__detail">{children}</span>}
    </span>
  );
}

/* ---------- Panel ---------- */
export function Panel({ eyebrow, title, aside, children, level = 2 }: { eyebrow?: string; title?: string; aside?: ReactNode; children: ReactNode; level?: 2 | 3 }) {
  const H = `h${level}` as 'h2' | 'h3';
  return (
    <section className="ax-panel">
      {(title || aside) && (
        <header className="ax-panel__head">
          <div>{eyebrow && <div className="ax-eyebrow">{eyebrow}</div>}{title && <H className="ax-panel__title">{title}</H>}</div>
          {aside && <div className="ax-panel__aside">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/* ---------- Metric readout ---------- */
// A missing value is never rendered as zero: pass value={null} and say why in `missing`.
export function Readout({ label, value, unit, note, source, observed, missing }: {
  label: string; value: string | number | null; unit?: string; note?: string; source?: SourceKind; observed?: string; missing?: string;
}) {
  const absent = value === null || value === undefined;
  return (
    <div className="ax-readout">
      <div className="ax-readout__label">{label}</div>
      {absent
        ? <div className="ax-readout__value ax-readout__value--missing"><CircleHelp size={18} aria-hidden="true" /> <span>No reading</span></div>
        : <div className="ax-readout__value"><span className="ax-num">{value}</span>{unit && <span className="ax-readout__unit">{unit}</span>}</div>}
      {absent && missing && <div className="ax-readout__note">{missing}</div>}
      {!absent && note && <div className="ax-readout__note">{note}</div>}
      {(source || observed) && (
        <div className="ax-readout__meta">{source && <SourceLabel kind={source} />}{observed && <span className="ax-mono">{observed}</span>}</div>
      )}
    </div>
  );
}

/* ---------- Insight / situation ---------- */
// Conclusion first, then confidence, then evidence for and against. Confidence is not sensor quality.
export function InsightPanel({ statement, source, confidence, supporting, contradicting, next, caveat }: {
  statement: string; source: SourceKind; confidence?: string; supporting: string[]; contradicting: string[]; next?: string; caveat?: string;
}) {
  return (
    <section className="ax-insight" aria-label="Situation summary">
      <div className="ax-insight__top"><SourceLabel kind={source} /><span className="ax-eyebrow">SITUATION</span></div>
      <p className="ax-insight__statement">{statement}</p>
      {confidence && <p className="ax-insight__confidence"><strong>Confidence in this interpretation:</strong> {confidence}</p>}
      <div className="ax-insight__evidence">
        <div><h3 className="ax-insight__h">Supporting evidence</h3><ul>{supporting.map((s) => <li key={s}>{s}</li>)}</ul></div>
        <div><h3 className="ax-insight__h">Contradicting or missing evidence</h3><ul>{contradicting.map((s) => <li key={s}>{s}</li>)}</ul></div>
      </div>
      {next && <p className="ax-insight__next"><Play size={13} aria-hidden="true" /> <strong>Next:</strong> {next}</p>}
      {caveat && <p className="ax-insight__caveat">{caveat}</p>}
    </section>
  );
}

/* ---------- Event item: lifecycle, severity, confidence and sensor quality stay separate fields ---------- */
export function EventItem({ title, lifecycle, severity, confidence, sensorQuality, evidence }: {
  title: string; lifecycle: string; severity: 'low' | 'moderate' | 'high'; confidence: string; sensorQuality: string; evidence: string;
}) {
  const tone = severity === 'high' ? 'critical' : severity === 'moderate' ? 'warning' : 'good';
  return (
    <article className="ax-event">
      <h3 className="ax-event__title">{title}</h3>
      <dl className="ax-event__fields">
        <div><dt>Lifecycle</dt><dd>{lifecycle}</dd></div>
        <div><dt>Severity</dt><dd><span className={`ax-state ax-state--${tone}`}><AlertTriangle size={13} aria-hidden="true" /> {severity.toUpperCase()}</span></dd></div>
        <div><dt>Event confidence</dt><dd>{confidence}</dd></div>
        <div><dt>Sensor quality</dt><dd>{sensorQuality}</dd></div>
      </dl>
      <p className="ax-event__evidence">{evidence}</p>
    </article>
  );
}

/* ---------- Chart frame ---------- */
export type LegendItem = { label: string; color: string; dash?: string; marker?: boolean };
export function ChartFrame({ title, takeaway, units, legend, source, children, table }: {
  title: string; takeaway: string; units: string; legend: LegendItem[]; source: SourceKind; children: ReactNode;
  table: { columns: string[]; rows: Array<Array<string | number>> };
}) {
  return (
    <figure className="ax-chart">
      <figcaption className="ax-chart__head">
        <div><h3 className="ax-chart__title">{title}</h3><p className="ax-chart__takeaway">{takeaway}</p></div>
        <SourceLabel kind={source} />
      </figcaption>
      <ul className="ax-chart__legend" aria-label="Legend">
        {legend.map((l) => (
          <li key={l.label}>
            <svg width="26" height="10" aria-hidden="true">
              {l.marker
                ? <circle cx="13" cy="5" r="4.5" fill={l.color} />
                : <line x1="0" y1="5" x2="26" y2="5" stroke={l.color} strokeWidth="2.5" strokeDasharray={l.dash} />}
            </svg>
            {l.label}
          </li>
        ))}
        <li className="ax-chart__units">Units: {units}</li>
      </ul>
      <div className="ax-chart__plot">{children}</div>
      <details className="ax-chart__table">
        <summary>View data as a table</summary>
        <table>
          <thead><tr>{table.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => (j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j}>{v}</td>))}</tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

/* ---------- Empty / stale / loading / error: six different situations, six different designs ---------- */
export type EmptyKind = 'not-run' | 'no-result' | 'unavailable' | 'stale' | 'loading' | 'error';
const EMPTY: Record<EmptyKind, { Icon: typeof Clock; tone: string }> = {
  'not-run': { Icon: Play, tone: 'neutral' },
  'no-result': { Icon: CheckCircle2, tone: 'neutral' },
  unavailable: { Icon: WifiOff, tone: 'warning' },
  stale: { Icon: Clock, tone: 'warning' },
  loading: { Icon: Loader2, tone: 'neutral' },
  error: { Icon: ServerCrash, tone: 'critical' },
};
export function EmptyState({ kind, title, children, action }: { kind: EmptyKind; title: string; children: ReactNode; action?: ReactNode }) {
  const { Icon, tone } = EMPTY[kind];
  return (
    <div className={`ax-empty ax-empty--${tone} ax-empty--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={20} aria-hidden="true" className={kind === 'loading' ? 'ax-spin' : undefined} />
      <div><strong>{title}</strong><p>{children}</p>{action}</div>
    </div>
  );
}

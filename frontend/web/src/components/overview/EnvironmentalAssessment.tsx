import { EmptyState, SourceLabel } from '../../design/primitives';
import AtmosphericColumn, { type ColumnLevel, type ColumnTemp } from './AtmosphericColumn';
import { gaugePosition, type EvidenceRow } from './model';

export type Criteria = { vc: number | null; wind: number | null; inv: number | null; blh: number | null; poorAt: number; calmKmh: number };

type GaugeSpec = { id: string; min: number; max: number; scale: 'linear' | 'log'; threshold: number | null; zone: 'below' | 'above' | null; zoneLabel: string; ticks: [string, string] };

function Gauge({ row, value, spec }: { row: EvidenceRow; value: number | null; spec: GaugeSpec }) {
  const pos = gaugePosition(value, spec);
  const th = spec.threshold === null ? null : gaugePosition(spec.threshold, spec)!.pos;
  const zoneStyle = th === null || spec.zone === null ? undefined
    : spec.zone === 'below' ? { left: 0, width: `${th * 100}%` } : { left: `${th * 100}%`, width: `${(1 - th) * 100}%` };
  return (
    <div className="cc-gauge">
      <div className="cc-gauge__top">
        <span className="cc-gauge__label">{row.label}</span>
        <span className="cc-gauge__value">{row.value === null ? <span className="cc-dim">not available</span> : <>{row.value}<small>{row.unit}</small></>}</span>
      </div>
      <div className="cc-gauge__track" aria-hidden="true">
        {zoneStyle && <span className="cc-gauge__zone" style={zoneStyle} title={spec.zoneLabel} />}
        {th !== null && <span className="cc-gauge__threshold" style={{ left: `${th * 100}%` }} />}
        {pos && <span className={`cc-gauge__mark ${pos.below || pos.above ? 'is-clamped' : ''}`} style={{ left: `${pos.pos * 100}%` }} />}
      </div>
      <div className="cc-gauge__ticks" aria-hidden="true"><span>{spec.ticks[0]}</span>{spec.zone && <span className="cc-gauge__zonelabel">{spec.zoneLabel}</span>}<span>{spec.ticks[1]}</span></div>
      <p className="cc-gauge__note">{row.note}</p>
    </div>
  );
}

export default function EnvironmentalAssessment({ loadState, evidence, criteria, limits, hourLabel, column, onNavigate, onRetry }: {
  loadState: 'loading' | 'ready' | 'error'; evidence: EvidenceRow[]; criteria: Criteria; limits: string[]; hourLabel: string;
  column: { blh: number | null; temps: ColumnTemp[]; winds: ColumnLevel[] };
  onNavigate: (id: string) => void; onRetry: () => void;
}) {
  const row = (id: string) => evidence.find((r) => r.id === id)!;
  const calmMs = criteria.calmKmh / 3.6;
  const specs: Record<string, GaugeSpec> = {
    vc: { id: 'vc', min: 10, max: 100000, scale: 'log', threshold: criteria.poorAt, zone: 'below', zoneLabel: 'poor', ticks: ['10', '100k m²/s'] },
    wind: { id: 'wind', min: 0, max: 10, scale: 'linear', threshold: calmMs, zone: 'below', zoneLabel: 'calm', ticks: ['0', '10 m/s'] },
    inv: { id: 'inv', min: -5, max: 5, scale: 'linear', threshold: 0, zone: 'above', zoneLabel: 'lid', ticks: ['−5', '+5 °C'] },
    blh: { id: 'blh', min: 10, max: 3000, scale: 'log', threshold: null, zone: null, zoneLabel: '', ticks: ['10', '3,000 m'] },
  };
  const values: Record<string, number | null> = { vc: criteria.vc, wind: criteria.wind, inv: criteria.inv, blh: criteria.blh };

  return (
    <section className="cc-assess" aria-labelledby="cc-assess-h" aria-busy={loadState === 'loading'}>
      <div className="cc-head">
        <div><div className="ax-eyebrow">Environmental assessment</div><h2 id="cc-assess-h" className="cc-h2">Why the air can or cannot clear</h2></div>
        <div className="cc-aside"><SourceLabel kind="regional" detail={`Open-Meteo · valid ${hourLabel}`} /></div>
      </div>
      {loadState === 'loading' && <div className="cc-skel" role="status" aria-label="Loading assessment"><i /><i /><i /></div>}
      {loadState === 'error' && (
        <EmptyState kind="error" title="Weather model feed unavailable" action={<button className="ax-btn" style={{ marginTop: 'var(--aeios-space-3)' }} onClick={onRetry}>Retry</button>}>
          The assessment comes from the regional weather model, and it could not be loaded. Check this device&apos;s internet connection.
        </EmptyState>
      )}
      {loadState === 'ready' && (
        <>
          <div className="cc-assess__body">
            <AtmosphericColumn blh={column.blh} temps={column.temps} winds={column.winds} validLabel={hourLabel} />
            <div className="cc-gauges" role="list" aria-label="Dispersion criteria against their thresholds">
              {['vc', 'wind', 'inv', 'blh'].map((id) => <div role="listitem" key={id}><Gauge row={row(id)} value={values[id]} spec={specs[id]} /></div>)}
            </div>
          </div>
          <div className="cc-limits"><h3 className="cc-h4">What this does not tell you</h3><ul>{limits.map((l) => <li key={l}>{l}</li>)}</ul></div>
          <a className="cc-link" href="#dispersion" onClick={(e) => { e.preventDefault(); onNavigate('dispersion'); }}>Open the full 48-hour analysis in Pollution dispersion</a>
        </>
      )}
    </section>
  );
}

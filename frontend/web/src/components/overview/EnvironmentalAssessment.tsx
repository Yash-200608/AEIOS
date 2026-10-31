import { AlertTriangle, CheckCircle2, CircleHelp, ShieldAlert } from 'lucide-react';
import { EmptyState, SourceLabel } from '../../design/primitives';
import { verdictView, type DispersionClass, type EvidenceRow } from './model';

const ICON = { good: CheckCircle2, fair: AlertTriangle, poor: ShieldAlert } as const;

export default function EnvironmentalAssessment({ loadState, cls, evidence, limits, hourLabel, onNavigate, onRetry }: {
  loadState: 'loading' | 'ready' | 'error'; cls: DispersionClass; evidence: EvidenceRow[]; limits: string[]; hourLabel: string;
  onNavigate: (id: string) => void; onRetry: () => void;
}) {
  const view = verdictView(cls);
  const Icon = view.known ? ICON[cls.tone] : CircleHelp;
  const tone = view.known ? cls.tone : 'unknown';
  return (
    <section className={`cc-assess cc-assess--${tone}`} aria-labelledby="cc-assess-h" aria-busy={loadState === 'loading'}>
      <div className="cc-head" style={{ marginBottom: 0 }}>
        <div className="ax-eyebrow">Environmental assessment</div>
        <div className="cc-aside"><SourceLabel kind="regional" detail={`Open-Meteo · ${hourLabel}`} /></div>
      </div>
      {loadState === 'loading' && (
        <div className="cc-skel" role="status" aria-label="Loading assessment"><i /><i /><i /><h2 id="cc-assess-h" className="cc-sr">Environmental assessment</h2></div>
      )}
      {loadState === 'error' && (
        <>
          <h2 id="cc-assess-h" className="cc-sr">Environmental assessment</h2>
          <EmptyState kind="error" title="Weather model feed unavailable" action={<button className="ax-btn" style={{ marginTop: 'var(--aeios-space-3)' }} onClick={onRetry}>Retry</button>}>
            The assessment comes from the regional weather model, and it could not be loaded. Check this device&apos;s internet connection.
          </EmptyState>
        </>
      )}
      {loadState === 'ready' && (
        <>
          <div className="cc-verdict"><Icon size={30} aria-hidden="true" /><h2 id="cc-assess-h" className="cc-h3">{view.headline}</h2></div>
          <p className="cc-p">{view.known ? `${cls.detail}.` : cls.detail}</p>
          <dl className="cc-evidence" aria-label="Evidence for the assessment">
            {evidence.map((r) => (
              <div key={r.id}>
                <dt>{r.label}</dt>
                <dd className="cc-v">{r.value === null ? <span className="cc-dim">Not available</span> : <>{r.value}<small>{r.unit}</small></>}</dd>
                <dd className="cc-n">{r.note}</dd>
              </div>
            ))}
          </dl>
          <div className="cc-limits"><h3 className="cc-h4">What this does not tell you</h3><ul>{limits.map((l) => <li key={l}>{l}</li>)}</ul></div>
          <a className="cc-link" href="#dispersion" onClick={(e) => { e.preventDefault(); onNavigate('dispersion'); }}>Open Pollution dispersion</a>
        </>
      )}
    </section>
  );
}

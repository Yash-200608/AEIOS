import { AlertTriangle, RadioTower } from 'lucide-react';
import { EmptyState } from '../../design/primitives';
import { istDateTime } from './format';
import type { AlertOutcome } from './model';

export default function AlertSummary({ outcome, windowHours, onNavigate }: { outcome: AlertOutcome; windowHours: number; onNavigate: (id: string) => void }) {
  return (
    <section className="cc-panel" aria-labelledby="cc-alert-h" aria-busy={outcome.kind === 'loading'}>
      <div className="cc-head">
        <div><div className="ax-eyebrow">Smoke alerts</div><h2 id="cc-alert-h" className="cc-h2">Raised by the gateway</h2></div>
        <div className="cc-aside"><span className="cc-chip"><RadioTower size={12} aria-hidden="true" /> AEIOS GATEWAY · every 10 min</span></div>
      </div>

      {outcome.kind === 'loading' && <EmptyState kind="loading" title="Checking alerts">Reading the gateway alert history.</EmptyState>}
      {outcome.kind === 'error' && <EmptyState kind="error" title="Could not load alerts">{outcome.message}</EmptyState>}
      {outcome.kind === 'none' && (
        <EmptyState kind="no-result" title="No alerts raised">No WATCH or WARNING in the last {windowHours} hours, and the node PM2.5 input is current.</EmptyState>
      )}
      {outcome.kind === 'cannot-assess' && (
        <EmptyState kind="unavailable" title="Cannot assess">{outcome.reason}</EmptyState>
      )}
      {outcome.kind === 'active' && (
        <div className={`cc-alert cc-alert--${outcome.alert.level.toLowerCase()}`} role="status">
          <div className="cc-health__top">
            <span className={`ax-state ax-state--${outcome.alert.level === 'WARNING' ? 'critical' : 'warning'}`}><AlertTriangle size={13} aria-hidden="true" /> {outcome.alert.level}</span>
            <span className="ax-mono cc-dim">{istDateTime(outcome.alert.utc)}</span>
          </div>
          <p className="cc-alert__msg">{outcome.alert.message || 'No message recorded.'}</p>
          {outcome.more > 0 && <span className="cc-dim">{outcome.more} more in the last {windowHours} hours.</span>}
        </div>
      )}

      <p className="cc-caveat">Fire matches are an air-mass pathway estimate (wind back-trajectories against satellite fire detections), not source confirmation.</p>
      <details className="cc-details">
        <summary>How alerts are triggered</summary>
        <ul>
          <li><b>WATCH</b>: air passed 5 or more fires, or 10 MW of fire radiative power.</li>
          <li><b>WARNING</b>: 20 fires or 50 MW, or a WATCH while node PM2.5 is above 90 µg/m³.</li>
        </ul>
      </details>
      <a className="cc-link" href="#smoke" onClick={(e) => { e.preventDefault(); onNavigate('smoke'); }}>Open Smoke origin</a>
    </section>
  );
}

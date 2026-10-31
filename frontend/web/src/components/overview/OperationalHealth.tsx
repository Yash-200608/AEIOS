import { StateLabel, type OperationalState } from '../../design/primitives';
import type { HealthRow, HealthState } from './model';

const STATE: Record<HealthState, OperationalState> = {
  online: 'online', offline: 'offline', fresh: 'fresh', stale: 'stale', nodata: 'nodata', warming: 'warming', active: 'active', unknown: 'checking', error: 'unavailable',
};

export default function OperationalHealth({ rows, onNavigate }: { rows: HealthRow[]; onNavigate: (id: string) => void }) {
  return (
    <section className="cc-panel" aria-labelledby="cc-health-h">
      <div className="cc-head">
        <div><div className="ax-eyebrow">Operational health</div><h2 id="cc-health-h" className="cc-h2">Gateway, nodes and model</h2></div>
      </div>
      <p className="cc-p" style={{ marginBottom: 'var(--aeios-space-4)' }}>Three separate questions. A connected gateway does not mean a node is reporting.</p>
      <ul className="cc-health">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="cc-health__top">
              <div><div className="cc-health__scope">{r.scope}</div><div className="cc-health__name">{r.name}</div></div>
              <StateLabel state={STATE[r.state]} />
            </div>
            <div className="cc-health__detail">{r.detail}</div>
          </li>
        ))}
      </ul>
      <a className="cc-link" href="#station" onClick={(e) => { e.preventDefault(); onNavigate('station'); }}>Open Station network</a>
    </section>
  );
}

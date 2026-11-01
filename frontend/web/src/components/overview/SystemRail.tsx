import { StateLabel, type OperationalState } from '../../design/primitives';
import type { HealthRow, HealthState } from './model';

const STATE: Record<HealthState, OperationalState> = {
  online: 'online', offline: 'offline', fresh: 'fresh', stale: 'stale', nodata: 'nodata', warming: 'warming', active: 'active', unknown: 'checking', error: 'unavailable',
};

export type FeedCell = { id: string; scope: string; name: string; state: OperationalState; detail: string };

/**
 * Mission-style telemetry strip: one cell per subsystem, each with its own state and age.
 * Data feeds first (what the assessment depends on), then the AEIOS edge: gateway, every registry node, local model.
 */
export default function SystemRail({ feeds, rows, onNavigate }: { feeds: FeedCell[]; rows: HealthRow[]; onNavigate: (id: string) => void }) {
  const cells: FeedCell[] = [...feeds, ...rows.map((r) => ({ id: r.id, scope: r.scope, name: r.name, state: STATE[r.state], detail: r.detail }))];
  return (
    <section className="cc-rail" aria-labelledby="cc-rail-h">
      <div className="cc-rail__head">
        <h2 id="cc-rail-h" className="cc-h2">Operational health</h2>
        <p className="cc-p">Each system reports separately. A connected gateway does not mean a node is reporting.</p>
        <a className="cc-link" href="#station" onClick={(e) => { e.preventDefault(); onNavigate('station'); }}>Station network</a>
      </div>
      <ul className="cc-rail__cells">
        {cells.map((c) => (
          <li key={c.id} className={`cc-rail__cell cc-rail__cell--${c.state}`}>
            <span className="cc-rail__scope">{c.scope}</span>
            <span className="cc-rail__name">{c.name}</span>
            <StateLabel state={c.state} />
            <span className="cc-rail__detail">{c.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

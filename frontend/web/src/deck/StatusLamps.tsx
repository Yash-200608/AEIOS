import type { HealthRow } from '../components/overview/model';
import type { FeedCell } from '../components/overview/SystemRail';
import { lampState } from './scrub';

/* One lamp per gateway, node, feed and local model. Only a fresh or online lamp pulses (see lampState); the rest are dim and still. */
export default function StatusLamps({ feeds, rows }: { feeds: FeedCell[]; rows: HealthRow[] }) {
  const items = [
    ...rows.map((r) => ({ id: r.id, name: r.name, state: r.state as string, detail: r.detail, kind: 'node' as const })),
    ...feeds.map((f) => ({ id: f.id, name: f.name, state: f.state as string, detail: f.detail, kind: 'feed' as const })),
  ];
  return (
    <ul className="dk-lamps" aria-label="System status">
      {items.map((it) => (
        <li key={it.id} className="dk-lamp" data-lamp={lampState(it.state, it.kind)} title={`${it.name}: ${it.state}. ${it.detail}`}>
          <span className="dk-lamp__dot" aria-hidden="true" />
          <span className="dk-lamp__name">{it.name}</span>
          <span className="dk-lamp__state">{it.state.toUpperCase()}</span>
          <span className="dk-sr">{it.detail}</span>
        </li>
      ))}
    </ul>
  );
}

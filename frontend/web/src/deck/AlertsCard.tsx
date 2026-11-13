import { AlertTriangle } from 'lucide-react';
import { istDateTime } from '../components/overview/format';
import type { AlertOutcome } from '../components/overview/model';
import DeckCard from './DeckCard';

/* The smoke WATCH / WARNING outcome of the last 12 hours, in one short block. */
export default function AlertsCard({ outcome, onNavigate }: { outcome: AlertOutcome; onNavigate: (id: string) => void }) {
  return (
    <DeckCard title="Smoke alerts" source="model" sourceDetail="AEIOS gateway">
      {outcome.kind === 'loading' && <p className="dk-card__note">Checking alerts…</p>}
      {outcome.kind === 'error' && <p className="dk-card__note">Could not load alerts: {outcome.message}</p>}
      {outcome.kind === 'none' && <p className="dk-card__note">No WATCH or WARNING in the last 12 hours.</p>}
      {outcome.kind === 'cannot-assess' && <p className="dk-card__note">Cannot assess: {outcome.reason}</p>}
      {outcome.kind === 'active' && (
        <div className={`dk-alert dk-alert--${outcome.alert.level.toLowerCase()}`} role="status">
          <strong><AlertTriangle size={14} aria-hidden="true" /> {outcome.alert.level}</strong>
          <span className="ax-mono dk-dim">{istDateTime(outcome.alert.utc)}</span>
          <p>{outcome.alert.message || 'No message recorded.'}</p>
          {outcome.more > 0 && <span className="dk-dim">{outcome.more} more in the last 12 hours.</span>}
        </div>
      )}
      <button type="button" className="dk-link" onClick={() => onNavigate('smoke')}>Open smoke origin</button>
    </DeckCard>
  );
}

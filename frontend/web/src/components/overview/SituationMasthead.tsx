import { AlertTriangle, CheckCircle2, Loader2, MapPin, RefreshCw, ServerCrash } from 'lucide-react';
import { SourceLabel, StateLabel, type OperationalState } from '../../design/primitives';
import type { feedStatus } from './model';

type Feed = ReturnType<typeof feedStatus>;
const FEED_ICON = { good: CheckCircle2, warning: AlertTriangle, critical: ServerCrash, neutral: Loader2 } as const;

export default function SituationMasthead({ title, subtitle, lat, lon, feed, modelFetched, modelHour, stationNode, stationState, stationAgo, refreshing, onRefresh }: {
  title: string; subtitle: string; lat: number; lon: number; feed: Feed; modelFetched: string; modelHour: string;
  stationNode?: string; stationState: OperationalState; stationAgo: string; refreshing: boolean; onRefresh: () => void;
}) {
  const FeedIcon = FEED_ICON[feed.tone];
  return (
    <header className="cc-mast">
      <div>
        <div className="ax-eyebrow">Overview · situation</div>
        <h1 className="cc-title">{title}</h1>
        <div className="cc-sub">
          <span><MapPin size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {subtitle}</span>
          <span className="ax-mono">{lat.toFixed(4)}° N, {lon.toFixed(4)}° E</span>
        </div>
      </div>
      <div className="cc-asof" role="group" aria-label="Data currency">
        <div className="cc-asof__row">
          <div className="cc-asof__line">
            <SourceLabel kind="regional" detail="Open-Meteo" />
            <span className={`cc-feed cc-feed--${feed.tone}`}><FeedIcon size={14} aria-hidden="true" className={feed.tone === 'neutral' ? 'ax-spin' : undefined} /> {feed.label}</span>
          </div>
          <div className="cc-asof__line">Fetched {modelFetched} · values for <span className="ax-mono">{modelHour}</span></div>
        </div>
        <div className="cc-asof__row">
          <div className="cc-asof__line">
            <SourceLabel kind="live" detail="AEIOS station" />
            <StateLabel state={stationState} scope={stationNode ? `Node ${stationNode}` : 'Node'} />
          </div>
          <div className="cc-asof__line">Last packet {stationAgo}</div>
        </div>
        <button className="ax-btn cc-refresh" onClick={onRefresh} aria-label="Refresh weather model data" disabled={refreshing}>
          <RefreshCw size={16} aria-hidden="true" className={refreshing ? 'ax-spin' : undefined} /> Refresh
        </button>
      </div>
    </header>
  );
}

import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, MapPin, ServerCrash, ShieldAlert } from 'lucide-react';
import { SourceLabel, StateLabel, type OperationalState } from '../../design/primitives';
import { situationStatement, type DispersionClass, type feedStatus } from './model';

type Feed = ReturnType<typeof feedStatus>;
const TONE_ICON = { good: CheckCircle2, fair: AlertTriangle, poor: ShieldAlert, unknown: CircleHelp } as const;
const FEED_ICON = { good: CheckCircle2, warning: AlertTriangle, critical: ServerCrash, neutral: Loader2 } as const;

/**
 * The situation is the headline; the site is its subject, not its title. Currency (model valid time, node freshness)
 * sits directly under it, with provenance and freshness as separate labels.
 */
export default function SituationHeader({ cls, loadState, site, subtitle, lat, lon, feed, modelFetched, modelHour, stationNode, stationState, stationAgo }: {
  cls: DispersionClass; loadState: 'loading' | 'ready' | 'error'; site: string; subtitle: string; lat: number; lon: number;
  feed: Feed; modelFetched: string; modelHour: string; stationNode?: string; stationState: OperationalState; stationAgo: string;
}) {
  const s = loadState === 'ready' ? situationStatement(cls) : { lead: '', tone: 'unknown' as const };
  const Icon = TONE_ICON[s.tone];
  const FeedIcon = FEED_ICON[feed.tone];
  return (
    <header className="cc-situation">
      <div className="cc-situation__meta">
        <span className="cc-situation__site"><MapPin size={14} aria-hidden="true" /> <b>{site}</b> · {subtitle}</span>
        <span className="ax-mono cc-dim">{lat.toFixed(4)}° N, {lon.toFixed(4)}° E</span>
      </div>
      <h1 className={`cc-statement cc-statement--${s.tone}`}>
        {loadState === 'loading' && <span className="cc-dim">Reading the regional weather model…</span>}
        {loadState === 'error' && <><ServerCrash size={30} aria-hidden="true" /> <span>The weather model is unavailable, so dispersion cannot be assessed.</span></>}
        {loadState === 'ready' && <><Icon size={34} aria-hidden="true" /> <span>{s.tone === 'unknown' ? `Dispersion at ${site} cannot be assessed right now.` : <>{s.lead.replace(/\.$/, '')} <span className="cc-statement__site">at {site}.</span></>}</span></>}
      </h1>
      {loadState === 'ready' && <p className="cc-situation__detail">{cls.label === 'Unknown' ? cls.detail : `${cls.detail}.`} The evidence is below.</p>}
      <div className="cc-currency" role="group" aria-label="How current the evidence is">
        <div className="cc-currency__item">
          <SourceLabel kind="regional" detail="Open-Meteo" />
          <span className={`cc-feed cc-feed--${feed.tone}`}><FeedIcon size={13} aria-hidden="true" className={feed.tone === 'neutral' ? 'ax-spin' : undefined} /> {feed.label}</span>
          {loadState === 'ready' && <span className="cc-dim">valid <span className="ax-mono">{modelHour}</span> · fetched <span className="ax-mono">{modelFetched}</span></span>}
        </div>
        <div className="cc-currency__item">
          <SourceLabel kind="live" />
          <StateLabel state={stationState} scope={stationNode ? `Node ${stationNode}` : 'Node'} />
          <span className="cc-dim">last packet <span className="ax-mono">{stationAgo}</span></span>
        </div>
      </div>
    </header>
  );
}

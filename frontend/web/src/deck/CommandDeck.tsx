import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import '../components/overview/overview.css';
import AtmosphericColumn from '../components/overview/AtmosphericColumn';
import { verdictView } from '../components/overview/model';
import { VENTILATION_POOR, ventilation } from '../lib/derived';
import { useMotionPolicy } from '../motion/useMotionPolicy';
import { ViewRoot } from '../views/shared';
import AirCard from './AirCard';
import AlertsCard from './AlertsCard';
import DeckStage from './DeckStage';
import OutlookScrubber from './OutlookScrubber';
import StationCard from './StationCard';
import StatusLamps from './StatusLamps';
import WeatherCard from './WeatherCard';
import { fixed, useOverviewModel, type OverviewProps } from './useOverviewModel';
import './deck.css';

const WINDOW_HOURS = 48;
const BOOT_FAILSAFE_MS = 4000; // the panels never stay hidden if the globe chunk is slow or the boot never reports

/** Index of the first hourly slot at or after the current model time (0 when it cannot be placed). */
function currentHourIndex(times: unknown[], currentTime: string): number {
  const now = Date.parse(currentTime);
  if (!Number.isFinite(now)) return 0;
  const i = times.findIndex((t) => Date.parse(String(t)) >= now);
  return i < 0 ? 0 : i;
}

/*
 * The command deck: the landing view, built for a desktop screen and sized to it (no page scroll). Every value comes from
 * useOverviewModel, the same hook the Briefing uses. Moving the outlook scrubber changes the selected hour for the whole
 * dashboard (verdict, atmospheric column, Briefing).
 */
export default function CommandDeck({ overview, onSelectHour }: { overview: OverviewProps; onSelectHour: (hourIndex: number) => void }) {
  const model = useOverviewModel(overview);
  const { reduced } = useMotionPolicy();
  const [booted, setBooted] = useState(reduced);
  useEffect(() => {
    if (booted) return;
    const timer = window.setTimeout(() => setBooted(true), BOOT_FAILSAFE_MS);
    return () => window.clearTimeout(timer);
  }, [booted]);

  const verdict = verdictView(model.cls);
  const tone = verdict.known ? model.cls.tone : 'unknown';
  // The verdict colour tints the ambient background (ambient.css reads --deck-tone from <html>).
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.deckTone = tone;
    return () => { delete html.dataset.deckTone; };
  }, [tone]);

  // A fixed 48-hour window from the current hour, so the chart does not slide while an hour is being picked.
  const times = overview.hourly.time || [];
  const base = useMemo(() => currentHourIndex(times, String(overview.current.time || '')), [times, overview.current.time]);
  const rows = useMemo(() => {
    const out: Array<{ time: string; vc: number | null }> = [];
    for (let i = base; i < Math.min(times.length, base + WINDOW_HOURS); i += 1) out.push({ time: String(times[i]), vc: ventilation(overview.hourly, i) });
    return out;
  }, [overview.hourly, times, base]);
  const rel = overview.selectedHour - base;
  const selected = rel >= 0 && rel < rows.length ? rel : null;
  const onSelect = useCallback((i: number) => onSelectHour(base + i), [onSelectHour, base]);

  const site = useMemo(() => ({ name: overview.title, lat: overview.lat, lon: overview.lon }), [overview.title, overview.lat, overview.lon]);
  const weatherOff = model.loadState !== 'ready';

  return (
    <ViewRoot id="overview" className="dk-deck">
      <div className="dk-deck__grid" data-booted={booted ? 'true' : 'false'} data-testid="command-deck">
        <div className="dk-deck__left dk-enter" style={{ '--i': 0 } as React.CSSProperties}>
          <AtmosphericColumn blh={model.column.blh} temps={model.column.temps} winds={model.column.winds} validLabel={model.modelHour} />
        </div>

        <div className="dk-deck__center">
          <DeckStage site={site} verdict={verdict.headline} tone={tone} onBooted={() => setBooted(true)} />
          <button type="button" className="dk-deck__briefing dk-enter" style={{ '--i': 5 } as React.CSSProperties} onClick={() => overview.onNavigate('briefing')}>
            Full briefing <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="dk-deck__right">
          <div className="dk-enter" style={{ '--i': 1 } as React.CSSProperties}><StationCard model={model} /></div>
          <div className="dk-enter" style={{ '--i': 2 } as React.CSSProperties}>
            <AirCard aqi={model.aqiNumber} pm25={fixed((overview.aq?.current as any)?.pm2_5)} warning={overview.aqWarning} available={overview.aq !== null} />
          </div>
          <div className="dk-enter" style={{ '--i': 3 } as React.CSSProperties}><WeatherCard current={overview.current} /></div>
          <div className="dk-enter" style={{ '--i': 4 } as React.CSSProperties}><AlertsCard outcome={model.outcome} onNavigate={overview.onNavigate} /></div>
        </div>

        <div className="dk-deck__bottom dk-enter" style={{ '--i': 6 } as React.CSSProperties}>
          <OutlookScrubber rows={rows} poorAt={VENTILATION_POOR} selected={selected} disabled={weatherOff || rows.length === 0} onSelect={onSelect} />
          <StatusLamps feeds={model.feeds} rows={model.health} />
        </div>
      </div>
    </ViewRoot>
  );
}

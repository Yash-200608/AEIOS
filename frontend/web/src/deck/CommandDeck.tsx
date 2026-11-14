import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import '../components/overview/overview.css';
import AtmosphericColumn from '../components/overview/AtmosphericColumn';
import { istTime } from '../components/overview/format';
import { verdictView } from '../components/overview/model';
import { bootSeen, shouldBoot } from './boot';
import { nearestHourIndex } from './hours';
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
const BOOT_FAILSAFE_MS = 6000; // longer than the globe's 4.3 s fly-in; the panels never stay hidden if the chunk is slow or the boot never reports

const EMPTY_COLUMN = {
  blh: null,
  temps: [2, 80, 120, 180].map((h) => ({ h, t: null })),
  winds: [10, 80, 120, 180].map((h) => ({ h, speed: null, dir: null, from: '' })),
};

/*
 * The command deck: the landing view, built for a desktop screen and sized to it (no page scroll). Every value comes from
 * useOverviewModel, the same hook the Briefing uses. Moving the outlook scrubber changes the selected hour for the whole
 * dashboard (verdict, atmospheric column, Briefing).
 */
export default function CommandDeck({ overview, onSelectHour }: { overview: OverviewProps; onSelectHour: (hourIndex: number) => void }) {
  const model = useOverviewModel(overview);
  const { reduced } = useMotionPolicy();
  const [booted, setBooted] = useState(() => !shouldBoot(bootSeen(), reduced)); // no boot to wait for: panels are there at once
  useEffect(() => {
    if (booted) return;
    const timer = window.setTimeout(() => setBooted(true), BOOT_FAILSAFE_MS);
    return () => window.clearTimeout(timer);
  }, [booted]);

  // While the weather model is loading (also during a site switch, when the previous site's run is still in state) or has
  // failed, nothing derived from it is shown: the verdict says so and the model cards are empty.
  const ready = model.loadState === 'ready';
  const known = ready && verdictView(model.cls).known;
  const verdictText = !ready ? (model.loadState === 'loading' ? 'Reading the weather model…' : 'Weather model unavailable') : verdictView(model.cls).headline;
  const verdict = { headline: verdictText, known };
  const tone = known ? model.cls.tone : 'unknown';
  const note = ready
    ? `Regional model · Open-Meteo · valid ${model.modelHour}${overview.forecastMeta?.stale ? ` · cached run, fetched ${istTime(overview.lastUpdated)} IST` : ''}`
    : '';
  // The verdict colour tints the ambient background (ambient.css reads --deck-tone from <html>).
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.deckTone = tone;
    return () => { delete html.dataset.deckTone; };
  }, [tone]);

  // A fixed 48-hour window from the hour the dashboard treats as "now" (the same rule App uses to select it), so the chart does
  // not slide while an hour is being picked and the thumb starts on the selected hour.
  const times = overview.hourly.time;
  const base = useMemo(() => nearestHourIndex(times || [], String(overview.current.time || '')), [times, overview.current.time]);
  const rows = useMemo(() => {
    const all = times || [];
    const out: Array<{ time: string; vc: number | null }> = [];
    for (let i = base; i < Math.min(all.length, base + WINDOW_HOURS); i += 1) out.push({ time: String(all[i]), vc: ventilation(overview.hourly, i) });
    return out;
  }, [overview.hourly, times, base]);
  const rel = overview.selectedHour - base;
  const selected = rel >= 0 && rel < rows.length ? rel : null;
  const onSelect = useCallback((i: number) => onSelectHour(base + i), [onSelectHour, base]);

  const site = useMemo(() => ({ name: overview.title, lat: overview.lat, lon: overview.lon }), [overview.title, overview.lat, overview.lon]);
  const weatherOff = !ready;
  const column = ready ? model.column : EMPTY_COLUMN;

  return (
    <ViewRoot id="overview" className="dk-deck">
      <div className="dk-deck__grid" data-booted={booted ? 'true' : 'false'} data-testid="command-deck">
        <div className="dk-deck__left dk-enter" style={{ '--i': 0 } as React.CSSProperties}>
          <AtmosphericColumn blh={column.blh} temps={column.temps} winds={column.winds} validLabel={ready ? model.modelHour : '—'} />
        </div>

        <div className="dk-deck__center">
          <DeckStage site={site} verdict={verdict.headline} tone={tone} note={note} onBooted={() => setBooted(true)} />
          <button type="button" className="dk-deck__briefing dk-enter" style={{ '--i': 5 } as React.CSSProperties} onClick={() => overview.onNavigate('briefing')}>
            Full briefing <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="dk-deck__right">
          <div className="dk-enter" style={{ '--i': 1 } as React.CSSProperties}><StationCard model={model} /></div>
          <div className="dk-enter" style={{ '--i': 2 } as React.CSSProperties}>
            <AirCard
              aqi={ready ? model.aqiNumber : null} pm25={ready ? fixed((overview.aq?.current as any)?.pm2_5) : null}
              warning={ready ? overview.aqWarning : 'Waiting for the weather model…'} available={ready && overview.aq !== null}
            />
          </div>
          <div className="dk-enter" style={{ '--i': 3 } as React.CSSProperties}><WeatherCard current={ready ? overview.current : {}} /></div>
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

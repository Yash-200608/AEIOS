import { StateLabel } from '../design/primitives';
import DeckCard from './DeckCard';
import { useCountUp } from './useCountUp';
import type { OverviewModel } from './useOverviewModel';

function Stat({ label, value, unit, digits = 0 }: { label: string; value: number | null; unit: string; digits?: number }) {
  const text = useCountUp(value, { digits });
  return (
    <div className="dk-stat">
      <span className="dk-stat__label">{label}</span>
      {text === null
        ? <span className="dk-stat__value dk-stat__value--none">no reading</span>
        : <span className="dk-stat__value"><span className="ax-num">{text}</span><small>{unit}</small></span>}
    </div>
  );
}

/*
 * The measured station reading. Numbers are shown only when the model says the reading is current ('valid'). A stale, missing
 * or unloadable reading shows the model's own headline and no numbers, so an old value is never drawn as current and a
 * failed load is "unknown", not zero.
 */
export default function StationCard({ model }: { model: OverviewModel }) {
  const current = model.loaded && model.observation === 'valid' && !model.failed;
  const v = model.values;
  return (
    <DeckCard title="Local station" source="live" sourceDetail={model.reading.node ? `Node ${model.reading.node}` : undefined} data-station-state={model.stationState}>
      <div className="dk-station__state"><StateLabel state={model.stationState} /><span className="dk-dim">{!model.loaded || model.failed ? '—' : model.packetAgo}</span></div>
      {!model.loaded ? (
        <div className="dk-station__none"><strong>Checking the gateway…</strong></div>
      ) : current ? (
        <div className="dk-stats">
          <Stat label="PM2.5" value={v.pm25} unit="µg/m³" />
          <Stat label="PM10" value={v.pm10} unit="µg/m³" />
          <Stat label="Temp" value={v.temp} unit="°C" digits={1} />
          <Stat label="RH" value={v.rh} unit="%" />
        </div>
      ) : (
        <div className="dk-station__none">
          <strong>{model.headline.title}</strong>
          <p>{model.headline.detail}</p>
        </div>
      )}
    </DeckCard>
  );
}

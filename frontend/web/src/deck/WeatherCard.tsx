import { compass } from '../lib/api';
import { finiteOrNull } from './useOverviewModel';
import DeckCard from './DeckCard';
import { useCountUp } from './useCountUp';

function Num({ label, value, unit, digits = 0 }: { label: string; value: number | null; unit: string; digits?: number }) {
  const text = useCountUp(value, { digits });
  return (
    <div className="dk-stat">
      <span className="dk-stat__label">{label}</span>
      {text === null ? <span className="dk-stat__value dk-stat__value--none">no reading</span> : <span className="dk-stat__value"><span className="ax-num">{text}</span><small>{unit}</small></span>}
    </div>
  );
}

/* Regional weather model now: four numbers and a compass whose needle turns to the direction the wind comes from. */
export default function WeatherCard({ current }: { current: Record<string, any> }) {
  const dir = finiteOrNull(current.wind_direction_10m);
  return (
    <DeckCard title="Weather now" source="regional" sourceDetail="Open-Meteo">
      <div className="dk-weather">
        <div className="dk-compass" role="img" aria-label={dir === null ? 'Wind direction unavailable' : `Wind from ${compass(dir)}`}>
          <span className="dk-compass__n" aria-hidden="true">N</span>
          <span className="dk-compass__needle" style={{ transform: `rotate(${dir ?? 0}deg)`, opacity: dir === null ? 0.2 : 1 }} aria-hidden="true" />
        </div>
        <div className="dk-stats dk-stats--tight">
          <Num label="Wind" value={finiteOrNull(current.wind_speed_10m)} unit="km/h" digits={1} />
          <Num label="Temp" value={finiteOrNull(current.temperature_2m)} unit="°C" digits={1} />
          <Num label="Humidity" value={finiteOrNull(current.relative_humidity_2m)} unit="%" />
          <Num label="Pressure" value={finiteOrNull(current.pressure_msl)} unit="hPa" />
        </div>
      </div>
    </DeckCard>
  );
}

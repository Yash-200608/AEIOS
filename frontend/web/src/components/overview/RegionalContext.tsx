import { EmptyState, Readout, SourceLabel } from '../../design/primitives';
import { aqiCategory } from './model';

export type WeatherNow = {
  temp: string | null; humidity: string | null; wind: string | null; windDir: string; pressure: string | null; uv: string | null;
};

export default function RegionalContext({ weather, aqi, aqPm25, aqWarning, aqAvailable }: {
  weather: WeatherNow; aqi: number | null; aqPm25: string | null; aqWarning: string; aqAvailable: boolean;
}) {
  const category = aqiCategory(aqi);
  return (
    <section className="cc-region" aria-labelledby="cc-region-h">
      <div className="ax-eyebrow">Regional context</div>
      <h2 id="cc-region-h" className="cc-h2">Model estimates for the area, not measured on site</h2>
      <div className="cc-region__cols">
        <div>
          <SourceLabel kind="regional" detail="Open-Meteo weather model" />
          <div className="cc-region__grid">
            <Readout label="Temperature" value={weather.temp} unit="°C" missing="Model value unavailable." />
            <Readout label="Humidity" value={weather.humidity} unit="%" missing="Model value unavailable." />
            <Readout label="Wind, 10 m" value={weather.wind} unit="m/s" note={weather.windDir || undefined} missing="Model value unavailable." />
            <Readout label="Pressure" value={weather.pressure} unit="hPa" missing="Model value unavailable." />
            <Readout label="UV index" value={weather.uv} missing="Model value unavailable." />
          </div>
        </div>
        <div>
          <SourceLabel kind="regional" detail="CAMS · ~45 km grid · 3-hourly" />
          {aqAvailable ? (
            <div className="cc-region__grid">
              <Readout label="US AQI (modelled)" value={aqi === null ? null : Math.round(aqi)} note={category ?? undefined} missing="Model value unavailable." />
              <Readout label="PM2.5 (modelled)" value={aqPm25} unit="µg/m³" note="Regional estimate; compare with the local station value above." missing="Model value unavailable." />
            </div>
          ) : (
            <div style={{ marginTop: 'var(--aeios-space-3)' }}><EmptyState kind="unavailable" title="Regional air-quality model unavailable">{aqWarning || 'The CAMS feed did not return data.'}</EmptyState></div>
          )}
          {aqWarning && aqAvailable && <p className="cc-caveat">{aqWarning}</p>}
        </div>
      </div>
    </section>
  );
}

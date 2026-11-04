import { useState } from 'react';
import { AlertTriangle, Zap } from 'lucide-react';
import WeatherScene, { layerNorms, type SceneWeather } from '../components/WeatherScene';
import { RevealOnScroll } from '../motion/scroll';
import { formatDay, formatHour, numeric, round } from '../lib/api';
import { Hero, SectionTitle, ViewRoot, hourlyAt, na, numOrNull, type Hourly } from './shared';

type Layer = SceneWeather['layer'];

const LAYERS = [{ value: 'wind', label: 'Wind' }, { value: 'cloud', label: 'Cloud' }, { value: 'temperature', label: 'Thermal' }, { value: 'rain', label: 'Rain' }] as const;

/*
 * Schematic altitude labels for the 3D scene: the scene's own normalised layer heights (layerNorms), nudged apart only as
 * far as needed so labels never overlap (min gap 13 % of the label column). Not a projection of the orbiting camera.
 */
function altitudeLabelPositions(norms: number[]): number[] {
  const gap = 0.13;
  const order = norms.map((n, i) => i).sort((a, b) => norms[a] - norms[b]);
  const pos = norms.slice();
  order.forEach((idx, k) => { if (k > 0) pos[idx] = Math.max(pos[idx], pos[order[k - 1]] + gap); });
  for (let k = order.length - 1; k >= 0; k -= 1) {
    const ceiling = k === order.length - 1 ? 1 : pos[order[k + 1]] - gap;
    pos[order[k]] = Math.max(0, Math.min(pos[order[k]], ceiling));
  }
  return pos;
}

type Props = {
  siteTitle: string;
  current: Record<string, any>;
  hourly: Hourly;
  selectedHour: number;
  selectedTime: string;
  onSelectHour: (index: number) => void;
  simulation: any;
  onClearSimulation: () => void;
  layer: Layer;
  onLayer: (layer: Layer) => void;
  paused: boolean;
  onTogglePaused: () => void;
};

export default function AtmosphereView({ siteTitle, current, hourly, selectedHour, selectedTime, onSelectHour, simulation, onClearSimulation, layer, onLayer, paused, onTogglePaused }: Props) {
  const [sceneReset, setSceneReset] = useState(0);

  const sceneRow = simulation?.timeline?.[Math.min(selectedHour, (simulation.timeline.length || 1) - 1)];
  // Missing model values stay null (shown as "n/a", hidden in the scene); the only fallback is the current-conditions value.
  const getValue = (key: string, fallback: number | null = null): number | null => (sceneRow && sceneRow[key] != null
    ? numOrNull(sceneRow[key]) : hourlyAt(hourly, key, selectedHour)) ?? fallback;
  // Nominal heights only place a pressure level in the scene when the model returns no geopotential height.
  const pressureLayer = (hPa: number, nominal: number) => {
    const geopotential = hourlyAt(hourly, `geopotential_height_${hPa}hPa`, selectedHour);
    return {
      label: `${hPa} hPa`, speed: getValue(`wind_speed_${hPa}hPa`), direction: getValue(`wind_direction_${hPa}hPa`),
      altitude: geopotential ?? nominal, geopotential,
      temperature: getValue(`temperature_${hPa}hPa`), humidity: getValue(`relative_humidity_${hPa}hPa`), cloud: getValue(`cloud_cover_${hPa}hPa`),
    };
  };

  const sceneWeather: SceneWeather = {
    windSpeed: getValue('wind_speed_10m', numOrNull(current.wind_speed_10m)),
    windDirection: getValue('wind_direction_10m', numOrNull(current.wind_direction_10m)),
    gust: getValue('wind_gusts_10m', numOrNull(current.wind_gusts_10m)),
    temperature: getValue('temperature_2m', numOrNull(current.temperature_2m)),
    cloudCover: getValue('cloud_cover', numOrNull(current.cloud_cover)),
    cloudLow: getValue('cloud_cover_low'),
    cloudMid: getValue('cloud_cover_mid'),
    cloudHigh: getValue('cloud_cover_high'),
    precipitation: getValue('precipitation', numOrNull(current.precipitation)),
    layer,
    scenarioActive: Boolean(sceneRow?.scenario_active),
    dustLoading: numeric(sceneRow?.dust_scenario_index, 0), // no scenario row = no dust overlay
    windLayers: [
      { label: '10 m AGL', speed: getValue('wind_speed_10m'), direction: getValue('wind_direction_10m'), altitude: 10,
        temperature: getValue('temperature_2m'), humidity: getValue('relative_humidity_2m'), cloud: getValue('cloud_cover') },
      { label: '80 m AGL', speed: getValue('wind_speed_80m'), direction: getValue('wind_direction_80m'), altitude: 80,
        temperature: getValue('temperature_80m') },
      pressureLayer(950, 500),
      pressureLayer(925, 800),
      pressureLayer(850, 1500),
      pressureLayer(700, 3000),
      pressureLayer(500, 5600),
    ],
  };
  const altitudeLabelPos = altitudeLabelPositions(layerNorms(sceneWeather.windLayers));

  return (
    <ViewRoot id="atmosphere" className="page-section">
      <Hero id="atmosphere" />
      <SectionTitle kicker="ATMOSPHERIC FIELD VISUALIZATION" title="3D weather environment" right={<div className="model-status"><span className="status-led" /> REGIONAL MODEL FIELD</div>} />
      <RevealOnScroll>
        <div className="atmosphere-card">
          <div className="atmosphere-head">
            <div><div className="panel-title">Atmospheric volume · {siteTitle}</div><div className="panel-subtitle">Wind vectors, cloud layers and surface conditions · forecast-derived</div></div>
            <div className="layer-switcher" role="group" aria-label="Atmospheric layer">
              {LAYERS.map((item) => <button key={item.value} onClick={() => onLayer(item.value)} className={layer === item.value ? 'selected' : ''}>{item.label}</button>)}
            </div>
          </div>
          <div className="scene-frame">
            <WeatherScene weather={sceneWeather} paused={paused} resetSignal={sceneReset} />
            <div className="scene-tag scene-tag-top"><span className="status-led" /> 3D MODEL VIEW · {simulation ? 'SCENARIO OVERLAY' : 'FORECAST FIELD'}</div>
            <div className="scene-tag scene-tag-bottom"><span className="scene-key"><i className="key-wind" /> WIND PARTICLES</span><span className="scene-key"><i className="key-cloud" /> CLOUD LAYERS</span><span className="scene-key"><i className="key-site" /> STATION SITES</span><span className="scene-gesture">DRAG / SWIPE TO ROTATE · SCROLL / PINCH TO ZOOM</span></div>
            <div style={{ position: 'absolute', right: 12, top: 44, zIndex: 3, display: 'flex', gap: 8 }}><button className="scene-reset" style={{ position: 'static' }} aria-pressed={paused} aria-label={paused ? 'Resume 3D scene' : 'Pause 3D scene'} onClick={onTogglePaused}>{paused ? 'Resume' : 'Pause'}</button><button className="scene-reset" style={{ position: 'static' }} onClick={() => setSceneReset((n) => n + 1)}>Reset view</button></div>
            <div className="scene-altitude" aria-hidden="true"><span className="scene-altitude-note">SCHEMATIC HEIGHTS</span><ol>{sceneWeather.windLayers.map((l, i) => <li key={l.label} className={l.speed == null || l.direction == null ? 'missing' : undefined} style={{ bottom: `${altitudeLabelPos[i] * 100}%` }}>{l.label}{l.speed == null || l.direction == null ? ' · n/a' : ''}</li>)}</ol></div>
          </div>
          <div className="scene-controls">
            <div className="timeline-label"><b>{selectedTime ? formatDay(selectedTime.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' }) : 'Forecast'}</b><span>{formatHour(selectedTime)}</span></div>
            <input aria-label="Forecast hour" type="range" min={0} max={Math.min(71, Math.max(0, (hourly.time?.length || 1) - 1))} value={selectedHour} onChange={(e) => onSelectHour(Number(e.target.value))} />
            <div className="timeline-actions"><span>+0h</span><span>+24h</span><span>+48h</span><span>+72h</span><button onClick={onClearSimulation} disabled={!simulation}>Clear scenario</button></div>
          </div>
          {simulation && <div className="scenario-active-note"><Zap size={14} /> Scenario overlay active: {simulation.scenario_label}. These are controlled perturbations, not forecast updates. <button onClick={onClearSimulation}>Return to model</button></div>}
          <div className="profile-heading"><b>VERTICAL WIND PROFILE</b><span>m AGL = metres above ground level. hPa = air-pressure level, not a height; its geopotential height is the model's height for that pressure surface.</span></div>
          <div className="vertical-profile-grid">
            {sceneWeather.windLayers.map((windLayer) => <div key={windLayer.label}><span>{windLayer.label.toUpperCase()}</span><b>{na(windLayer.speed, 1)}{windLayer.speed != null && <> <small>m/s</small></>}</b><em>{na(windLayer.temperature, 1)}{windLayer.temperature != null ? '°C' : ''} · {na(windLayer.humidity)}{windLayer.humidity != null ? '%' : ''} RH</em>{windLayer.label.includes('hPa') && <em>Geopotential {windLayer.geopotential != null ? `${round(windLayer.geopotential)} m` : 'n/a'}</em>}</div>)}
          </div>
          <div className="visualization-disclaimer"><AlertTriangle size={13} /> 3D view uses forecast wind vectors at near-surface heights and 950–500 hPa pressure levels, cloud-layer coverage and precipitation. Pressure-level heights vary with weather; geopotential height is used when returned. This is a model-field visualization, not a CFD solver, radar or direct upper-air sounding.</div>
        </div>
      </RevealOnScroll>
    </ViewRoot>
  );
}

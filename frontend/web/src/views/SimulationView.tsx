import { useMemo } from 'react';
import { AlertTriangle, Layers3, Play, ShieldCheck, Zap } from 'lucide-react';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { RevealOnScroll } from '../motion/scroll';
import { formatHour, numeric, round } from '../lib/api';
import { CHART_TOOLTIP_STYLE, Hero, SectionTitle, ViewRoot, type LoadState } from './shared';

export const SCENARIOS = [
  { value: 'dust_event', label: 'Dust / particulate episode', note: 'Elevated dust response and dry-air conditions' },
  { value: 'heat_stress', label: 'Heat stress episode', note: 'Temperature increase and humidity reduction' },
  { value: 'convective_storm', label: 'Convective storm', note: 'Cloud build-up, rainfall and gust response' },
  { value: 'gust_front', label: 'Gust front', note: 'Rapid wind speed increase and direction shift' },
  { value: 'baseline', label: 'Baseline replay', note: 'Replay the weather-model baseline without perturbation' },
];

/** The scenario result panel; runSimulation scrolls it into view so the response is visible on every screen width. */
export const SIMULATION_OUTPUT_ID = 'simulation-output';

type Props = {
  scenario: string; onScenario: (value: string) => void;
  intensity: number; onIntensity: (value: number) => void;
  duration: number; onDuration: (value: number) => void;
  start: number; onStart: (value: number) => void;
  busy: boolean; error: string; loadState: LoadState;
  simulation: any; onRun: () => void;
};

export default function SimulationView({ scenario, onScenario, intensity, onIntensity, duration, onDuration, start, onStart, busy, error, loadState, simulation, onRun }: Props) {
  const simulationMetric = useMemo(() => {
    if (!simulation) return null;
    const first = simulation.timeline?.find((row: any) => row.scenario_active) || simulation.timeline?.[0];
    if (simulation.scenario === 'dust_event') {
      if (first?.baseline_pm2_5 != null) return { key: 'pm2_5', baseline: 'baseline_pm2_5', label: 'PM2.5 concentration · illustrative scenario', unit: 'µg/m³' };
      return { key: 'dust_scenario_index', baseline: null, label: 'Dust scenario intensity · unitless', unit: 'index' };
    }
    if (simulation.scenario === 'convective_storm') return { key: 'precipitation', baseline: 'baseline_precipitation', label: 'Hourly precipitation response', unit: 'mm' };
    if (simulation.scenario === 'gust_front') return { key: 'wind_speed_10m', baseline: 'baseline_wind_speed_10m', label: '10 m wind response', unit: 'm/s' };
    return { key: 'temperature_2m', baseline: 'baseline_temperature_2m', label: '2 m temperature response', unit: '°C' };
  }, [simulation]);
  const simulationPeak = useMemo(() => {
    if (!simulation || !simulationMetric) return null;
    const values = simulation.timeline.map((row: any) => numeric(row[simulationMetric.key], 0));
    return values.length ? Math.max(...values) : null;
  }, [simulation, simulationMetric]);

  return (
    <ViewRoot id="simulation" className="page-section">
      <Hero id="simulation" />
      <SectionTitle kicker="DIGITAL TWIN · WHAT-IF ANALYSIS" title="Weather scenario laboratory" right={<span className="simulation-badge"><Zap size={12} /> SIMULATION ONLY</span>} />
      <div className="sim-banner" role="note"><Zap size={14} /> <b>Simulation only.</b> A deterministic what-if perturbation. It is not a new observation or a validated forecast, and it never changes official forecast data, sensor observations or trained-model predictions.</div>
      <RevealOnScroll className="simulation-layout">
        <div className="panel simulation-controls">
          <div className="panel-title">Configure an event</div><div className="panel-subtitle">Perturb the numerical forecast baseline to explore environmental response.</div>
          <label className="field-label" htmlFor="scenario-select">SCENARIO TYPE</label>
          <select id="scenario-select" value={scenario} onChange={(e) => onScenario(e.target.value)}>{SCENARIOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <div className="field-description">{SCENARIOS.find((s) => s.value === scenario)?.note}</div>
          <div className="range-field"><div><label htmlFor="intensity-range">EVENT INTENSITY</label><b>{Math.round(intensity * 100)}%</b></div><input id="intensity-range" type="range" min="10" max="100" value={Math.round(intensity * 100)} onChange={(e) => onIntensity(Number(e.target.value) / 100)} /></div>
          <div className="range-field"><div><label htmlFor="duration-range">EVENT DURATION</label><b>{duration} hours</b></div><input id="duration-range" type="range" min="1" max="24" value={duration} onChange={(e) => onDuration(Number(e.target.value))} /></div>
          <div className="range-field"><div><label htmlFor="start-range">START AFTER</label><b>{start} hours</b></div><input id="start-range" type="range" min="0" max="48" value={start} onChange={(e) => onStart(Number(e.target.value))} /></div>
          <button className="primary-button" onClick={onRun} disabled={busy || loadState !== 'ready'}><Play size={15} fill="currentColor" /> {busy ? 'Running scenario…' : 'Run scenario simulation'}</button>
          {error && <div className="error-text">{error}</div>}
          <div className="simulation-method"><ShieldCheck size={14} /><span>Deterministic scenario perturbation. Does not alter official forecast data, sensor observations or trained-model predictions.</span></div>
        </div>
        <div id={SIMULATION_OUTPUT_ID} className="panel simulation-output">
          <div className="panel-header"><div><div className="panel-title">Scenario response · simulated</div><div className="panel-subtitle">Model baseline vs perturbed scenario · not an official forecast</div></div>{simulation && <span className="simulation-badge">RESULT GENERATED</span>}</div>
          {simulation ? <>
            <div className="simulation-result-head"><div><span>ACTIVE SCENARIO</span><b>{simulation.scenario_label}</b></div><div><span>EVENT WINDOW</span><b>{simulation.duration_hours} h · +{simulation.start_hour} h</b></div><div><span>PEAK {simulationMetric?.unit?.toUpperCase()}</span><b>{simulationPeak == null ? '—' : round(simulationPeak, 1)}</b></div></div>
            <div className="sim-metric-label">{simulationMetric?.label}</div>
            <div className="chart-wrap sim-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={simulation.timeline.slice(0, 36)} margin={{ top: 12, right: 8, left: -18, bottom: 2 }}><CartesianGrid stroke="#443753" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="time" tickFormatter={(v) => formatHour(v)} tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} interval={5} /><YAxis tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} /><ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} labelFormatter={(v) => String(v)} />{simulationMetric?.baseline && <Line dataKey={simulationMetric.baseline} name="Model baseline" stroke="#a797b9" strokeDasharray="4 4" dot={false} /> }<Line dataKey={simulationMetric?.key || 'temperature_2m'} name="Scenario" stroke="#eab16e" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div>
            <div className="simulation-method"><AlertTriangle size={14} /> {simulation.method} {simulation.pollution_note ? ` ${simulation.pollution_note}` : ''}</div>
          </> : <div className="simulation-empty"><div className="simulation-orbit"><Layers3 size={32} /></div><b>Not run yet</b><span>Choose an event, intensity, duration and start time, then press Run. You will see the simulated response against the model baseline, plus a peak value for the event window.</span><div className="scenario-pills"><span>DUST</span><span>HEAT</span><span>STORM</span><span>GUST FRONT</span></div></div>}
        </div>
      </RevealOnScroll>
    </ViewRoot>
  );
}

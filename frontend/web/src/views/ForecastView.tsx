import { useMemo } from 'react';
import { CloudRain } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { RevealOnScroll } from '../motion/scroll';
import { ventilation, VENTILATION_POOR } from '../lib/derived';
import { formatDay, formatHour, numeric, round, weatherLabel } from '../lib/api';
import { CHART_TOOLTIP_STYLE, Hero, SectionTitle, ViewRoot, WeatherGlyph, type Hourly } from './shared';

export const DAY_OPTIONS = [3, 4, 5, 7, 10, 15];

function buildDailyRows(daily: Record<string, any[]> | undefined, days: number) {
  if (!daily?.time) return [];
  return daily.time.slice(0, days).map((time, i) => ({
    date: String(time),
    label: formatDay(String(time)),
    max: numeric(daily.temperature_2m_max?.[i], 0),
    min: numeric(daily.temperature_2m_min?.[i], 0),
    rain: numeric(daily.precipitation_sum?.[i], 0),
    rainChance: numeric(daily.precipitation_probability_max?.[i], 0),
    wind: numeric(daily.wind_speed_10m_max?.[i], 0),
    gust: numeric(daily.wind_gusts_10m_max?.[i], 0),
    direction: numeric(daily.wind_direction_10m_dominant?.[i], 0),
    uv: numeric(daily.uv_index_max?.[i], 0),
    code: numeric(daily.weather_code?.[i], 3),
    sunrise: String(daily.sunrise?.[i] || ''),
    sunset: String(daily.sunset?.[i] || ''),
  }));
}

type Props = {
  daily: Record<string, any[]> | undefined;
  hourly: Hourly;
  days: number;
  onDays: (days: number) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSelectHour: (index: number) => void;
};

export default function ForecastView({ daily, hourly, days, onDays, selectedDate, onSelectDate, onSelectHour }: Props) {
  const dailyRows = useMemo(() => buildDailyRows(daily, days), [daily, days]);
  const dailyChart = dailyRows.map((d) => ({ date: d.label, max: d.max, min: d.min, rain: d.rain }));

  const next72 = useMemo(() => {
    const n = Math.min(72, hourly.time?.length || 0);
    const col = (k: string) => Array.from({ length: n }, (_, i) => numeric(hourly[k]?.[i], NaN)).filter(Number.isFinite);
    const t = col('temperature_2m'), ch = col('precipitation_probability'), w = col('wind_speed_10m');
    let poor = 0;
    for (let i = 0; i < n; i += 1) { const v = ventilation(hourly, i); if (v !== null && v < VENTILATION_POOR) poor += 1; }
    return {
      hours: n, poor,
      minT: t.length ? Math.round(Math.min(...t)) : '—', maxT: t.length ? Math.round(Math.max(...t)) : '—',
      rain: round(col('precipitation').reduce((a, b) => a + b, 0), 1), chance: ch.length ? Math.round(Math.max(...ch)) : '—',
      wind: w.length ? round(Math.max(...w), 1) : '—',
    };
  }, [hourly]);

  const hourlyChart = useMemo(() => {
    if (!hourly.time) return [];
    return hourly.time.map((time, i) => ({
      time: String(time),
      hour: formatHour(String(time)),
      temperature: numeric(hourly.temperature_2m?.[i], 0),
      feels: numeric(hourly.apparent_temperature?.[i], 0),
      rain: numeric(hourly.precipitation?.[i], 0),
      rainChance: numeric(hourly.precipitation_probability?.[i], 0),
      wind: numeric(hourly.wind_speed_10m?.[i], 0),
      gust: numeric(hourly.wind_gusts_10m?.[i], 0),
    })).filter((row) => !selectedDate || row.time.startsWith(selectedDate)).slice(0, 24);
  }, [hourly, selectedDate]);

  return (
    <ViewRoot id="forecast" className="page-section">
      <Hero id="forecast" />
      <SectionTitle kicker="NUMERICAL WEATHER PREDICTION" title="Extended forecast" right={<div className="range-switch">{DAY_OPTIONS.map((d) => <button key={d} onClick={() => onDays(d)} className={days === d ? 'active' : ''}>{d}d</button>)}</div>} />
      <RevealOnScroll>
        <div className="next72" aria-label="Next 72 hours summary">
          <div className="sp-label">NEXT 72 HOURS · REGIONAL MODEL</div>
          <div className="next72-grid">
            <div><span>Temperature</span><b>{next72.minT}–{next72.maxT}<small>°C</small></b></div>
            <div><span>Rain amount</span><b>{next72.rain}<small>mm</small></b></div>
            <div><span>Peak rain chance</span><b>{next72.chance}<small>%</small></b></div>
            <div><span>Peak wind</span><b>{next72.wind}<small>m/s</small></b></div>
            <div><span>Poor-dispersion hours</span><b>{next72.poor}<small>of {next72.hours} h</small></b></div>
          </div>
        </div>
      </RevealOnScroll>
      <RevealOnScroll className="forecast-layout">
        <div className="panel forecast-chart-panel">
          <div className="panel-header"><div><div className="panel-title">Temperature outlook</div><div className="panel-subtitle">Daily maximum and minimum · °C</div></div><span className="legend-inline"><i className="legend-max" /> High <i className="legend-min" /> Low</span></div>
          {dailyChart.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={dailyChart} margin={{ top: 12, right: 4, left: -20, bottom: 2 }}>
            <defs><linearGradient id="tempHigh" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e9ad69" stopOpacity={0.23} /><stop offset="100%" stopColor="#e9ad69" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="#443753" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} />
            <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Area dataKey="max" type="monotone" stroke="#efb36e" fill="url(#tempHigh)" strokeWidth={2.1} name="Maximum" />
            <Line dataKey="min" type="monotone" stroke="#00e5ff" strokeWidth={2} dot={false} name="Minimum" />
          </ComposedChart></ResponsiveContainer></div> : <div className="empty-chart">Waiting for forecast values…</div>}
        </div>
        <div className="panel precipitation-panel">
          <div className="panel-title">Rain chance vs amount</div><div className="panel-subtitle">Bars: highest chance of rain that day (%). This is not how much will fall; amounts are in the table below.</div>
          <div className="rain-bars">{dailyRows.slice(0, 8).map((d) => <div className="rain-bar-item" key={d.date}><div className="rain-bar-track"><div className="rain-bar-fill" style={{ height: `${Math.max(2, d.rainChance)}%` }} /></div><b>{Math.round(d.rainChance)}%</b><span>{d.date.slice(5).replace('-', '/')}</span></div>)}</div>
          <div className="rain-total"><CloudRain size={17} /><span>Forecast rainfall</span><b>{round(dailyRows.slice(0, 3).reduce((sum, d) => sum + d.rain, 0), 1)} mm</b><small>Next 72 hours · total amount, a different measure from chance</small></div>
        </div>
      </RevealOnScroll>
      <RevealOnScroll>
        <div className="panel hourly-panel">
          <div className="panel-header"><div><div className="panel-title">Hourly conditions</div><div className="panel-subtitle">{selectedDate ? formatDay(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Select a forecast day'} · 24-hour profile</div></div><div className="day-select">{dailyRows.slice(0, 5).map((d) => <button key={d.date} className={selectedDate === d.date ? 'active' : ''} onClick={() => onSelectDate(d.date)}>{formatDay(d.date, { weekday: 'short', day: 'numeric' })}</button>)}</div></div>
          {hourlyChart.length ? <div className="chart-wrap hourly-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={hourlyChart} margin={{ top: 10, right: 8, left: -20, bottom: 2 }}>
            <CartesianGrid stroke="#443753" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="hour" tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} interval={3} />
            <YAxis yAxisId="temp" tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', fill: '#b3a8c0', fontSize: 10, dx: 22 }} />
            <YAxis yAxisId="rain" orientation="right" domain={[0, 100]} tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Rain chance (%)', angle: 90, position: 'insideRight', fill: '#b3a8c0', fontSize: 10, dx: -22 }} />
            <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Area yAxisId="temp" dataKey="temperature" type="monotone" stroke="#eab16e" fill="#eab16e" fillOpacity={0.1} name="Temperature °C" />
            <Line yAxisId="temp" dataKey="feels" type="monotone" stroke="#00e5ff" strokeWidth={1.8} dot={false} name="Feels like °C" />
            <Line yAxisId="rain" dataKey="rainChance" type="monotone" stroke="#b889ed" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="Rain chance %" /><Legend verticalAlign="top" height={24} iconType="plainline" wrapperStyle={{ fontSize: 11, color: '#b3a8c0' }} />
          </ComposedChart></ResponsiveContainer></div> : <div className="empty-chart">Hourly profile unavailable.</div>}
        </div>
      </RevealOnScroll>
      <RevealOnScroll>
        <div className="panel outlook-panel">
          <div className="panel-header"><div><div className="panel-title">{days}-day weather outlook</div><div className="panel-subtitle">Regional numerical model · daily summary</div></div><span className="source-badge">OPEN-METEO MODEL</span></div>
          <div className="outlook-table-wrap"><table className="outlook-table"><thead><tr><th>DAY</th><th>CONDITIONS</th><th>TEMP RANGE</th><th>RAIN CHANCE</th><th>RAIN</th><th>WIND MAX</th><th>UV MAX</th></tr></thead><tbody>
            {dailyRows.map((d, i) => <tr key={d.date} className={selectedDate === d.date ? 'selected-row' : ''} onClick={() => { onSelectDate(d.date); const idx = (hourly.time || []).findIndex((t: string) => t.startsWith(d.date)); if (idx >= 0) onSelectHour(idx); }}>
              <td><b>{i === 0 ? 'Today' : d.label}</b><small>{d.date}</small></td><td><span className="condition-cell"><WeatherGlyph code={d.code} size={17} /> {weatherLabel(d.code)}</span></td><td><b>{Math.round(d.max)}°</b><span className="muted-temp"> / {Math.round(d.min)}°</span></td><td>{Math.round(d.rainChance)}%</td><td>{d.rain.toFixed(1)} mm</td><td>{d.wind.toFixed(1)} m/s</td><td>{d.uv.toFixed(1)}</td>
            </tr>)}
          </tbody></table></div>
          <div className="table-footnote">Weather forecast available up to 16 days. Daily model values are estimates and can change as forecast runs update.</div>
        </div>
      </RevealOnScroll>
    </ViewRoot>
  );
}

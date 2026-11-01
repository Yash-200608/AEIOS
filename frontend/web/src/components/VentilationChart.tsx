import type { ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './overview/overview.css';
import { ChartFrame, EmptyState } from '../design/primitives';
import { inversionHours, outlookSummary } from './overview/model';

export type VentilationRow = { time: string; vc: number | null; inv: number | null };

/**
 * The one canonical 48-hour ventilation and inversion chart. It lives in the Pollution dispersion section; the Overview
 * shows a short summary and links here instead of drawing the same series a second time.
 * Regional weather-model data only (Open-Meteo), never an AEIOS sensor measurement.
 */
export default function VentilationChart({ rows, poorAt, loadState = 'ready', footer }: {
  rows: VentilationRow[]; poorAt: number; loadState?: 'loading' | 'ready' | 'error'; footer?: ReactNode;
}) {
  const summary = outlookSummary(rows.map((r) => r.vc), poorAt);
  const invHours = inversionHours(rows.map((r) => r.inv));
  const data = rows.map((r) => ({ time: r.time, vc: r.vc === null ? null : Math.round(r.vc), inv: r.inv === null ? null : Math.round(r.inv * 10) / 10 }));
  const takeaway = summary.valid === 0 ? summary.takeaway : `${summary.takeaway} ${invHours} of ${summary.hours} hours show a surface inversion.`;
  return (
    <div className="cc cc-embed">
      <section className="cc-panel" aria-labelledby="cc-vent-h">
        <div className="cc-head"><div><div className="ax-eyebrow">Regional weather model</div><h3 id="cc-vent-h" className="cc-h2">Next 48 hours</h3></div></div>
        {loadState !== 'ready' || summary.valid === 0 ? (
          <EmptyState kind={loadState === 'loading' ? 'loading' : 'unavailable'} title={loadState === 'loading' ? 'Loading the outlook' : loadState === 'error' ? 'Outlook unavailable' : 'No outlook available'}>
            {loadState === 'loading' ? 'Waiting for the regional weather model.' : loadState === 'error' ? 'The weather model feed is unavailable, so there is no outlook to show.' : 'The regional weather model returned no ventilation values for this site.'}
          </EmptyState>
        ) : (
          <ChartFrame
            title="Ventilation coefficient and surface inversion" takeaway={takeaway} units="ventilation m²/s (lower is worse) · inversion °C" source="regional"
            legend={[
              { label: 'Ventilation, left axis (solid)', color: 'var(--aeios-source-regional)' },
              { label: 'Inversion, right axis (dashed)', color: 'var(--aeios-text-secondary)', dash: '6 4' },
              { label: `Poor-dispersion threshold ${poorAt.toLocaleString('en-IN')} (dotted)`, color: 'var(--aeios-status-warning)', dash: '2 4' },
            ]}
            table={{
              columns: ['Time (IST)', 'Ventilation (m²/s)', 'Inversion (°C)'],
              rows: data.map((r) => [r.time, r.vc === null ? 'not available' : r.vc.toLocaleString('en-IN'), r.inv === null ? 'not available' : `${r.inv > 0 ? '+' : ''}${r.inv}`]),
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} accessibilityLayer>
                <CartesianGrid stroke="var(--aeios-border-subtle)" vertical={false} />
                <XAxis dataKey="time" stroke="var(--aeios-border-strong)" tickLine={false} interval={5} />
                <YAxis yAxisId="vc" stroke="var(--aeios-border-strong)" tickLine={false} width={52} tickFormatter={(v) => `${Math.round(v / 1000)}k`} label={{ value: 'Ventilation (m²/s)', angle: -90, position: 'insideLeft', style: { fill: 'var(--aeios-text-secondary)', fontSize: 12 } }} />
                <YAxis yAxisId="inv" orientation="right" stroke="var(--aeios-border-strong)" tickLine={false} width={48} label={{ value: 'Inversion (°C)', angle: 90, position: 'insideRight', style: { fill: 'var(--aeios-text-secondary)', fontSize: 12 } }} />
                <ReferenceLine yAxisId="vc" y={poorAt} stroke="var(--aeios-status-warning)" strokeDasharray="2 4" label={{ value: 'poor below', position: 'insideTopRight', style: { fill: 'var(--aeios-status-warning)', fontSize: 12 } }} />
                <ReferenceLine yAxisId="inv" y={0} stroke="var(--aeios-border-strong)" />
                <Tooltip
                  contentStyle={{ background: 'var(--aeios-surface-3)', border: '1px solid var(--aeios-border-strong)', borderRadius: 10, color: 'var(--aeios-text-primary)' }}
                  labelStyle={{ color: 'var(--aeios-text-secondary)' }}
                  formatter={(v: number, name: string) => (name === 'Inversion' ? [`${v > 0 ? '+' : ''}${v} °C`, 'Inversion (regional model)'] : [`${v.toLocaleString('en-IN')} m²/s`, 'Ventilation (regional model)'])}
                />
                <Line yAxisId="vc" dataKey="vc" name="Ventilation" type="monotone" stroke="var(--aeios-source-regional)" strokeWidth={2.5} dot={false} connectNulls={false} />
                <Line yAxisId="inv" dataKey="inv" name="Inversion" type="monotone" stroke="var(--aeios-text-secondary)" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}
        {footer}
      </section>
    </div>
  );
}

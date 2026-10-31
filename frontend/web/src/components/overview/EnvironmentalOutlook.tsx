import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartFrame, EmptyState } from '../../design/primitives';
import { outlookSummary } from './model';

export type OutlookRow = { time: string; vc: number | null };

export default function EnvironmentalOutlook({ rows, poorAt, loadState }: { rows: OutlookRow[]; poorAt: number; loadState: 'loading' | 'ready' | 'error' }) {
  const summary = outlookSummary(rows.map((r) => r.vc), poorAt);
  const data = rows.map((r) => ({ time: r.time, vc: r.vc === null ? null : Math.round(r.vc) }));
  return (
    <section className="cc-panel" aria-labelledby="cc-outlook-h">
      <div className="cc-head"><div><div className="ax-eyebrow">Outlook · next 48 hours</div><h2 id="cc-outlook-h" className="cc-h2">Ventilation outlook</h2></div></div>
      {loadState !== 'ready' || summary.valid === 0 ? (
        <EmptyState kind={loadState === 'loading' ? 'loading' : 'unavailable'} title={loadState === 'loading' ? 'Loading the outlook' : loadState === 'error' ? 'Outlook unavailable' : 'No outlook available'}>
          {loadState === 'loading' ? 'Waiting for the regional weather model.' : loadState === 'error' ? 'The weather model feed is unavailable, so there is no outlook to show.' : 'The regional weather model returned no ventilation values for this site.'}
        </EmptyState>
      ) : (
        <ChartFrame
          title="Ventilation coefficient" takeaway={summary.takeaway} units="m²/s (lower is worse)" source="regional"
          legend={[{ label: 'Ventilation (solid)', color: 'var(--aeios-source-regional)' }, { label: `Poor threshold ${poorAt.toLocaleString('en-IN')} (dashed)`, color: 'var(--aeios-status-warning)', dash: '4 4' }]}
          table={{ columns: ['Time (IST)', 'Ventilation (m²/s)'], rows: rows.map((r) => [r.time, r.vc === null ? 'not available' : Math.round(r.vc).toLocaleString('en-IN')]) }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }} accessibilityLayer>
              <CartesianGrid stroke="var(--aeios-border-subtle)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--aeios-border-strong)" tickLine={false} interval={5} />
              <YAxis stroke="var(--aeios-border-strong)" tickLine={false} width={52} tickFormatter={(v) => `${Math.round(v / 1000)}k`} label={{ value: 'm²/s', angle: -90, position: 'insideLeft', style: { fill: 'var(--aeios-text-secondary)', fontSize: 12 } }} />
              <ReferenceLine y={poorAt} stroke="var(--aeios-status-warning)" strokeDasharray="4 4" label={{ value: 'poor below', position: 'insideTopRight', style: { fill: 'var(--aeios-status-warning)', fontSize: 12 } }} />
              <Tooltip contentStyle={{ background: 'var(--aeios-surface-3)', border: '1px solid var(--aeios-border-strong)', borderRadius: 10, color: 'var(--aeios-text-primary)' }} labelStyle={{ color: 'var(--aeios-text-secondary)' }} formatter={(v: number) => [`${v.toLocaleString('en-IN')} m²/s`, 'Ventilation (regional model)']} />
              <Line dataKey="vc" name="Ventilation" type="monotone" stroke="var(--aeios-source-regional)" strokeWidth={2.5} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}
    </section>
  );
}

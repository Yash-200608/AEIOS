import { EmptyState, SourceLabel } from '../../design/primitives';
import { localSlot } from './format';
import { inversionHours, outlookSummary, ribbonCells, ventilationWindows } from './model';

/**
 * A categorical 48-hour summary: for each hour, is ventilation adequate or poor, and is there an inversion?
 * It answers "when could the air clear?" and links to the one canonical chart; it does not re-plot the values.
 */
export default function OutlookRibbon({ rows, poorAt, loadState, onNavigate }: {
  rows: Array<{ time: string; vc: number | null; inv: number | null }>; poorAt: number; loadState: 'loading' | 'ready' | 'error';
  onNavigate: (id: string) => void;
}) {
  const cells = ribbonCells(rows, poorAt);
  const summary = outlookSummary(rows.map((r) => r.vc), poorAt);
  const invHours = inversionHours(rows.map((r) => r.inv));
  const windows = ventilationWindows(cells);
  const limit = poorAt.toLocaleString('en-IN');
  return (
    <section className="cc-panel cc-outlook" aria-labelledby="cc-outlook-h" aria-busy={loadState === 'loading'}>
      <div className="cc-head">
        <div><div className="ax-eyebrow">Outlook · next 48 hours</div><h2 id="cc-outlook-h" className="cc-h2">When could the air clear?</h2></div>
        <div className="cc-aside"><SourceLabel kind="regional" detail="Open-Meteo" /></div>
      </div>
      {loadState !== 'ready' || summary.valid === 0 ? (
        <EmptyState kind={loadState === 'loading' ? 'loading' : 'unavailable'} title={loadState === 'loading' ? 'Loading the outlook' : loadState === 'error' ? 'Outlook unavailable' : 'No outlook available'}>
          {loadState === 'loading' ? 'Waiting for the regional weather model.' : loadState === 'error' ? 'The weather model feed is unavailable, so there is no outlook to show.' : 'The regional weather model returned no ventilation values for this site.'}
        </EmptyState>
      ) : (
        <>
          <p className="cc-outlook__takeaway">{summary.takeaway}</p>
          <div className="cc-ribbon" role="img" aria-label={`Hourly ventilation for the next ${cells.length} hours: ${summary.poor} poor, ${summary.valid - summary.poor} adequate, ${cells.length - summary.valid} unknown; ${invHours} hours with an inversion.`}>
            {cells.map((c, i) => (
              <span key={i} className={`cc-ribbon__cell is-${c.state} ${c.inversion ? 'has-inv' : ''}`} title={`${localSlot(c.time)} · ${c.state}${c.inversion ? ' · inversion' : ''}`} />
            ))}
          </div>
          <div className="cc-ribbon__axis" aria-hidden="true">
            {cells.map((c, i) => (i % 12 === 0 ? <span key={i} style={{ left: `${(i / cells.length) * 100}%` }}>{localSlot(c.time)}</span> : null))}
          </div>
          <ul className="cc-ribbon__key" aria-label="Key">
            <li><i className="is-adequate" aria-hidden="true" /> Adequate, ≥ {limit} m²/s</li>
            <li><i className="is-poor" aria-hidden="true" /> Poor, &lt; {limit} m²/s (hatched)</li>
            <li><i className="has-inv-key" aria-hidden="true" /> Inversion that hour ({invHours} h)</li>
            {cells.some((c) => c.state === 'unknown') && <li><i className="is-unknown" aria-hidden="true" /> No model value</li>}
          </ul>
          <p className="cc-outlook__windows">
            {windows.length === 0
              ? `No hour reaches adequate ventilation in the next ${cells.length} hours.`
              : <>Adequate ventilation: {windows.map((w, i) => <span key={i} className="ax-mono">{i > 0 ? '; ' : ''}{localSlot(w.from)}{w.hours > 1 ? `–${localSlot(w.to)}` : ''} ({w.hours} h)</span>)}.</>}
          </p>
          <a className="cc-link" href="#dispersion" onClick={(e) => { e.preventDefault(); onNavigate('dispersion'); }}>See the values in the 48-hour chart</a>
        </>
      )}
    </section>
  );
}

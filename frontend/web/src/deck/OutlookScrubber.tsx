import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { localSlot } from '../components/overview/format';
import { SourceLabel } from '../design/primitives';
import { scrubIndex } from './scrub';

const W = 1000;
const H = 84;
const STEP_MS = 600;

/*
 * The 48-hour ventilation outlook with a draggable scrubber. `rows` is a fixed window (it does not slide when an hour is
 * picked); `selected` and `onSelect` are indexes into it. With no hours (the weather load failed) it renders disabled and
 * never calls onSelect. The line is the regional model's ventilation coefficient with the "poor" limit drawn across it.
 */
export default function OutlookScrubber({ rows, poorAt, selected, disabled, onSelect }: {
  rows: Array<{ time: string; vc: number | null }>; poorAt: number; selected: number | null; disabled: boolean; onSelect: (i: number) => void;
}) {
  const off = disabled || rows.length === 0;
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [drag, setDrag] = useState(false);
  const last = rows.length - 1;
  const at = selected === null ? 0 : Math.min(Math.max(selected, 0), Math.max(last, 0));
  const atRef = useRef(at);
  atRef.current = at;

  const { line, area, limitY } = useMemo(() => {
    const vals = rows.map((r) => r.vc).filter((v): v is number => v !== null && Number.isFinite(v));
    const top = Math.max(poorAt * 1.6, ...vals, 1);
    const y = (v: number) => H - (Math.min(v, top) / top) * (H - 6) - 2;
    const x = (i: number) => (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * W);
    const runs: Array<Array<[number, number]>> = [];
    let open = false;
    rows.forEach((r, i) => {
      if (r.vc === null || !Number.isFinite(r.vc)) { open = false; return; }
      if (!open) { runs.push([]); open = true; }
      runs[runs.length - 1].push([x(i), y(r.vc)]);
    });
    const pt = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const l = runs.map((run) => `M${run.map(pt).join(' L')}`).join(' ');
    // Each run of hours with data is closed down to the baseline on its own, so a gap in the data is a gap in the fill.
    const a = runs.map((run) => `M${run[0][0].toFixed(1)} ${H} L${run.map(pt).join(' L')} L${run[run.length - 1][0].toFixed(1)} ${H} Z`).join(' ');
    return { line: l, area: a, limitY: y(poorAt) };
  }, [rows, poorAt]);

  const pick = (clientX: number) => {
    const el = track.current;
    if (!el || off) return;
    const r = el.getBoundingClientRect();
    const i = scrubIndex(clientX - r.left, r.width, rows.length);
    if (i !== null) onSelect(i);
  };
  const onDown = (e: PointerEvent) => {
    if (off) return;
    setPlaying(false);
    setDrag(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pick(e.clientX);
  };
  const onKey = (e: KeyboardEvent) => {
    if (off) return;
    const cur = atRef.current; // the latest index, so a held key (many events before the next render) keeps moving
    const to = e.key === 'ArrowRight' ? cur + 1 : e.key === 'ArrowLeft' ? cur - 1 : e.key === 'PageUp' ? cur + 6 : e.key === 'PageDown' ? cur - 6 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (to === null) return;
    e.preventDefault();
    setPlaying(false);
    const next = Math.min(Math.max(to, 0), last);
    atRef.current = next;
    onSelect(next);
  };

  // Play: one hour per STEP_MS, stops at the end, in a hidden tab, and when the data goes away.
  useEffect(() => {
    if (!playing || off) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      if (atRef.current >= last) { setPlaying(false); return; }
      onSelect(atRef.current + 1);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, off, last, onSelect]);
  useEffect(() => { if (off) setPlaying(false); }, [off]);

  const label = rows[at] ? localSlot(rows[at].time) : '—';
  const vcNow = rows[at]?.vc ?? null;
  const valueText = vcNow === null ? label : `${label}, ventilation ${Math.round(vcNow).toLocaleString('en-IN')} m²/s, ${vcNow < poorAt ? 'below' : 'at or above'} the poor limit`;
  const pct = rows.length <= 1 ? 0 : (at / (rows.length - 1)) * 100;
  return (
    <div className="dk-scrub" data-disabled={off ? 'true' : undefined}>
      <div className="dk-scrub__head">
        <span className="dk-scrub__title">Ventilation outlook · next {rows.length || 48} h</span>
        <SourceLabel kind="regional" detail="Open-Meteo" />
        <span className="dk-scrub__hour ax-mono" aria-live="off">{label}</span>
      </div>
      <div className="dk-scrub__row">
        <button type="button" className="dk-scrub__btn" aria-label="Previous hour" disabled={off || at <= 0} onClick={() => { setPlaying(false); onSelect(at - 1); }}><ChevronLeft size={16} aria-hidden="true" /></button>
        <button type="button" className="dk-scrub__btn" aria-label="Play outlook" aria-pressed={playing} disabled={off} onClick={() => setPlaying((p) => !p)}>{playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}</button>
        <div
          ref={track} className="dk-scrub__track" role="slider" tabIndex={off ? -1 : 0} aria-disabled={off ? 'true' : undefined} aria-label="Forecast hour"
          aria-valuemin={0} aria-valuemax={Math.max(last, 0)} aria-valuenow={at} aria-valuetext={valueText}
          data-dragging={drag ? 'true' : undefined}
          onPointerDown={onDown} onPointerMove={(e) => drag && pick(e.clientX)} onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)} onKeyDown={onKey}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            {area && <path d={area} className="dk-scrub__area" />}
            {line && <path d={line} className="dk-scrub__line" pathLength={1} />}
            <line x1="0" x2={W} y1={limitY} y2={limitY} className="dk-scrub__limit" />
          </svg>
          {!off && <span className="dk-scrub__thumb" style={{ left: `${pct}%` }} aria-hidden="true" />}
        </div>
        <button type="button" className="dk-scrub__btn" aria-label="Next hour" disabled={off || at >= last} onClick={() => { setPlaying(false); onSelect(at + 1); }}><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useMotionPolicy } from '../../motion/useMotionPolicy';
import { Navigation, Pause, Play } from 'lucide-react';
import { flowDuration, mixingLayer, profileDomain } from './model';

export type ColumnLevel = { h: number; speed: number | null; from: string; dir: number | null };
export type ColumnTemp = { h: number; t: number | null };

const CEIL = 200;                       // metres shown: the model levels used for ventilation stop at 180 m
const W = 410, H = 300;
const X0 = 62, X1 = 236, Y0 = 262, Y1 = 22; // plot box; wind labels sit in the gutter to the right of X1
const y = (h: number) => Y0 - (Math.min(h, CEIL) / CEIL) * (Y0 - Y1);

/**
 * Model-derived vertical profile of the lowest 200 m above the site (Open-Meteo, selected hour).
 * Shaded band: mixing layer. Line: temperature with height (rising = inversion lid). Streaks: modelled wind speed
 * at each height (crossing time is inversely proportional to speed; direction is printed, not drawn as motion).
 */
export default function AtmosphericColumn({ blh, temps, winds, validLabel }: {
  blh: number | null; temps: ColumnTemp[]; winds: ColumnLevel[]; validLabel: string;
}) {
  const [paused, setPaused] = useState(false);
  const { reduced } = useMotionPolicy();
  const figureRef = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false); // first time on screen: the mixing layer rises once (a visual introduction only)
  const [hot, setHot] = useState<number | null>(null); // the height the operator has selected or focused
  // Off-screen pause: the streaks are CSS animations that keep costing main-thread time while nobody can see them. The attribute is
  // written straight to the element (no React state), so scrolling never re-renders the column. Values, labels and the table are untouched.
  useEffect(() => {
    const el = figureRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      el.setAttribute('data-offscreen', String(!e.isIntersecting));
      if (e.isIntersecting) setEntered(true); // idempotent: only the first call re-renders
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const ml = mixingLayer(blh, CEIL);
  const dom = profileDomain(temps.map((t) => t.t));
  const x = (t: number) => (dom ? X0 + ((t - dom[0]) / (dom[1] - dom[0])) * (X1 - X0) : X0);
  const pts = temps.filter((t): t is { h: number; t: number } => t.t !== null);
  const surface = temps.find((t) => t.h === 2)?.t ?? null;
  const top = temps.find((t) => t.h === 180)?.t ?? null;
  const inv = surface !== null && top !== null ? top - surface : null;

  const summary = [
    ml ? (ml.clamped ? `Mixing layer deeper than ${CEIL} m (${Math.round(blh!)} m).` : `Mixing layer ${Math.round(blh!)} m deep.`) : 'Mixing height not available.',
    inv === null ? 'Temperature profile incomplete.' : inv > 0 ? `Temperature rises ${inv.toFixed(1)} °C from 2 m to 180 m: an inversion lid.` : `Temperature falls ${Math.abs(inv).toFixed(1)} °C from 2 m to 180 m: no lid.`,
    ...winds.map((w) => (w.speed === null ? `Wind at ${w.h} m not available.` : `Wind at ${w.h} m ${w.speed.toFixed(1)} m/s${w.from ? ` from ${w.from}` : ''}.`)),
  ].join(' ');

  return (
    <figure
      ref={figureRef}
      className={`cc-column ${paused ? 'is-paused' : ''}`}
      data-enter={reduced || typeof IntersectionObserver === 'undefined' || entered ? 'done' : 'pending'}
    >
      <div className="cc-column__bar">
        <figcaption className="cc-column__cap">Atmospheric column · lowest {CEIL} m · model field, valid {validLabel}</figcaption>
        {reduced ? (
          <span className="cc-column__note">Wind animation off (reduced motion)</span>
        ) : (
          <button className="cc-icon-btn cc-column__toggle" onClick={() => setPaused((v) => !v)} aria-pressed={paused} aria-label={paused ? 'Resume wind flow animation' : 'Pause wind flow animation'}>
            {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            <span aria-hidden="true">{paused ? 'Resume' : 'Pause'}</span>
          </button>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={summary} className="cc-column__svg">
        {/* height grid */}
        {[0, 50, 100, 150, 200].map((h) => (
          <g key={h}>
            <line x1={X0} x2={X1} y1={y(h)} y2={y(h)} className="cc-col-grid" />
            <text x={X0 - 8} y={y(h) + 6} textAnchor="end" className="cc-col-axis">{h} m</text>
          </g>
        ))}
        {/* mixing layer */}
        {ml && (
          <g>
            <rect x={X0} y={y(ml.shown)} width={X1 - X0} height={Y0 - y(ml.shown)} className="cc-col-mix" />
            <line x1={X0} x2={X1} y1={y(ml.shown)} y2={y(ml.shown)} className={`cc-col-mixtop ${ml.clamped ? 'is-clamped' : ''}`} />
            <text x={X0 + 6} y={Math.max(y(ml.shown) - 6, Y1 + 10)} className="cc-col-label">
              {ml.clamped ? `mixing layer continues to ${Math.round(blh!).toLocaleString('en-IN')} m ↑` : `mixing layer ${Math.round(blh!)} m`}
            </text>
          </g>
        )}
        {/* wind flow: one streak lane per model height */}
        {winds.map((w) => {
          const dur = flowDuration(w.speed);
          const t = temps.find((v) => v.h === w.h)?.t ?? null;
          const label = `${w.h} m: ${w.speed === null ? 'wind not available' : `${w.speed.toFixed(1)} m/s${w.from ? ` from ${w.from}` : ''}`}${t === null ? '' : `, ${t.toFixed(1)} °C`}`;
          const off = () => setHot((v) => (v === w.h ? null : v));
          return (
            <g
              key={w.h}
              className={`cc-col-lane ${hot === w.h ? 'is-hot' : ''}`}
              tabIndex={0}
              role="img"
              aria-label={label}
              onMouseEnter={() => setHot(w.h)}
              onMouseLeave={off}
              onFocus={() => setHot(w.h)}
              onBlur={off}
              onClick={() => setHot(w.h)}
              onKeyDown={(e) => e.key === 'Escape' && setHot(null)}
            >
              <rect x={X0 - 4} y={y(w.h) - 18} width={W - X0 + 4} height={36} className="cc-col-lanebg" />
              {dur !== null && (
                <line x1={X0} x2={X1} y1={y(w.h)} y2={y(w.h)} className="cc-col-flow" style={{ animationDuration: `${dur}s` }} />
              )}
              <text x={X1 + 12} y={y(w.h) + 5} className="cc-col-wind">
                <tspan className="cc-col-windh">{w.h} m</tspan>
                <tspan dx="6">{w.speed === null ? 'n/a' : `${w.speed.toFixed(1)} m/s`}</tspan>
              </text>
              {w.dir !== null && (
                <g transform={`translate(${W - 9} ${y(w.h)}) rotate(${(w.dir + 180) % 360})`} className="cc-col-arrow">
                  <path d="M0 -7 L4 5 L0 2 L-4 5 Z" />
                </g>
              )}
            </g>
          );
        })}
        {/* temperature profile */}
        {dom && pts.length >= 2 && (
          <g>
            <polyline points={pts.map((p) => `${x(p.t)},${y(p.h)}`).join(' ')} className="cc-col-temp" />
            {pts.map((p) => <circle key={p.h} cx={x(p.t)} cy={y(p.h)} r={3.2} className="cc-col-tempdot" />)}
            <text x={X0} y={H - 6} className="cc-col-axis">{dom[0]} °C</text>
            <text x={X1} y={H - 6} textAnchor="end" className="cc-col-axis">{dom[1]} °C</text>
          </g>
        )}
        <line x1={X0} x2={X1} y1={Y0} y2={Y0} className="cc-col-ground" />
      </svg>
      <ul className="cc-column__key" aria-label="Key">
        <li><i className="k-mix" aria-hidden="true" /> Mixing layer</li>
        <li><i className="k-temp" aria-hidden="true" /> Temperature with height</li>
        <li><i className="k-flow" aria-hidden="true" /> Streak speed = modelled wind speed</li>
        <li><Navigation size={11} aria-hidden="true" /> Arrow points downwind</li>
      </ul>
      <details className="cc-details">
        <summary>View the profile values</summary>
        <table className="cc-mini-table">
          <thead><tr><th scope="col">Height</th><th scope="col">Temperature</th><th scope="col">Wind</th><th scope="col">From</th></tr></thead>
          <tbody>
            {[2, 10, 80, 120, 180].map((h) => {
              const t = temps.find((v) => v.h === h)?.t ?? null;
              const w = winds.find((v) => v.h === h);
              return (
                <tr key={h}>
                  <th scope="row">{h} m</th>
                  <td>{t === null ? (h === 10 ? '·' : 'n/a') : `${t.toFixed(1)} °C`}</td>
                  <td>{!w ? '·' : w.speed === null ? 'n/a' : `${w.speed.toFixed(1)} m/s`}</td>
                  <td>{!w ? '·' : w.from || 'n/a'}</td>
                </tr>
              );
            })}
            <tr><th scope="row">Mixing height</th><td colSpan={3}>{blh === null ? 'n/a' : `${Math.round(blh).toLocaleString('en-IN')} m`}</td></tr>
          </tbody>
        </table>
      </details>
    </figure>
  );
}

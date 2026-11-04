import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { SourceLabel } from '../design/primitives';
import { useActiveLoop } from '../motion/useActiveLoop';
import { useMotionPolicy } from '../motion/useMotionPolicy';
import type { ColumnLevel, ColumnTemp } from '../components/overview/AtmosphericColumn';
import { mixingLayer } from '../components/overview/model';

/*
 * Prototype B: Atmospheric Flow. The SAME model fields as the Overview's AtmosphericColumn (wind speed and direction at
 * 10/80/120/180 m, temperature at 2/80/120/180 m, boundary-layer height) at the model hour the Lab shows.
 *
 * Encoding: streaks in each height lane advance at K x speed SVG units per second (time-based, frame-rate independent) and
 * wrap across the lane. Direction is printed, never drawn as motion. Calm (< 0.4 m/s) is one static dash labelled "calm";
 * speeds above the drawable maximum move at the maximum and are labelled "saturated"; a missing speed draws nothing ("n/a").
 *
 * Loop: ONE requestAnimationFrame loop for all lanes, writing SVG transform attributes directly (no React state per frame),
 * scheduled only while useActiveLoop allows it (not paused, on screen, tab visible, motion not reduced) and something moves.
 * Test contract on the root: data-flow-active ("true" while the loop runs) and data-flow-frames (frames drawn, written every
 * 10 frames and when the loop stops).
 */

const CEIL = 200; // metres shown: the model levels used for ventilation stop at 180 m
const W = 420,
  H = 300;
const X0 = 64,
  X1 = 250,
  Y0 = 262,
  Y1 = 22; // lane box; values sit in the gutter right of X1
const y = (h: number) => Y0 - (Math.min(h, CEIL) / CEIL) * (Y0 - Y1);
const LANE_H = 40; // focus/hover band; stays >= 24 CSS px tall at phone widths
const STREAK = 22; // streak length, SVG units
const PER_LANE = 3;
const SPAN = X1 - X0 + STREAK; // one wrap period
export const FLOW_K = 12; // SVG units per second for each m/s of modelled wind (one multiple for every lane)
export const CALM_MS = 0.4;
export const MAX_DRAW_MS = 20; // drawable maximum: faster wind moves at this rate and is labelled saturated
const MAX_DT = 0.1; // s: a long gap (tab switch, jank) never teleports streaks

type LaneKind = 'flow' | 'calm' | 'saturated' | 'missing';
type Lane = { h: number; speed: number | null; from: string; temp: number | null; kind: LaneKind; rate: number; label: string };

function lanesFor(winds: ColumnLevel[], temps: ColumnTemp[]): Lane[] {
  return [...winds]
    .sort((a, b) => b.h - a.h)
    .map((w) => {
      const temp = temps.find((t) => t.h === w.h)?.t ?? null;
      const kind: LaneKind = w.speed === null ? 'missing' : w.speed < CALM_MS ? 'calm' : w.speed > MAX_DRAW_MS ? 'saturated' : 'flow';
      const rate = kind === 'flow' || kind === 'saturated' ? FLOW_K * Math.min(w.speed as number, MAX_DRAW_MS) : 0;
      const label =
        w.speed === null
          ? `${w.h} m: wind not available`
          : `${w.h} m: ${w.speed.toFixed(1)} m/s${w.from ? ` from ${w.from}` : ''}${kind === 'calm' ? ', calm' : kind === 'saturated' ? `, saturated (drawn at ${MAX_DRAW_MS} m/s)` : ''}${temp === null ? '' : `, ${temp.toFixed(1)} °C`}`;
      return { h: w.h, speed: w.speed, from: w.from, temp, kind, rate, label };
    });
}

const startPos = (phase: number, k: number) => (phase + (k * SPAN) / PER_LANE) % SPAN;

export default function AtmosFlow({
  winds,
  temps,
  blh,
  validLabel,
  loadState,
}: {
  winds: ColumnLevel[];
  temps: ColumnTemp[];
  blh: number | null;
  validLabel: string;
  loadState: 'loading' | 'ready' | 'error';
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const streaks = useRef<Array<Array<SVGLineElement | null>>>([]);
  const phase = useRef<number[]>([]);
  const frames = useRef(0);
  const clipId = `ml-flow-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`; // React ids contain ':' which url(#…) dislikes
  const [paused, setPaused] = useState(false);
  const [hot, setHot] = useState<number | null>(null);
  const { reduced } = useMotionPolicy();
  // The mixing layer rises once, the first time the instrument is on screen. Reduced motion (or no IntersectionObserver): already there.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setEntered(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const enter = reduced || typeof IntersectionObserver === 'undefined' || entered ? 'done' : 'pending';
  const active = useActiveLoop(rootRef, paused);

  const lanes = lanesFor(winds, temps);
  const ratesKey = lanes.map((l) => l.rate).join('|');
  const moving = lanes.some((l) => l.rate > 0);
  const running = active && moving;
  const ml = mixingLayer(blh, CEIL);
  const surface = temps.find((t) => t.h === 2)?.t ?? null;

  // Static positions (first paint, data change, reduced motion): evenly spaced streaks, written before paint.
  useLayoutEffect(() => {
    const rates = ratesKey.split('|').map(Number);
    const root = rootRef.current;
    if (root && !root.hasAttribute('data-flow-frames')) root.setAttribute('data-flow-frames', String(frames.current));
    rates.forEach((_, i) => {
      const p = phase.current[i] ?? 0;
      phase.current[i] = p;
      streaks.current[i]?.forEach((el, k) => el?.setAttribute('transform', `translate(${(X0 - STREAK + startPos(p, k)).toFixed(2)} 0)`));
    });
  }, [ratesKey]);

  // The one loop. No rAF is scheduled at all unless it may run and a lane actually moves.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !running) return;
    const rates = ratesKey.split('|').map(Number); // effects depend on the value key, not on a per-render array
    let raf = 0;
    let last = performance.now();
    let count = frames.current;
    const tick = (now: number) => {
      const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
      last = now;
      for (let i = 0; i < rates.length; i += 1) {
        if (rates[i] <= 0) continue;
        const p = ((phase.current[i] ?? 0) + rates[i] * dt) % SPAN;
        phase.current[i] = p;
        const row = streaks.current[i];
        if (row)
          for (let k = 0; k < row.length; k += 1)
            row[k]?.setAttribute('transform', `translate(${(X0 - STREAK + startPos(p, k)).toFixed(2)} 0)`);
      }
      count += 1;
      if (count % 10 === 0) root.setAttribute('data-flow-frames', String(count));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      frames.current = count;
      root.setAttribute('data-flow-frames', String(count));
    };
  }, [running, ratesKey]);

  const hotLane = lanes.find((l) => l.h === hot) ?? null;
  const stopReason = reduced
    ? 'reduced motion: static streaks'
    : paused
      ? 'paused'
      : !moving
        ? 'nothing moves (calm or missing)'
        : 'off-screen or tab hidden';

  return (
    <div className="ml-flow" data-testid="atmos-flow" data-flow-active={String(running)} data-enter={enter} ref={rootRef}>
      <div className="ml-flow__bar">
        <SourceLabel kind="regional" detail={`Open-Meteo · valid ${validLabel}`} />
        <button
          type="button"
          className="ax-btn"
          aria-pressed={paused}
          aria-label={paused ? 'Resume wind flow' : 'Pause wind flow'}
          onClick={() => setPaused((v) => !v)}
        >
          {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />} {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
      <figure className="ml-flow__figure">
        {loadState !== 'ready' ? (
          <p className="ml-status">
            {loadState === 'loading'
              ? 'Reading the cached regional model run…'
              : 'The regional model run is unavailable, so there is no profile to draw.'}
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="ml-flow__svg"
            role="group"
            aria-label="Wind flow by height. Each lane can be focused to read its value."
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={X0} y={0} width={X1 - X0} height={H} />
              </clipPath>
            </defs>
            {ml && (
              <g aria-hidden="true">
                <rect x={X0} y={y(ml.shown)} width={X1 - X0} height={Y0 - y(ml.shown)} className="ml-flow__mix" />
                <line x1={X0} x2={X1} y1={y(ml.shown)} y2={y(ml.shown)} className={`ml-flow__mixtop ${ml.clamped ? 'is-clamped' : ''}`} />
                <text x={X0 + 6} y={Math.max(y(ml.shown) - 6, Y1 + 10)} className="ml-flow__mixlabel">
                  {ml.clamped
                    ? `mixing layer continues to ${Math.round(blh as number).toLocaleString('en-IN')} m ↑`
                    : `mixing layer ${Math.round(blh as number)} m`}
                </text>
              </g>
            )}
            {lanes.map((l, i) => {
              const ly = y(l.h);
              return (
                <g
                  key={l.h}
                  className={`ml-lane ml-lane--${l.kind} ${hot === l.h ? 'is-hot' : ''}`}
                  tabIndex={0}
                  role="img"
                  aria-label={l.label}
                  onMouseEnter={() => setHot(l.h)}
                  onMouseLeave={() => setHot((v) => (v === l.h ? null : v))}
                  onFocus={() => setHot(l.h)}
                  onBlur={() => setHot((v) => (v === l.h ? null : v))}
                >
                  <rect x={2} y={ly - LANE_H / 2} width={W - 4} height={LANE_H} rx={6} className="ml-lane__bg" />
                  <line x1={X0} x2={X1} y1={ly} y2={ly} className="ml-lane__rule" />
                  <text x={X0 - 8} y={ly + 6} textAnchor="end" className="ml-flow__axis">
                    {l.h} m
                  </text>
                  <g clipPath={`url(#${clipId})`}>
                    {(l.kind === 'flow' || l.kind === 'saturated') &&
                      Array.from({ length: PER_LANE }, (_, k) => (
                        <line
                          key={k}
                          x1={0}
                          x2={STREAK}
                          y1={ly}
                          y2={ly}
                          className="ml-streak"
                          ref={(el) => {
                            (streaks.current[i] ??= [])[k] = el;
                          }}
                        />
                      ))}
                    {l.kind === 'calm' && (
                      <line
                        x1={(X0 + X1) / 2 - STREAK / 2}
                        x2={(X0 + X1) / 2 + STREAK / 2}
                        y1={ly}
                        y2={ly}
                        className="ml-streak ml-streak--calm"
                      />
                    )}
                  </g>
                  <text x={X1 + 10} y={ly - 2} className="ml-flow__value">
                    {l.speed === null ? 'n/a' : `${l.speed.toFixed(1)} m/s`}
                    {l.from && (
                      <tspan dx="6" className="ml-flow__dir">
                        {l.from}
                      </tspan>
                    )}
                  </text>
                  <text x={X1 + 10} y={ly + 16} className="ml-flow__sub">
                    {l.kind === 'calm' && <tspan className="ml-tag">calm</tspan>}
                    {l.kind === 'saturated' && <tspan className="ml-tag ml-tag--warn">saturated</tspan>}
                    {l.kind === 'missing' && <tspan className="ml-tag">no model value</tspan>}
                    {l.temp !== null && <tspan dx={l.kind === 'flow' ? 0 : 6}>{l.temp.toFixed(1)} °C</tspan>}
                  </text>
                </g>
              );
            })}
            <line x1={X0} x2={X1} y1={Y0} y2={Y0} className="ml-flow__ground" aria-hidden="true" />
            <text x={X0} y={H - 10} className="ml-flow__sub" aria-hidden="true">
              surface (2 m) {surface === null ? 'n/a' : `${surface.toFixed(1)} °C`}
            </text>
          </svg>
        )}
        <figcaption className="ml-flow__cap">
          Regional model profile (Open-Meteo), valid {validLabel}. Not a vertical measurement.
        </figcaption>
      </figure>
      <p className="ml-status">
        {hotLane ? (
          <>
            Selected lane: <b>{hotLane.label}</b>.{' '}
          </>
        ) : (
          'Hover or focus a lane to read it. '
        )}
        Loop: <b>{running ? 'running' : `stopped (${stopReason})`}</b>. Streak speed = {FLOW_K} SVG units/s per m/s; drawn up to{' '}
        {MAX_DRAW_MS} m/s; calm below {CALM_MS} m/s.
      </p>
      <details className="cc-details">
        <summary>View the profile values</summary>
        <div className="ml-table-wrap">
          <table className="cc-mini-table">
            <thead>
              <tr>
                <th scope="col">Height</th>
                <th scope="col">Wind</th>
                <th scope="col">From</th>
                <th scope="col">Temperature</th>
                <th scope="col">Drawn as</th>
              </tr>
            </thead>
            <tbody>
              {lanes.map((l) => (
                <tr key={l.h}>
                  <th scope="row">{l.h} m</th>
                  <td>{l.speed === null ? 'n/a' : `${l.speed.toFixed(1)} m/s`}</td>
                  <td>{l.from || 'n/a'}</td>
                  <td>{l.temp === null ? (l.h === 10 ? '·' : 'n/a') : `${l.temp.toFixed(1)} °C`}</td>
                  <td>
                    {l.kind === 'missing'
                      ? 'nothing'
                      : l.kind === 'calm'
                        ? 'static dash'
                        : l.kind === 'saturated'
                          ? `streaks at ${MAX_DRAW_MS} m/s`
                          : 'moving streaks'}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">2 m</th>
                <td colSpan={2}>·</td>
                <td>{surface === null ? 'n/a' : `${surface.toFixed(1)} °C`}</td>
                <td>text</td>
              </tr>
              <tr>
                <th scope="row">Mixing height</th>
                <td colSpan={4}>{blh === null ? 'n/a' : `${Math.round(blh).toLocaleString('en-IN')} m`}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

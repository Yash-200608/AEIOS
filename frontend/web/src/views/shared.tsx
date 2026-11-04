import { createContext, useContext, type ReactNode } from 'react';
import { AlertTriangle, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Sun } from 'lucide-react';
import { ViewHero } from '../motion/scroll';
import { numeric, round } from '../lib/api';
import { VIEW_BY_ID, type ViewId } from '../shell/viewRegistry';

/*
 * Pieces shared by the views (moved unchanged from App.tsx when the single long page was split into views).
 */

export type LoadState = 'loading' | 'ready' | 'error';
export type StationState = { status: string; count: number; observations: any[]; note: string } | null;
export type Hourly = Record<string, any[]>;

/**
 * The root of every view: <section data-view-id>. It carries the view's id unless the panel it wraps already renders a
 * section with that id (DispersionPanel, SatellitePanel, ...), so ids stay unique and old #anchors still find their section.
 */
export function ViewRoot({ id, ownsId = true, className, children }: { id: ViewId; ownsId?: boolean; className?: string; children: ReactNode }) {
  return (
    <section id={ownsId ? id : undefined} data-view-id={id} className={className ? `view ${className}` : 'view'}>
      {children}
    </section>
  );
}

/**
 * The weather model run the shell loaded, when it is a cached run served because the provider could not be reached (stale), so
 * every view that shows model data says so in its own hero band. Null when the run is current (or not loaded).
 */
export type ModelRunState = { fetchedAt: string } | null;
export const ModelRunContext = createContext<ModelRunState>(null);

const IST_STAMP: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false };

/** "Cached model run · fetched 31 Oct, 15:30 IST" (the same currency label the Overview uses). Plain text, not a live region. */
function ModelRunNotice({ run }: { run: NonNullable<ModelRunState> }) {
  const at = new Date(run.fetchedAt);
  const stamp = Number.isNaN(at.getTime()) ? null : `${at.toLocaleString('en-IN', IST_STAMP)} IST`;
  return (
    <p className="view-model-notice" data-model-run="cached">
      <AlertTriangle size={14} aria-hidden="true" />
      <span><b>Cached model run</b>{stamp && <> · fetched {stamp}</>}</span>
    </p>
  );
}

/** The view's header band (group kicker, the view's name as its one <h1>, and what it answers). */
export function Hero({ id, right }: { id: ViewId; right?: ReactNode }) {
  const def = VIEW_BY_ID[id];
  const run = useContext(ModelRunContext);
  const notice = def.weatherModel && run ? <ModelRunNotice run={run} /> : null;
  const slot = notice && right ? <>{notice}{right}</> : (notice ?? right);
  return <ViewHero kicker={def.group} title={def.label} subtitle={def.subtitle} right={slot} />;
}

export function SectionTitle({ kicker, title, right }: { kicker: string; title: string; right?: ReactNode }) {
  return <div className="section-title"><div><div className="eyebrow">{kicker}</div><h2>{title}</h2></div>{right}</div>;
}

/** A finite number, or null when the value is absent or not numeric (never a made-up 0). */
export function numOrNull(value: unknown): number | null {
  const number = numeric(value, Number.NaN);
  return Number.isFinite(number) ? number : null;
}

export function hourlyAt(hourly: Record<string, unknown[]> | undefined, key: string, index: number): number | null {
  const values = hourly?.[key];
  return values && index >= 0 && index < values.length ? numOrNull(values[index]) : null;
}

/** Profile-card value: "n/a" for a missing model value. */
export function na(value: number | null | undefined, digits = 0): string {
  return value == null ? 'n/a' : round(value, digits);
}

export function WeatherGlyph({ code, size = 18 }: { code: unknown; size?: number }) {
  const c = numeric(code, 3);
  if (c === 0) return <Sun size={size} className="weather-sun" />;
  if ([1, 2].includes(c)) return <CloudSun size={size} className="weather-sun" />;
  if ([45, 48].includes(c)) return <CloudFog size={size} />;
  if ([51, 53, 55, 56, 57].includes(c)) return <CloudDrizzle size={size} />;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(c)) return <CloudRain size={size} className="weather-rain" />;
  if ([95, 96, 99].includes(c)) return <CloudLightning size={size} className="weather-rain" />;
  return <Cloud size={size} />;
}

/** Recharts tooltip surface used by every chart in the views. */
export const CHART_TOOLTIP_STYLE = { background: '#100a17', border: '1px solid #473a57', borderRadius: 10, color: '#f1eff4' };

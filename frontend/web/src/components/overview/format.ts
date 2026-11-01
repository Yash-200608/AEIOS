// Display helpers for the Overview. Pure; no data decisions live here.
const tz = 'Asia/Kolkata';
export const istTime = (iso?: string | null): string =>
  iso && Number.isFinite(Date.parse(iso)) ? `${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })} IST` : '—';
export const istDateTime = (iso?: string | null): string =>
  iso && Number.isFinite(Date.parse(iso))
    ? `${new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })} IST` : '—';

/** Open-Meteo hourly times are site-local strings ("2026-11-01T14:00"). Format without re-interpreting the time zone. */
export const localSlot = (t: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t);
  if (!m) return t;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  return `${day} ${m[4]}:${m[5]}`;
};

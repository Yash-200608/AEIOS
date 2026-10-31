// Display helpers for the Overview. Pure; no data decisions live here.
const tz = 'Asia/Kolkata';
export const istTime = (iso?: string | null): string =>
  iso && Number.isFinite(Date.parse(iso)) ? `${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })} IST` : '—';
export const istDateTime = (iso?: string | null): string =>
  iso && Number.isFinite(Date.parse(iso))
    ? `${new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })} IST` : '—';

/*
 * The hourly slot the dashboard shows as "now": the one nearest to the model's current time, the earlier slot on a tie. Used by
 * App (which selects it after each load) and by the command deck (which anchors its 48-hour window on it), so the two cannot
 * disagree. Open-Meteo reports current.time in 15-minute steps, so "nearest" is not always the first slot at or after it.
 */
export function nearestHourIndex(times: ReadonlyArray<unknown>, currentTime: string): number {
  const now = Date.parse(currentTime);
  if (!Number.isFinite(now)) return 0;
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;
  times.forEach((time, i) => {
    const d = Math.abs(Date.parse(String(time)) - now);
    if (Number.isFinite(d) && d < distance) { nearest = i; distance = d; }
  });
  return nearest;
}

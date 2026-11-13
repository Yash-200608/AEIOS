/* Pure helpers for the deck's outlook scrubber and status lamps. */

/** The hour nearest to horizontal position x on a track `width` px wide holding `count` hours; null when there is nothing to pick. */
export function scrubIndex(x: number, width: number, count: number): number | null {
  if (!(count > 0) || !(width > 0)) return null;
  if (count === 1) return 0;
  const k = Math.min(1, Math.max(0, x / width));
  return Math.round(k * (count - 1));
}

/**
 * How a status lamp is drawn. Only a fresh or online gateway or node pulses: motion never implies liveness that is not there.
 * A model feed (weather, air quality) is fetched once per load and not polled, so a successful fetch says nothing about how
 * current it is now: its lamp is steady at best.
 */
export function lampState(state: string, kind: 'node' | 'feed' = 'node'): 'pulse' | 'steady' | 'dim' {
  if (state === 'fresh' || state === 'online') return kind === 'feed' ? 'steady' : 'pulse';
  if (state === 'checking') return 'steady';
  return 'dim';
}

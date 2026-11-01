/*
 * Pure change detection for state-change signals. The AEIOS poll returns new objects every 30 s (alerts every 60 s) even
 * when nothing changed, so signals compare VALUES, never object identity. No runtime imports (runs under `node --test`).
 */

export type PacketStamp = Record<string, string | null>; // node -> rx_utc of its newest packet

/** Nodes whose newest packet timestamp differs from the previous snapshot. No signal on the first snapshot. */
export function newPackets(prev: PacketStamp | null, next: PacketStamp): string[] {
  if (!prev) return [];
  return Object.keys(next).filter((n) => next[n] !== null && n in prev && prev[n] !== next[n]);
}

/** Keys whose state value changed between snapshots (freshness, gateway online, model maturity). */
export function changedStates<T extends string>(
  prev: Record<string, T> | null,
  next: Record<string, T>,
): Array<{ key: string; from: T; to: T }> {
  if (!prev) return [];
  return Object.keys(next)
    .filter((k) => k in prev && prev[k] !== next[k])
    .map((k) => ({ key: k, from: prev[k], to: next[k] }));
}

export type AlertSnapshot = { kind: string; id: number | null };
export type AlertChange = 'raised' | 'cleared' | null;

/** A newly raised alert (new id while active) or a cleared one (active to any other kind). Loading flicker is ignored. */
export function alertChange(prev: AlertSnapshot | null, next: AlertSnapshot): AlertChange {
  if (!prev || next.kind === 'loading' || prev.kind === 'loading') return null;
  if (next.kind === 'active' && next.id !== null && (prev.kind !== 'active' || prev.id !== next.id)) return 'raised';
  if (prev.kind === 'active' && next.kind !== 'active' && next.kind !== 'error') return 'cleared';
  return null;
}

/** A context key: when it changes (site switch, fixture switch) previous snapshots must be discarded, not diffed. */
export function contextKey(site: string, fixture: string | null): string {
  return `${site}|${fixture ?? 'live'}`;
}

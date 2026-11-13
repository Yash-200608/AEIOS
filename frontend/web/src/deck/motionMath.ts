/* Pure animation maths for the command deck, kept apart from React so it can be unit tested. */

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Value `t` (0..1) of the way from `from` to `to`, ease-out cubic. Exactly `to` at t >= 1. */
export function countFrame(from: number, to: number, t: number): number {
  const k = clamp01(t);
  if (k >= 1) return to;
  const eased = 1 - (1 - k) ** 3;
  return from + (to - from) * eased;
}

/**
 * The text at `t` (0..1) of a decode: characters left of floor(t * length) are final, the rest are drawn from GLYPHS.
 * Spaces are kept and the length never changes, so the layout does not move.
 */
export function decodeFrame(target: string, t: number, rand: () => number): string {
  const fixed = Math.floor(clamp01(t) * target.length);
  let out = '';
  for (let i = 0; i < target.length; i += 1) {
    const c = target[i];
    out += i < fixed || c === ' ' ? c : GLYPHS[Math.floor(rand() * GLYPHS.length) % GLYPHS.length];
  }
  return out;
}

/*
 * The dashboard is desktop only. Under MIN_WIDTH it is replaced by a notice; from MIN_WIDTH up to DESIGN_WIDTH the same
 * layout is scaled down to fit (a small desktop window is still a PC); from DESIGN_WIDTH up it renders at its natural size.
 */
export const MIN_WIDTH = 1024;
export const DESIGN_WIDTH = 1280;

export type DeskMode = { mode: 'full' | 'scaled' | 'blocked'; scale: number };

export function deskMode(width: number): DeskMode {
  if (!(width >= MIN_WIDTH)) return { mode: 'blocked', scale: 1 };
  if (width < DESIGN_WIDTH) return { mode: 'scaled', scale: width / DESIGN_WIDTH };
  return { mode: 'full', scale: 1 };
}

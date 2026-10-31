import { describe, expect, it } from 'vitest';
import { isosurface, meshArea } from './isosurface';

function blob(n: number, cx: number, cy: number, cz: number, sx = 1, sy = 1, sz = 1, fn = (r2: number) => Math.exp(-r2 / 50)) {
  const f = new Float32Array(n * n * n);
  for (let k = 0; k < n; k += 1) for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) {
    const x = (i + 0.5) * sx - cx, y = (j + 0.5) * sy - cy, z = (k + 0.5) * sz - cz;
    f[(k * n + j) * n + i] = fn(x * x + y * y + z * z);
  }
  return f;
}

describe('isosurface', () => {
  it('extracts a sphere with the right radius and area from a smooth blob', () => {
    const n = 32, R = 8;
    const f = blob(n, 16, 16, 16);
    const iso = Math.exp(-(R * R) / 50);
    const m = isosurface(f, n, n, n, iso);
    expect(m.positions.length).toBeGreaterThan(900);
    let worst = 0;
    for (let v = 0; v < m.positions.length; v += 3) worst = Math.max(worst, Math.abs(Math.hypot(m.positions[v] - 16, m.positions[v + 1] - 16, m.positions[v + 2] - 16) - R));
    expect(worst).toBeLessThan(0.15);
    expect(Math.abs(meshArea(m) - 4 * Math.PI * R * R) / (4 * Math.PI * R * R)).toBeLessThan(0.03);
  });

  it('gives outward-pointing normals (toward lower values) for a peaked field', () => {
    const n = 32, f = blob(n, 16, 16, 16);
    const m = isosurface(f, n, n, n, Math.exp(-64 / 50));
    let outward = 0, total = 0;
    for (let v = 0; v < m.positions.length; v += 3) {
      const dx = m.positions[v] - 16, dy = m.positions[v + 1] - 16, dz = m.positions[v + 2] - 16, d = Math.hypot(dx, dy, dz);
      outward += (dx * m.normals[v] + dy * m.normals[v + 1] + dz * m.normals[v + 2]) / d; total += 1;
    }
    expect(outward / total).toBeGreaterThan(0.95);
  });

  it('respects anisotropic cell sizes (world units)', () => {
    // the same index-space field with cells twice as tall must give a surface twice as tall in world units
    const n = 32;
    const f = blob(n, 16, 16, 16);
    const iso = Math.exp(-64 / 50);
    const m1 = isosurface(f, n, n, n, iso), m2 = isosurface(f, n, n, n, iso, 1, 1, 2);
    const zr = (m: { positions: Float32Array }) => { let lo = 1e9, hi = -1e9; for (let v = 2; v < m.positions.length; v += 3) { lo = Math.min(lo, m.positions[v]); hi = Math.max(hi, m.positions[v]); } return hi - lo; };
    expect(zr(m2) / zr(m1)).toBeGreaterThan(1.9);
    expect(zr(m2) / zr(m1)).toBeLessThan(2.1);
  });

  it('returns nothing when the field never reaches the level, or is entirely above it', () => {
    const n = 8, f = new Float32Array(n * n * n).fill(1);
    expect(isosurface(f, n, n, n, 5).positions.length).toBe(0);
    expect(isosurface(f, n, n, n, 0.5).positions.length).toBe(0);
  });

  it('produces a closed surface: every edge is shared by exactly two triangles for an interior blob', () => {
    const n = 20, f = blob(n, 10, 10, 10, 1, 1, 1, (r2) => Math.exp(-r2 / 20));
    const m = isosurface(f, n, n, n, 0.3);
    const key = (i: number) => `${m.positions[i].toFixed(4)},${m.positions[i + 1].toFixed(4)},${m.positions[i + 2].toFixed(4)}`;
    const count = new Map<string, number>();
    for (let t = 0; t < m.positions.length; t += 9) {
      const vs = [key(t), key(t + 3), key(t + 6)];
      for (let e = 0; e < 3; e += 1) {
        const a = vs[e], b = vs[(e + 1) % 3], k = a < b ? `${a}|${b}` : `${b}|${a}`;
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
    const bad = [...count.values()].filter((c) => c !== 2).length;
    expect(bad).toBe(0);
  });
});

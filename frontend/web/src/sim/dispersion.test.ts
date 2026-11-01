import { describe, expect, it } from 'vitest';
import { fireEmission, idx, runDispersion, sampleFrame, uniformForcing, type Config, type Forcing, type Source } from './dispersion';

const base = (over: Partial<Config> = {}): Config => ({
  nx: 40, ny: 40, nz: 10, dx: 500, dy: 500, dz: 100, horizonS: 3600, outputEveryS: 1800, kh: 50, vd: 0.002, background: 0, ...over,
});
const centre = (c: Config, q = 10, t1 = 1800): Source => ({ x: (c.nx / 2) * c.dx, y: (c.ny / 2) * c.dy, z: 50, q, t0: 0, t1 });

const massOf = (c: Config, f: Float32Array) => f.reduce((s, v) => s + v, 0) * c.dx * c.dy * c.dz;

describe('conservation and positivity', () => {
  it('closes the mass budget: emitted + inflow - outflow - deposited - clipped = mass in the domain', () => {
    const c = base();
    const r = runDispersion(c, uniformForcing(3, 1.5, 800), [centre(c)]);
    const d = r.diagnostics;
    expect(d.emitted).toBeGreaterThan(0);
    const residual = d.emitted + d.inflow - d.outflow - d.deposited - d.clipped - d.mass;
    expect(Math.abs(residual) / d.emitted).toBeLessThan(1e-9);
  });

  it('accounts for mass leaving through the boundaries and deposited at the ground', () => {
    const c = base({ horizonS: 7200, outputEveryS: 3600 });
    const d = runDispersion(c, uniformForcing(5, 0, 800), [centre(c, 10, 600)]).diagnostics;
    expect(d.outflow).toBeGreaterThan(0.2 * d.emitted);   // a 5 m/s wind clears a 20 km half-domain within 2 h
    expect(d.deposited).toBeGreaterThan(0);
    expect(d.deposited).toBeLessThan(0.1 * d.emitted);    // 0.2 cm/s deposition is a small sink
  });

  it('never produces negative concentrations and clips essentially nothing', () => {
    const c = base();
    const r = runDispersion(c, uniformForcing(3, -2, 600), [centre(c)]);
    for (const fr of r.frames) expect(Math.min(...fr.c)).toBeGreaterThanOrEqual(0);
    expect(r.diagnostics.clipped / r.diagnostics.emitted).toBeLessThan(1e-9);
  });

  it('holds all mass in a closed calm box (no wind, no deposition, no inflow)', () => {
    const c = base({ vd: 0, horizonS: 1800 });
    const r = runDispersion(c, uniformForcing(0, 0, 800), [centre(c, 10, 600)]);
    expect(Math.abs(r.diagnostics.mass - r.diagnostics.emitted) / r.diagnostics.emitted).toBeLessThan(1e-9);
    expect(r.diagnostics.outflow).toBe(0);
  });

  it('respects the advective Courant limit', () => {
    const c = base();
    const r = runDispersion(c, uniformForcing(12, 9, 800), [centre(c)]);
    expect(r.diagnostics.maxCourant).toBeLessThanOrEqual(0.8 + 1e-9);
  });
});

describe('physics against analytic results', () => {
  it('matches the steady Gaussian plume (continuous point source, uniform wind, constant diffusivities)', () => {
    const U = 5, Kz = 5, Kh = 40, Q = 10;               // m/s, m2/s, m2/s, g/s
    const c: Config = { nx: 120, ny: 60, nz: 20, dx: 100, dy: 50, dz: 50, horizonS: 2400, outputEveryS: 2400, kh: Kh, vd: 0, background: 0, kzConst: Kz };
    const H = 125, xs = 1000, ys = 1500;
    const r = runDispersion(c, uniformForcing(U, 0, 5000), [{ x: xs, y: ys, z: H, q: Q, t0: 0, t1: 1e9 }]);
    const f = r.frames[r.frames.length - 1].c;
    const X = 4000;
    // slender-plume solution with ground reflection: C = Q / (4 pi X sqrt(Ky Kz)) * [exp(-U (z-H)^2 / 4KzX) + exp(-U (z+H)^2 / 4KzX)] * exp(-U y^2 / 4KyX)
    const analytic = (y: number, z: number) => (Q * 1e6) / (4 * Math.PI * X * Math.sqrt(Kh * Kz))
      * (Math.exp((-U * (z - H) ** 2) / (4 * Kz * X)) + Math.exp((-U * (z + H) ** 2) / (4 * Kz * X))) * Math.exp((-U * y * y) / (4 * Kh * X));
    const at = (y: number, z: number) => sampleFrame(c, f, xs + X, ys + y, z);
    expect(at(0, H) / analytic(0, H)).toBeGreaterThan(0.85);
    expect(at(0, H) / analytic(0, H)).toBeLessThan(1.15);
    // lateral width: concentration at one analytic sigma_y off-axis relative to the centre line is exp(-1/2)
    const sy = Math.sqrt((2 * Kh * X) / U);
    expect(at(sy, H) / at(0, H)).toBeGreaterThan(0.5);
    expect(at(sy, H) / at(0, H)).toBeLessThan(0.72);
    // vertical: more at the release height than 200 m above
    expect(at(0, H)).toBeGreaterThan(3 * at(0, H + 200));
  });

  it('advects the centre of mass at the wind speed, including a wind that changes linearly in time', () => {
    const c: Config = { nx: 120, ny: 20, nz: 6, dx: 500, dy: 500, dz: 200, horizonS: 3600, outputEveryS: 3600, kh: 10, vd: 0, background: 0, kzConst: 1 };
    const f: Forcing = { ...uniformForcing(0, 0, 1500), u: Float32Array.from([2, 2, 6, 6]) };   // hour 0 -> 1: 2 m/s ramps to 6 m/s at every level
    const x0 = 5000;
    const r = runDispersion(c, f, [{ x: x0, y: 5000, z: 100, q: 50, t0: 0, t1: 30 }]);
    const fin = r.frames[r.frames.length - 1].c;
    let m = 0, mx = 0;
    for (let k = 0; k < c.nz; k += 1) for (let j = 0; j < c.ny; j += 1) for (let i = 0; i < c.nx; i += 1) {
      const v = fin[idx(c, i, j, k)]; m += v; mx += v * (i + 0.5) * c.dx;
    }
    const centroid = mx / m, expected = x0 + 4 * 3600;     // mean of 2 and 6 m/s over the hour
    expect(Math.abs(centroid - expected) / (expected - x0)).toBeLessThan(0.03);
  });

  it('keeps a surface release under a low boundary-layer lid and lets it mix upward when the layer is deep', () => {
    const run = (blh: number) => {
      const c = base({ nz: 20, dz: 100, horizonS: 7200, outputEveryS: 7200, vd: 0 });
      const r = runDispersion(c, uniformForcing(3, 0, blh), [{ x: 10000, y: 10000, z: 50, q: 10, t0: 0, t1: 7200 }]);
      const f = r.frames[r.frames.length - 1].c;
      let above = 0, total = 0;
      for (let k = 0; k < c.nz; k += 1) for (let j = 0; j < c.ny; j += 1) for (let i = 0; i < c.nx; i += 1) {
        const m = f[idx(c, i, j, k)];
        total += m; if ((k + 0.5) * c.dz > 400) above += m;
      }
      return above / total;
    };
    const shallow = run(200), deep = run(1500);
    expect(shallow).toBeLessThan(0.01);
    expect(deep).toBeGreaterThan(10 * shallow);
    expect(deep).toBeGreaterThan(0.05);
  });

  it('deposits mass at the ground at roughly the expected rate', () => {
    // well-mixed column, steady state: deposition flux = vd * c_surface. Check the sink is non-trivial but bounded.
    const c = base({ vd: 0.01, horizonS: 3600 });
    const r = runDispersion(c, uniformForcing(0, 0, 400), [centre(c, 10, 3600)]);
    expect(r.diagnostics.deposited).toBeGreaterThan(0.01 * r.diagnostics.emitted);
    expect(r.diagnostics.deposited).toBeLessThan(r.diagnostics.emitted);
  });
});

describe('determinism and helpers', () => {
  it('gives bit-identical output for identical inputs', () => {
    const c = base();
    const a = runDispersion(c, uniformForcing(3, 1, 700), [centre(c)]);
    const b = runDispersion(c, uniformForcing(3, 1, 700), [centre(c)]);
    expect(a.frames.length).toBe(b.frames.length);
    a.frames.forEach((fr, n) => expect(Array.from(fr.c)).toEqual(Array.from(b.frames[n].c)));
    expect(a.diagnostics).toEqual(b.diagnostics);
  });

  it('writes a frame at every output time and a zero first frame', () => {
    const c = base({ horizonS: 3600, outputEveryS: 900 });
    const r = runDispersion(c, uniformForcing(2, 0, 700), [centre(c)]);
    expect(r.frames.map((f) => Math.round(f.t))).toEqual([0, 900, 1800, 2700, 3600]);
    expect(massOf(c, r.frames[0].c)).toBe(0);
  });

  it('streams frames to a callback with progress', () => {
    const c = base({ outputEveryS: 1200 });
    const seen: number[] = [];
    runDispersion(c, uniformForcing(2, 0, 700), [centre(c)], (_f, p) => seen.push(p));
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBeCloseTo(1, 6);
  });

  it('samples a linear field exactly with trilinear interpolation', () => {
    const c = base();
    const f = new Float32Array(c.nx * c.ny * c.nz);
    for (let k = 0; k < c.nz; k += 1) for (let j = 0; j < c.ny; j += 1) for (let i = 0; i < c.nx; i += 1) f[idx(c, i, j, k)] = 2 * (i + 0.5) * c.dx + 3 * (j + 0.5) * c.dy + 5 * (k + 0.5) * c.dz;
    expect(sampleFrame(c, f, 7300, 4100, 430)).toBeCloseTo(2 * 7300 + 3 * 4100 + 5 * 430, 0);
  });

  it('converts fire radiative power to a PM2.5 emission of a few g/s per MW (illustrative)', () => {
    expect(fireEmission(10)).toBeCloseTo(29.44, 1);
    expect(fireEmission(0)).toBe(0);
  });

  it('puts the plume downwind of the source for a given wind direction', () => {
    const c = base();
    const r = runDispersion(c, uniformForcing(0, -4, 800), [centre(c)]);        // wind blowing toward the south
    const f = r.frames[r.frames.length - 1].c;
    const south = sampleFrame(c, f, 10000, 6000, 50), north = sampleFrame(c, f, 10000, 14000, 50);
    expect(south).toBeGreaterThan(20 * Math.max(north, 1e-9));
  });
});

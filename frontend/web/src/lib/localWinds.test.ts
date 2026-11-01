import { describe, expect, it } from 'vitest';
import { buildForcing, forcingPoints, manualMet, withMinuteRetry } from './localWinds';
import { runDispersion, sampleFrame, type Config } from '../sim/dispersion';

const T = Array.from({ length: 30 }, (_, i) => `2026-10-31T${String(i % 24).padStart(2, '0')}:00`.replace('2026-10-31', i < 24 ? '2026-10-31' : '2026-11-01'));

function point(elev: number, dirFrom: number, speed: number, withPressure = true) {
  const h: Record<string, any> = { time: T, boundary_layer_height: T.map(() => 600) };
  for (const l of [10, 80, 120, 180]) { h[`wind_speed_${l}m`] = T.map(() => speed + l / 100); h[`wind_direction_${l}m`] = T.map(() => dirFrom); }
  for (const [p, gh] of [[950, elev + 500], [925, elev + 760], [850, elev + 1450]] as const) {
    h[`wind_speed_${p}hPa`] = T.map(() => (withPressure ? speed + 3 : null)); h[`wind_direction_${p}hPa`] = T.map(() => (withPressure ? dirFrom + 20 : null));
    h[`geopotential_height_${p}hPa`] = T.map(() => gh);
  }
  return { elevation: elev, hourly: h };
}

describe('forcingPoints', () => {
  it('spans the box and is ordered south to north, west to east', () => {
    const p = forcingPoints({ lat: 28.5, lon: 77, halfKm: 24 });
    expect(p).toHaveLength(9);
    expect(p[0].lat).toBeLessThan(p[8].lat);
    expect(p[0].lon).toBeLessThan(p[2].lon);
    expect(p[0].lat).toBeCloseTo(p[2].lat, 6);                  // same row: same latitude
    expect((p[8].lat - p[0].lat) * 111.32).toBeCloseTo(48, 0);  // 48 km north-south
    expect(p[4].lat).toBeCloseTo(28.5, 6);                      // centre point is the domain centre
  });
});

describe('buildForcing', () => {
  const payload = Array.from({ length: 9 }, () => point(230, 270, 4));   // wind from the west at 4 m/s

  it('converts meteorological direction to u/v: a westerly blows toward +x (east)', () => {
    const m = buildForcing(payload, Date.parse('2026-10-31T05:30:00Z'), 12);
    expect(m.forcing.u[0]).toBeGreaterThan(3);
    expect(Math.abs(m.forcing.v[0])).toBeLessThan(1e-4);
    expect(m.windNow.dirFrom).toBeCloseTo(270, 3);
  });

  it('starts at the hour containing the start time and keeps hours + 2 steps', () => {
    const m = buildForcing(payload, Date.parse('2026-10-31T05:30:00Z'), 12);
    expect(m.forcing.nT).toBe(14);
    expect(new Date(m.times[0]).toISOString()).toBe('2026-10-31T05:00:00.000Z');
    expect(m.times).toHaveLength(14);
  });

  it('derives pressure-level heights above ground from geopotential minus elevation, in ascending order', () => {
    const m = buildForcing(payload, Date.parse('2026-10-31T05:00:00Z'), 6);
    expect(m.forcing.heights).toEqual([10, 80, 120, 180, 500, 760, 1450]);
    expect(m.levelLabels[4]).toContain('950 hPa');
  });

  it('drops a pressure level that is below ground, and copies the level below where a wind is missing', () => {
    const p = Array.from({ length: 9 }, () => point(230, 270, 4));
    p.forEach((pt) => { pt.hourly.geopotential_height_850hPa = T.map(() => 230 + 100); });   // 100 m above ground: inside the surface layer
    p.forEach((pt) => { pt.hourly.wind_speed_925hPa = T.map(() => null); });
    const m = buildForcing(p, Date.parse('2026-10-31T05:00:00Z'), 6);
    expect(m.forcing.heights).toEqual([10, 80, 120, 180, 500, 760]);
    const nPts = 9, nLev = m.forcing.heights.length;
    expect(m.forcing.u[(0 * nLev + 5) * nPts]).toBe(m.forcing.u[(0 * nLev + 4) * nPts]);       // 925 hPa missing -> copy of 950 hPa
  });

  it('rejects an empty or non-square payload', () => {
    expect(() => buildForcing([], 0, 6)).toThrow();
    expect(() => buildForcing(payload.slice(0, 8), Date.parse('2026-10-31T05:00:00Z'), 6)).toThrow();
  });

  it('drives the solver: a plume released into a westerly drifts east', () => {
    const m = buildForcing(payload, Date.parse('2026-10-31T05:00:00Z'), 3);
    const c: Config = { nx: 40, ny: 40, nz: 12, dx: 1000, dy: 1000, dz: 200, horizonS: 3600, outputEveryS: 3600, kh: 50, vd: 0.002, background: 0 };
    const r = runDispersion(c, m.forcing, [{ x: 12000, y: 20000, z: 80, q: 20, t0: 0, t1: 3600 }]);
    const f = r.frames[r.frames.length - 1].c;
    expect(sampleFrame(c, f, 17000, 20000, 80)).toBeGreaterThan(10 * Math.max(1e-9, sampleFrame(c, f, 7000, 20000, 80)));
  });
});

describe('manualMet', () => {
  it('gives a uniform wind from the requested direction for the whole run', () => {
    const m = manualMet(5, 0, 900, Date.parse('2026-10-31T05:30:00Z'), 12);   // from the north: blows toward -y
    expect(m.source).toBe('manual');
    expect(m.forcing.v[0]).toBeCloseTo(-5, 5);
    expect(Math.abs(m.forcing.u[0])).toBeLessThan(1e-5);
    expect(m.forcing.nT).toBe(14);
    expect(m.blhNow).toBe(900);
  });
});

describe('withMinuteRetry', () => {
  const noWait = () => Promise.resolve();
  it('retries after a per-minute refusal and then succeeds', async () => {
    let n = 0;
    const out = await withMinuteRetry(async () => { n += 1; if (n < 3) throw new Error('Wind data unavailable: Minutely API request limit exceeded.'); return 'ok'; }, 3, 1, noWait);
    expect(out).toBe('ok');
    expect(n).toBe(3);
  });
  it('does not retry a daily limit or any other error', async () => {
    let n = 0;
    await expect(withMinuteRetry(async () => { n += 1; throw new Error('Daily API request limit exceeded'); }, 3, 1, noWait)).rejects.toThrow('Daily');
    expect(n).toBe(1);
  });
  it('gives up after the allowed number of tries', async () => {
    let n = 0;
    await expect(withMinuteRetry(async () => { n += 1; throw new Error('Minutely API request limit exceeded'); }, 2, 1, noWait)).rejects.toThrow('Minutely');
    expect(n).toBe(2);
  });
});

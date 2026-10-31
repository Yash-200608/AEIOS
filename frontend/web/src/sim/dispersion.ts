// Scenario dispersion solver for the 3D twin. Pure TypeScript, no DOM, deterministic.
//
// What it solves: the transport of a passive, non-reacting tracer (an INCREMENT above background, in ug/m3) emitted by user-defined
// sources into a box of air above flat ground:
//
//   dc/dt + u . grad(c) = d/dz( Kz dc/dz ) + Kh laplacian_h(c) - (dry deposition at the ground) + sources
//
// Method (operator splitting, each step): inject sources -> horizontal advection (flux-limited Lax-Wendroff, MC limiter, Strang
// X-Y-X; conservative and monotone under CFL <= 1) -> explicit horizontal diffusion -> implicit vertical diffusion with deposition
// (backward Euler, tridiagonal, conservative). Horizontal winds come from interpolated model profiles; there is NO vertical wind,
// no terrain-forced flow, no chemistry, no secondary aerosol, no plume rise. The grid uses height above ground, so terrain is a
// display layer only. These are scenario tools, not forecasts of measured air quality.

export type Config = {
  nx: number; ny: number; nz: number;      // cells
  dx: number; dy: number; dz: number;      // m (dz = layer thickness above ground)
  horizonS: number;                        // simulated seconds
  outputEveryS: number;                    // frame interval
  cfl?: number;                            // advective Courant limit (default 0.8)
  dtMax?: number;                          // s (default 120)
  kh: number;                              // horizontal eddy diffusivity, m2/s
  vd: number;                              // dry deposition velocity, m/s (0 = none)
  background: number;                      // inflow concentration at the lateral boundaries, ug/m3 (0 = show the scenario increment only)
  z0?: number;                             // roughness length, m (default 0.3)
  kmin?: number;                           // floor for Kz, m2/s (default 0.05): the "stable layer / lid" mixing
  kzConst?: number;                        // test hook: constant Kz everywhere
  kzScale?: number;                        // multiplier on the boundary-layer Kz (default 1)
};

export type Source = { x: number; y: number; z: number; q: number; t0: number; t1: number };   // q in g/s, times in s from start

export type Forcing = {
  nT: number; dtF: number;                 // number of forcing times and their spacing (s); time 0 is the simulation start
  heights: number[];                       // wind levels, m above ground, ascending
  nxF: number; nyF: number;                // coarse forcing grid spanning the domain (1 x 1 = uniform)
  u: Float32Array; v: Float32Array;        // [t][level][jF][iF], m/s toward +x (east) and +y (north)
  blh: Float32Array;                       // [t][jF][iF], boundary-layer height, m
};

export type Diagnostics = { steps: number; emitted: number; inflow: number; outflow: number; deposited: number; clipped: number; mass: number; maxCourant: number };
export type Frame = { t: number; c: Float32Array };
export type Result = { frames: Frame[]; diagnostics: Diagnostics; config: Config };

const KAPPA = 0.4;

export const idx = (cfg: Config, i: number, j: number, k: number) => (k * cfg.ny + j) * cfg.nx + i;

/** Interpolate the coarse forcing to every cell centre of one time level; returns [u, v, blh] for that hour. */
function hourFields(cfg: Config, f: Forcing, h: number, z0: number): { u: Float32Array; v: Float32Array; blh: Float32Array } {
  const { nx, ny, nz, dz } = cfg;
  const nLev = f.heights.length, nPts = f.nxF * f.nyF;
  const u = new Float32Array(nx * ny * nz), v = new Float32Array(nx * ny * nz), blh = new Float32Array(nx * ny);
  const coarse = (arr: Float32Array, base: number, x: number, y: number) => {
    // bilinear over the coarse grid; x, y in [0, 1] of the domain
    if (f.nxF === 1 && f.nyF === 1) return arr[base];
    const fx = f.nxF === 1 ? 0 : x * (f.nxF - 1), fy = f.nyF === 1 ? 0 : y * (f.nyF - 1);
    const i0 = Math.min(f.nxF - 2 < 0 ? 0 : f.nxF - 2, Math.floor(fx)), j0 = Math.min(f.nyF - 2 < 0 ? 0 : f.nyF - 2, Math.floor(fy));
    const i1 = Math.min(f.nxF - 1, i0 + 1), j1 = Math.min(f.nyF - 1, j0 + 1);
    const ax = fx - i0, ay = fy - j0;
    const g = (ii: number, jj: number) => arr[base + jj * f.nxF + ii];
    return g(i0, j0) * (1 - ax) * (1 - ay) + g(i1, j0) * ax * (1 - ay) + g(i0, j1) * (1 - ax) * ay + g(i1, j1) * ax * ay;
  };
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const x = (i + 0.5) / nx, y = (j + 0.5) / ny;
      blh[j * nx + i] = coarse(f.blh, h * nPts, x, y);
      const ul = new Float64Array(nLev), vl = new Float64Array(nLev);
      for (let l = 0; l < nLev; l += 1) {
        ul[l] = coarse(f.u, (h * nLev + l) * nPts, x, y);
        vl[l] = coarse(f.v, (h * nLev + l) * nPts, x, y);
      }
      for (let k = 0; k < nz; k += 1) {
        const z = (k + 0.5) * dz;
        let uu: number, vv: number;
        if (z <= f.heights[0]) {            // below the lowest wind level: logarithmic profile toward the ground
          const s = Math.max(0.3, Math.log(Math.max(z, 1.05 * z0) / z0) / Math.log(f.heights[0] / z0));
          uu = ul[0] * s; vv = vl[0] * s;
        } else if (z >= f.heights[nLev - 1]) {
          uu = ul[nLev - 1]; vv = vl[nLev - 1];
        } else {
          let l = 0;
          while (f.heights[l + 1] < z) l += 1;
          const a = (z - f.heights[l]) / (f.heights[l + 1] - f.heights[l]);
          uu = ul[l] * (1 - a) + ul[l + 1] * a; vv = vl[l] * (1 - a) + vl[l + 1] * a;
        }
        const p = (k * ny + j) * nx + i;
        u[p] = uu; v[p] = vv;
      }
    }
  }
  return { u, v, blh };
}

function mc(r: number): number {            // monotonised-central flux limiter
  return Math.max(0, Math.min((1 + r) / 2, 2, 2 * r));
}

/** One 1-D conservative flux-limited advection sweep along a line of n cells. Returns [inflow, outflow] in concentration x metres. */
function sweepLine(c: Float64Array, w: Float32Array, start: number, stride: number, n: number, d: number, dt: number, bg: number, flux: Float64Array): [number, number] {
  let inflow = 0, outflow = 0;
  for (let f = 0; f <= n; f += 1) {
    const iL = start + (f - 1) * stride, iR = start + f * stride;
    const uf = f === 0 ? w[iR] : f === n ? w[iL] : 0.5 * (w[iL] + w[iR]);
    let F: number;
    if (f === 0) {
      F = uf >= 0 ? uf * bg : uf * c[iR];
    } else if (f === n) {
      F = uf >= 0 ? uf * c[iL] : uf * bg;
    } else {
      const cu = uf >= 0 ? c[iL] : c[iR];
      const cd = uf >= 0 ? c[iR] : c[iL];
      const iUU = uf >= 0 ? start + (f - 2) * stride : start + (f + 1) * stride;
      const hasUU = uf >= 0 ? f >= 2 : f <= n - 2;
      const cuu = hasUU ? c[iUU] : bg;
      const delta = cd - cu;
      const nu = Math.abs(uf) * dt / d;
      let corr = 0;
      if (delta !== 0) corr = 0.5 * (1 - nu) * mc((cu - cuu) / delta) * delta;
      F = uf * (cu + corr);
    }
    flux[f] = F;
    if (f === 0) { if (F > 0) inflow += F; else outflow -= F; }
    if (f === n) { if (F > 0) outflow += F; else inflow -= F; }
  }
  const k = dt / d;
  for (let i = 0; i < n; i += 1) c[start + i * stride] -= k * (flux[i + 1] - flux[i]);
  return [inflow * dt, outflow * dt];
}

/** Run the scenario. Concentrations are in ug/m3; masses in ug. Deterministic for identical inputs. */
export function runDispersion(cfg: Config, forcing: Forcing, sources: Source[], onFrame?: (fr: Frame, progress: number) => void): Result {
  const { nx, ny, nz, dx, dy, dz } = cfg;
  const n = nx * ny * nz;
  const cfl = cfg.cfl ?? 0.8, dtMax = cfg.dtMax ?? 120, z0 = cfg.z0 ?? 0.3, kmin = cfg.kmin ?? 0.05, kzScale = cfg.kzScale ?? 1;
  const c = new Float64Array(n);
  const cellVol = dx * dy * dz;
  const hours = Array.from({ length: forcing.nT }, (_, h) => hourFields(cfg, forcing, h, z0));
  const uw = new Float32Array(n), vw = new Float32Array(n), blh = new Float32Array(nx * ny), ustar = new Float32Array(nx * ny);
  const flux = new Float64Array(Math.max(nx, ny, nz) + 1);
  const diag: Diagnostics = { steps: 0, emitted: 0, inflow: 0, outflow: 0, deposited: 0, clipped: 0, mass: 0, maxCourant: 0 };
  const frames: Frame[] = [];
  const snap = (t: number) => {
    const fr = { t, c: Float32Array.from(c) };
    frames.push(fr);
    onFrame?.(fr, Math.min(1, t / cfg.horizonS));
  };
  snap(0);

  const bufD = new Float64Array(n);
  const a = new Float64Array(nz), b = new Float64Array(nz), cc = new Float64Array(nz), r = new Float64Array(nz), kz = new Float64Array(nz);

  let t = 0, nextOut = cfg.outputEveryS;
  while (t < cfg.horizonS - 1e-9) {
    // --- meteorology at time t (linear in time between hourly fields)
    const hf = Math.min(forcing.nT - 1, t / forcing.dtF), h0 = Math.min(forcing.nT - 1, Math.floor(hf)), h1 = Math.min(forcing.nT - 1, h0 + 1), fr = hf - h0;
    let umax = 1e-6, vmax = 1e-6;
    for (let p = 0; p < n; p += 1) {
      uw[p] = hours[h0].u[p] * (1 - fr) + hours[h1].u[p] * fr;
      vw[p] = hours[h0].v[p] * (1 - fr) + hours[h1].v[p] * fr;
      const au = Math.abs(uw[p]), av = Math.abs(vw[p]);
      if (au > umax) umax = au;
      if (av > vmax) vmax = av;
    }
    for (let p = 0; p < nx * ny; p += 1) {
      blh[p] = hours[h0].blh[p] * (1 - fr) + hours[h1].blh[p] * fr;
      // friction velocity from the lowest layer's wind (log law): u* = kappa U / ln(z / z0)
      const k0 = (0.5 * dz);
      const spd = Math.hypot(uw[p], vw[p]);
      ustar[p] = Math.max(0.05, (KAPPA * spd) / Math.log(Math.max(k0, 1.05 * z0) / z0));
    }
    // --- time step
    let dt = Math.min(dtMax, cfl * dx / umax, cfl * dy / vmax, 0.4 / (cfg.kh * (1 / (dx * dx) + 1 / (dy * dy)) + 1e-12));
    dt = Math.min(dt, nextOut - t, cfg.horizonS - t);
    if (dt <= 0) dt = Math.min(dtMax, cfg.horizonS - t);
    diag.maxCourant = Math.max(diag.maxCourant, (umax * dt) / dx, (vmax * dt) / dy);

    // --- sources (mass added to the cell containing the source)
    for (const s of sources) {
      const ov = Math.min(t + dt, s.t1) - Math.max(t, s.t0);
      if (ov <= 0) continue;
      const i = Math.min(nx - 1, Math.max(0, Math.floor(s.x / dx))), j = Math.min(ny - 1, Math.max(0, Math.floor(s.y / dy))), k = Math.min(nz - 1, Math.max(0, Math.floor(s.z / dz)));
      const mass = s.q * 1e6 * ov;            // ug
      c[idx(cfg, i, j, k)] += mass / cellVol;
      diag.emitted += mass;
    }

    // --- horizontal advection, Strang X(dt/2) Y(dt) X(dt/2)
    const sweepX = (dtx: number) => {
      for (let k = 0; k < nz; k += 1) for (let j = 0; j < ny; j += 1) {
        const [inn, out] = sweepLine(c, uw, (k * ny + j) * nx, 1, nx, dx, dtx, cfg.background, flux);
        diag.inflow += inn * dy * dz; diag.outflow += out * dy * dz;
      }
    };
    const sweepY = (dty: number) => {
      for (let k = 0; k < nz; k += 1) for (let i = 0; i < nx; i += 1) {
        const [inn, out] = sweepLine(c, vw, k * ny * nx + i, nx, ny, dy, dty, cfg.background, flux);
        diag.inflow += inn * dx * dz; diag.outflow += out * dx * dz;
      }
    };
    sweepX(dt / 2); sweepY(dt); sweepX(dt / 2);

    // --- horizontal diffusion (explicit, no-flux walls)
    if (cfg.kh > 0) {
      bufD.set(c);
      const kx = (cfg.kh * dt) / (dx * dx), ky = (cfg.kh * dt) / (dy * dy);
      for (let k = 0; k < nz; k += 1) for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
        const p = (k * ny + j) * nx + i, v0 = bufD[p];
        let d = 0;
        if (i > 0) d += kx * (bufD[p - 1] - v0);
        if (i < nx - 1) d += kx * (bufD[p + 1] - v0);
        if (j > 0) d += ky * (bufD[p - nx] - v0);
        if (j < ny - 1) d += ky * (bufD[p + nx] - v0);
        c[p] = v0 + d;
      }
    }

    // --- vertical mixing + dry deposition (implicit, conservative); K profile from the boundary-layer height
    for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
      const col = j * nx + i, h = Math.max(50, blh[col]), us = ustar[col];
      for (let k = 0; k < nz - 1; k += 1) {
        const z = (k + 1) * dz;                          // interface height
        kz[k] = cfg.kzConst !== undefined ? cfg.kzConst : Math.max(kmin, z < h ? kzScale * KAPPA * us * z * (1 - z / h) ** 2 : kmin);
      }
      for (let k = 0; k < nz; k += 1) {
        const lo = k > 0 ? (dt * kz[k - 1]) / (dz * dz) : 0, up = k < nz - 1 ? (dt * kz[k]) / (dz * dz) : 0;
        a[k] = -lo; cc[k] = -up; b[k] = 1 + lo + up + (k === 0 ? (dt * cfg.vd) / dz : 0);
        r[k] = c[(k * ny + j) * nx + i];
      }
      for (let k = 1; k < nz; k += 1) {                  // Thomas algorithm
        const m = a[k] / b[k - 1];
        b[k] -= m * cc[k - 1]; r[k] -= m * r[k - 1];
      }
      r[nz - 1] /= b[nz - 1];
      for (let k = nz - 2; k >= 0; k -= 1) r[k] = (r[k] - cc[k] * r[k + 1]) / b[k];
      diag.deposited += (dt * cfg.vd * r[0]) * dx * dy;
      for (let k = 0; k < nz; k += 1) c[(k * ny + j) * nx + i] = r[k];
    }

    // --- tiny negative values from the limiter are clipped and their mass reported, never hidden
    for (let p = 0; p < n; p += 1) if (c[p] < 0) { diag.clipped += -c[p] * cellVol; c[p] = 0; }

    t += dt;
    diag.steps += 1;
    if (t >= nextOut - 1e-9) { snap(t); nextOut += cfg.outputEveryS; }
  }
  let m = 0;
  for (let p = 0; p < n; p += 1) m += c[p];
  diag.mass = m * cellVol;
  return { frames, diagnostics: diag, config: cfg };
}

// ---- helpers for the viewer and the tests -------------------------------------------------------------------------------------

/** Trilinear sample of one frame at (x, y, z) metres from the domain's SW corner, ground level. */
export function sampleFrame(cfg: Config, c: Float32Array, x: number, y: number, z: number): number {
  const fx = Math.min(cfg.nx - 1, Math.max(0, x / cfg.dx - 0.5)), fy = Math.min(cfg.ny - 1, Math.max(0, y / cfg.dy - 0.5)), fz = Math.min(cfg.nz - 1, Math.max(0, z / cfg.dz - 0.5));
  const i0 = Math.min(cfg.nx - 2, Math.floor(fx)), j0 = Math.min(cfg.ny - 2, Math.floor(fy)), k0 = Math.min(cfg.nz - 2, Math.floor(fz));
  const ax = fx - i0, ay = fy - j0, az = fz - k0;
  const g = (i: number, j: number, k: number) => c[idx(cfg, Math.max(0, i), Math.max(0, j), Math.max(0, k))];
  let s = 0;
  for (let dk = 0; dk < 2; dk += 1) for (let dj = 0; dj < 2; dj += 1) for (let di = 0; di < 2; di += 1) {
    s += g(i0 + di, j0 + dj, k0 + dk) * (di ? ax : 1 - ax) * (dj ? ay : 1 - ay) * (dk ? az : 1 - az);
  }
  return s;
}

/** Uniform forcing (same wind and boundary-layer height everywhere and at all times), used by tests and as a fallback. */
export function uniformForcing(u: number, v: number, blh: number, nT = 2, dtF = 3600): Forcing {
  return { nT, dtF, heights: [10, 2000], nxF: 1, nyF: 1, u: Float32Array.from({ length: nT * 2 }, () => u), v: Float32Array.from({ length: nT * 2 }, () => v), blh: Float32Array.from({ length: nT }, () => blh) };
}

/** PM2.5 emission (g/s) of a fire from its radiative power. Illustrative: biomass burned 0.368 kg per MJ of fire radiative energy
 *  (Wooster et al. 2005) times a crop-residue PM2.5 emission factor of ~8 g/kg gives about 2.9 g/s per MW. Good to roughly an order
 *  of magnitude; satellite snapshots also miss the diurnal cycle of burning. */
export const PM25_G_PER_S_PER_MW = 0.368 * 8;
export const fireEmission = (frpMw: number) => frpMw * PM25_G_PER_S_PER_MW;

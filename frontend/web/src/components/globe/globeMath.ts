/*
 * Pure maths for the Overview globe (no three.js, no DOM): coordinate convention, easing, camera fit and the intro
 * choreography as a function of time. The engine samples these every frame; keeping them pure makes the timeline
 * deterministic (frame-rate independent) and testable.
 *
 * Convention (shared with landDots.ts): y up, longitude 0 at +Z, east toward +X:
 *   x = cos(lat) sin(lon), y = sin(lat), z = cos(lat) cos(lon).
 * A globe rotation of -lon about +Y brings longitude `lon` to the front (+Z, toward a camera on the +Z side); a camera
 * raised to elevation `lat` above the equator then looks straight down at that latitude.
 */

export type LatLon = { lat: number; lon: number };

export const DEG = Math.PI / 180;

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;

export function latLonToVec3(lat: number, lon: number, radius = 1): [number, number, number] {
  const phi = lat * DEG;
  const lambda = lon * DEG;
  return [radius * Math.cos(phi) * Math.sin(lambda), radius * Math.sin(phi), radius * Math.cos(phi) * Math.cos(lambda)];
}

/** Great-circle distance in km (mean Earth radius 6371 km). */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "28.478° N, 76.904° E" */
export function formatLatLon({ lat, lon }: LatLon, digits = 3): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(digits)}° ${ns}, ${Math.abs(lon).toFixed(digits)}° ${ew}`;
}

/** CSS-style cubic-bezier easing (x1, x2 in 0..1), solved with Newton steps and a bisection fallback. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
  const slopeX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    const x = clamp01(t);
    let u = x;
    for (let i = 0; i < 6; i += 1) {
      const err = sampleX(u) - x;
      const d = slopeX(u);
      if (Math.abs(err) < 1e-6) return sampleY(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 24; i += 1) {
      const value = sampleX(u);
      if (Math.abs(value - x) < 1e-6) break;
      if (value < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return sampleY(u);
  };
}

/** Camera distance at which a unit sphere fills `fill` of the shorter viewport side (vertical FOV in degrees). */
export function fitDistance(aspect: number, fovDeg: number, fill: number): number {
  const tanV = Math.tan((fovDeg * DEG) / 2);
  const tanMin = Math.min(tanV, tanV * Math.max(0.1, aspect));
  return 1 / Math.sin(Math.atan(fill * tanMin));
}

/** The intro timeline (seconds). */
export const INTRO = {
  duration: 4.3, // intro is "done" here
  spinEnd: 3.7, // the globe has turned the site to the front
  dollyStart: 0.35,
  dollyEnd: 3.95,
  reveal: 3.0, // title and chips rise in
  lockStart: 3.05, // site reticle closes in
  lockEnd: 3.8,
  sweepDeg: 160, // the camera travels east from the Americas over the Atlantic, Africa and Arabia to the site
  startElevationDeg: 2,
  startRollDeg: -9,
  fillFar: 0.3, // globe size at the start (share of the shorter side)
  fillNear: 0.86, // final size: the whole globe and its halo stay in frame
  elevationOffsetDeg: -2, // final camera elevation relative to the site latitude (site sits just above centre)
} as const;

/** Idle drift after the intro: a slow sway that keeps the site in view. */
export const IDLE = { swayDeg: 10, swayPeriod: 40, tiltDeg: 1.2, tiltPeriod: 57, rampIn: 5 } as const;

export const PULSE_PERIOD = 2.8; // s, site locator ring

export type GlobePose = {
  spin: number; // globe rotation about +Y, radians
  distance: number; // camera distance from the globe centre (globe radius = 1)
  elevation: number; // camera elevation above the equatorial plane, radians
  roll: number; // camera roll, radians
  fade: number; // 0..1 globe visibility
  lock: number; // 0..1 site reticle
  focus: number; // 0..1 emphasis of the land around the site
};

const spinEase = cubicBezier(0.32, 0.18, 0.12, 1); // already turning at the start, long settle
const dollyEase = cubicBezier(0.55, 0, 0.15, 1); // slow push, decisive approach, quiet settle

export type PoseFrame = { site: LatLon; near: number; far: number };

function finalSpin(site: LatLon) {
  return -site.lon * DEG;
}

export function introPose(t: number, frame: PoseFrame): GlobePose {
  const spinT = spinEase(t / INTRO.spinEnd);
  const dollyT = dollyEase((t - INTRO.dollyStart) / (INTRO.dollyEnd - INTRO.dollyStart));
  const end = finalSpin(frame.site);
  const start = end + INTRO.sweepDeg * DEG; // facing longitude = -spin, so it increases (eastward) toward the site
  const finalElevation = (frame.site.lat + INTRO.elevationOffsetDeg) * DEG;
  return {
    spin: lerp(start, end, spinT),
    distance: frame.far * (frame.near / frame.far) ** dollyT, // exponential: constant perceived zoom speed
    elevation: lerp(INTRO.startElevationDeg * DEG, finalElevation, dollyT),
    roll: lerp(INTRO.startRollDeg * DEG, 0, dollyT),
    fade: smoothstep(0, 0.9, t),
    lock: easeOutCubic((t - INTRO.lockStart) / (INTRO.lockEnd - INTRO.lockStart)),
    focus: smoothstep(2.6, 3.8, t),
  };
}

/** Pose after the intro; t = seconds of idle drift (0 = the final intro frame exactly). */
export function idlePose(t: number, frame: PoseFrame): GlobePose {
  const ramp = smoothstep(0, IDLE.rampIn, t);
  return {
    spin: finalSpin(frame.site) + IDLE.swayDeg * DEG * ramp * Math.sin((2 * Math.PI * t) / IDLE.swayPeriod),
    distance: frame.near,
    elevation: (frame.site.lat + INTRO.elevationOffsetDeg + IDLE.tiltDeg * ramp * Math.sin((2 * Math.PI * t) / IDLE.tiltPeriod)) * DEG,
    roll: 0,
    fade: 1,
    lock: 1,
    focus: 1,
  };
}

/**
 * The scroll-driven descent (Overview landing): 0 = the resting pose, 1 = the camera low over the site, which sits exactly at the
 * centre of the frame. Distance is interpolated exponentially (constant perceived zoom speed), everything else linearly on an
 * eased parameter. `close` is the final camera distance from the globe centre (globe radius 1).
 */
// close: low enough to read the region, high enough that the land stays a fine dot matrix (closer, it turns into polka dots).
export const DESCENT = { close: 2.1, gridBoost: 0.24 } as const;

/** World scale of the site reticle at a camera distance: shrinks as the camera descends so its on-screen size grows gently. */
export function reticleScale(distance: number, near: number): number {
  return Math.min(1, Math.max(0.4, ((distance - 1) / Math.max(0.01, near - 1)) ** 0.7));
}

const descentEase = cubicBezier(0.45, 0, 0.2, 1);

export function descentPose(base: GlobePose, d: number, frame: PoseFrame): GlobePose {
  const e = descentEase(d);
  if (e <= 0) return base;
  return {
    spin: lerp(base.spin, finalSpin(frame.site), e),
    distance: base.distance * (DESCENT.close / base.distance) ** e,
    elevation: lerp(base.elevation, frame.site.lat * DEG, e),
    roll: lerp(base.roll, 0, e),
    fade: lerp(base.fade, 1, e),
    lock: lerp(base.lock, 1, e),
    focus: lerp(base.focus, 1, e),
  };
}

/** Eased descent parameter (shared by the engine for the framing and the graticule). */
export function descentEased(d: number): number {
  return descentEase(d);
}

/** A rectangle in fractions of the canvas (x, y = top-left). */
export type FrameBox = { x: number; y: number; w: number; h: number };

/** Locator ring: 0..1 phase -> scale and opacity (expands and fades; hidden when not running). */
export function pulseAt(t: number): { scale: number; opacity: number } {
  const p = (((t % PULSE_PERIOD) + PULSE_PERIOD) % PULSE_PERIOD) / PULSE_PERIOD;
  return { scale: 1 + 2.4 * easeOutCubic(p), opacity: 0.6 * (1 - p) ** 2 };
}

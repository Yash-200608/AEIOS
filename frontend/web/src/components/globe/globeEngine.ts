import * as THREE from 'three';
import {
  DEG,
  INTRO,
  DESCENT,
  descentEased,
  descentPose,
  fitDistance,
  lerp,
  idlePose,
  introPose,
  latLonToVec3,
  pulseAt,
  reticleScale,
  type FrameBox,
  type GlobePose,
  type LatLon,
  type PoseFrame,
} from './globeMath';

/*
 * Plain three.js dot-matrix Earth for the Overview landing (no React Three Fiber). Loaded lazily by GlobeHero.
 *
 * Scene: a very dark ocean sphere with a soft light gradient and fresnel rim, land as soft round points (Natural Earth
 * 1:110m, see landDots.ts), a faint 30-degree graticule, a back-side fresnel atmosphere shell, a static star field and one
 * site reticle (the two observation sites are 1.3 km apart, far below the globe's resolution, so they share one marker).
 * Everything is decorative geography: no layer encodes a measurement.
 *
 * Camera: scripted, never user-driven (no OrbitControls, the canvas ignores pointer input so vertical touch scrolling is
 * never trapped). Poses come from globeMath.ts as a pure function of accumulated time, so the intro is frame-rate
 * independent (dt in seconds, clamped to 0.1 s) and Skip/Replay are exact. The scroll descent (setDescent, 0..1) is
 * composed on top of the intro/idle pose (globeMath.descentPose), so scrolling and time never fight over the camera.
 *
 * Framing: the canvas covers the whole hero. The resting globe is sized to fit the box GlobeHero measures (setRestBox) and
 * centred on it with camera.setViewOffset; the descent moves that centre to the middle of the canvas.
 *
 * Loop: start()/stop() are driven by useActiveLoop. When stopped no requestAnimationFrame is scheduled at all; single frames
 * are drawn on creation, resize, Skip/Replay, site change, descent change and when the tab becomes visible again. The intro
 * runs at the display rate; the idle drift is capped at about 30 FPS, except that a descent change draws on the next frame.
 *
 * Test contract on the host: data-globe-active="true"|"false" (loop running) and data-globe-frames (frames rendered,
 * written every 10 loop frames, after every single frame and when the loop stops). No React state is touched per frame.
 */

export type GlobeEngineOptions = {
  host: HTMLDivElement;
  /** Absolutely positioned overlay moved to the marker's screen position (transform only; data-placed toggles visibility). */
  label?: HTMLElement | null;
  site: LatLon;
  /** Packed xyz land dot positions on the unit sphere (decodeLandDots()). */
  land: Float32Array;
  /** Start at the final frame (intro already seen this session, or reduced motion). */
  introDone: boolean;
  /** Where the resting globe sits on the canvas (fractions); the canvas covers the whole hero. Default: the whole canvas. */
  restBox?: FrameBox;
  onReveal(): void;
  onDone(): void;
};

export type GlobeEngine = {
  start(): void;
  stop(): void;
  /** Jump to the final intro frame (fires onReveal/onDone if they have not fired). */
  skip(): void;
  /** Restart the intro from its first frame. */
  replay(): void;
  /** The static final frame, focused on the site (reduced motion). */
  showFinalFrame(): void;
  setSite(site: LatLon): void;
  /** The scroll-driven descent, 0..1 (0 = resting pose). Drawn at once when the loop is stopped. */
  setDescent(d: number): void;
  /** The resting globe's box on the canvas (fractions), measured from the layout. */
  setRestBox(box: FrameBox): void;
  /** True while the intro is part-way through (it has advanced but not finished). */
  readonly introStarted: boolean;
  readonly running: boolean;
  dispose(): void;
};

const FOV = 30;
const MAX_DT = 0.1;
const IDLE_MIN_FRAME_MS = 32; // ~30 FPS is plenty for a 0.25 deg/s drift
const OCEAN_RADIUS = 0.99;
const LAND_RADIUS = 1.0;
const ATMOSPHERE_RADIUS = 1.15;
const DOT_SIZE = 0.0078; // world units (unit globe); about half the Fibonacci spacing of 60k points
const STAR_COUNT = 650;

// mulberry32: stable star placement and dot brightness between mounts.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LAND_VERT = /* glsl */ `
uniform float uSize;
uniform float uScale;
uniform float uOpacity;
uniform float uFocus;
uniform vec3 uSiteDir;
uniform vec3 uColorFront;
uniform vec3 uColorLimb;
attribute float aRand;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float facing = dot(normalize(world.xyz), normalize(cameraPosition - world.xyz));
  float near = smoothstep(0.975, 0.999, dot(normalize(position), uSiteDir)) * uFocus;
  vec4 mv = viewMatrix * world;
  // Dot diameter in device pixels. Below about 2.6 px the Fibonacci lattice aliases into moire stripes, so a distant globe
  // draws larger, fainter dots that blend into a soft fill instead (roughly constant brightness).
  float px = uSize * uScale / -mv.z;
  float size = clamp(px, 2.6, 48.0);
  float energy = mix(clamp((px * px) / (size * size), 0.0, 1.0), 1.0, 0.15);
  gl_PointSize = size * 2.0;
  gl_Position = projectionMatrix * mv;
  vColor = mix(uColorLimb, uColorFront, smoothstep(0.1, 0.9, facing));
  vColor = mix(vColor, vec3(1.0), near * 0.3);
  vAlpha = uOpacity * energy * smoothstep(0.0, 0.38, facing) * (0.55 + 0.45 * aRand) * (1.0 + near * 0.7);
}`;

const LAND_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.3, 0.5, d);
  float halo = 1.0 - smoothstep(0.0, 1.0, d);
  float a = (core + halo * halo * 0.3) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

const OCEAN_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const OCEAN_FRAG = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uRim;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec3 n = normalize(vNormal);
  float facing = clamp(dot(n, normalize(vView)), 0.0, 1.0);
  float light = clamp(dot(n, normalize(vec3(-0.5, 0.6, 0.65))), 0.0, 1.0);
  vec3 color = mix(uDeep, uShallow, light * light);
  color += uRim * pow(1.0 - facing, 3.0) * 0.6;
  gl_FragColor = vec4(color, uOpacity);
  #include <colorspace_fragment>
}`;

const ATMOSPHERE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uEdge;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  // Back faces of the shell: the dot product is 0 at the shell's silhouette and about -uEdge just outside the globe limb.
  float t = clamp(-dot(normalize(vNormal), normalize(vView)) / uEdge, 0.0, 1.0);
  float glow = pow(t, 2.8) * 0.62;
  gl_FragColor = vec4(uColor, glow * uOpacity);
  #include <colorspace_fragment>
}`;

const LINE_VERT = /* glsl */ `
varying float vFacing;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vFacing = dot(normalize(world.xyz), normalize(cameraPosition - world.xyz));
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFacing;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * smoothstep(0.05, 0.5, vFacing));
  #include <colorspace_fragment>
}`;

const STAR_VERT = /* glsl */ `
uniform float uPixelRatio;
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio;
  vAlpha = aAlpha;
}`;

const STAR_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * vAlpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

function graticuleGeometry(radius: number): THREE.BufferGeometry {
  const points: number[] = [];
  const push = (lat: number, lon: number) => points.push(...latLonToVec3(lat, lon, radius));
  const step = 2;
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += step) {
      push(lat, lon);
      push(lat, lon + step);
    }
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -84; lat < 84; lat += step) {
      push(lat, lon);
      push(lat + step, lon);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

export function createGlobeEngine(options: GlobeEngineOptions): GlobeEngine {
  const { host, label } = options;
  let site: LatLon = { ...options.site };

  const css = getComputedStyle(host);
  const token = (name: string, fallback: string) => new THREE.Color(css.getPropertyValue(name).trim() || fallback);
  const accent = token('--aeios-accent', '#42d9d0');
  const regional = token('--aeios-source-regional', '#8daeff');
  const canvasTone = token('--aeios-canvas', '#080d13');
  const surfaceTone = token('--aeios-surface-2', '#141f29');
  const starTone = token('--aeios-text-secondary', '#b3c0cc');

  // Throws when WebGL is unavailable; GlobeHero catches it and keeps its static fallback.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'pan-y';
  canvas.style.pointerEvents = 'none';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 260);
  const globe = new THREE.Group();
  scene.add(globe);

  // Ocean
  const oceanUniforms = {
    uDeep: { value: canvasTone.clone().multiplyScalar(0.55) },
    uShallow: { value: surfaceTone.clone().lerp(regional, 0.08) },
    uRim: { value: regional.clone().lerp(accent, 0.25) },
    uOpacity: { value: 0 },
  };
  const ocean = new THREE.Mesh(
    new THREE.SphereGeometry(OCEAN_RADIUS, 96, 64),
    new THREE.ShaderMaterial({ uniforms: oceanUniforms, vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG, transparent: true }),
  );
  ocean.renderOrder = 0;
  globe.add(ocean);

  // Graticule (every 30 degrees)
  const lineUniforms = { uColor: { value: regional.clone() }, uOpacity: { value: 0 } };
  const graticule = new THREE.LineSegments(
    graticuleGeometry(1.0015),
    new THREE.ShaderMaterial({
      uniforms: lineUniforms,
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      transparent: true,
      depthWrite: false,
    }),
  );
  graticule.renderOrder = 1;
  globe.add(graticule);

  // Land dots
  const landGeometry = new THREE.BufferGeometry();
  const landPositions = new Float32Array(options.land.length);
  for (let i = 0; i < options.land.length; i += 1) landPositions[i] = options.land[i] * LAND_RADIUS;
  landGeometry.setAttribute('position', new THREE.BufferAttribute(landPositions, 3));
  const rand = seeded(1977);
  const landRand = new Float32Array(landPositions.length / 3);
  for (let i = 0; i < landRand.length; i += 1) landRand[i] = rand();
  landGeometry.setAttribute('aRand', new THREE.BufferAttribute(landRand, 1));
  const landUniforms = {
    uSize: { value: DOT_SIZE },
    uScale: { value: 600 },
    uOpacity: { value: 0 },
    uFocus: { value: 0 },
    uSiteDir: { value: new THREE.Vector3(...latLonToVec3(site.lat, site.lon)) },
    uColorFront: { value: accent.clone() },
    uColorLimb: { value: regional.clone() },
  };
  const land = new THREE.Points(
    landGeometry,
    new THREE.ShaderMaterial({
      uniforms: landUniforms,
      vertexShader: LAND_VERT,
      fragmentShader: LAND_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  land.renderOrder = 2;
  globe.add(land);

  // Site reticle: core dot, closing ring with four corner ticks, and a locator pulse. Lies in the tangent plane.
  const marker = new THREE.Group();
  globe.add(marker);
  const markerMaterial = (color: THREE.Color) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  const coreColor = accent.clone().lerp(new THREE.Color(1, 1, 1), 0.55);
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.0075, 32), markerMaterial(coreColor));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.0305, 72), markerMaterial(accent));
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.027, 0.0295, 72), markerMaterial(accent));
  const tickPoints: number[] = [];
  for (let k = 0; k < 4; k += 1) {
    const a = (45 + 90 * k) * DEG;
    tickPoints.push(Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0, Math.cos(a) * 0.054, Math.sin(a) * 0.054, 0);
  }
  const tickGeometry = new THREE.BufferGeometry();
  tickGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tickPoints, 3));
  const tickMaterial = new THREE.LineBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ticks = new THREE.LineSegments(tickGeometry, tickMaterial);
  [pulse, ring, ticks, core].forEach((object, i) => {
    object.renderOrder = 3 + i * 0.01;
    marker.add(object);
  });

  const placeMarker = () => {
    const normal = new THREE.Vector3(...latLonToVec3(site.lat, site.lon));
    marker.position.copy(normal).multiplyScalar(1.004);
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    landUniforms.uSiteDir.value.copy(normal);
  };
  placeMarker();

  // Atmosphere halo (not rotated: it is symmetric)
  const atmosphereUniforms = {
    uColor: { value: regional.clone().lerp(accent, 0.3) },
    uOpacity: { value: 0 },
    uEdge: { value: Math.sqrt(1 - 1 / (ATMOSPHERE_RADIUS * ATMOSPHERE_RADIUS)) },
  };
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(ATMOSPHERE_RADIUS, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: atmosphereUniforms,
      vertexShader: OCEAN_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  atmosphere.renderOrder = 4;
  scene.add(atmosphere);

  // Static star field (decorative backdrop, never animated)
  const starRand = seeded(4242);
  const starPositions = new Float32Array(STAR_COUNT * 3);
  const starSizes = new Float32Array(STAR_COUNT);
  const starAlphas = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const u = starRand() * 2 - 1;
    const theta = starRand() * Math.PI * 2;
    const r = 90 + starRand() * 60;
    const s = Math.sqrt(1 - u * u);
    starPositions.set([r * s * Math.cos(theta), r * u, r * s * Math.sin(theta)], i * 3);
    starSizes[i] = 0.7 + starRand() ** 3 * 1.6;
    starAlphas[i] = 0.12 + starRand() ** 2 * 0.45;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
  starGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(starAlphas, 1));
  const starUniforms = { uColor: { value: starTone }, uOpacity: { value: 0 }, uPixelRatio: { value: pixelRatio } };
  const stars = new THREE.Points(
    starGeometry,
    new THREE.ShaderMaterial({
      uniforms: starUniforms,
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
    }),
  );
  stars.renderOrder = -1;
  scene.add(stars);

  // ---- state ----
  let mode: 'intro' | 'idle' = options.introDone ? 'idle' : 'intro';
  let introT = options.introDone ? INTRO.duration : 0;
  let idleT = 0;
  let pulseT = 0;
  let revealed = options.introDone;
  let finished = options.introDone;
  let raf = 0;
  let lastFrame = 0;
  let frames = 0;
  let disposed = false;
  let frame: PoseFrame = { site, near: 4.3, far: 11.7 };
  let restBox: FrameBox = options.restBox ?? { x: 0, y: 0, w: 1, h: 1 };
  let descent = 0;
  let urgent = false; // a descent change: draw on the next loop frame even under the idle frame cap
  let viewWidth = 1;
  let viewHeight = 1;
  let labelX = Number.NaN;
  let labelY = Number.NaN;
  let labelPlaced: boolean | null = null;
  const projected = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  host.dataset.globeActive = 'false';
  host.dataset.globeFrames = '0';

  const applyPose = (pose: GlobePose, showPulse: boolean) => {
    globe.rotation.y = pose.spin;
    camera.position.set(0, pose.distance * Math.sin(pose.elevation), pose.distance * Math.cos(pose.elevation));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.rotateZ(pose.roll);
    camera.updateMatrixWorld();

    // Framing: the globe centre moves from the resting box's centre to the canvas centre as the descent progresses.
    const e = descentEased(descent);
    const cx = lerp(restBox.x + restBox.w / 2, 0.5, e);
    const cy = lerp(restBox.y + restBox.h / 2, 0.5, e);
    camera.setViewOffset(viewWidth, viewHeight, (0.5 - cx) * viewWidth, (0.5 - cy) * viewHeight, viewWidth, viewHeight);

    oceanUniforms.uOpacity.value = pose.fade;
    lineUniforms.uOpacity.value = (0.16 + DESCENT.gridBoost * e) * pose.fade;
    landUniforms.uOpacity.value = pose.fade;
    landUniforms.uFocus.value = pose.focus;
    atmosphereUniforms.uOpacity.value = pose.fade;
    starUniforms.uOpacity.value = pose.fade;

    marker.scale.setScalar(reticleScale(pose.distance, frame.near));
    const lock = pose.lock;
    const ringScale = 1 + 2.2 * (1 - lock);
    ring.scale.setScalar(ringScale);
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.95 * lock;
    ticks.scale.setScalar(1 + 1.4 * (1 - lock));
    ticks.rotation.z = (1 - lock) * 45 * DEG;
    tickMaterial.opacity = 0.85 * lock;
    (core.material as THREE.MeshBasicMaterial).opacity = Math.min(1, lock * 2);
    const p = pulseAt(pulseT);
    pulse.visible = showPulse && lock >= 1;
    pulse.scale.setScalar(p.scale);
    (pulse.material as THREE.MeshBasicMaterial).opacity = p.opacity;
  };

  const currentPose = () => descentPose(mode === 'intro' ? introPose(introT, frame) : idlePose(idleT, frame), descent, frame);

  const placeLabel = () => {
    if (!label) return;
    marker.getWorldPosition(projected); // matrices are current: called right after render()
    toCamera.copy(camera.position).sub(projected).normalize();
    const facing = (toCamera.x * projected.x + toCamera.y * projected.y + toCamera.z * projected.z) / projected.length();
    projected.project(camera);
    const x = ((projected.x + 1) / 2) * viewWidth;
    const y = ((1 - projected.y) / 2) * viewHeight;
    // Position first (labelX is NaN after a resize or site change, which forces a write), then visibility.
    if (!(Math.abs(x - labelX) <= 0.1 && Math.abs(y - labelY) <= 0.1)) {
      label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      labelX = x;
      labelY = y;
    }
    const placed = facing > 0.2;
    if (placed !== labelPlaced) {
      label.dataset.placed = placed ? 'true' : 'false';
      labelPlaced = placed;
    }
  };

  const draw = (showPulse: boolean) => {
    if (disposed) return;
    applyPose(currentPose(), showPulse);
    renderer.render(scene, camera);
    placeLabel();
    frames += 1;
  };

  /** A single frame while the loop is stopped (static; the pulse is hidden so a paused frame never looks mid-signal). */
  const drawStatic = () => {
    if (raf || disposed) return;
    draw(false);
    host.dataset.globeFrames = String(frames);
  };

  const fireReveal = () => {
    if (revealed) return;
    revealed = true;
    options.onReveal();
  };
  const fireDone = () => {
    if (finished) return;
    finished = true;
    options.onDone();
  };

  const advance = (dt: number) => {
    if (mode === 'intro') {
      introT = Math.min(INTRO.duration, introT + dt);
      if (introT >= INTRO.lockEnd) pulseT += dt;
      if (introT >= INTRO.reveal) fireReveal();
      if (introT >= INTRO.duration) {
        mode = 'idle';
        idleT = 0;
        fireDone();
      }
    } else {
      idleT += dt;
      pulseT += dt;
    }
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const elapsed = now - lastFrame;
    if (mode === 'idle' && elapsed < IDLE_MIN_FRAME_MS && !urgent) return;
    urgent = false;
    const dt = Math.min(MAX_DT, Math.max(0, elapsed / 1000));
    lastFrame = now;
    advance(dt);
    draw(true);
    if (frames % 10 === 0) host.dataset.globeFrames = String(frames);
  };

  const resize = () => {
    viewWidth = Math.max(1, host.clientWidth);
    viewHeight = Math.max(1, host.clientHeight);
    camera.aspect = viewWidth / viewHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewWidth, viewHeight, false);
    landUniforms.uScale.value = (viewHeight * pixelRatio) / (2 * Math.tan((FOV * DEG) / 2));
    fit();
    drawStatic(); // setSize clears the canvas
  };

  /** Resting sizes from the resting box: INTRO.fillNear of its shorter side (the visible halo keeps a 14 px margin). */
  const fit = () => {
    const shorter = Math.max(1, Math.min(restBox.w * viewWidth, restBox.h * viewHeight));
    const fillNear = Math.max(0.6, Math.min(INTRO.fillNear, (shorter - 28) / (shorter * 1.12)));
    // The vertical FOV spans the canvas height, so a fill of the box is a fill of (box px / canvas height) at aspect 1.
    frame = {
      site,
      near: fitDistance(1, FOV, (fillNear * shorter) / viewHeight),
      far: fitDistance(1, FOV, (INTRO.fillFar * shorter) / viewHeight),
    };
    labelX = Number.NaN;
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  const onVisibility = () => {
    if (!document.hidden) drawStatic();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const toFinal = () => {
    mode = 'idle';
    introT = INTRO.duration;
    idleT = 0;
  };

  return {
    get introStarted() {
      return mode === 'intro' && introT > 0 && introT < INTRO.duration;
    },
    get running() {
      return raf !== 0;
    },
    start() {
      if (raf || disposed) return;
      lastFrame = performance.now();
      host.dataset.globeActive = 'true';
      raf = requestAnimationFrame(tick);
    },
    stop() {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
      host.dataset.globeActive = 'false';
      drawStatic(); // one clean frame without the locator pulse (also writes the final frame count)
    },
    skip() {
      toFinal();
      fireReveal();
      fireDone();
      if (!raf) drawStatic();
    },
    replay() {
      mode = 'intro';
      introT = 0;
      idleT = 0;
      pulseT = 0;
      revealed = false;
      finished = false;
      if (!raf) drawStatic();
    },
    showFinalFrame() {
      toFinal();
      revealed = true;
      finished = true;
      if (!raf) drawStatic();
    },
    setSite(next) {
      if (next.lat === site.lat && next.lon === site.lon) return;
      site = { ...next };
      frame = { ...frame, site };
      placeMarker();
      labelX = Number.NaN;
      if (!raf) drawStatic();
    },
    setDescent(d) {
      const next = Math.min(1, Math.max(0, d));
      if (Math.abs(next - descent) < 1e-4) return;
      descent = next;
      urgent = true;
      labelX = Number.NaN;
      if (!raf) drawStatic();
    },
    setRestBox(box) {
      if (box.x === restBox.x && box.y === restBox.y && box.w === restBox.w && box.h === restBox.h) return;
      restBox = { ...box };
      fit();
      if (!raf) drawStatic();
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      host.dataset.globeActive = 'false';
      host.dataset.globeFrames = String(frames);
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      renderer.forceContextLoss();
      renderer.dispose();
      if (canvas.parentElement === host) host.removeChild(canvas);
      if (label) delete label.dataset.placed;
    },
  };
}

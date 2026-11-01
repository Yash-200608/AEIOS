import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useActiveLoop } from '../motion/useActiveLoop';

/*
 * Plain Three.js atmospheric scene (no React Three Fiber).
 *
 * Lifecycle: one mount effect creates the renderer, camera, controls, lights, static geometry and object pools once and
 * disposes all of it on unmount (forceContextLoss first). New weather values are applied in place to the existing objects,
 * so a data change never rebuilds the WebGL context.
 *
 * Loop: runs only while useActiveLoop allows it (on screen within 100 px, tab visible, motion not reduced, not paused by
 * the user). Otherwise no requestAnimationFrame is scheduled at all; a single static frame is drawn on mount, on data change,
 * on resize and on user camera moves, so the view stays current.
 *
 * Integrity: particle motion is time-based (scene units per second = UNITS_PER_MS x m/s); calm air stands still; a wind
 * layer with a missing speed or direction is hidden, not drawn as 0; rain only when the model forecasts > 0.1 mm; cloud
 * puffs only in proportion to cover (0 at 0 %); no decorative sway or wobble.
 *
 * Test contract on the host element: data-scene-active="true"|"false" (loop running) and data-scene-frames (total frames
 * rendered, written every 10 frames and when the loop stops). No React state is touched per frame.
 */

export type SceneWindLayer = {
  label: string;
  speed: number | null; // m/s; null when the model did not return it (layer hidden)
  direction: number | null; // degrees the wind blows FROM; null when not returned (layer hidden)
  altitude: number; // placement height, m (geopotential when returned, else the nominal level height)
  geopotential?: number | null; // model geopotential height, m, when returned (pressure levels only)
  humidity?: number | null;
  cloud?: number | null;
  temperature?: number | null;
};

export type SceneWeather = {
  windSpeed: number | null;
  windDirection: number | null;
  gust: number | null;
  temperature: number | null;
  cloudCover: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  precipitation: number | null;
  layer: 'wind' | 'cloud' | 'temperature' | 'rain';
  scenarioActive: boolean;
  dustLoading: number;
  windLayers: SceneWindLayer[];
};

type Props = {
  weather: SceneWeather;
  /** User pause (the Pause 3D scene button). */
  paused?: boolean;
  /** Increment to restore the saved camera view without remounting. */
  resetSignal?: number;
};

const PARTICLE_COUNT = 420;
const UNITS_PER_MS = 0.2; // scene units per second for each m/s of wind (one fixed multiple for every layer)
const CALM_MS = 0.3; // below this the particles of that layer stand still
const MAX_VISUAL_MS = 25; // speeds above this are drawn at this speed (proportional below)
const RAIN_DROPS = 220;
const RAIN_MIN_MM = 0.1; // no rain is drawn at or below this hourly precipitation
const RAIN_FULL_MM = 8; // drop count reaches the pool size at this intensity (heavy rain)
const RAIN_FALL = 4; // fixed, schematic fall speed in scene units per second (not scaled with intensity)
const CLOUD_MAX = 12; // puffs per level at 100 % cover
const MIN_FRAME_MS = 32; // ~30 FPS cap: sufficient for a dashboard and lighter on clients
const MAX_DT = 0.1; // s; a long gap (tab switch, jank) never teleports particles
const X_HALF = 9;
const Z_HALF = 5.5;
const LAYER_Y0 = 0.45;
const LAYER_SPAN = 4.85;

/** Normalised (0..1) vertical position of each wind layer, exactly as the scene places them (linear in height). */
export function layerNorms(layers: ReadonlyArray<{ altitude: number }>): number[] {
  const altitudes = layers.map((layer) => Math.max(10, Number.isFinite(layer.altitude) ? layer.altitude : 10));
  const min = Math.min(...altitudes);
  const max = Math.max(...altitudes);
  return altitudes.map((altitude) => (altitude - min) / Math.max(1, max - min));
}

/** Whether the scene draws rain for this value (shared by the scene and its "no precipitation" tag). */
export function rainForecast(precipitation: number | null): boolean {
  return precipitation != null && precipitation > RAIN_MIN_MM;
}

// Small seeded PRNG (mulberry32) so puff and particle placement is stable between updates and mounts.
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

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const wrap = (value: number, half: number) => (value > half ? value - 2 * half : value < -half ? value + 2 * half : value);

type Runtime = {
  apply(weather: SceneWeather): void;
  start(): void;
  stop(): void;
  reset(): void;
  dispose(): void;
};

type CloudLevel = { material: THREE.MeshBasicMaterial; meshes: THREE.Mesh[] };
type WindPoints = { points: THREE.Points; attr: THREE.BufferAttribute; jitter: Float32Array; y: number; vx: number; vz: number };

function createRuntime(host: HTMLDivElement): Runtime {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050505');
  scene.fog = new THREE.FogExp2('#050505', 0.028);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(11, 10, 16);
  camera.lookAt(0, 1.6, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false; // enabled only while the loop runs (damping needs per-frame updates to settle)
  controls.dampingFactor = 0.065;
  controls.minDistance = 9;
  controls.maxDistance = 36;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 1.6, 0);
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.update();
  controls.saveState();
  // OrbitControls sets touch-action:none inline on the canvas, which would trap vertical page swipes on phones. With pan-y
  // the browser keeps vertical scrolling (and sends pointercancel, which ends the orbit), while horizontal one-finger drags
  // still rotate and two-finger gestures still dolly/pan.
  renderer.domElement.style.touchAction = 'pan-y';

  scene.add(new THREE.AmbientLight(0xb8abc7, 1.4));
  const key = new THREE.DirectionalLight(0xeadfff, 2.0);
  key.position.set(8, 14, 10);
  scene.add(key);
  const rim = new THREE.PointLight(0x00e5ff, 18, 32);
  rim.position.set(-7, 5, -5);
  scene.add(rim);

  // Surface: static relief; vertex colours are rewritten in place by apply().
  const platform = new THREE.Group();
  scene.add(platform);
  const floorGeometry = new THREE.PlaneGeometry(18, 11, 54, 36);
  floorGeometry.rotateX(-Math.PI / 2);
  const floorPos = floorGeometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < floorPos.count; i += 1) {
    const x = floorPos.getX(i);
    const z = floorPos.getZ(i);
    floorPos.setY(i, Math.sin(x * 0.45) * Math.cos(z * 0.5) * 0.08 + Math.cos((x + z) * 0.28) * 0.045);
  }
  const floorColors = new THREE.Float32BufferAttribute(new Float32Array(floorPos.count * 3), 3);
  floorGeometry.setAttribute('color', floorColors);
  floorGeometry.computeVertexNormals();
  platform.add(
    new THREE.Mesh(
      floorGeometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.08, side: THREE.DoubleSide }),
    ),
  );
  const hotColor = new THREE.Color('#e6a25d');
  const coolColor = new THREE.Color('#460f84');
  const missingColor = new THREE.Color('#2b2433'); // neutral: the driving value is not available
  const tmpColor = new THREE.Color();

  const grid = new THREE.GridHelper(18, 36, 0x8c77a5, 0x30174b);
  grid.position.y = 0.08;
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.22;
  platform.add(grid);

  // Reference observation points (not a claim of building-scale model resolution).
  [
    { x: -1.5, z: 0.4, color: 0x00e5ff },
    { x: 1.2, z: -0.3, color: 0xf3bc70 },
  ].forEach((point) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.025, 6, 48),
      new THREE.MeshBasicMaterial({ color: point.color, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(point.x, 0.35, point.z);
    platform.add(ring);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshBasicMaterial({ color: point.color }));
    core.position.set(point.x, 0.38, point.z);
    platform.add(core);
  });

  const atmosphere = new THREE.Group();
  scene.add(atmosphere);

  // Clouds: a fixed pool per level, placed once by a seeded PRNG; apply() only toggles visibility and opacity. Static.
  const cloudGroup = new THREE.Group();
  atmosphere.add(cloudGroup);
  const puffGeometry = new THREE.SphereGeometry(1, 10, 8);
  const makeLevel = (y: number, tint: number, seed: number): CloudLevel => {
    const rnd = seeded(seed);
    const material = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0, depthWrite: false });
    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < CLOUD_MAX; i += 1) {
      const radius = 0.48 + rnd() * 0.28;
      const mesh = new THREE.Mesh(puffGeometry, material);
      mesh.scale.set(radius * (1.9 + rnd() * 1.2), radius * (0.28 + rnd() * 0.15), radius * (0.8 + rnd() * 0.5));
      mesh.position.set((rnd() - 0.5) * 12, y + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 6);
      mesh.visible = false;
      cloudGroup.add(mesh);
      meshes.push(mesh);
    }
    return { material, meshes };
  };
  const cloudLow = makeLevel(1.25, 0x00e5ff, 11);
  const cloudMid = makeLevel(3.0, 0x9978be, 12);
  const cloudHigh = makeLevel(4.8, 0xad93cb, 13);
  const dust = makeLevel(0.78, 0xc28d55, 14);
  const setCover = (level: CloudLevel, amount: number | null) => {
    const a = amount == null || !Number.isFinite(amount) ? 0 : clamp01(amount / 100); // missing cover draws nothing
    const count = Math.round(a * CLOUD_MAX);
    level.meshes.forEach((mesh, i) => {
      mesh.visible = i < count;
    });
    level.material.opacity = 0.12 + a * 0.18;
  };

  // Wind: one Points object per layer so a layer with missing data can be hidden on its own.
  const particleMaterial = new THREE.PointsMaterial({
    color: 0x00e5ff,
    size: 0.055,
    transparent: true,
    opacity: 0.82,
    sizeAttenuation: true,
  });
  let wind: WindPoints[] = [];
  const buildWind = (layerCount: number) => {
    wind.forEach((w) => {
      atmosphere.remove(w.points);
      w.points.geometry.dispose();
    });
    const perLayer = Math.floor(PARTICLE_COUNT / Math.max(1, layerCount));
    wind = Array.from({ length: layerCount }, (_, index) => {
      const rnd = seeded(101 + index);
      const positions = new Float32Array(perLayer * 3);
      const jitter = new Float32Array(perLayer);
      for (let j = 0; j < perLayer; j += 1) {
        positions[j * 3] = (rnd() - 0.5) * 2 * X_HALF;
        jitter[j] = (rnd() - 0.5) * 0.28;
        positions[j * 3 + 2] = (rnd() - 0.5) * 2 * Z_HALF;
      }
      const geometry = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(positions, 3);
      geometry.setAttribute('position', attr);
      const points = new THREE.Points(geometry, particleMaterial);
      points.frustumCulled = false; // positions change every frame; the volume is always in view
      atmosphere.add(points);
      return { points, attr, jitter, y: Number.NaN, vx: 0, vz: 0 };
    });
  };

  // Rain: fixed pool of streaks; apply() sets how many are drawn (setDrawRange) from intensity.
  const rainRnd = seeded(7);
  const rainVertices = new Float32Array(RAIN_DROPS * 6);
  for (let i = 0; i < RAIN_DROPS; i += 1) {
    const x = (rainRnd() - 0.5) * 17;
    const y = 0.4 + rainRnd() * 5.2;
    const z = (rainRnd() - 0.5) * 10;
    rainVertices.set([x, y, z, x - 0.04, y - 0.33, z - 0.02], i * 6);
  }
  const rainGeometry = new THREE.BufferGeometry();
  const rainAttr = new THREE.BufferAttribute(rainVertices, 3);
  rainGeometry.setAttribute('position', rainAttr);
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: 0x16e7ff, transparent: true, opacity: 0.58 }));
  rain.frustumCulled = false;
  rain.visible = false;
  atmosphere.add(rain);
  let rainDrops = 0;

  const atmosphereBox = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(-9, 0.15, -5.5), new THREE.Vector3(9, 5.8, 5.5)), 0x3f2062);
  const boxMat = atmosphereBox.material as THREE.Material;
  boxMat.transparent = true;
  boxMat.opacity = 0.14;
  scene.add(atmosphereBox);

  // ---- render bookkeeping ----
  let raf = 0;
  let lastFrame = 0;
  let frames = 0;
  let disposed = false;
  host.dataset.sceneActive = 'false';
  host.dataset.sceneFrames = '0';

  const renderNow = () => {
    if (disposed) return;
    renderer.render(scene, camera);
    frames += 1;
    if (frames % 10 === 0) host.dataset.sceneFrames = String(frames);
  };

  const step = (dt: number) => {
    for (const w of wind) {
      if (!w.points.visible || (w.vx === 0 && w.vz === 0)) continue;
      const arr = w.attr.array as Float32Array;
      for (let j = 0; j < arr.length; j += 3) {
        arr[j] = wrap(arr[j] + w.vx * dt, X_HALF);
        arr[j + 2] = wrap(arr[j + 2] + w.vz * dt, Z_HALF);
      }
      w.attr.needsUpdate = true;
    }
    if (rainDrops > 0) {
      for (let i = 0; i < rainDrops; i += 1) {
        let y = rainVertices[i * 6 + 1] - RAIN_FALL * dt;
        if (y < 0.35) y = 5.6 + rainRnd() * 0.8;
        rainVertices[i * 6 + 1] = y;
        rainVertices[i * 6 + 4] = y - 0.33;
      }
      rainAttr.needsUpdate = true;
    }
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (now - lastFrame < MIN_FRAME_MS) return;
    const dt = Math.min(MAX_DT, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    step(dt);
    controls.update();
    renderNow();
  };

  // While stopped, the camera only moves when the user drags; draw exactly those frames.
  const onControlsChange = () => {
    if (!raf) renderNow();
  };
  controls.addEventListener('change', onControlsChange);

  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(240, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (!raf) renderNow(); // setSize clears the canvas
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  return {
    apply(weather) {
      const layers: SceneWindLayer[] = weather.windLayers.length
        ? weather.windLayers
        : [{ label: '10 m', speed: weather.windSpeed, direction: weather.windDirection, altitude: 10 }];
      if (layers.length !== wind.length) buildWind(layers.length);
      const norms = layerNorms(layers);
      layers.forEach((layer, index) => {
        const w = wind[index];
        const y = LAYER_Y0 + norms[index] * LAYER_SPAN;
        if (y !== w.y) {
          const arr = w.attr.array as Float32Array;
          for (let j = 0; j < w.jitter.length; j += 1) arr[j * 3 + 1] = y + w.jitter[j];
          w.attr.needsUpdate = true;
          w.y = y;
        }
        const { speed, direction } = layer;
        const known = speed != null && direction != null && Number.isFinite(speed) && Number.isFinite(direction);
        w.points.visible = known;
        if (!known) {
          w.vx = 0;
          w.vz = 0;
          return;
        }
        const visual = speed < CALM_MS ? 0 : Math.min(speed, MAX_VISUAL_MS) * UNITS_PER_MS;
        const angle = ((direction + 180) * Math.PI) / 180; // travel toward direction + 180; north is -z
        w.vx = Math.sin(angle) * visual;
        w.vz = -Math.cos(angle) * visual;
      });
      particleMaterial.color.setHex(weather.layer === 'cloud' ? 0x21e8ff : weather.layer === 'temperature' ? 0xffc078 : 0x00e5ff);

      setCover(cloudLow, weather.cloudLow);
      setCover(cloudMid, weather.cloudMid);
      setCover(cloudHigh, weather.cloudHigh);
      setCover(dust, weather.dustLoading > 0 ? weather.dustLoading : 0);

      const precipitation = weather.precipitation;
      rainDrops = rainForecast(precipitation) ? Math.max(8, Math.round(RAIN_DROPS * clamp01((precipitation as number) / RAIN_FULL_MM))) : 0;
      rain.visible = rainDrops > 0;
      rainGeometry.setDrawRange(0, rainDrops * 2);

      const driver = weather.layer === 'temperature' ? weather.temperature : weather.windSpeed;
      const blend = driver == null ? null : weather.layer === 'temperature' ? clamp01((driver - 18) / 24) : clamp01(driver / 18);
      const colors = floorColors.array as Float32Array;
      for (let i = 0; i < floorPos.count; i += 1) {
        if (blend == null) tmpColor.copy(missingColor);
        else tmpColor.copy(coolColor).lerp(hotColor, blend * 0.64 + 0.08 * Math.sin(floorPos.getX(i) * 0.3 + floorPos.getZ(i) * 0.2));
        colors[i * 3] = tmpColor.r;
        colors[i * 3 + 1] = tmpColor.g;
        colors[i * 3 + 2] = tmpColor.b;
      }
      floorColors.needsUpdate = true;

      if (!raf) renderNow(); // keep the static view current
    },
    start() {
      if (raf || disposed) return;
      controls.enableDamping = true;
      lastFrame = performance.now();
      host.dataset.sceneActive = 'true';
      raf = requestAnimationFrame(tick);
    },
    stop() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      controls.enableDamping = false;
      host.dataset.sceneActive = 'false';
      // No extra frame here: the last loop frame (<= 32 ms old) is already current, and apply()/resize() draw on change.
      host.dataset.sceneFrames = String(frames);
    },
    reset() {
      controls.reset(); // dispatches 'change', which draws a frame when stopped
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      host.dataset.sceneActive = 'false';
      resizeObserver.disconnect();
      controls.removeEventListener('change', onControlsChange);
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      renderer.forceContextLoss();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    },
  };
}

export default function WeatherScene({ weather, paused = false, resetSignal = 0 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const active = useActiveLoop(hostRef, paused);
  // Value key, not identity: the poll returns a new object every 30 s even when nothing changed.
  const weatherKey = JSON.stringify(weather);

  // Mount: create once, dispose fully. Declared first so the effects below find the runtime (also under StrictMode).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const runtime = createRuntime(host);
    runtimeRef.current = runtime;
    return () => {
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, []);

  // Data: applied in place to the existing objects.
  useEffect(() => {
    runtimeRef.current?.apply(JSON.parse(weatherKey) as SceneWeather);
  }, [weatherKey]);

  // Loop: starts and stops with the shared loop policy (the last drawn frame stays on the canvas when stopped).
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (active) runtime.start();
    else runtime.stop();
  }, [active]);

  useEffect(() => {
    if (resetSignal) runtimeRef.current?.reset();
  }, [resetSignal]);

  const rainTag =
    weather.layer === 'rain' && !rainForecast(weather.precipitation)
      ? weather.precipitation == null
        ? 'Precipitation not available'
        : 'No precipitation forecast'
      : null;

  return (
    <div className="weather-scene" ref={hostRef} role="group" aria-label="Three-dimensional atmospheric weather visualization">
      {rainTag && (
        <div className="scene-tag" role="status" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
          {rainTag}
        </div>
      )}
    </div>
  );
}

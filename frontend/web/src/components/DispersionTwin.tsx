import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Lut } from 'three/examples/jsm/math/Lut.js';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Pause, Play } from 'lucide-react';
import { fireEmission, sampleFrame, type Config, type Source } from '../sim/dispersion';
import type { WorkerIn, WorkerOut } from '../sim/dispersion.worker';
import { isosurface } from '../sim/isosurface';
import { fetchLocalMet, fetchTerrain, manualMet, withMinuteRetry, type Domain, type LocalMet } from '../lib/localWinds';
import type { Fire } from '../lib/trajectory';

const DOMAIN: Domain = { lat: 28.4782417, lon: 76.9040528, halfKm: 24 };     // centred on SGT University
const SITES = [{ name: 'SGT University', xKm: 24, yKm: 24 }, { name: 'Chandu village', xKm: 24 + 1.27, yKm: 24 - 0.31 }];
const FIRES_URL = 'https://xqsuuhgakodtlpcyletx.supabase.co/functions/v1/fires?hours=72';
const L_KM = 48, TOP_KM = 2.4, VZ = 8;                                          // box size and vertical exaggeration
const THRESH = [15, 60, 150];                                                    // ug/m3 increments: WHO daily guideline, India 24 h standard, heavy
const RES = { standard: { nx: 64, ny: 64, nz: 16 }, fine: { nx: 96, ny: 96, nz: 24 } } as const;
const HORIZON_H = 12;

const ist = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
const fmt = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));

function makeLut() {
  const lut = new Lut('rainbow', 256);
  lut.addColorMap('aeios', [[0.0, 0x3b0a6b], [0.45, 0x6a3fd0], [0.72, 0x00b8d9], [1.0, 0xf5ff7a]] as never);
  lut.setColorMap('aeios', 256);
  lut.setMin(0); lut.setMax(1);
  return lut;
}
const LUT = makeLut();
const levelColor = (c: number) => { const a = Math.min(1, Math.max(0, Math.log(Math.max(c, 1)) / Math.log(300))); return LUT.getColor(a); };   // 1..300 ug/m3, log scale

function label(text: string, scale = 3.2, color = '#cfc6dc') {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d')!; g.font = '600 26px ui-monospace, monospace'; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 32);
  const m = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false });
  const s = new THREE.Sprite(m); s.scale.set(scale * 4, scale, 1);
  return s;
}

type Terrain = { z: Float32Array; n: number; real: boolean };
const terrAt = (t: Terrain, tmin: number, xKm: number, yKm: number) => {
  const fx = Math.min(t.n - 1, Math.max(0, (xKm / L_KM) * (t.n - 1))), fy = Math.min(t.n - 1, Math.max(0, (yKm / L_KM) * (t.n - 1)));
  const i = Math.min(t.n - 2, Math.floor(fx)), j = Math.min(t.n - 2, Math.floor(fy)), a = fx - i, b = fy - j, g = (ii: number, jj: number) => t.z[jj * t.n + ii];
  return (g(i, j) * (1 - a) * (1 - b) + g(i + 1, j) * a * (1 - b) + g(i, j + 1) * (1 - a) * b + g(i + 1, j + 1) * a * b - tmin) / 1000;   // km above the lowest terrain point
};

function DispersionTwinInner() {
  const mount = useRef<HTMLDivElement>(null);
  const three = useRef<{ scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; controls: OrbitControls; plume: THREE.Group; wind: THREE.Group; curtain: THREE.Group; terrain: THREE.Mesh | null; srcMarker: THREE.Group; render: () => void } | null>(null);
  const worker = useRef<Worker | null>(null);

  const [met, setMet] = useState<LocalMet | null>(null);
  const [metErr, setMetErr] = useState('');
  const [mode, setMode] = useState<'forecast' | 'manual'>('forecast');
  const [manual, setManual] = useState({ speed: 3, dirFrom: 315, blh: 600 });
  const [terrain, setTerrain] = useState<Terrain | null>(null);
  const [fires, setFires] = useState<Fire[]>([]);
  const [src, setSrc] = useState({ xKm: 14, yKm: 33 });                       // default: 14 km west and 9 km north of SGT
  const [useFires, setUseFires] = useState(false);
  const [qGs, setQGs] = useState(30);
  const [releaseH, setReleaseH] = useState(3);
  const [res, setRes] = useState<keyof typeof RES>('standard');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [frames, setFrames] = useState<{ t: number; c: Float32Array }[]>([]);
  const [fi, setFi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [diag, setDiag] = useState<{ ms: number; massError: number; steps: number; clipped: number } | null>(null);
  const [runCfg, setRunCfg] = useState<{ cfg: Config; met: LocalMet; sources: Source[] } | null>(null);
  const [err, setErr] = useState('');
  const [perf, setPerf] = useState<{ build: number; draw: number } | null>(null);

  // ---- data
  useEffect(() => {
    let alive = true;
    // winds first, then terrain: the terrain request is large and should not compete with them for the per-minute allowance
    withMinuteRetry(() => fetchLocalMet(DOMAIN, Date.now(), HORIZON_H))
      .then((m) => { if (alive) { setMet(m); setMetErr(''); setMode('forecast'); } })
      .catch((e) => { if (alive) { setMetErr(String(e.message || e)); setMode('manual'); } })
      .finally(() => { if (alive) fetchTerrain(DOMAIN, 16).then((t) => alive && setTerrain(t)); });
    fetch(FIRES_URL).then((r) => r.json()).then((d) => alive && setFires((d.fires || []) as Fire[])).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const activeMet = useMemo(() => (mode === 'manual' || !met ? manualMet(manual.speed, manual.dirFrom, manual.blh, Date.now(), HORIZON_H) : met), [mode, met, manual]);
  const tmin = useMemo(() => (terrain ? Math.min(...terrain.z) : 0), [terrain]);
  const firesInBox = useMemo(() => {
    const kmLat = 111.32, kmLon = 111.32 * Math.cos((DOMAIN.lat * Math.PI) / 180);
    return fires.map((f) => ({ f, xKm: L_KM / 2 + (f.lon - DOMAIN.lon) * kmLon, yKm: L_KM / 2 + (f.lat - DOMAIN.lat) * kmLat })).filter((p) => p.xKm >= 0 && p.xKm <= L_KM && p.yKm >= 0 && p.yKm <= L_KM);
  }, [fires]);

  // ---- three.js scene (created once)
  useEffect(() => {
    const host = mount.current;
    if (!host) return undefined;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
    camera.position.set(-2, 38, 62);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 4, 0); controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 12; controls.maxDistance = 160;
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(-20, 40, 30); scene.add(sun);
    const plume = new THREE.Group(), wind = new THREE.Group(), curtain = new THREE.Group(), srcMarker = new THREE.Group();
    scene.add(plume, wind, curtain, srcMarker);

    // axis box with real-unit ticks
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L_KM, VZ * TOP_KM, L_KM)), new THREE.LineBasicMaterial({ color: 0x6a5a86, transparent: true, opacity: 0.8 }));
    box.position.y = (VZ * TOP_KM) / 2; scene.add(box);
    for (const k of [0, 12, 24, 36, 48]) {
      const a = label(`${k}`, 2.2, '#9c8baf'); a.position.set(k - 24, -0.8, 27); scene.add(a);
      const b = label(`${k}`, 2.2, '#9c8baf'); b.position.set(-27, -0.8, 24 - k); scene.add(b);
    }
    const ex = label('east, km', 2.2, '#b8abc7'); ex.position.set(0, -2.6, 30); scene.add(ex);
    const ey = label('north, km', 2.2, '#b8abc7'); ey.position.set(-31, -2.6, 0); scene.add(ey);
    for (const h of [0.6, 1.2, 1.8, 2.4]) { const t = label(`${h} km`, 2.0, '#9c8baf'); t.position.set(-27.5, VZ * h, 24.5); scene.add(t); }
    const vzl = label(`height, vertical x${VZ}`, 2.0, '#b8abc7'); vzl.position.set(-27.5, VZ * TOP_KM + 2.2, 24.5); scene.add(vzl);

    const render = () => { renderer.render(scene, camera); };
    controls.addEventListener('change', render);
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); render();
    };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();
    three.current = { scene, camera, renderer, controls, plume, wind, curtain, terrain: null, srcMarker, render };
    return () => {
      ro.disconnect(); controls.dispose(); renderer.dispose();
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | undefined; if (mat && 'dispose' in mat) mat.dispose(); });
      host.removeChild(renderer.domElement); three.current = null;
    };
  }, []);

  const toWorld = useCallback((xKm: number, yKm: number, zKm: number) => {
    const ground = terrain ? terrAt(terrain, tmin, xKm, yKm) : 0;
    return new THREE.Vector3(xKm - L_KM / 2, VZ * (zKm + ground), -(yKm - L_KM / 2));
  }, [terrain, tmin]);

  // terrain mesh
  useEffect(() => {
    const t3 = three.current; if (!t3) return;
    if (t3.terrain) { t3.scene.remove(t3.terrain); t3.terrain.geometry.dispose(); (t3.terrain.material as THREE.Material).dispose(); t3.terrain = null; }
    const n = terrain?.n ?? 2, pos: number[] = [], col: number[] = [], idxs: number[] = [];
    const zmax = terrain ? Math.max(...terrain.z) - tmin : 1;
    for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) {
      const xKm = (i / (n - 1)) * L_KM, yKm = (j / (n - 1)) * L_KM, z = terrain ? (terrain.z[j * n + i] - tmin) / 1000 : 0;
      pos.push(xKm - L_KM / 2, VZ * z, -(yKm - L_KM / 2));
      const a = terrain && zmax > 0 ? (terrain.z[j * n + i] - tmin) / zmax : 0;
      const c = new THREE.Color().setRGB(0.10 + 0.22 * a, 0.09 + 0.20 * a, 0.16 + 0.24 * a);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < n - 1; j += 1) for (let i = 0; i < n - 1; i += 1) { const a = j * n + i; idxs.push(a, a + 1, a + n, a + 1, a + n + 1, a + n); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idxs); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false, side: THREE.DoubleSide }));
    t3.scene.add(m); t3.terrain = m;
    // site markers
    for (const s of SITES.slice(0, 1)) {
      const p = toWorld(s.xKm, s.yKm, 0); const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, p.clone().setY(p.y + 6)]), new THREE.LineBasicMaterial({ color: 0x00e5ff }));
      t3.scene.add(line); const lb = label('SGT · Chandu', 2.4, '#00e5ff'); lb.position.copy(p).setY(p.y + 8); t3.scene.add(lb);
    }
    t3.render();
  }, [terrain, tmin, toWorld]);

  // source marker
  useEffect(() => {
    const t3 = three.current; if (!t3) return;
    t3.srcMarker.clear();
    const spots = useFires ? firesInBox.map((p) => ({ xKm: p.xKm, yKm: p.yKm })) : [src];
    for (const s of spots) {
      const p = toWorld(s.xKm, s.yKm, 0);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3, 12), new THREE.MeshStandardMaterial({ color: 0xff7a3d, emissive: 0x5a1c00 }));
      cone.position.copy(p).setY(p.y + 1.5); t3.srcMarker.add(cone);
    }
    if (!useFires) { const lb = label('SOURCE', 2.2, '#ff9a64'); const p = toWorld(src.xKm, src.yKm, 0); lb.position.copy(p).setY(p.y + 5); t3.srcMarker.add(lb); }
    t3.render();
  }, [src, useFires, firesInBox, toWorld]);

  // click-to-place
  useEffect(() => {
    const t3 = three.current, el = t3?.renderer.domElement; if (!t3 || !el) return undefined;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || !t3.terrain) return;
      const r = el.getBoundingClientRect();
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), t3.camera);
      const hit = ray.intersectObject(t3.terrain)[0];
      if (hit) { setUseFires(false); setSrc({ xKm: Math.min(L_KM - 1, Math.max(1, hit.point.x + L_KM / 2)), yKm: Math.min(L_KM - 1, Math.max(1, -hit.point.z + L_KM / 2)) }); }
    };
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointerup', onUp);
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); };
  }, []);

  // plume, curtain and wind arrows for the frame being shown
  useEffect(() => {
    const t3 = three.current; if (!t3 || !runCfg) return;
    const fr = frames[Math.min(fi, frames.length - 1)];
    const t0 = performance.now();
    for (const grp of [t3.plume, t3.curtain, t3.wind]) { grp.children.forEach((c) => { const m = c as THREE.Mesh; m.geometry?.dispose(); const mat = m.material as THREE.Material | undefined; if (mat && 'dispose' in mat) { (mat as THREE.MeshBasicMaterial).map?.dispose(); mat.dispose(); } }); grp.clear(); }
    const { cfg } = runCfg, hourIdx = Math.min(runCfg.met.forcing.nT - 1, Math.floor((fr?.t ?? 0) / 3600));
    // wind arrows: three levels at the 3 x 3 forcing points
    const f = runCfg.met.forcing, nPts = f.nxF * f.nyF, lv = [0, Math.max(0, f.heights.findIndex((h) => h >= 120)), f.heights.length - 1];
    const cols = [0xec8b74, 0xe8b16c, 0xc095f0];
    lv.forEach((l, q) => {
      for (let p = 0; p < nPts; p += 1) {
        const u = f.u[(hourIdx * f.heights.length + l) * nPts + p], v = f.v[(hourIdx * f.heights.length + l) * nPts + p], sp = Math.hypot(u, v);
        if (sp < 0.3) continue;
        const xKm = f.nxF === 1 ? L_KM / 2 : ((p % f.nxF) / (f.nxF - 1)) * L_KM, yKm = f.nyF === 1 ? L_KM / 2 : (Math.floor(p / f.nxF) / (f.nyF - 1)) * L_KM;
        const dir = new THREE.Vector3(u, 0, -v).normalize();
        t3.wind.add(new THREE.ArrowHelper(dir, toWorld(xKm, yKm, f.heights[l] / 1000), Math.min(12, 1.6 * sp), cols[q], 1.4, 0.9));
      }
    });
    if (fr) {
      const pad = (f0: Float32Array) => { const out = new Float32Array(cfg.nx * cfg.ny * (cfg.nz + 1)); out.set(f0.subarray(0, cfg.nx * cfg.ny), 0); out.set(f0, cfg.nx * cfg.ny); return out; };   // reflect the ground layer so surfaces reach z = 0
      const padded = pad(fr.c);
      THRESH.forEach((th, q) => {
        const m = isosurface(padded, cfg.nx, cfg.ny, cfg.nz + 1, th, cfg.dx / 1000, cfg.dy / 1000, cfg.dz / 1000);
        if (!m.positions.length) return;
        const pos = new Float32Array(m.positions.length);
        for (let v = 0; v < pos.length; v += 3) {
          const w = toWorld(m.positions[v], m.positions[v + 1], Math.max(0, m.positions[v + 2] - cfg.dz / 1000));
          pos[v] = w.x; pos[v + 1] = w.y; pos[v + 2] = w.z;
        }
        const nor = new Float32Array(m.normals.length);
        // index-space (east, north, up) -> world (east, up, -north); the up component shrinks because that axis is exaggerated
        for (let v = 0; v < nor.length; v += 3) { nor[v] = m.normals[v]; nor[v + 1] = m.normals[v + 2] / VZ; nor[v + 2] = -m.normals[v + 1]; }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        const color = levelColor(th * 1.2);
        t3.plume.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: [0.26, 0.38, 0.6][q], side: THREE.DoubleSide, depthWrite: false, roughness: 0.6 })));
      });
      // vertical curtain through the source along the wind
      const s0 = useFires && firesInBox.length ? firesInBox[0] : src, u0 = f.u[hourIdx * f.heights.length * nPts + Math.floor(nPts / 2)], v0 = f.v[hourIdx * f.heights.length * nPts + Math.floor(nPts / 2)];
      const sp = Math.hypot(u0, v0) || 1, dx = u0 / sp, dy = v0 / sp, M = 200, K = cfg.nz * 3;
      const cv = document.createElement('canvas'); cv.width = M; cv.height = K; const g2 = cv.getContext('2d')!, img = g2.createImageData(M, K);
      for (let a = 0; a < M; a += 1) {
        const s = (a / (M - 1) - 0.5) * 2 * 24, xk = s0.xKm + dx * s, yk = s0.yKm + dy * s;
        for (let b = 0; b < K; b += 1) {
          const z = (1 - b / (K - 1)) * TOP_KM * 1000, inside = xk >= 0 && xk <= L_KM && yk >= 0 && yk <= L_KM;
          const val = inside ? sampleFrame(cfg, fr.c, xk * 1000, yk * 1000, z) : 0, p = (b * M + a) * 4;
          if (val >= 1) { const c = levelColor(val); img.data[p] = c.r * 255; img.data[p + 1] = c.g * 255; img.data[p + 2] = c.b * 255; img.data[p + 3] = Math.min(235, 60 + 60 * Math.log10(val)); }
        }
      }
      g2.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(48, VZ * TOP_KM), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      const ctr = toWorld(s0.xKm, s0.yKm, 0);
      plane.position.set(ctr.x, VZ * TOP_KM / 2, ctr.z);
      plane.rotation.y = Math.atan2(dy, dx);              // local +x of the plane runs along the wind: world (dx, 0, -dy)
      t3.curtain.add(plane);
    }
    const build = performance.now() - t0;
    const t1 = performance.now(); t3.render(); setPerf({ build: Math.round(build), draw: Math.round(performance.now() - t1) });
  }, [fi, frames, runCfg, toWorld, src, useFires, firesInBox]);

  // ---- running a scenario
  const run = useCallback(() => {
    setErr(''); setRunning(true); setProgress(0); setFrames([]); setFi(0); setDiag(null); setPlaying(false);
    const g = RES[res];
    const cfg: Config = { ...g, dx: (L_KM * 1000) / g.nx, dy: (L_KM * 1000) / g.ny, dz: (TOP_KM * 1000) / g.nz, horizonS: HORIZON_H * 3600, outputEveryS: 1800, kh: 50, vd: 0.002, background: 0 };
    const sources: Source[] = useFires && firesInBox.length
      ? firesInBox.map((p) => ({ x: p.xKm * 1000, y: p.yKm * 1000, z: 60, q: fireEmission(p.f.frp), t0: 0, t1: releaseH * 3600 }))
      : [{ x: src.xKm * 1000, y: src.yKm * 1000, z: 60, q: qGs, t0: 0, t1: releaseH * 3600 }];
    setRunCfg({ cfg, met: activeMet, sources });
    worker.current?.terminate();
    const w = new Worker(new URL('../sim/dispersion.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    const got: { t: number; c: Float32Array }[] = [];
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'frame') { got.push({ t: m.t, c: m.c }); setFrames([...got]); setFi(got.length - 1); setProgress(m.progress); }
      else if (m.type === 'done') {
        const d = m.diagnostics;
        setDiag({ ms: Math.round(m.ms), massError: Math.abs(d.emitted + d.inflow - d.outflow - d.deposited - d.clipped - d.mass) / Math.max(1, d.emitted), steps: d.steps, clipped: d.clipped / Math.max(1, d.emitted) });
        // open on the frame holding the most mass: by +12 h a short release has usually left the box
        let best = 0, bestSum = -1;
        got.forEach((fr, i) => { let sum = 0; for (let k = 0; k < fr.c.length; k += 1) sum += fr.c[k]; if (sum > bestSum) { bestSum = sum; best = i; } });
        setFi(best); setRunning(false); w.terminate();
      } else { setErr(m.message); setRunning(false); w.terminate(); }
    };
    const msg: WorkerIn = { type: 'run', cfg, forcing: activeMet.forcing, sources };
    w.postMessage(msg);
  }, [res, useFires, firesInBox, releaseH, src, qGs, activeMet]);
  useEffect(() => () => worker.current?.terminate(), []);

  // ---- playback
  useEffect(() => {
    if (!playing || running) return undefined;
    const id = setInterval(() => setFi((i) => (i + 1 >= frames.length ? 0 : i + 1)), 450);
    return () => clearInterval(id);
  }, [playing, running, frames.length]);

  // ---- readouts
  const series = useMemo(() => {
    if (!runCfg) return [];
    return frames.map((fr) => {
      const row: Record<string, number | string> = { t: ist(activeMet.times[0] + fr.t * 1000) };
      SITES.forEach((s, k) => { row[k === 0 ? 'SGT' : 'Chandu'] = +sampleFrame(runCfg.cfg, fr.c, s.xKm * 1000, s.yKm * 1000, 80).toFixed(2); });
      return row;
    });
  }, [frames, runCfg, activeMet]);
  const cur = frames[Math.min(fi, frames.length - 1)];
  const peak = cur ? cur.c.reduce((m, v) => (v > m ? v : m), 0) : 0;
  const emitG = useFires && firesInBox.length ? firesInBox.reduce((s, p) => s + fireEmission(p.f.frp), 0) : qGs;

  return (
    <section id="twin" className="page-section">
      <div className="section-title">
        <div><div className="eyebrow">DISPERSION TWIN · SCENARIO SIMULATION</div><h2>Where would a release go? 48 × 48 km, to 2.4 km high</h2></div>
        <span className="status-chip"><span className="status-led" /> SCENARIO · NOT OBSERVED</span>
      </div>
      <div className="state-box state-warm"><AlertTriangle size={14} /><span><b>This is a what-if, not a measurement or a forecast of air quality.</b> It moves a passive tracer released from the source you set, using model winds and mixing height. Values are the <b>increment above background</b>; chemistry, secondary particles, terrain-forced flow and plume rise are not modelled, and satellite-fire emissions are only good to about an order of magnitude.</span></div>
      {metErr && <div className="state-box state-info"><span><b>Model winds unavailable right now</b> ({metErr}). The twin is using manual winds below, which are a what-if you control.</span></div>}
      {terrain && !terrain.real && <div className="state-box state-info"><span><b>Terrain data unavailable;</b> the ground is drawn flat. The solver works in height above ground either way.</span></div>}
      <div className="tw-layout">
        <div className="panel tw-controls">
          <div className="panel-title">Scenario</div>
          <label className="tw-field">Source <small>click the ground to move it · {src.xKm.toFixed(0)} km E, {src.yKm.toFixed(0)} km N of the box corner</small>
            <div className="fc-pills">
              <button className={!useFires ? 'active' : ''} onClick={() => setUseFires(false)}>Point source</button>
              <button className={useFires ? 'active' : ''} disabled={!firesInBox.length} onClick={() => setUseFires(true)} title="Satellite fire detections (last 72 h) inside this box">{firesInBox.length ? `Fires in box (${firesInBox.length})` : 'No fires in box'}</button>
              <button onClick={() => { setUseFires(false); setSrc({ xKm: 24, yKm: 24 }); }}>At SGT</button>
              <button onClick={() => { setUseFires(false); setSrc({ xKm: 10, yKm: 38 }); }}>NW, 20 km</button>
            </div>
          </label>
          {!useFires && <label className="tw-field">Emission <b>{qGs} g/s</b> <small>PM2.5 · about a {(qGs / 2.94).toFixed(0)} MW fire · {(qGs * 3.6).toFixed(0)} kg/h</small>
            <input type="range" min={0} max={100} value={Math.round(Math.log(qGs) / Math.log(1000) * 100)} onChange={(e) => setQGs(Math.max(1, Math.round(Math.pow(1000, Number(e.target.value) / 100))))} /></label>}
          {useFires && <div className="panel-subtitle">Fire emissions: {emitG.toFixed(0)} g/s in total, from each fire's radiative power (about 2.9 g/s per MW, illustrative).</div>}
          <label className="tw-field">Release lasts <b>{releaseH} h</b>
            <input type="range" min={1} max={8} value={releaseH} onChange={(e) => setReleaseH(Number(e.target.value))} /></label>
          <label className="tw-field">Winds
            <div className="fc-pills">
              <button className={mode === 'forecast' ? 'active' : ''} disabled={!met} onClick={() => setMode('forecast')}>Model forecast</button>
              <button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>Manual</button>
            </div></label>
          {mode === 'manual' ? (
            <>
              <label className="tw-field">Wind <b>{manual.speed} m/s from {manual.dirFrom}°</b>
                <input type="range" min={0.5} max={12} step={0.5} value={manual.speed} onChange={(e) => setManual({ ...manual, speed: Number(e.target.value) })} />
                <input type="range" min={0} max={350} step={10} value={manual.dirFrom} onChange={(e) => setManual({ ...manual, dirFrom: Number(e.target.value) })} /></label>
              <label className="tw-field">Mixing height <b>{manual.blh} m</b> <small>low = inversion lid</small>
                <input type="range" min={100} max={2000} step={50} value={manual.blh} onChange={(e) => setManual({ ...manual, blh: Number(e.target.value) })} /></label>
            </>
          ) : met && <div className="panel-subtitle">Open-Meteo winds at 9 points and {met.levelLabels.length} heights ({met.levelLabels.join(', ')}); mixing height {Math.round(met.blhNow)} m now; wind now {met.windNow.speed.toFixed(1)} m/s from {Math.round(met.windNow.dirFrom)}°.</div>}
          <label className="tw-field">Resolution
            <div className="fc-pills">{(Object.keys(RES) as Array<keyof typeof RES>).map((k) => <button key={k} className={res === k ? 'active' : ''} onClick={() => setRes(k)}>{k === 'standard' ? 'Standard 64×64×16' : 'Fine 96×96×24'}</button>)}</div></label>
          <button className="tw-run" onClick={run} disabled={running}>{running ? `Running… ${Math.round(progress * 100)} %` : 'Run scenario'}</button>
          {err && <div className="panel-subtitle" style={{ color: '#ec8b74' }}>Run failed: {err}</div>}
          {diag && <div className="panel-subtitle">Solved in {(diag.ms / 1000).toFixed(1)} s ({diag.steps} steps). Mass budget closes to {(diag.massError * 100).toExponential(0)} %; {(diag.clipped * 100).toFixed(4)} % clipped.</div>}
        </div>

        <div className="tw-stage">
          <div className="tw-canvas" ref={mount} />
          <div className="tw-overlay tw-banner">SCENARIO — NOT OBSERVED</div>
          <div className="tw-overlay tw-legend">
            <div className="tw-bar" />
            <div className="tw-bar-labels"><span>1</span><span>15</span><span>60</span><span>150</span><span>300 µg/m³</span></div>
            <div className="tw-hint">Surfaces: 15 (WHO daily guideline) · 60 (India 24 h standard) · 150 µg/m³ increment. Arrows: winds at {activeMet.levelLabels.length > 1 ? 'lowest, ~120 m, top level' : 'all levels'}.</div>
          </div>
          {!runCfg && <div className="tw-empty">Set a source and press <b>Run scenario</b>. Drag to orbit, scroll to zoom, click the ground to move the source.</div>}
        </div>
      </div>

      {frames.length > 0 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="tw-transport">
            <button className="tw-play" onClick={() => setPlaying((p) => !p)} disabled={running} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={Math.min(fi, frames.length - 1)} onChange={(e) => { setPlaying(false); setFi(Number(e.target.value)); }} disabled={running} />
            <span className="tw-time">+{((cur?.t ?? 0) / 3600).toFixed(1)} h · {ist(activeMet.times[0] + (cur?.t ?? 0) * 1000)} IST · peak {fmt(peak)} µg/m³</span>
          </div>
          <div className="chart-wrap" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="#443753" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="t" tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} interval={3} />
                <YAxis tick={{ fill: '#9c8baf', fontSize: 10 }} axisLine={false} tickLine={false} />
                <ChartTooltip contentStyle={{ background: '#100a17', border: '1px solid #473a57', borderRadius: 10, color: '#f1eff4' }} />
                <Line dataKey="SGT" stroke="#00e5ff" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="Chandu" stroke="#a784d9" strokeWidth={2} dot={false} isAnimationActive={false} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="panel-subtitle">Scenario increment at 80 m above SGT University and Chandu village (µg/m³). The two sites are 1.3 km apart, so in a 750 m grid they nearly coincide.{perf ? ` Last redraw: ${perf.build} ms to build, ${perf.draw} ms to render.` : ''}</div>
        </div>
      )}
      <div className="panel-subtitle" style={{ marginTop: 8 }}>Method: horizontal advection (flux-limited, mass-conserving), horizontal diffusion 50 m²/s, vertical mixing from the model boundary-layer height with a lid above it, 0.2 cm/s dry deposition. Winds and mixing height are interpolated model output (Open-Meteo), or the manual values you set. No vertical wind, terrain-forced flow or chemistry. Not validated against measurements.</div>
    </section>
  );
}

/** Defers all data loading and WebGL setup until the section is about to scroll into view. */
export default function DispersionTwin() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || on) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setOn(true); return undefined; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setOn(true); io.disconnect(); } }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return <div ref={ref}>{on ? <DispersionTwinInner /> : (
    <section id="twin" className="page-section"><div className="section-title"><div><div className="eyebrow">DISPERSION TWIN · SCENARIO SIMULATION</div><h2>Where would a release go?</h2></div></div>
      <div className="panel"><div className="panel-subtitle">Loads when you scroll here.</div></div></section>)}</div>;
}

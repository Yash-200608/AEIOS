// Phase 2B, Stage 2: the production CSS dash streaks versus an isolated transform-based prototype (plus static and reduced motion).
// Experimental code lives only here: the transform variant is built in a standalone page or injected into the measuring page.
//
// Usage: npm run dev -- --host 127.0.0.1 --port 5173      (needed for the integrated scenarios)
//        node tools/perf/streak-variants.mjs visual        (visual equivalence only, no dev server needed)
//        node tools/perf/streak-variants.mjs perf [reps]   (performance; default 5 repetitions per variant and scenario)
// Output: tools/perf/out/streaks-<mode>.json (git-ignored).
import { chromium, firefox, webkit } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:5173';
const MODE = process.argv[2] ?? 'visual';
const REPS = Number(process.argv[3] ?? 5);
const WINDOW_S = 5;

// Production geometry and CSS (AtmosphericColumn.tsx / overview.css): lane from X0 to X1, dash 14 gap 64 (period 78).
const X0 = 62, X1 = 236, PERIOD = 78;
const LANES = [{ y: 60, dur: 3.2 }, { y: 110, dur: 3.4 }, { y: 160, dur: 3.6 }, { y: 210, dur: 8.6 }];
const COMMON_CSS = `body{margin:0;background:#0b1220} svg{width:820px;height:600px;display:block}
.f{stroke:#7aa2ff;stroke-width:2.5;stroke-linecap:round;stroke-dasharray:14 64;opacity:.85}
@keyframes cc-flow{from{stroke-dashoffset:78}to{stroke-dashoffset:0}}
@keyframes cc-flow-t{from{transform:translateX(0)}to{transform:translateX(${PERIOD}px)}}
.dash .f{animation:cc-flow linear infinite}
.transform .f,.transform-noclip .f{animation:cc-flow-t linear infinite}
.static .f{stroke-dasharray:14 18}
.paused .f{animation-play-state:paused}`;
function standalone(variant, phase = null) {
  const lanes = LANES.map(({ y, dur }, i) => {
    const delay = phase === null ? '' : `animation-delay:${-phase * dur}s;`;
    if (variant === 'transform-noclip') {
      return `<line class="f" x1="${X0 - PERIOD}" x2="${X1}" y1="${y}" y2="${y}" style="animation-duration:${dur}s;${delay}"/>`;
    }
    if (variant === 'transform') {
      // One period of extra line on the left, translated right by one period per cycle, clipped to the lane (caps included).
      return `<clipPath id="c${i}"><rect x="${X0 - 1.25}" y="${y - 3}" width="${X1 - X0 + 2.5}" height="6"/></clipPath>
<g clip-path="url(#c${i})"><line class="f" x1="${X0 - PERIOD}" x2="${X1}" y1="${y}" y2="${y}" style="animation-duration:${dur}s;${delay}"/></g>`;
    }
    return `<line class="f" x1="${X0}" x2="${X1}" y1="${y}" y2="${y}" style="animation-duration:${dur}s;${delay}"/>`;
  }).join('\n');
  return `<!doctype html><meta charset=utf-8><style>${COMMON_CSS}</style><div class="${variant}${phase === null ? '' : ' paused'}"><svg viewBox="0 0 410 300">${lanes}</svg></div>`;
}

// ------------------------------------------------------------------------------------------------ visual equivalence
async function visual(browser) {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 })).newPage();
  const shot = async (variant, phase) => {
    await page.setContent(standalone(variant, phase));
    await page.waitForTimeout(80);
    return (await page.locator('svg').screenshot()).toString('base64');
  };
  // Compare two PNGs in the browser (canvas pixel data), split into the lane interior and the 3 px bands at each lane end.
  const compare = (a, b) =>
    page.evaluate(
      async ({ a, b, x0, x1 }) => {
        const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/png;base64,${s}`; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const c = document.createElement('canvas');
        c.width = ia.width; c.height = ia.height;
        const g = c.getContext('2d');
        g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
        g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
        const scale = c.width / 410; // SVG units to image pixels
        const edge = (x) => Math.abs(x / scale - x0) <= 3 || Math.abs(x / scale - x1) <= 3;
        const r = { interior: { px: 0, diff: 0, max: 0 }, edges: { px: 0, diff: 0, max: 0 } };
        for (let y = 0; y < c.height; y += 1) for (let x = 0; x < c.width; x += 1) {
          const k = (y * c.width + x) * 4;
          const d = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2]));
          const bucket = edge(x) ? r.edges : r.interior;
          bucket.px += 1;
          if (d > 16) bucket.diff += 1;
          bucket.max = Math.max(bucket.max, d);
        }
        return r;
      },
      { a, b, x0: X0, x1: X1 },
    );
  const phases = Array.from({ length: 20 }, (_, i) => i / 20);
  const rows = [];
  for (const ph of phases) {
    const [d, t] = [await shot('dash', ph), await shot('transform', ph)];
    const r = await compare(d, t);
    rows.push({ phase: ph, interiorPixelsDiffering: r.interior.diff, interiorMaxDelta: r.interior.max, edgePixelsDiffering: r.edges.diff, edgeMaxDelta: r.edges.max });
  }
  // Keep one pair of images for the record.
  writeFileSync(join(OUT, `streaks-visual-${ENGINE}-dash-0.30.png`), Buffer.from(await shot('dash', 0.3), 'base64'));
  writeFileSync(join(OUT, `streaks-visual-${ENGINE}-transform-0.30.png`), Buffer.from(await shot('transform', 0.3), 'base64'));
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const result = { phases: rows.length, interiorPixelsDifferingTotal: sum('interiorPixelsDiffering'), interiorMaxDelta: Math.max(...rows.map((r) => r.interiorMaxDelta)), edgePixelsDifferingTotal: sum('edgePixelsDiffering'), edgeMaxDelta: Math.max(...rows.map((r) => r.edgeMaxDelta)), rows };
  console.log(JSON.stringify({ ...result, rows: undefined }));
  writeFileSync(join(OUT, `streaks-visual-${ENGINE}.json`), JSON.stringify({ engine: ENGINE, ...result }, null, 2));
}

// ------------------------------------------------------------------------------------------------ performance
const cache = JSON.parse(readFileSync(join(HERE, '../../tests/e2e/fixtures/openmeteo-cache.json'), 'utf8'));
const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
// Turn the integrated page's production dash streaks into the prototype (measuring page only; nothing is shipped).
const INJECT_TRANSFORM = ({ period, x0, x1, withClip = true }) => {
  const style = document.createElement('style');
  style.textContent = `@keyframes cc-flow-t{from{transform:translateX(0)}to{transform:translateX(${period}px)}} .cc-col-flow{animation-name:cc-flow-t !important;stroke-dashoffset:0 !important}`;
  document.head.append(style);
  const NS = 'http://www.w3.org/2000/svg';
  document.querySelectorAll('.cc-col-flow').forEach((line, i) => {
    if (!withClip) {
      line.setAttribute('x1', String(x0 - period));
      return;
    }
    const svg = line.ownerSVGElement;
    const y = Number(line.getAttribute('y1'));
    const clip = document.createElementNS(NS, 'clipPath');
    clip.id = `ccx-${i}`;
    const rect = document.createElementNS(NS, 'rect');
    Object.entries({ x: x0 - 1.25, y: y - 3, width: x1 - x0 + 2.5, height: 6 }).forEach(([k, v]) => rect.setAttribute(k, String(v)));
    clip.append(rect);
    svg.prepend(clip);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('clip-path', `url(#ccx-${i})`);
    line.replaceWith(g);
    g.append(line);
    line.setAttribute('x1', String(x0 - period));
  });
};
const VARIANT_CSS = { static: '.cc-col-flow{animation:none !important;stroke-dasharray:14 18 !important}' };

async function measureOnce(browser, { scenario, variant }) {
  const tall = scenario === 'integrated-webgl-active';
  const context = await browser.newContext({ viewport: { width: 1440, height: tall ? 4400 : 900 }, reducedMotion: variant === 'reduced' ? 'reduce' : 'no-preference' });
  await context.addInitScript((entries) => {
    try { for (const { name, value } of entries) localStorage.setItem(name, value); } catch { /* none */ }
    // NOTE: no requestAnimationFrame counter here. A running rAF loop forces a main-thread frame every vsync, which moves a
    // compositor animation's work back onto the main thread and hides the very difference being measured (found in Phase 2B).
    // Frame timing comes from the browser trace instead (frames presented by the display compositor).
  }, cache);
  await context.route(/open-meteo\.com/, (r) => r.abort());
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
  if (scenario === 'isolated') {
    await page.setContent(standalone(variant === 'reduced' || variant === 'static' ? 'static' : variant));
  } else {
    await page.goto(`${BASE}/?preview&fixture=normal`, { waitUntil: 'domcontentloaded' });
    await page.locator('.cc-column').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(3_500);
    if (variant === 'transform') await page.evaluate(INJECT_TRANSFORM, { period: PERIOD, x0: X0, x1: X1 });
    if (variant === 'transform-noclip') await page.evaluate(INJECT_TRANSFORM, { period: PERIOD, x0: X0, x1: X1, withClip: false });
    if (VARIANT_CSS[variant]) await page.addStyleTag({ content: VARIANT_CSS[variant] });
    if (tall) await page.evaluate(() => window.scrollTo(0, document.querySelector('.cc-column').getBoundingClientRect().top + window.scrollY - 200));
    else await page.evaluate(() => document.querySelector('.cc-column').scrollIntoView({ block: 'center' }));
  }
  await page.waitForTimeout(1_500);
  const path = join(OUT, `trace-streaks-tmp.json`);
  await browser.startTracing(page, { path, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'gpu', 'viz', 'cc', 'toplevel', 'benchmark'] });
  const m0 = await metrics(cdp);
  const t0 = Date.now();
  await page.waitForTimeout(WINDOW_S * 1000);
  const dt = (Date.now() - t0) / 1000;
  const m1 = await metrics(cdp);
  // Memory after a forced garbage collection, so the reading does not depend on when the collector last ran.
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const mem = await metrics(cdp);
  const state = await page.evaluate(() => ({
    running: document.getAnimations().filter((a) => a.playState === 'running').length,
    sceneActive: document.querySelector('[data-scene-active]')?.getAttribute('data-scene-active') ?? null,
    columnInView: (() => { const c = document.querySelector('.cc-column'); if (!c) return null; const r = c.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })(),
  }));
  await browser.stopTracing();
  await context.close();
  // Trace attribution: renderer main thread events by name; GPU and compositor threads by top-level task time.
  const ev = JSON.parse(readFileSync(path, 'utf8')).traceEvents;
  const names = new Map();
  for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args?.name);
  const sum = (pred) => ev.filter((e) => e.ph === 'X' && e.dur && pred(e)).reduce((a, e) => a + e.dur / 1000, 0) / dt;
  const on = (thread) => (e) => names.get(`${e.pid}:${e.tid}`) === thread;
  const main = on('CrRendererMain');
  const top = (e) => e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask';
  // Presented frames: the display compositor's draw-and-swap events, in microseconds.
  const draws = ev.filter((e) => e.ph === 'X' && on('VizCompositorThread')(e) && /DrawAndSwap/.test(e.name)).map((e) => e.ts / 1000).sort((a, b) => a - b);
  const iv = draws.slice(1).map((t, i) => t - draws[i]).sort((a, b) => a - b);
  const q = (p) => (iv.length ? iv[Math.min(iv.length - 1, Math.floor(p * iv.length))] : null);
  return {
    mainTaskMsPerSec: ((m1.TaskDuration - m0.TaskDuration) * 1000) / dt,
    scriptMsPerSec: ((m1.ScriptDuration - m0.ScriptDuration) * 1000) / dt,
    layoutMsPerSec: ((m1.LayoutDuration - m0.LayoutDuration) * 1000) / dt,
    styleMsPerSec: ((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000) / dt,
    paintMsPerSec: sum((e) => main(e) && e.name === 'Paint'),
    gpuMainMsPerSec: sum((e) => on('CrGpuMain')(e) && top(e)),
    vizCompositorMsPerSec: sum((e) => on('VizCompositorThread')(e) && top(e)),
    rendererCompositorMsPerSec: sum((e) => on('Compositor')(e) && top(e)),
    framesPresented: draws.length, framesPresentedPerSec: draws.length / dt, frameMeanMs: iv.length ? iv.reduce((a, b) => a + b, 0) / iv.length : null, frameP95Ms: q(0.95), frameP99Ms: q(0.99), frameMaxMs: iv.length ? iv[iv.length - 1] : null,
    droppedFrames: iv.filter((x) => x > 25).length,
    jsHeapMB: mem.JSHeapUsedSize / 1048576, nodes: mem.Nodes, layoutObjects: mem.LayoutObjects,
    ...state,
  };
}

async function perf(browser) {
  const scenarios = (process.env.SCENARIOS ?? 'isolated,integrated-webgl-inactive,integrated-webgl-active').split(',');
  const variants = (process.env.VARIANTS ?? 'dash,transform,static,reduced').split(',');
  const results = [];
  for (const scenario of scenarios) for (const variant of variants) {
    const reps = [];
    for (let r = 0; r < REPS; r += 1) reps.push(await measureOnce(browser, { scenario, variant }));
    const keys = [...new Set(reps.flatMap((x) => Object.keys(x).filter((k) => typeof x[k] === 'number')))];
    const stat = Object.fromEntries(keys.map((k) => {
      const xs = reps.map((x) => x[k]).filter((x) => typeof x === 'number');
      if (!xs.length) return [k, null];
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1));
      return [k, { mean: +mean.toFixed(2), sd: +sd.toFixed(2), min: +Math.min(...xs).toFixed(2), max: +Math.max(...xs).toFixed(2) }];
    }));
    const flags = { running: reps.map((x) => x.running), sceneActive: reps.map((x) => x.sceneActive), columnInView: reps.map((x) => x.columnInView) };
    results.push({ scenario, variant, reps: REPS, stat, flags });
    writeFileSync(join(OUT, `streaks-perf${process.env.TAG ? '-' + process.env.TAG : ''}.json`), JSON.stringify({ date: new Date().toISOString(), reps: REPS, windowS: WINDOW_S, partial: true, results }, null, 2));
    const v = (k) => (stat[k] ? stat[k].mean : 'n/a');
    console.log(`${scenario.padEnd(26)} ${variant.padEnd(10)} main ${String(stat.mainTaskMsPerSec.mean).padStart(7)} ±${String(stat.mainTaskMsPerSec.sd).padEnd(6)} paint ${String(stat.paintMsPerSec.mean).padStart(7)} gpu ${String(stat.gpuMainMsPerSec.mean).padStart(6)} viz ${String(stat.vizCompositorMsPerSec.mean).padStart(6)} p95 ${String(v('frameP95Ms')).padStart(5)} drop ${String(v('droppedFrames')).padStart(5)} heap ${stat.jsHeapMB.mean} | running ${flags.running.join('/')} scene ${flags.sceneActive.join('/')}`);
  }
  writeFileSync(join(OUT, `streaks-perf${process.env.TAG ? '-' + process.env.TAG : ''}.json`), JSON.stringify({ date: new Date().toISOString(), reps: REPS, windowS: WINDOW_S, results }, null, 2));
}

// ENGINE=firefox|webkit runs the VISUAL mode on Playwright's other engines (performance needs Chrome's CDP and stays on Chrome).
const ENGINE = process.env.ENGINE ?? 'chrome';
const browser =
  ENGINE === 'firefox' ? await firefox.launch() : ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome', headless: false, args: ['--headless=new'] });
if (MODE === 'visual') await visual(browser);
else await perf(browser);
await browser.close();

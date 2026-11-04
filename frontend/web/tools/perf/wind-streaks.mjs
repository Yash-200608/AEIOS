// Main-thread cost of the Overview's CSS wind streaks and of the WebGL scene, measured separately.
//
// Usage (dev server must already be running):  npm run dev -- --host 127.0.0.1 --port 5173
//                                              node tools/perf/wind-streaks.mjs [tag]
// Output: tools/perf/out/<tag>.json (git-ignored). Seeds the cached model run and blocks Open-Meteo, so it never uses API quota.
//
// Method (all numbers are medians of SAMPLES samples of SECS seconds each, in a fresh browser context per scenario):
//   * Chrome DevTools Protocol Performance.getMetrics: TaskDuration, ScriptDuration, RecalcStyleDuration, LayoutDuration are
//     cumulative main-thread seconds; the difference over the window divided by the window gives ms of main thread per second.
//   * document.getAnimations(): how many animations are really running.
//   * requestAnimationFrame callbacks per second, and the scene's own data-scene-frames counter (renders per second).
//   * Diagnostic variants inject CSS only into the measuring page (never shipped) to find which part of the animation costs time.
//   * A separate traced run (never mixed into the medians, because tracing adds overhead) aggregates main-thread trace events by
//     name, to attribute the time to style, layout, paint, commit and so on.
// Limits: one machine, a dev build, Chrome headless; main-thread time only (GPU/compositor/raster threads are not included).
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:5173';
const TAG = process.argv[2] ?? 'run';
const SAMPLES = 3;
const SECS = 6;
const cache = JSON.parse(readFileSync(join(HERE, '../../tests/e2e/fixtures/openmeteo-cache.json'), 'utf8'));

const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function newPage(browser, { reduced = false, width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await context.addInitScript((entries) => {
    try {
      for (const { name, value } of entries) localStorage.setItem(name, value);
    } catch {
      /* storage unavailable */
    }
    window.__raf = 0;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => orig((t) => { window.__raf += 1; return cb(t); });
  }, cache);
  await context.route(/open-meteo\.com/, (r) => r.abort());
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
  await page.goto(`${BASE}/?preview&fixture=normal`, { waitUntil: 'domcontentloaded' });
  await page.locator('.cc-column').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(3_000); // let the reveal and first renders settle
  return { context, page, cdp };
}

const goTo = (page, where) =>
  page.evaluate((w) => {
    const target = w === 'column' ? '.cc-column' : w === 'scene' ? '#atmosphere [data-scene-active]' : null;
    if (target) document.querySelector(target).scrollIntoView({ block: 'center' });
    else window.scrollTo(0, document.documentElement.scrollHeight);
  }, where);

async function measure(page, cdp) {
  const samples = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const m0 = await metrics(cdp);
    const r0 = await page.evaluate(() => window.__raf);
    const f0 = await page.evaluate(() => Number(document.querySelector('[data-scene-frames]')?.getAttribute('data-scene-frames') ?? 0));
    const t0 = Date.now();
    await page.waitForTimeout(SECS * 1000);
    const dt = (Date.now() - t0) / 1000;
    const m1 = await metrics(cdp);
    const r1 = await page.evaluate(() => window.__raf);
    const f1 = await page.evaluate(() => Number(document.querySelector('[data-scene-frames]')?.getAttribute('data-scene-frames') ?? 0));
    samples.push({
      taskMsPerSec: ((m1.TaskDuration - m0.TaskDuration) * 1000) / dt,
      scriptMsPerSec: ((m1.ScriptDuration - m0.ScriptDuration) * 1000) / dt,
      styleMsPerSec: ((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000) / dt,
      layoutMsPerSec: ((m1.LayoutDuration - m0.LayoutDuration) * 1000) / dt,
      rafPerSec: (r1 - r0) / dt,
      sceneRendersPerSec: (f1 - f0) / dt,
    });
  }
  const pick = (k) => +median(samples.map((s) => s[k])).toFixed(1);
  const running = await page.evaluate(() => {
    const a = document.getAnimations().filter((x) => x.playState === 'running');
    return { count: a.length, names: [...new Set(a.map((x) => x.animationName || x.transitionProperty || x.constructor.name))] };
  });
  const sceneActive = await page.evaluate(() => document.querySelector('[data-scene-active]')?.getAttribute('data-scene-active') ?? null);
  return { task: pick('taskMsPerSec'), script: pick('scriptMsPerSec'), style: pick('styleMsPerSec'), layout: pick('layoutMsPerSec'), raf: pick('rafPerSec'), sceneRenders: pick('sceneRendersPerSec'), running, sceneActive, samples: samples.map((s) => +s.taskMsPerSec.toFixed(1)) };
}

// A page with nothing but four animated dashed SVG lines (the same CSS as the column): what the browser costs without the app.
const STANDALONE = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#0b1220}
svg{width:440px;height:320px;display:block}
.f{stroke:#7aa2ff;stroke-width:2.5;stroke-linecap:round;stroke-dasharray:14 64;opacity:.85;animation:cc-flow linear infinite}
@keyframes cc-flow{to{stroke-dashoffset:-78}}</style>
<svg viewBox="0 0 410 300">${[60, 110, 160, 210].map((y, i) => `<line class="f" x1="62" x2="236" y1="${y}" y2="${y}" style="animation-duration:${2 + i}s"/>`).join('')}</svg>`;

async function standalone(browser, def) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
  await page.setContent(STANDALONE);
  await page.evaluate(() => { window.__raf = 0; });
  await page.waitForTimeout(2_500);
  const result = { name: def.name, group: def.group, ...(await measure(page, cdp)) };
  await context.close();
  console.log(`${def.group.padEnd(11)} ${def.name.padEnd(58)} task ${String(result.task).padStart(6)} ms/s  style ${String(result.style).padStart(5)}  anim ${result.running.count}`);
  return result;
}

async function scenario(browser, def) {
  if (def.standalone) return standalone(browser, def);
  const { context, page, cdp } = await newPage(browser, def);
  if (def.css) await page.addStyleTag({ content: def.css });
  await goTo(page, def.where);
  if (def.action) await def.action(page);
  await page.waitForTimeout(2_500);
  const result = { name: def.name, group: def.group, ...(await measure(page, cdp)) };
  await context.close();
  console.log(`${def.group.padEnd(11)} ${def.name.padEnd(58)} task ${String(result.task).padStart(6)} ms/s  style ${String(result.style).padStart(5)}  raf ${String(result.raf).padStart(5)}  scene ${String(result.sceneRenders).padStart(5)}  anim ${result.running.count}`);
  return result;
}

// Attribute main-thread time to trace event names in a separate, traced run of one scenario.
async function traced(browser, def) {
  const { context, page } = await newPage(browser, def);
  if (def.css) await page.addStyleTag({ content: def.css });
  await goTo(page, def.where);
  await page.waitForTimeout(2_000);
  const path = join(HERE, 'out', `trace-${TAG}-${def.name.replace(/\W+/g, '_')}.json`);
  await browser.startTracing(page, { path, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc'] });
  const t0 = Date.now();
  await page.waitForTimeout(5_000);
  const secs = (Date.now() - t0) / 1000;
  await browser.stopTracing();
  await context.close();
  const events = JSON.parse(readFileSync(path, 'utf8')).traceEvents;
  const mainThreads = new Set(events.filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
  const totals = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !mainThreads.has(`${e.pid}:${e.tid}`) || !e.dur) continue;
    const t = totals.get(e.name) ?? { ms: 0, n: 0 };
    t.ms += e.dur / 1000;
    t.n += 1;
    totals.set(e.name, t);
  }
  const KEEP = ['RunTask', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'UpdateLayer', 'HitTest', 'FireAnimationFrame', 'FunctionCall', 'EvaluateScript', 'Animation', 'ParseHTML', 'ScheduleStyleRecalculation'];
  const rows = KEEP.filter((k) => totals.has(k)).map((k) => ({ event: k, msPerSec: +(totals.get(k).ms / secs).toFixed(1), perSec: +(totals.get(k).n / secs).toFixed(1) }));
  console.log(`traced: ${def.name}`);
  for (const r of rows) console.log(`   ${r.event.padEnd(26)} ${String(r.msPerSec).padStart(7)} ms/s   ${String(r.perSec).padStart(7)} events/s`);
  return { name: def.name, seconds: +secs.toFixed(1), rows };
}

const CLICK_PAUSE_COLUMN = (page) => page.locator('.cc-column__bar button').first().click();
const CLICK_PAUSE_SCENE = (page) => page.getByRole('button', { name: 'Pause 3D scene' }).click();

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--headless=new'] });
mkdirSync(join(HERE, 'out'), { recursive: true });
const SCENARIOS = [
  { group: 'required', name: 'A idle: column and scene both off-screen', where: 'bottom' },
  { group: 'required', name: 'B column visible, streaks running', where: 'column' },
  { group: 'required', name: 'C column visible, Pause pressed', where: 'column', action: CLICK_PAUSE_COLUMN },
  { group: 'required', name: 'D column visible, reduced motion', where: 'column', reduced: true },
  { group: 'webgl', name: 'E WebGL scene visible and running (column off-screen)', where: 'scene' },
  { group: 'webgl', name: 'F WebGL scene visible, Pause 3D scene pressed', where: 'scene', action: CLICK_PAUSE_SCENE },
  { group: 'webgl', name: 'G WebGL scene visible, all CSS animation forced off', where: 'scene', css: '*,*::before,*::after{animation:none !important;transition:none !important}' },
  { group: 'diagnostic', name: 'H column visible, streak animation forced off', where: 'column', css: '.cc-col-flow{animation:none !important}' },
  { group: 'diagnostic', name: 'I column visible, running, SVG text hidden', where: 'column', css: '.cc-column__svg text{visibility:hidden}' },
  { group: 'diagnostic', name: 'J column visible, running, only one streak animated', where: 'column', css: '.cc-col-flow:not(:first-of-type){animation:none !important}' },
  { group: 'diagnostic', name: 'K column visible, running, SVG contain:paint', where: 'column', css: '.cc-column__svg{contain:paint}' },
  { group: 'diagnostic', name: 'L column visible, running, SVG own compositing layer', where: 'column', css: '.cc-column__svg{will-change:transform}' },
  { group: 'diagnostic', name: 'M column visible, running, backdrop-filter removed page-wide', where: 'column', css: '*{backdrop-filter:none !important;-webkit-backdrop-filter:none !important}' },
  { group: 'diagnostic', name: 'N column visible, running, filters and shadows removed in the Overview', where: 'column', css: '#overview *{box-shadow:none !important;filter:none !important;text-shadow:none !important}' },
  { group: 'diagnostic', name: 'O column visible, running, streak lines only (rest of the SVG hidden)', where: 'column', css: '.cc-column__svg > *:not(.cc-col-lane),.cc-col-lane > *:not(.cc-col-flow){display:none}' },
  { group: 'diagnostic', name: 'P column visible, running, rest of the Overview hidden', where: 'column', css: '#overview .cc > *:not(.cc-band),.cc-band__side,.cc-band--b{display:none !important}' },
  { group: 'diagnostic', name: 'Q column visible, running, all other page sections hidden', where: 'column', css: 'main .page-section:not(#overview){display:none !important}' },
  { group: 'diagnostic', name: 'R column visible, running, sidebar and top bar hidden', where: 'column', css: '#primary-nav,.topbar,header.topbar{display:none !important}' },
  { group: 'diagnostic', name: 'U column visible, running, all canvases hidden', where: 'column', css: 'canvas{display:none !important}' },
  { group: 'diagnostic', name: 'W column visible, running, everything else visibility:hidden (nothing else paints)', where: 'column', css: 'body *{visibility:hidden !important} .cc-column,.cc-column *{visibility:visible !important}' },
  { group: 'diagnostic', name: 'X column visible, dash animation replaced by a transform animation (not visually equivalent)', where: 'column', css: '@keyframes ccx{to{transform:translateX(-32px)}} .cc-col-flow{animation:ccx 2s linear infinite !important;stroke-dasharray:14 18 !important}' },
  { group: 'standalone', name: 'S four animated dashed lines on a blank page', standalone: true },
];
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null; // e.g. ONLY='^(B|X) ' to run a subset
const results = [];
for (const s of SCENARIOS.filter((x) => !only || only.test(x.name))) results.push(await scenario(browser, s));
const traces = [];
for (const name of ['B column visible, streaks running'].filter((n) => !only || only.test(n))) traces.push(await traced(browser, SCENARIOS.find((s) => s.name === name)));
await browser.close();
writeFileSync(join(HERE, 'out', `${TAG}.json`), JSON.stringify({ tag: TAG, date: new Date().toISOString(), viewport: '1440x900', samples: SAMPLES, secondsPerSample: SECS, results, traces }, null, 2));

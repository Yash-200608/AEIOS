/*
 * Phase 2B navigation validation: rapid repeated navigation (latest wins), user interruption (wheel, touch, keyboard, scrollbar
 * drag), dynamic page growth up to correction exhaustion, alignment, no unwanted automatic scrolling, and reduced motion.
 * Uses the development-only diagnostics on window.__aeiosNav (current lock + decision log). Emulated devices only.
 */
import type { CDPSession, Page } from '@playwright/test';
import { expect, test } from './support';

const URL = '/?preview&fixture=normal';
// Every section the navigation knows (must match NAV_LABEL in App.tsx, so the reading rule below sees the same sections).
const LABEL: Record<string, string> = {
  overview: 'Overview',
  dispersion: 'Pollution dispersion',
  twin: '3D dispersion twin',
  atmosphere: '3D atmosphere',
  forecast: 'Forecast',
  'air-quality': 'Air quality',
  satellite: 'Satellite',
  smoke: 'Smoke origin',
  simulation: 'Simulation lab',
  aeios: 'AEIOS model',
  station: 'Station network',
};
type Log = Array<{ t: number; event: string; id?: string; detail?: string }>;

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const dump = await page
      .evaluate(() => ({
        log: (window as unknown as { __aeiosNav?: { log: unknown[] } }).__aeiosNav?.log ?? null,
        y: Math.round(window.scrollY),
        tops: Object.fromEntries(
          ['forecast', 'station', 'aeios'].map((i) => [i, Math.round(document.getElementById(i)?.getBoundingClientRect().top ?? -1)]),
        ),
      }))
      .catch(() => null);
    console.log('NAVDUMP', JSON.stringify(dump));
  }
});

async function open(page: Page) {
  await page.goto(URL);
  await expect(page.locator('#overview .cc-currency')).toContainText('Cached model run', { timeout: 15_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __aeiosNav?: unknown }).__aeiosNav));
}
/** Activate a nav item exactly as a click does (works with the drawer closed on narrow layouts). */
const nav = (page: Page, id: string) =>
  page.evaluate((label) => {
    const b = Array.from(document.querySelectorAll<HTMLButtonElement>('#primary-nav button')).find((x) => x.textContent?.trim() === label);
    if (!b) throw new Error(`no nav item ${label}`);
    b.click();
  }, LABEL[id]);
const active = (page: Page) => page.evaluate(() => document.querySelector('#primary-nav button[aria-current]')?.textContent?.trim() ?? '');
const lockState = (page: Page) => page.evaluate(() => (window as unknown as { __aeiosNav: { lock: () => unknown } }).__aeiosNav.lock());
const navLog = (page: Page) => page.evaluate(() => (window as unknown as { __aeiosNav: { log: Log } }).__aeiosNav.log) as Promise<Log>;
const scrollY = (page: Page) => page.evaluate(() => window.scrollY);
/** The destination rests where scrollIntoView puts it (scroll-padding + scroll-margin), or the page cannot scroll further. */
const arrivedAt = (page: Page, id: string) =>
  page.evaluate((i) => {
    const el = document.getElementById(i)!;
    const px = (v: string) => Number.parseFloat(v) || 0;
    const rest = px(getComputedStyle(el).scrollMarginTop) + px(getComputedStyle(document.documentElement).scrollPaddingTop);
    const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
    return Math.abs(el.getBoundingClientRect().top - rest) < 40 || atEnd;
  }, id);
/** The section the reading rule says is being read right now (same rule as the hook). */
const readingSection = (page: Page) =>
  page.evaluate((labels) => {
    const ids = Object.keys(labels);
    const els = ids.map((i) => document.getElementById(i)).filter((e): e is HTMLElement => !!e);
    els.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    let cur = els[0].id;
    for (const e of els) if (e.getBoundingClientRect().top <= window.innerHeight * 0.35) cur = e.id;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && window.scrollY > 0)
      cur = els[els.length - 1].id;
    return labels[cur];
  }, LABEL);
/** Wait until the hook holds no lock (or fail: a stuck lock). */
const noLock = (page: Page, timeout = 8_000) =>
  expect.poll(() => lockState(page), { timeout, message: 'lock must be released' }).toBeNull();
/** After the last user action, the page must not move by itself. */
async function stillAfter(page: Page, ms: number) {
  const y0 = await scrollY(page);
  await page.waitForTimeout(ms);
  expect(Math.abs((await scrollY(page)) - y0), 'no automatic scrolling after the user took over').toBeLessThan(3);
}
/** Corrective scrolls issued after the hook registered the user taking over (its own user-* log entry). */
const fixesAfterUser = (log: Log) => {
  const u = log.find((e) => e.event.startsWith('user-'));
  expect(u, 'the hook must register the user taking over').toBeTruthy();
  return log.filter((e) => e.event === 'fix' && e.t >= u!.t);
};

// ------------------------------------------------------------------------------------------- latest request wins
test('rapid repeated navigation: the latest destination wins, earlier ones never correct or highlight', async ({ page }) => {
  await open(page);
  await nav(page, 'station');
  await page.waitForTimeout(150);
  await nav(page, 'forecast');
  await page.waitForTimeout(150);
  await nav(page, 'aeios');
  expect(await active(page)).toBe('AEIOS model');
  await expect.poll(() => arrivedAt(page, 'aeios'), { timeout: 10_000 }).toBe(true);
  await noLock(page);
  expect(await active(page)).toBe('AEIOS model');
  const log = await navLog(page);
  expect(
    log.filter((e) => e.event === 'fix' && e.id !== 'aeios'),
    'no corrective scroll for a superseded destination',
  ).toEqual([]);
  expect(log.filter((e) => e.event === 'superseded').map((e) => e.id)).toEqual(['station', 'forecast']);
});

test('ten navigation requests 80 ms apart end on the last one with no lock left behind', async ({ page }) => {
  await open(page);
  const seq = ['station', 'forecast', 'simulation', 'overview', 'aeios', 'air-quality', 'station', 'satellite', 'simulation', 'forecast'];
  for (const id of seq) {
    await nav(page, id);
    await page.waitForTimeout(80);
  }
  await expect.poll(() => arrivedAt(page, 'forecast'), { timeout: 10_000 }).toBe(true);
  await noLock(page);
  expect(await active(page)).toBe('Forecast');
  expect((await navLog(page)).filter((e) => e.event === 'fix' && e.id !== 'forecast')).toEqual([]);
});

test('clicking the section you are already on does not move the page and does not leave a lock', async ({ page }) => {
  await open(page);
  await nav(page, 'forecast');
  await expect.poll(() => arrivedAt(page, 'forecast'), { timeout: 10_000 }).toBe(true);
  await noLock(page);
  const y = await scrollY(page);
  await nav(page, 'forecast');
  await noLock(page, 2_000);
  expect(Math.abs((await scrollY(page)) - y)).toBeLessThan(3);
  expect(await active(page)).toBe('Forecast');
});

// ------------------------------------------------------------------------------------------- user interruption
test('wheel during the smooth scroll: the user wins, no corrective scroll afterwards', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse wheel is a desktop input');
  await open(page);
  await nav(page, 'station');
  await page.waitForTimeout(250);
  await page.mouse.move(700, 400);
  await page.mouse.wheel(0, -500);
  await noLock(page, 3_000);
  await page.waitForTimeout(400);
  await stillAfter(page, 1_200);
  expect(fixesAfterUser(await navLog(page))).toEqual([]);
  expect(await active(page)).toBe(await readingSection(page)); // the highlight reflects where the user actually is
});

test('keyboard scrolling (Page Up) during the smooth scroll: the user wins', async ({ page }) => {
  await open(page);
  await nav(page, 'station');
  await page.waitForTimeout(250);
  await page.keyboard.press('PageUp');
  await noLock(page, 3_000);
  await page.waitForTimeout(500);
  await stillAfter(page, 1_200);
  expect(fixesAfterUser(await navLog(page))).toEqual([]);
  expect(await active(page)).toBe(await readingSection(page));
});

test('touch swipe during the smooth scroll: the user wins', async ({ page, hasTouch, context }) => {
  test.skip(!hasTouch, 'touch input');
  await open(page);
  const cdp: CDPSession = await context.newCDPSession(page);
  await nav(page, 'station');
  await page.waitForTimeout(250);
  const x = 150;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: 300 }] });
  for (let y = 320; y <= 520; y += 40) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await noLock(page, 3_000);
  await page.waitForTimeout(600);
  await stillAfter(page, 1_200);
  expect(fixesAfterUser(await navLog(page))).toEqual([]);
});

test('dragging the scrollbar during the smooth scroll: the user wins (real scrollbar: run headed)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'classic scrollbar is a desktop control');
  await open(page);
  const bar = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
  test.skip(bar < 8, `no classic scrollbar in this browser (width ${bar})`);
  await nav(page, 'station');
  await page.waitForTimeout(250);
  const vw = await page.evaluate(() => window.innerWidth);
  // Grab the thumb wherever it is now and drag it up.
  const thumbY = await page.evaluate(() => {
    const vh = window.innerHeight;
    const sh = document.documentElement.scrollHeight;
    return Math.round((window.scrollY / sh) * vh + ((vh / sh) * vh) / 2);
  });
  await page.mouse.move(vw - Math.ceil(bar / 2), thumbY);
  await page.mouse.down();
  await page.mouse.move(vw - Math.ceil(bar / 2), Math.max(5, thumbY - 120), { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await stillAfter(page, 1_500);
  await noLock(page, 3_000);
  expect(fixesAfterUser(await navLog(page)), 'a corrective scroll must not undo a scrollbar drag').toEqual([]);
});

// ------------------------------------------------------------------------------------------- growth and exhaustion
test('content that keeps growing during the scroll: corrections stop, the lock is released, the highlight is not stale', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.id = 'grow-spacer';
    spacer.style.height = '0px';
    document.getElementById('station')!.before(spacer);
    let n = 0;
    const id = window.setInterval(() => {
      spacer.style.height = `${(n += 1) * 400}px`;
      if (n >= 30) window.clearInterval(id); // 30 x 120 ms = 3.6 s of growth, 12,000 px
    }, 120);
  });
  await nav(page, 'station');
  await noLock(page, 15_000);
  const log = await navLog(page);
  const fixes = log.filter((e) => e.event === 'fix');
  expect(fixes.length).toBeLessThanOrEqual(6);
  test.info().annotations.push({
    type: 'growth',
    description: `fixes ${fixes.length}; end ${log
      .filter((e) => /settled|exhausted/.test(e.event))
      .map((e) => e.event)
      .join(',')}`,
  });
  await page.waitForTimeout(800);
  // Whatever happened, the highlight must describe where the reader is, or still be the destination they asked for.
  const [hl, reading] = [await active(page), await readingSection(page)];
  expect([reading, 'Station network']).toContain(hl);
  await stillAfter(page, 1_000);
});

// ------------------------------------------------------------------------------------------- alignment, idle
test('alignment: the section rests at the 106 px reading offset and nothing covers its heading', async ({ page }) => {
  await open(page);
  for (const id of ['forecast', 'simulation']) {
    await nav(page, id);
    await expect.poll(() => arrivedAt(page, id), { timeout: 10_000 }).toBe(true);
    await noLock(page);
    const r = await page.evaluate((i) => {
      const el = document.getElementById(i)!;
      const top = el.getBoundingClientRect().top;
      const hit = document.elementFromPoint(Math.round(el.getBoundingClientRect().left + 20), Math.round(top + 8));
      const stickyOrFixed = Array.from(document.querySelectorAll('body *')).filter(
        (n) =>
          /sticky|fixed/.test(getComputedStyle(n).position) &&
          n.getBoundingClientRect().height > 0 &&
          n.getBoundingClientRect().top < 120 &&
          n.getBoundingClientRect().width > 200,
      );
      return {
        top: Math.round(top),
        covered: !el.contains(hit),
        overlays: stickyOrFixed.map((n) => `${n.tagName.toLowerCase()}.${(n as HTMLElement).className.toString().split(' ')[0]}`),
      };
    }, id);
    test.info().annotations.push({ type: `align ${id}`, description: JSON.stringify(r) });
    expect(Math.abs(r.top - 106)).toBeLessThan(40);
    expect(r.covered, `#${id}'s top must not be covered`).toBe(false);
  }
});

test('no automatic scrolling at rest or after an ordinary user scroll', async ({ page, isMobile }) => {
  await open(page);
  await stillAfter(page, 2_500);
  if (!isMobile) {
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, 1_500);
    await page.waitForTimeout(600);
  } else {
    await page.evaluate(() => window.scrollBy({ top: 1_500, behavior: 'instant' }));
  }
  await stillAfter(page, 2_000);
  expect((await navLog(page)).filter((e) => e.event === 'lock' || e.event === 'fix')).toEqual([]);
  expect(await active(page)).toBe(await readingSection(page));
});

test('keyboard activation of a nav item navigates and highlights it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the sidebar is a drawer on narrow layouts');
  await open(page);
  const visible = await page.locator('#primary-nav').isVisible();
  test.skip(!visible, 'sidebar not visible at this width');
  await page.locator('#primary-nav button', { hasText: 'Forecast' }).focus();
  await page.keyboard.press('Enter');
  expect(await active(page)).toBe('Forecast');
  await expect.poll(() => arrivedAt(page, 'forecast'), { timeout: 10_000 }).toBe(true);
  await noLock(page);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('rapid requests jump instantly and the last one wins', async ({ page }) => {
    await open(page);
    await nav(page, 'station');
    await nav(page, 'forecast');
    expect(await active(page)).toBe('Forecast');
    await expect.poll(() => arrivedAt(page, 'forecast'), { timeout: 2_000 }).toBe(true);
    await noLock(page, 2_000);
    expect((await navLog(page)).filter((e) => e.event === 'fix' && e.id !== 'forecast')).toEqual([]);
  });
});

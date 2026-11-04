/*
 * Shared Playwright fixture. Every spec imports { test, expect } from here, never from @playwright/test directly.
 * For every browser context it:
 *   (a) seeds localStorage on the dev-server origin with the recorded Open-Meteo responses in fixtures/openmeteo-cache.json,
 *       before any app script runs, so the app has a (deliberately old) cached model run to fall back to;
 *   (b) aborts every request to open-meteo.com, so the free daily quota is never consumed. The app then shows the
 *       seeded run as a cached (stale) model run, which is exactly the state the specs assert.
 */
import { test as base, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import cacheEntries from './fixtures/openmeteo-cache.json' with { type: 'json' };

export const ORIGIN = 'http://127.0.0.1:5174';
const OPEN_METEO = /open-meteo\.com/;
type CacheEntry = { name: string; value: string };
const CACHE: CacheEntry[] = cacheEntries;

/** Dev-only debug hook exposed by the Motion Lab (window.__motionLab). */
declare global {
  interface Window {
    __motionLab?: { scrollTriggers(): number; gsapTweens(): number };
  }
}

// Requests to open-meteo.com that each context attempted (and that were aborted), for diagnostics.
const blocked = new WeakMap<BrowserContext, string[]>();
export const blockedOpenMeteoRequests = (context: BrowserContext): string[] => blocked.get(context) ?? [];

export const test = base.extend({
  context: async ({ context }, use) => {
    const urls: string[] = [];
    blocked.set(context, urls);
    await context.route(OPEN_METEO, (route) => {
      urls.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    await context.addInitScript(
      ({ origin, entries }) => {
        if (window.location.origin !== origin) return;
        for (const e of entries) {
          try {
            window.localStorage.setItem(e.name, e.value);
          } catch {
            /* storage blocked: the app then shows its no-cache state */
          }
        }
      },
      { origin: ORIGIN, entries: CACHE },
    );
    await use(context);
  },
});

export { expect };

/** True when the document is wider than the viewport (horizontal overflow). One pixel of rounding is tolerated. */
export async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

/** Integer value of a numeric data attribute (e.g. data-flow-frames); NaN when missing. */
export async function intAttr(loc: Locator, name: string): Promise<number> {
  return Number.parseInt((await loc.getAttribute(name)) ?? '', 10);
}

/** Jump-scroll the window (bypasses `scroll-behavior: smooth`). */
export async function scrollToY(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
}

/** Scroll so the element is fully off-screen (above the viewport, or below it if the page cannot scroll that far). */
export async function scrollOffScreen(page: Page, loc: Locator): Promise<void> {
  await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const below = window.scrollY + r.bottom + 200;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: below <= max ? below : Math.max(0, window.scrollY + r.top - window.innerHeight - 200), behavior: 'instant' });
  });
  await expect.poll(() => isInViewport(loc), { message: 'element should be off-screen after scrolling' }).toBe(false);
}

export async function isInViewport(loc: Locator): Promise<boolean> {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  });
}

/** Wait until every finite Web Animation / CSS transition on the page has finished (infinite loops are ignored). */
export async function settleFiniteAnimations(page: Page, timeout = 5_000): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running')
        .every((a) => a.effect?.getComputedTiming().endTime === Infinity),
    undefined,
    { timeout },
  );
}

export const sleep = (page: Page, ms: number) => page.waitForTimeout(ms);

// ------------------------------------------------------------------------------------------------------------ views

/** The development preview (no sign-in) with the "normal" fixture. Append '#/<viewId>' for a deep link. */
export const PREVIEW = '/?preview&fixture=normal';

/** Navigation label of every view, in navigation order (must match src/shell/viewRegistry.ts). */
export const VIEW_LABELS = {
  overview: 'Overview',
  'air-quality': 'Air quality',
  dispersion: 'Pollution dispersion',
  twin: '3D dispersion twin',
  forecast: 'Forecast',
  smoke: 'Smoke origin',
  satellite: 'Satellite',
  atmosphere: '3D atmosphere',
  simulation: 'Simulation lab',
  aeios: 'AEIOS model',
  station: 'Station network',
} as const;
export type ViewKey = keyof typeof VIEW_LABELS;
export const VIEW_KEYS = Object.keys(VIEW_LABELS) as ViewKey[];

export const stage = (page: Page) => page.getByTestId('view-stage');

/** Open the preview (optionally deep-linked to a view) and wait until that view is mounted and settled. */
export async function openView(page: Page, view: ViewKey = 'overview'): Promise<void> {
  await page.goto(view === 'overview' ? PREVIEW : `${PREVIEW}#/${view}`);
  await expect(stage(page)).toHaveAttribute('data-view', view);
  await expect(stage(page)).toHaveAttribute('data-view-state', 'idle', { timeout: 5_000 });
}

/** True when the sidebar is an off-canvas drawer (narrow layouts): the menu button is shown. */
export const isCompact = (page: Page) => page.locator('.menu-button').isVisible();

/**
 * Open a view the way a user does: click its sidebar item, opening the drawer first on narrow layouts.
 * Waits until the stage shows the view (not until its transition has finished).
 */
export async function navTo(page: Page, view: ViewKey): Promise<void> {
  if (await isCompact(page)) {
    await page.locator('.menu-button').click();
    await expect(page.locator('#primary-nav')).toHaveClass(/is-open/);
  }
  await page.locator('#primary-nav').getByRole('button', { name: VIEW_LABELS[view], exact: true }).click();
  await expect(stage(page)).toHaveAttribute('data-view', view);
}

/** Wait until the view transition has finished. */
export const stageIdle = (page: Page, timeout = 5_000) => expect(stage(page)).toHaveAttribute('data-view-state', 'idle', { timeout });

/** Every "aria-current:text" in the sidebar navigation (exactly one is expected). */
export const currentNav = (page: Page) =>
  page
    .locator('#primary-nav [aria-current]')
    .evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-current')}:${e.textContent?.trim()}`));

/**
 * Bring the Overview's command center into view so its Mission Reveal starts (it waits below the globe landing), and wait
 * until the reveal has finished. Also waits for the cached model run, which every Overview assertion depends on.
 */
export async function revealCommandCenter(page: Page, feed: RegExp | string = 'Cached model run'): Promise<void> {
  const root = page.locator('#overview .cc');
  await expect(page.locator('#overview .cc-currency')).toContainText(feed, { timeout: 15_000 });
  // Late panels shift the layout, so scroll again until the reveal has started.
  await expect(async () => {
    await root.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await expect(root).toHaveAttribute('data-reveal-start', 'started', { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await expect(root).toHaveAttribute('data-reveal-state', 'done', { timeout: 3_000 });
}

/** A data update while the Overview stays mounted: the topbar's Refresh reloads the (cached) model run into new objects. */
export async function refreshData(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Refresh weather data' }).click();
}

/**
 * Collect uncaught page errors and console errors, ignoring failed resource loads: every Open-Meteo request is aborted by this
 * fixture on purpose, and the dev preview has no backend, so "Failed to load resource" lines and the browser's CORS refusals of
 * cloud functions called from 127.0.0.1 (e.g. the Smoke origin fire feed) are expected.
 */
export function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource|net::ERR_|has been blocked by CORS policy/.test(text)) return;
    problems.push(`console.error: ${text.slice(0, 300)}`);
  });
  return problems;
}

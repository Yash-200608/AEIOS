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

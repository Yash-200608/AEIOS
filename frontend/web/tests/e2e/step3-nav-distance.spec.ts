/*
 * Navigation to a distant section. The highlight must move to the destination immediately, stay there while the scroll is
 * travelling (however long that takes: there is no fixed timeout), and stay after it settles. It also must not need the destination
 * to reach the 35% reading line, and it must behave the same under reduced motion (an instant jump).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './support';

const URL = '/?preview&fixture=normal';
const DESTINATION = 'Review the station network'; // the farthest Overview link: Station network is the last section on the page
const TARGET = 'Station network';

async function open(page: Page) {
  await page.goto(URL);
  await expect(page.locator('#overview .cc-currency')).toContainText('Cached model run', { timeout: 15_000 });
}
const active = (page: Page) =>
  page
    .locator('#primary-nav button[aria-current]')
    .evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-current')}:${e.textContent?.trim()}`));

/** The destination rests where scrollIntoView puts it (sticky offset = scroll-padding + scroll-margin), or the page cannot scroll further. */
const arrivedAt = (page: Page, id: string) =>
  page.evaluate((i) => {
    const el = document.getElementById(i)!;
    const px = (v: string) => Number.parseFloat(v) || 0;
    const rest = px(getComputedStyle(el).scrollMarginTop) + px(getComputedStyle(document.documentElement).scrollPaddingTop);
    const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
    return Math.abs(el.getBoundingClientRect().top - rest) < 40 || atEnd;
  }, id);
const arrived = (page: Page) => arrivedAt(page, 'station');

/** Records every distinct highlighted item, with the time it appeared, from the moment it is called. */
async function recordHighlight(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __hl: Array<[number, string]>; __t0: number };
    w.__hl = [];
    w.__t0 = performance.now();
    const read = () => document.querySelector('#primary-nav button[aria-current]')?.textContent?.trim() ?? '';
    const note = () => {
      const cur = read();
      if (w.__hl.at(-1)?.[1] !== cur) w.__hl.push([Math.round(performance.now() - w.__t0), cur]);
    };
    note();
    new MutationObserver(note).observe(document.querySelector('#primary-nav')!, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-current', 'class'],
    });
  });
}
const recorded = (page: Page) => page.evaluate(() => (window as unknown as { __hl: Array<[number, string]> }).__hl);

test('from the top to the farthest section: the destination is highlighted at once and stays highlighted', async ({ page }) => {
  await open(page);
  expect(await active(page)).toEqual(['location:Overview']);
  await recordHighlight(page);
  await page.locator('.cc-dest a', { hasText: DESTINATION }).click();
  // Immediately, not when the scroll arrives.
  await expect.poll(() => active(page), { timeout: 500 }).toEqual([`location:${TARGET}`]);
  // The page really does travel there.
  await expect.poll(() => arrived(page), { timeout: 10_000 }).toBe(true); // content grows while scrolling: it re-aligns if it lands short
  await page.waitForTimeout(800);
  expect(await active(page)).toEqual([`location:${TARGET}`]);
  // Between the click and the arrival the highlight only ever moved Overview -> destination; no intermediate section flashed.
  const seen = (await recorded(page)).map(([, label]) => label);
  expect(seen.filter((label) => label !== '' && label !== 'Overview' && label !== TARGET)).toEqual([]);
  expect(await page.locator('.breadcrumb b').textContent()).toBe(TARGET);
});

test('a scroll that takes 4 s (longer than the old 2.5 s lock) never lets an intermediate section take over', async ({ page }) => {
  await page.addInitScript(() => {
    // Some browsers fire scrollend after every programmatic jump; a real smooth scroll fires one at the end. Hide it so this test
    // exercises the "still moving" path only.
    window.addEventListener('scrollend', (e) => e.stopImmediatePropagation(), true);
  });
  await open(page);
  await page.evaluate(() => {
    // A deliberately slow, JS-driven version of the browser's smooth scroll: 4 s from the click to the destination.
    const native = Element.prototype.scrollIntoView;
    let calls = 0;
    Element.prototype.scrollIntoView = function slow(this: Element, arg?: boolean | ScrollIntoViewOptions) {
      if (calls++ > 0) return native.call(this, arg as ScrollIntoViewOptions); // later calls are the app's corrective scrolls
      const start = window.scrollY;
      const end = this.getBoundingClientRect().top + window.scrollY;
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 4_000);
        window.scrollTo({ top: start + (end - start) * k, behavior: 'instant' });
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
  });
  await recordHighlight(page);
  await page.locator('.cc-dest a', { hasText: DESTINATION }).click();
  await expect.poll(() => active(page), { timeout: 500 }).toEqual([`location:${TARGET}`]);
  await page.waitForTimeout(5_200); // past 2.5 s and past the end of the 4 s scroll plus the settle time
  await expect.poll(() => arrived(page), { timeout: 8_000 }).toBe(true);
  expect(await active(page)).toEqual([`location:${TARGET}`]);
  const seen = await recorded(page);
  expect(seen.map(([, label]) => label).filter((label) => label !== '' && label !== 'Overview' && label !== TARGET)).toEqual([]);
  // After the scroll settled the highlight is released to the normal reading rule, and it agrees (we are at the end of the page).
  await page.evaluate(() => window.scrollBy({ top: -1, behavior: 'instant' }));
  await expect.poll(() => active(page), { timeout: 2_000 }).toEqual([`location:${TARGET}`]);
});

test('after a nearer click the lock is released once scrolling settles: the next scroll follows the reading position again', async ({
  page,
}) => {
  await open(page);
  await page.locator('.cc-dest a', { hasText: 'Check the forecast' }).click();
  await expect.poll(() => active(page), { timeout: 500 }).toEqual(['location:Forecast']);
  await expect.poll(() => arrivedAt(page, 'forecast'), { timeout: 8_000 }).toBe(true);
  await page.waitForTimeout(600); // settled
  await page.evaluate(() => {
    const el = document.getElementById('air-quality')!;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 60, behavior: 'instant' });
  });
  await expect.poll(() => active(page), { timeout: 3_000 }).toEqual(['location:Air quality']);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the jump is instant and the destination is highlighted straight away and stays', async ({ page }) => {
    await open(page);
    await recordHighlight(page);
    const t = Date.now();
    await page.locator('.cc-dest a', { hasText: DESTINATION }).click();
    await expect.poll(() => active(page), { timeout: 500 }).toEqual([`location:${TARGET}`]);
    // No smooth scroll: the page is at the end almost at once.
    await expect.poll(() => arrived(page), { timeout: 3_000 }).toBe(true);
    expect(Date.now() - t).toBeLessThan(2_500);
    await page.waitForTimeout(600);
    expect(await active(page)).toEqual([`location:${TARGET}`]);
    const seen = (await recorded(page)).map(([, label]) => label);
    expect(seen.filter((label) => label !== '' && label !== 'Overview' && label !== TARGET)).toEqual([]);
  });
});

/*
 * Step 3: focal shift on the column's height lanes, the one-time mixing-layer rise, scroll-following navigation with correct
 * aria-current, and one-time entrances for the two long lower Overview sections. No snapping, pinning or scroll hijacking.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './support';

const URL = '/?preview&fixture=normal';
async function open(page: Page) {
  await page.goto(URL);
  await expect(page.locator('#overview .cc-currency')).toContainText('Cached model run', { timeout: 15_000 });
}
const column = (page: Page) => page.locator('.cc-column').first();
const activeNav = (page: Page) =>
  page
    .locator('#primary-nav button[aria-current]')
    .evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-current')}:${e.textContent?.trim()}`));
const scrollToSection = (page: Page, id: string) =>
  page.evaluate(
    (i) => window.scrollTo({ top: document.getElementById(i)!.getBoundingClientRect().top + window.scrollY - 60, behavior: 'instant' }),
    id,
  );

// ------------------------------------------------------------------------------------------------ B(2) focal shift
test('focal shift: the focused height leads, the others recede, text and values are untouched', async ({ page }) => {
  await open(page);
  const col = column(page);
  await col.scrollIntoViewIfNeeded();
  const lanes = col.locator('.cc-col-lane');
  expect(await lanes.count()).toBeGreaterThanOrEqual(3);
  const before = await col.evaluate((el) => ({
    texts: Array.from(el.querySelectorAll('.cc-col-wind')).map(
      (n) => `${n.textContent}|${getComputedStyle(n).fill}|${getComputedStyle(n).opacity}`,
    ),
    table: el.querySelector('table')?.textContent,
  }));
  await lanes.nth(1).focus(); // keyboard path: lanes are focusable
  await expect(lanes.nth(1)).toHaveClass(/is-hot/);
  await expect(lanes.nth(1)).toHaveAttribute('aria-label', /m\/s|not available/);
  const opacities = () => lanes.evaluateAll((els) => els.map((e) => getComputedStyle(e.querySelector('.cc-col-flow') ?? e).opacity));
  await expect.poll(async () => (await opacities()).filter((o) => o === '0.35').length, { timeout: 1_500 }).toBe((await lanes.count()) - 1);
  expect((await opacities())[1]).toBe('1');
  const during = await col.evaluate((el) => ({
    texts: Array.from(el.querySelectorAll('.cc-col-wind')).map(
      (n) => `${n.textContent}|${getComputedStyle(n).fill}|${getComputedStyle(n).opacity}`,
    ),
    table: el.querySelector('table')?.textContent,
  }));
  expect(during).toEqual(before); // labels, colours (contrast) and the table are exactly as before
  await lanes.nth(1).blur();
  await expect(lanes.nth(1)).not.toHaveClass(/is-hot/);
  await expect.poll(async () => (await opacities()).filter((o) => o === '0.35').length, { timeout: 1_500 }).toBe(0);
});

test('focal shift works with a pointer too and a second selection replaces the first', async ({ page }) => {
  await open(page);
  const col = column(page);
  await col.scrollIntoViewIfNeeded();
  const lanes = col.locator('.cc-col-lane');
  await lanes.nth(0).click();
  await expect(col.locator('.cc-col-lane.is-hot')).toHaveCount(1);
  await expect(lanes.nth(0)).toHaveClass(/is-hot/);
  await lanes.nth(2).click();
  await expect(col.locator('.cc-col-lane.is-hot')).toHaveCount(1);
  await expect(lanes.nth(2)).toHaveClass(/is-hot/);
});

// ------------------------------------------------------------------------------------------------ B(3) mixing layer
test('mixing layer: ends at the modelled height; only a transform and an opacity animate', async ({ page }) => {
  await open(page);
  const col = column(page);
  await col.scrollIntoViewIfNeeded();
  await expect(col).toHaveAttribute('data-enter', 'done');
  const geometry = () => col.locator('.cc-col-mix').evaluate((el) => ({ y: el.getAttribute('y'), h: el.getAttribute('height') }));
  const g0 = await geometry();
  await expect
    .poll(() => col.locator('.cc-col-mix').evaluate((el) => getComputedStyle(el).transform), { timeout: 2_000 })
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  expect(await geometry()).toEqual(g0); // the real geometry never changed; nothing was simulated
  await expect(col.locator('.cc-col-label')).toContainText(/mixing layer/);
  await expect.poll(() => col.locator('.cc-col-label').evaluate((el) => getComputedStyle(el).opacity), { timeout: 2_000 }).toBe('1');
  // The "pending" state (before the column is first seen) is the band collapsed to the ground, not hidden elsewhere.
  await col.evaluate((el) => el.setAttribute('data-enter', 'pending'));
  expect(await col.locator('.cc-col-mix').evaluate((el) => getComputedStyle(el).transform)).toMatch(/^matrix\(1, 0, 0, 0,/);
  await col.evaluate((el) => el.setAttribute('data-enter', 'done'));
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the mixing layer is simply there, nothing transitions, and the lower sections are plain', async ({ page }) => {
    await open(page);
    const col = column(page);
    await col.scrollIntoViewIfNeeded();
    await expect(col).toHaveAttribute('data-enter', 'done');
    const mix = await col
      .locator('.cc-col-mix')
      .evaluate((el) => ({ t: getComputedStyle(el).transform, d: getComputedStyle(el).transitionDuration }));
    expect(mix.t).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    expect(mix.d).toBe('0s');
    expect(await page.locator('[data-enter-once]').count()).toBe(0);
    await expect(page.locator('.cc-region')).toBeVisible();
  });
});

// ------------------------------------------------------------------------------------------------ C navigation
test('the navigation follows the section being read; exactly one item has aria-current="location"', async ({ page }) => {
  await open(page);
  expect(await activeNav(page)).toEqual(['location:Overview']);
  for (const [id, label] of [
    ['forecast', 'Forecast'],
    ['air-quality', 'Air quality'],
    ['simulation', 'Simulation lab'],
    ['atmosphere', '3D atmosphere'],
    ['overview', 'Overview'],
  ] as const) {
    await scrollToSection(page, id);
    await expect.poll(() => activeNav(page), { timeout: 3_000, message: `active item at #${id}` }).toEqual([`location:${label}`]);
    await expect(page.locator('.breadcrumb b')).toHaveText(label);
  }
});

test('the last section becomes active at the end of the page', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await expect.poll(() => activeNav(page), { timeout: 3_000 }).toEqual(['location:Station network']);
});

test('clicking a destination moves the highlight straight to its target, without flickering through the sections on the way', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    const w = window as unknown as { __seen: string[] };
    w.__seen = [];
    new MutationObserver(() => {
      const cur = document.querySelector('#primary-nav button[aria-current]')?.textContent?.trim() ?? '';
      if (w.__seen.at(-1) !== cur) w.__seen.push(cur);
    }).observe(document.querySelector('#primary-nav')!, { attributes: true, subtree: true, attributeFilter: ['aria-current', 'class'] });
  });
  await page.locator('.cc-dest a', { hasText: 'Check the forecast' }).click();
  await expect.poll(() => activeNav(page), { timeout: 5_000 }).toEqual(['location:Forecast']);
  await page.waitForTimeout(1_200);
  expect(await activeNav(page)).toEqual(['location:Forecast']);
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen.filter((s) => s !== 'Forecast')).toEqual([]);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toBe('none');
});

// ------------------------------------------------------------------------------------------------ C entrances
test('Regional context and Destinations enter once; nothing else does; data updates and re-scrolling never repeat it', async ({ page }) => {
  await open(page);
  const once = page.locator('[data-enter-once]');
  await expect(once).toHaveCount(2);
  expect(await page.locator('#overview [data-enter-once] .cc-region, #overview [data-enter-once] .cc-dest').count()).toBe(2);
  await page.locator('.cc-region').scrollIntoViewIfNeeded();
  await page.locator('.cc-dest').scrollIntoViewIfNeeded(); // on a phone the two sections are a screen apart
  await expect.poll(() => once.evaluateAll((els) => els.every((e) => getComputedStyle(e).opacity === '1')), { timeout: 3_000 }).toBe(true);
  // Once seen, scrolling away and back, and a data update (model hour), must not hide or re-animate them.
  await page.evaluate(() => {
    const w = window as unknown as { __min: number };
    w.__min = 1;
    const tick = () => {
      document.querySelectorAll('[data-enter-once]').forEach((e) => (w.__min = Math.min(w.__min, Number(getComputedStyle(e).opacity))));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page
    .locator('#atmosphere input[type="range"]')
    .first()
    .evaluate((el: HTMLInputElement) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(el, String(Number(el.value) + 3));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await page.locator('.cc-region').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as unknown as { __min: number }).__min)).toBe(1);
  // Only those two use an entrance: the main band, alerts and rail are not scroll-animated.
  expect(await page.locator('#overview .cc-band [data-enter-once], #overview .cc-rail [data-enter-once]').count()).toBe(0);
});

test('a second visit in the same session shows the lower sections without any entrance', async ({ page }) => {
  await open(page);
  await expect(page.locator('#overview .cc')).toHaveAttribute('data-reveal-state', 'done', { timeout: 2_500 });
  await page.reload();
  await expect(page.locator('#overview .cc')).toBeVisible();
  expect(await page.locator('[data-enter-once]').count()).toBe(0);
  await expect(page.locator('.cc-region')).toBeVisible();
});

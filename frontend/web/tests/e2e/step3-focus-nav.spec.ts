/*
 * Step 3: focal shift on the column's height lanes, the one-time mixing-layer rise, and one-time entrances for the two long lower
 * Overview sections. No snapping, pinning or scroll hijacking. (The old single-page scroll-following navigation is gone: each
 * sidebar item now opens its own view, covered by views.spec.ts.)
 */
import type { Page } from '@playwright/test';
import { expect, openView, refreshData, revealCommandCenter, test } from './support';

async function open(page: Page) {
  await openView(page, 'overview');
  await expect(page.locator('#overview .cc-currency')).toContainText('Cached model run', { timeout: 15_000 });
}
const column = (page: Page) => page.locator('.cc-column').first();

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

// ------------------------------------------------------------------------------------------------ C entrances
test('Regional context and Destinations enter once; nothing else does; data updates and re-scrolling never repeat it', async ({ page }) => {
  await open(page);
  await revealCommandCenter(page);
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
  await refreshData(page); // a data update while the Overview stays mounted
  await page.locator('.cc-region').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as unknown as { __min: number }).__min)).toBe(1);
  // Only those two use an entrance: the main band, alerts and rail are not scroll-animated.
  expect(await page.locator('#overview .cc-band [data-enter-once], #overview .cc-rail [data-enter-once]').count()).toBe(0);
});

test('a second visit in the same session shows the lower sections without any entrance', async ({ page }) => {
  await open(page);
  await revealCommandCenter(page);
  await page.reload();
  await expect(page.locator('#overview .cc')).toBeVisible();
  expect(await page.locator('[data-enter-once]').count()).toBe(0);
  await expect(page.locator('.cc-region')).toBeVisible();
});

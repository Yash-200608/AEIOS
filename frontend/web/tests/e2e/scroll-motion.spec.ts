/*
 * Scroll-linked motion inside a view: the reading-progress bar follows the window scroll, panels rise in once when they are
 * scrolled into view (RevealOnScroll: pending -> shown, fully opaque after) and the view's hero band plays its entrance once.
 * Nothing blocks scrolling, and reduced motion shows everything at once. The Forecast view is used: it is long on every
 * viewport and its lower panels start below the fold.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, navTo, openView, scrollToY, stageIdle, test } from './support';

const bar = (page: Page) => page.getByTestId('scroll-progress');
/** The bar's scaleX (its transform is scaleX only: matrix(sx, 0, 0, 1, 0, 0), or none at 1). */
const scaleX = (page: Page) =>
  bar(page).evaluate((el) => {
    const t = getComputedStyle(el).transform;
    if (t === 'none') return 1;
    return new DOMMatrixReadOnly(t).a;
  });
const maxScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
/** How far the window is scrolled right now (0..1), measured the way the bar defines it. */
const actualProgress = (page: Page) =>
  page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 1 ? window.scrollY / max : 0;
  });
/** The bar matches the real scroll position (within 3 %), once its light spring has settled. */
const barTracksScroll = (page: Page) =>
  expect
    .poll(async () => Math.abs((await scaleX(page)) - (await actualProgress(page))), { timeout: 3_000, message: 'bar = scroll progress' })
    .toBeLessThan(0.03);
/** Scroll to the very end; late content can still make the page longer, so scroll again until the end holds. */
const scrollToEnd = (page: Page) =>
  expect(async () => {
    await scrollToY(page, await maxScroll(page));
    expect(await actualProgress(page)).toBeGreaterThan(0.995);
    await expect.poll(() => scaleX(page), { timeout: 1_500 }).toBeGreaterThan(0.97);
  }).toPass({ timeout: 10_000 });
const blocks = (page: Page) => page.locator('[data-view-id="forecast"] [data-reveal-on-scroll]');
const finalStyle = (loc: Locator) =>
  loc.evaluate((el) => ({ opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform }));

async function openForecast(page: Page) {
  await openView(page, 'overview');
  await navTo(page, 'forecast');
  await stageIdle(page);
}

test('the reading-progress bar grows with the scroll and reaches the end at the bottom', async ({ page }) => {
  await openForecast(page);
  await expect(bar(page)).toHaveAttribute('aria-hidden', 'true');
  const max = await maxScroll(page);
  expect(max, 'the Forecast view is long enough to scroll').toBeGreaterThan(300);
  await expect.poll(() => scaleX(page)).toBeLessThan(0.02);
  await scrollToY(page, Math.round(max / 2));
  await expect.poll(() => scaleX(page), { timeout: 3_000 }).toBeGreaterThan(0.25);
  await barTracksScroll(page);
  await scrollToEnd(page);
  await scrollToY(page, 0);
  await expect.poll(() => scaleX(page), { timeout: 3_000 }).toBeLessThan(0.02);
});

test('the bar restarts at zero for each new view', async ({ page }) => {
  await openForecast(page);
  await scrollToEnd(page);
  await navTo(page, 'air-quality');
  await stageIdle(page);
  await expect.poll(() => scaleX(page), { timeout: 3_000 }).toBeLessThan(0.02);
});

test('panels below the fold wait ("pending") and rise in once when scrolled into view, ending fully opaque', async ({ page }) => {
  await openForecast(page);
  const layout = () =>
    blocks(page).evaluateAll((els) =>
      els.map((el) => ({ state: el.getAttribute('data-reveal-on-scroll'), top: el.getBoundingClientRect().top, vh: window.innerHeight })),
    );
  // Blocks on the first screen enter with the view (a short cascade) and end "shown"...
  await expect
    .poll(async () => (await layout()).filter((b) => b.top < b.vh * 0.8).every((b) => b.state === 'shown'), { timeout: 3_000 })
    .toBe(true);
  // ...while blocks that start below the fold are still waiting.
  const below = (await layout()).filter((b) => b.top > b.vh);
  expect(below.length, 'some Forecast panels start below the fold').toBeGreaterThan(0);
  expect(below.every((b) => b.state === 'pending')).toBe(true);
  // A pending block is not shown yet (and is never display:none or visibility:hidden: it only waits for its entrance).
  const pending = blocks(page).and(page.locator('[data-reveal-on-scroll="pending"]')).first();
  const waiting = await pending.evaluate((el) => ({ o: Number(getComputedStyle(el).opacity), v: getComputedStyle(el).visibility }));
  expect(waiting.o).toBeLessThan(1);
  expect(waiting.v).toBe('visible');

  const count = await blocks(page).count();
  for (let i = 0; i < count; i += 1) {
    const block = blocks(page).nth(i);
    await block.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(block).toHaveAttribute('data-reveal-on-scroll', 'shown', { timeout: 3_000 });
    expect(await finalStyle(block)).toEqual({ opacity: '1', transform: expect.stringMatching(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/) });
  }
  // Once shown, scrolling away and back never hides them again.
  await scrollToY(page, 0);
  await page.waitForTimeout(300);
  expect(
    await blocks(page).evaluateAll((els) => els.map((e) => [e.getAttribute('data-reveal-on-scroll'), getComputedStyle(e).opacity])),
  ).toEqual(Array.from({ length: count }, () => ['shown', '1']));
});

test('the hero band plays its entrance and ends with every word in place; scrolling works during it', async ({ page }) => {
  await openView(page, 'overview');
  await navTo(page, 'forecast');
  const words = page.locator('[data-view-id="forecast"] .view-hero__word-inner');
  await expect(words.first()).toBeAttached();
  // Scrolling is never blocked by the entrance.
  await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await stageIdle(page);
  await expect.poll(() => words.evaluateAll((els) => els.every((e) => getComputedStyle(e).opacity === '1')), { timeout: 3_000 }).toBe(true);
  await expect(page.locator('[data-view-id="forecast"] [data-view-heading]')).toHaveText('Forecast');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('everything is shown at once: every panel "shown" and opaque, the hero static, the bar exact', async ({ page }) => {
    await openForecast(page);
    expect(await blocks(page).count()).toBeGreaterThan(0);
    expect(
      await blocks(page).evaluateAll((els) => els.map((e) => [e.getAttribute('data-reveal-on-scroll'), getComputedStyle(e).opacity])),
    ).toEqual(Array.from({ length: await blocks(page).count() }, () => ['shown', '1']));
    expect(
      await page
        .locator('[data-view-id="forecast"] .view-hero__word-inner, [data-view-id="forecast"] .view-hero__subtitle')
        .evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity).filter((o) => o !== '1')),
    ).toEqual([]);
    // Progress is information, so it stays, without smoothing: it is exact as soon as the scroll has happened.
    await scrollToY(page, Math.round((await maxScroll(page)) / 2));
    await barTracksScroll(page);
    await scrollToEnd(page);
  });
});

/*
 * Step 1: the Atmospheric Column's CSS wind streaks. They pause off-screen (IntersectionObserver), pause on request, and are off under
 * reduced motion, while every measurement, label and the values table stay exactly as they were. The column lives in the Overview
 * view's command center, below the globe landing.
 */
import { expect, hasHorizontalOverflow, openView, test } from './support';

const states = (page: import('@playwright/test').Page) =>
  page.locator('.cc-col-flow').evaluateAll((els) => els.map((el) => getComputedStyle(el).animationPlayState));
const infoText = (page: import('@playwright/test').Page) =>
  page
    .locator('.cc-column')
    .first()
    .evaluate((el) => ({
      svgLabel: el.querySelector('svg')?.getAttribute('aria-label') ?? '',
      winds: Array.from(el.querySelectorAll('.cc-col-wind')).map((n) => n.textContent),
      caption: el.querySelector('.cc-column__cap')?.textContent ?? '',
      table: el.querySelector('table')?.textContent ?? '',
    }));

async function openColumn(page: import('@playwright/test').Page) {
  await openView(page, 'overview');
  await expect(page.locator('#overview .cc-currency')).toContainText('Cached model run', { timeout: 15_000 });
  const column = page.locator('.cc-column').first();
  await column.scrollIntoViewIfNeeded();
  await expect(column).toHaveAttribute('data-offscreen', 'false');
  return column;
}

test('column streaks run in view, pause off-screen, and resume when back in view', async ({ page }) => {
  const column = await openColumn(page);
  expect((await states(page)).length).toBeGreaterThan(0);
  expect(new Set(await states(page))).toEqual(new Set(['running']));

  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await expect(column).toHaveAttribute('data-offscreen', 'true');
  expect(new Set(await states(page))).toEqual(new Set(['paused']));
  // Nothing is running anywhere in the document that belongs to the column.
  expect(
    await page.evaluate(
      () => document.getAnimations().filter((a) => a.playState === 'running' && (a as CSSAnimation).animationName === 'cc-flow').length,
    ),
  ).toBe(0);

  await column.scrollIntoViewIfNeeded();
  await expect(column).toHaveAttribute('data-offscreen', 'false');
  expect(new Set(await states(page))).toEqual(new Set(['running']));
});

test('Pause and Resume work, persist through scrolling away and back, and change no information', async ({ page }) => {
  const column = await openColumn(page);
  const before = await infoText(page);
  const button = column.getByRole('button', { name: /wind flow animation/ });
  await expect(button).toBeVisible();
  await expect(button).toContainText('Pause');

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toContainText('Resume');
  expect(new Set(await states(page))).toEqual(new Set(['paused']));
  expect(await infoText(page)).toEqual(before);

  // The user's pause survives leaving and re-entering the viewport.
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await expect(column).toHaveAttribute('data-offscreen', 'true');
  await column.scrollIntoViewIfNeeded();
  await expect(column).toHaveAttribute('data-offscreen', 'false');
  expect(new Set(await states(page))).toEqual(new Set(['paused']));

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(new Set(await states(page))).toEqual(new Set(['running']));
  expect(await infoText(page)).toEqual(before);
  // The values table is still present and readable.
  await column.locator('summary').click();
  await expect(column.locator('table')).toContainText('Mixing height');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('streaks are static, the note replaces the button, and nothing is lost', async ({ page }) => {
    const column = await openColumn(page);
    expect(await page.locator('.cc-col-flow').evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName))).toEqual(
      expect.arrayContaining(['none']),
    );
    expect(new Set(await page.locator('.cc-col-flow').evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName)))).toEqual(
      new Set(['none']),
    );
    await expect(column.getByRole('button', { name: /wind flow animation/ })).toHaveCount(0);
    await expect(column).toContainText('Wind animation off (reduced motion)');
    const info = await infoText(page);
    expect(info.winds.length).toBeGreaterThan(0);
    expect(info.winds.every((w) => /m\/s|n\/a/.test(w ?? ''))).toBe(true);
    expect(info.table).toContain('Mixing height');
    expect(info.svgLabel).toContain('Mixing layer');
  });
});

test('no horizontal overflow and the column does not capture touch scrolling', async ({ page }) => {
  const column = await openColumn(page);
  expect(await hasHorizontalOverflow(page)).toBe(false);
  expect(
    await column
      .locator('svg')
      .first()
      .evaluate((el) => getComputedStyle(el).touchAction),
  ).not.toBe('none');
  expect(await column.evaluate((el) => getComputedStyle(el).overflowY)).not.toBe('scroll');
});

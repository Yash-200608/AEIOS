/*
 * Step 2: Mission Reveal and status-label morph on the Briefing (the command center). The reveal starts when the command center is
 * on screen and finishes within 2.5 s. It plays once per session, can be skipped and replayed, never blocks input, is skipped under reduced
 * motion, and is never triggered by data updates or by returning to the Overview.
 */
import type { Page } from '@playwright/test';
import { expect, navTo, openView, refreshData, revealCommandCenter, stageIdle, test } from './support';

const ROOT = '#briefing .cc';
const state = (page: Page) => page.locator(ROOT).getAttribute('data-reveal-state');
const allOpaque = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('#briefing [data-reveal], #briefing .cc-rail__cell')).every((el) => {
      const cs = getComputedStyle(el);
      return cs.opacity === '1' && (cs.transform === 'none' || cs.transform === 'matrix(1, 0, 0, 1, 0, 0)');
    }),
  );

async function open(page: Page) {
  await openView(page, 'briefing');
  await expect(page.locator(ROOT)).toBeVisible();
}

test('the situation is never animated; groups and cells finish within 2.5 s and end fully shown', async ({ page }) => {
  await open(page);
  // The headline is not inside any reveal group, so it is visible from the first frame.
  await expect(page.locator('h1.cc-statement').locator('xpath=ancestor-or-self::*[@data-reveal]')).toHaveCount(0);
  await expect(page.locator(ROOT)).toHaveAttribute('data-reveal-state', /^(playing|done)$/);
  await revealCommandCenter(page);
  const groups = await page.locator('#briefing [data-reveal]').evaluateAll((els) => els.map((e) => e.getAttribute('data-reveal')));
  expect([...new Set(groups)].sort()).toEqual(['assessment', 'currency', 'evidence', 'outlook']);
  expect(await page.locator('#briefing .cc-rail__cell').count()).toBeGreaterThanOrEqual(5);
  expect(await allOpaque(page)).toBe(true);
  // Provenance and currency labels are present once the reveal is done.
  await expect(page.locator('#briefing .cc-currency')).toContainText('MEASURED · AEIOS STATION');
  await expect(page.locator('#briefing .cc-currency')).toContainText('Cached model run');
});

test('it plays once per session: a reload, or coming back to the Briefing, shows everything at once', async ({ page }) => {
  await open(page);
  await revealCommandCenter(page);
  await page.reload();
  await expect(page.locator(ROOT)).toBeVisible();
  expect(await state(page)).toBe('done');
  expect(await allOpaque(page)).toBe(true);

  await navTo(page, 'forecast');
  await stageIdle(page);
  await navTo(page, 'briefing');
  await expect(page.locator(ROOT)).toBeVisible();
  expect(await state(page)).toBe('done');
  expect(await allOpaque(page)).toBe(true);
});

test('Skip ends it at once; Replay plays it again and it ends done', async ({ page }) => {
  await open(page);
  await revealCommandCenter(page);
  await page.getByRole('button', { name: 'Replay introduction animation' }).click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-reveal-state', 'playing');
  await page.getByRole('button', { name: 'Skip introduction animation' }).click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-reveal-state', 'done');
  await expect.poll(() => allOpaque(page), { timeout: 400 }).toBe(true);
  await page.getByRole('button', { name: 'Replay introduction animation' }).click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-reveal-state', 'playing');
  await expect(page.locator(ROOT)).toHaveAttribute('data-reveal-state', 'done', { timeout: 2_500 });
  expect(await allOpaque(page)).toBe(true);
});

test('while it plays, scrolling, focus and clicks still work', async ({ page }) => {
  await open(page);
  await revealCommandCenter(page);
  await page.getByRole('button', { name: 'Replay introduction animation' }).click();
  await expect(page.locator(ROOT)).toHaveAttribute('data-reveal-state', 'playing');
  const style = await page
    .locator('#briefing [data-reveal]')
    .evaluateAll((els) => els.map((e) => [getComputedStyle(e).pointerEvents, getComputedStyle(e).visibility]));
  expect(style.every(([pe, vis]) => pe !== 'none' && vis === 'visible')).toBe(true);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'instant' }));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(y0);
  const link = page.locator('#briefing .cc-link').first();
  await link.focus();
  await expect(link).toBeFocused();
  await page.waitForTimeout(1_600); // the reveal ends; focus must not have moved
  await expect(link).toBeFocused();
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the whole presentation is there immediately, without scrolling', async ({ page }) => {
    await open(page);
    expect(await state(page)).toBe('done');
    expect(await page.locator(ROOT).getAttribute('data-reveal-start')).toBe('started');
    expect(await allOpaque(page)).toBe(true);
    await page.getByRole('button', { name: 'Replay introduction animation' }).click();
    expect(await state(page)).toBe('done');
    expect(await allOpaque(page)).toBe(true);
  });
});

test('data updates and polling never replay the reveal or remount a status label', async ({ page }) => {
  await page.clock.install();
  await open(page);
  await revealCommandCenter(page);
  await page.evaluate(() => {
    const w = window as unknown as { __seen: string[]; __labels: Element[] };
    w.__seen = [];
    new MutationObserver(() => w.__seen.push(document.querySelector('#briefing .cc')?.getAttribute('data-reveal-state') ?? '')).observe(
      document.querySelector('#briefing .cc')!,
      { attributes: true, attributeFilter: ['data-reveal-state'] },
    );
    w.__labels = Array.from(document.querySelectorAll('#briefing .ax-state'));
  });
  // A real change of props while the Overview stays mounted: Refresh reloads the model run into new objects. Then 65 s of polling.
  await refreshData(page);
  await page.clock.fastForward(65_000);
  await page.waitForTimeout(600);
  const result = await page.evaluate(() => {
    const w = window as unknown as { __seen: string[]; __labels: Element[] };
    return { seen: w.__seen, stillAttached: w.__labels.every((n) => n.isConnected), count: w.__labels.length };
  });
  expect(result.count).toBeGreaterThan(0);
  expect(result.seen).not.toContain('playing');
  expect(result.stillAttached).toBe(true);
  expect(await allOpaque(page)).toBe(true);
});

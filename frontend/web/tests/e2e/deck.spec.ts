/*
 * The command deck: a one-screen landing view for desktop windows. Checks that it fits the window, that the boot can be
 * skipped, that the outlook scrubber drives the whole dashboard's selected hour, that nothing pulses for stale or failed data,
 * that reduced motion is static, and that a narrow window gets the desktop notice instead of the dashboard.
 */
import type { Page } from '@playwright/test';
import { expect, PREVIEW, stage, stageIdle, test } from './support';

const deck = (page: Page) => page.getByTestId('command-deck');

async function openDeck(page: Page, fixture = 'normal'): Promise<void> {
  await page.goto(`/?preview&fixture=${fixture}`);
  await expect(stage(page)).toHaveAttribute('data-view', 'overview');
  await stageIdle(page);
  await expect(deck(page)).toBeVisible();
}

/** Skip the test when this browser has no WebGL (the globe then shows its static fallback and the boot ends at once). */
async function needGlobe(page: Page): Promise<void> {
  const status = page.getByTestId('deck-stage');
  await expect(status).not.toHaveAttribute('data-globe-status', 'loading', { timeout: 15_000 });
  test.skip((await status.getAttribute('data-globe-status')) === 'fallback', 'no WebGL in this browser');
}

for (const size of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`deck fits the window with no page scroll at ${size.width} x ${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openDeck(page);
    await expect(deck(page)).toHaveAttribute('data-booted', 'true', { timeout: 10_000 });
    const over = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(over, 'document taller than the window by (px)').toBeLessThanOrEqual(1);
  });
}

test('the boot can be skipped with a key press', async ({ page }) => {
  await openDeck(page);
  await needGlobe(page);
  const boot = page.getByTestId('deck-stage');
  // The boot plays once per session; this context is new, so it is playing now or has just ended on a fast machine.
  if ((await boot.getAttribute('data-deck-boot')) === 'playing') {
    await page.keyboard.press('Shift');
    await expect(boot).toHaveAttribute('data-deck-boot', 'done', { timeout: 1_000 });
  }
  await expect(boot).toHaveAttribute('data-deck-boot', 'done');
  await expect(deck(page)).toHaveAttribute('data-booted', 'true');
});

test('switching site ends a boot that is still playing', async ({ page }) => {
  await openDeck(page);
  await needGlobe(page);
  const boot = page.getByTestId('deck-stage');
  await page.getByRole('radio', { name: 'Chandu village' }).click();
  await expect(boot).toHaveAttribute('data-deck-boot', 'done', { timeout: 1_500 });
  await expect(boot).toHaveAttribute('aria-label', /Chandu village/);
});

test('the outlook scrubber changes the selected hour for the whole dashboard', async ({ page }) => {
  await openDeck(page);
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 }); // the cached model run has loaded
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  const before = await slider.getAttribute('aria-valuetext');
  await slider.focus();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '3');
  expect(await slider.getAttribute('aria-valuetext')).not.toBe(before);
  // The same hour is now selected everywhere: the atmospheric column's "valid" label follows it.
  const label = await slider.getAttribute('aria-valuetext');
  await expect(page.locator('.dk-deck__left')).toContainText(`valid ${label}`);
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', /^\d+$/);
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
});

test('a current station reading shows numbers and a pulsing lamp', async ({ page }) => {
  await openDeck(page, 'normal');
  const card = page.locator('[data-station-state]');
  await expect(card).toHaveAttribute('data-station-state', 'fresh');
  await expect(card.locator('.dk-stat').first()).toBeVisible();
  await expect(page.locator('.dk-lamp[data-lamp="pulse"]').first()).toBeVisible();
});

test('a stale station shows no numbers and nothing pulses for it', async ({ page }) => {
  await openDeck(page, 'stale');
  const card = page.locator('[data-station-state]');
  await expect(card).toHaveAttribute('data-station-state', 'stale');
  await expect(card.locator('.dk-stat')).toHaveCount(0);
  const looping = await card.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime === Infinity).length);
  expect(looping, 'running infinite animations inside the stale station card').toBe(0);
  // Node lamps are dim: only a fresh or online lamp may pulse.
  const nodeLamps = page.locator('.dk-lamp', { hasText: /^N\d/ });
  for (const lamp of await nodeLamps.all()) await expect(lamp).toHaveAttribute('data-lamp', 'dim');
});

test('an unreachable gateway reads as unknown, not zero', async ({ page }) => {
  await openDeck(page, 'error');
  const card = page.locator('[data-station-state]');
  await expect(card).toContainText('Local data unavailable');
  await expect(card.locator('.dk-stat')).toHaveCount(0);
});

test('with the weather feed down the scrubber is disabled and ignores input', async ({ page }) => {
  await openDeck(page, 'feederror');
  const slider = page.getByRole('slider', { name: 'Forecast hour' });
  await expect(slider).toHaveAttribute('aria-disabled', 'true');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the deck is static: no boot, no loops', async ({ page }) => {
    await openDeck(page);
    await expect(deck(page)).toHaveAttribute('data-booted', 'true');
    await expect(page.getByTestId('deck-stage')).toHaveAttribute('data-deck-boot', 'done');
    const looping = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime === Infinity).length);
    expect(looping, 'running infinite animations').toBe(0);
  });
});

test('a narrow window shows the desktop notice instead of the dashboard, and widening restores it', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto(PREVIEW);
  await expect(page.getByRole('heading', { name: 'AEIOS Sentinel is built for desktop screens' })).toBeVisible();
  await expect(deck(page)).toHaveCount(0);
  await page.setViewportSize({ width: 1300, height: 800 });
  await expect(deck(page)).toBeVisible();
  await expect(page.getByTestId('desktop-gate')).toHaveCount(0);
});

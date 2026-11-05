/*
 * The globe landing on the Overview view: a WebGL dot-matrix Earth that flies in to the observation sites, then hands over to the
 * command center. The intro plays once per browser session (each test has a fresh context, so it plays), can be skipped and
 * replayed, and is never left frozen part-way. Its loop runs only on screen, in a visible tab, unpaused and with motion allowed.
 * Under reduced motion it is one static final frame. Decorative geography only: the label states the configured site locations.
 */
import type { Locator, Page } from '@playwright/test';
import { collectProblems, expect, hasHorizontalOverflow, intAttr, isCompact, openView, scrollOffScreen, test } from './support';

const hero = (page: Page) => page.getByTestId('globe-hero');
const host = (page: Page) => page.getByTestId('globe-canvas-host');
const track = (page: Page) => page.getByTestId('globe-track');
const frames = (page: Page) => intAttr(host(page), 'data-globe-frames');

/** The loop is drawing: the frame counter moves on by more than one update (10 frames each). */
async function expectDrawing(page: Page) {
  await expect(host(page)).toHaveAttribute('data-globe-active', 'true', { timeout: 5_000 });
  const f0 = await frames(page);
  await expect.poll(() => frames(page), { timeout: 4_000, message: 'frames must keep increasing' }).toBeGreaterThan(f0 + 10);
}

/** The loop is stopped: inactive, and the frame counter does not move. */
async function expectStopped(page: Page) {
  await expect(host(page)).toHaveAttribute('data-globe-active', 'false', { timeout: 3_000 });
  const f0 = await frames(page);
  await page.waitForTimeout(700);
  expect(await frames(page), 'no frames may be drawn while stopped').toBe(f0);
}

async function skipIntro(page: Page) {
  const intro = hero(page);
  if ((await intro.getAttribute('data-globe-intro')) === 'playing') await page.getByRole('button', { name: 'Skip globe intro' }).click();
  await expect(intro).toHaveAttribute('data-globe-intro', 'done');
}

const opacityOf = (loc: Locator) => loc.evaluate((el) => getComputedStyle(el).opacity);

test('the intro plays, then ends "done" within 6 s with the title and chips shown; one canvas; no console errors', async ({ page }) => {
  const problems = collectProblems(page);
  await openView(page, 'overview');
  await expect(hero(page)).toHaveAttribute('data-globe-intro', 'playing');
  await expect(hero(page)).toHaveAttribute('data-globe-copy', 'pending');
  await expect(hero(page)).toHaveAttribute('data-globe-status', 'ready', { timeout: 5_000 });
  await expect(host(page)).toHaveAttribute('data-globe-active', 'true');
  const started = Date.now();
  await expect.poll(() => frames(page), { timeout: 3_000 }).toBeGreaterThan(10);
  await expect(hero(page)).toHaveAttribute('data-globe-intro', 'done', { timeout: 6_000 });
  test.info().annotations.push({
    type: 'intro',
    description: `done ${Date.now() - started} ms after the loop started; ${await frames(page)} frames`,
  });
  await expect(hero(page)).toHaveAttribute('data-globe-copy', 'shown');
  await expect.poll(() => opacityOf(hero(page).locator('h2'))).toBe('1');
  await expect(hero(page).locator('h2')).toContainText('Environmental intelligence for');
  // StrictMode mounts twice in development: exactly one WebGL canvas survives.
  await expect(host(page).locator('canvas')).toHaveCount(1);
  // After the intro a slow drift keeps running (with a Pause control).
  await expectDrawing(page);
  expect(problems).toEqual([]);
});

test('Skip ends the intro at once and keeps focus on the toggle, which then offers Replay; Replay plays it again', async ({ page }) => {
  await openView(page, 'overview');
  await expect(hero(page)).toHaveAttribute('data-globe-intro', 'playing');
  await page.getByRole('button', { name: 'Skip globe intro' }).click();
  await expect(hero(page)).toHaveAttribute('data-globe-intro', 'done');
  await expect(hero(page)).toHaveAttribute('data-globe-copy', 'shown');
  const toggle = page.getByRole('button', { name: 'Replay globe intro' });
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expect(hero(page)).toHaveAttribute('data-globe-intro', 'playing');
  await expect(page.getByRole('button', { name: 'Skip globe intro' })).toBeFocused();
  await expectDrawing(page);
  await expect(hero(page)).toHaveAttribute('data-globe-intro', 'done', { timeout: 6_000 });
  await expect(page.getByRole('button', { name: 'Replay globe intro' })).toBeFocused();
});

test('the intro is not replayed on the next visit in this session', async ({ page }) => {
  await openView(page, 'overview');
  await skipIntro(page);
  await page.reload();
  await expect(hero(page)).toHaveAttribute('data-globe-intro', 'done');
  await expect(hero(page)).toHaveAttribute('data-globe-copy', 'shown');
});

test('Pause stops the loop and Resume restarts it; the buttons say what they do', async ({ page }) => {
  await openView(page, 'overview');
  await skipIntro(page);
  await expectDrawing(page);
  const pause = page.getByRole('button', { name: 'Pause globe rotation' });
  await expect(pause).toHaveAttribute('aria-pressed', 'false');
  await pause.click();
  const resume = page.getByRole('button', { name: 'Resume globe rotation' });
  await expect(resume).toHaveAttribute('aria-pressed', 'true');
  await expectStopped(page);
  await resume.click();
  await expect(page.getByRole('button', { name: 'Pause globe rotation' })).toHaveAttribute('aria-pressed', 'false');
  await expectDrawing(page);
});

test('pausing mid-intro jumps to the final frame (never frozen part-way)', async ({ page }) => {
  await openView(page, 'overview');
  await expect(hero(page)).toHaveAttribute('data-globe-intro', 'playing');
  await page.getByRole('button', { name: 'Pause globe rotation' }).click();
  await expect(hero(page)).toHaveAttribute('data-globe-intro', 'done');
  await expect(hero(page)).toHaveAttribute('data-globe-copy', 'shown');
  await expectStopped(page);
});

test('the loop stops when the globe is scrolled off-screen and resumes when it is back', async ({ page }) => {
  await openView(page, 'overview');
  // Scrolled away mid-intro: the intro completes (final frame) and the loop stops.
  await expect(hero(page)).toHaveAttribute('data-globe-intro', 'playing');
  await expect(host(page)).toHaveAttribute('data-globe-active', 'true', { timeout: 5_000 });
  // The hero is pinned over its scroll track, so it leaves the screen only once the whole track has.
  await scrollOffScreen(page, track(page));
  await expect(hero(page)).toHaveAttribute('data-globe-intro', 'done');
  await expectStopped(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expectDrawing(page);
  // And once more after the intro.
  await scrollOffScreen(page, track(page));
  await expectStopped(page);
});

test('the site label states the configured locations and follows the site switcher', async ({ page }) => {
  await openView(page, 'overview');
  const label = page.locator('.globe-hero__label');
  await expect(label).toContainText('SGT University · Chandu village');
  await expect(label).toContainText('28.478° N, 76.904° E');
  await expect(label).toContainText('1.3 km apart'); // haversine between the two configured reference points
  await expect(page.locator('.globe-hero__caption')).toHaveText('Natural Earth outlines · site locations');
  await expect(page.locator('.globe-hero__stage')).toHaveAttribute('role', 'img');
  await expect(page.locator('.globe-hero__stage')).toHaveAttribute(
    'aria-label',
    /^Globe locating SGT University · Chandu village, 28\.478° N/,
  );

  if (await isCompact(page)) await page.locator('.menu-button').click();
  await page.locator('#primary-nav .site-link', { hasText: 'Chandu village' }).click();
  await expect(label).toContainText('Chandu village · SGT University');
  await expect(label).toContainText('28.475° N, 76.917° E');
  await expect(hero(page).locator('h2')).toContainText('Chandu village');
  await expect(host(page).locator('canvas'), 'a site change moves the marker; it does not rebuild the scene').toHaveCount(1);
});

test('no horizontal overflow, here and at 360 px', async ({ page }) => {
  await openView(page, 'overview');
  await skipIntro(page);
  expect(await hasHorizontalOverflow(page)).toBe(false);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(() => hasHorizontalOverflow(page)).toBe(false);
  const box = await hero(page).boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(360);
  // Skip / Replay stays on the first screen of a phone.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.getByRole('button', { name: 'Replay globe intro' })).toBeInViewport();
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('one static final frame: done at once, copy shown, no loop, no controls', async ({ page }) => {
    await openView(page, 'overview');
    await expect(hero(page)).toHaveAttribute('data-globe-intro', 'done');
    await expect(hero(page)).toHaveAttribute('data-globe-copy', 'shown');
    expect(await opacityOf(hero(page).locator('h2'))).toBe('1');
    await expect(hero(page)).toHaveAttribute('data-globe-status', 'ready', { timeout: 5_000 });
    await expectStopped(page);
    expect(await frames(page), 'a static frame or two, never a running loop').toBeLessThanOrEqual(3);
    await expect(page.getByRole('button', { name: /globe (intro|rotation)/ })).toHaveCount(0);
  });
});

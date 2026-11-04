/*
 * Reduced motion: every end state renders at once and no loop runs. Covers CSS (Overview column streaks), the globe landing
 * (static final frame), the 3D atmosphere scene (now in its own view: render loop stopped), the view change (an instant swap)
 * and the Motion Lab reveals (Motion and GSAP twins).
 */
import { expect, intAttr, navTo, openView, stage, test } from './support';

test.use({ reducedMotion: 'reduce' });

test('overview: no CSS streak animation and the globe is a static final frame', async ({ page }) => {
  await openView(page, 'overview');
  // The column (and its streak lanes) renders once the cached model run has loaded.
  await expect(page.locator('#overview .cc-currency')).toContainText('Cached model run', { timeout: 15_000 });
  const running = await page
    .locator('.cc-col-flow')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName).filter((n) => n !== 'none'));
  expect(running, 'no .cc-col-flow element may run a CSS animation under reduced motion').toEqual([]);

  const hero = page.getByTestId('globe-hero');
  await expect(hero).toHaveAttribute('data-globe-intro', 'done');
  await expect(hero).toHaveAttribute('data-globe-copy', 'shown');
  const host = page.getByTestId('globe-canvas-host');
  await page.waitForTimeout(500); // give an (incorrect) loop time to start
  await expect(host).toHaveAttribute('data-globe-active', 'false');
  const frames = await intAttr(host, 'data-globe-frames');
  await page.waitForTimeout(500);
  expect(await intAttr(host, 'data-globe-frames')).toBe(frames);
});

test('3D atmosphere view: the scene loop stays stopped; the view change is an instant swap', async ({ page }) => {
  await openView(page, 'overview');
  await navTo(page, 'atmosphere');
  // An instant swap: the new view is settled and the only one mounted as soon as the stage reports it.
  await expect(stage(page)).toHaveAttribute('data-view-state', 'idle');
  await expect(page.locator('[data-view-id]')).toHaveCount(1);
  await expect(page.locator('.view-stage__scan')).toHaveCount(0);

  const host = page.locator('#atmosphere [data-scene-active]');
  await expect(host).toHaveCount(1);
  await expect(async () => {
    await host.scrollIntoViewIfNeeded();
    await expect(host).toBeInViewport({ ratio: 0.1, timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.waitForTimeout(500); // give an (incorrect) loop time to start
  await expect(host).toHaveAttribute('data-scene-active', 'false');
});

test('motion lab: reveals are done immediately and fully opaque', async ({ page }) => {
  await page.goto('/?motionlab');
  await expect(page.getByTestId('motion-lab')).toBeVisible();
  for (const id of ['reveal-motion', 'reveal-gsap']) {
    await expect(page.getByTestId(id)).toHaveAttribute('data-reveal-state', 'done', { timeout: 300 });
  }
  const groups = page.locator('[data-reveal]');
  expect(await groups.count()).toBeGreaterThan(0);
  // "Immediately": no fade is allowed, so the opacity must already be 1, not converging towards it.
  await expect
    .poll(() => groups.evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity).filter((o) => o !== '1')), { timeout: 300 })
    .toEqual([]);
});

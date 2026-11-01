/*
 * Reduced motion: every end state renders at once and no loop runs. Covers CSS (Overview column streaks),
 * the Three.js scene (render loop stopped) and the Motion Lab reveals (Motion and GSAP twins).
 */
import { expect, test } from './support';

test.use({ reducedMotion: 'reduce' });

test('overview: no CSS streak animation and the 3D loop stays stopped', async ({ page }) => {
  await page.goto('/?preview&fixture=normal');
  // The column (and its streak lanes) renders once the cached model run has loaded.
  await expect(page.locator('#overview .cc-currency')).toContainText('Cached model run', { timeout: 15_000 });
  const running = await page
    .locator('.cc-col-flow')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName).filter((n) => n !== 'none'));
  expect(running, 'no .cc-col-flow element may run a CSS animation under reduced motion').toEqual([]);

  const host = page.locator('#atmosphere [data-scene-active]');
  await expect(host).toHaveCount(1);
  // Panels above the scene load late and shift the layout, so scroll again until the scene is really in view.
  await expect(async () => {
    await page.locator('#atmosphere').scrollIntoViewIfNeeded();
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

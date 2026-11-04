/*
 * Overview states (development fixtures, /?preview&fixture=NAME). Open-Meteo is blocked and the seeded cache is old,
 * so the weather model always arrives as a cached run: "Cached model run" is the expected feed label (except feederror,
 * which forces the model feed into its error state).
 *
 * The Overview is its own view: the globe landing on top, then the command center, whose Mission Reveal starts when it is
 * scrolled into view. The checks below scroll to it first, so nothing is measured mid-fade.
 */
import AxeBuilder from '@axe-core/playwright';
import {
  blockedOpenMeteoRequests,
  expect,
  hasHorizontalOverflow,
  revealCommandCenter,
  settleFiniteAnimations,
  stage,
  test,
} from './support';

const FIXTURES = ['normal', 'stale', 'noreading', 'gatewayoffline', 'alert', 'feederror'] as const;

for (const name of FIXTURES) {
  test(`overview: fixture ${name}`, async ({ page, context }, testInfo) => {
    await page.goto(`/?preview&fixture=${name}`);
    await expect(stage(page)).toHaveAttribute('data-view', 'overview');
    const overview = page.locator('#overview');
    // The fixture banner proves the fixture (not live data) is what is rendered.
    await expect(overview.locator('.cc-dev')).toContainText(`"${name}"`);

    // One h1 in the view: the situation statement. The globe landing's title is an h2.
    await expect(page.locator('h1.cc-statement')).toBeVisible();
    await expect(page.locator('[data-view-id="overview"] h1')).toHaveCount(1);
    await expect(page.getByTestId('globe-hero').locator('h2')).toHaveCount(1);

    await revealCommandCenter(page, name === 'feederror' ? /unavailable/ : 'Cached model run');

    // Provenance and node freshness are separate labels in the currency strip.
    const currency = overview.locator('.cc-currency');
    await expect(currency.getByText('MEASURED · AEIOS STATION', { exact: true })).toBeVisible();
    // A status-label morph keeps the outgoing label in the page for about 120 ms, so wait until exactly one node label remains.
    const nodeLabel = currency.locator('.ax-state').filter({ hasText: /^Node/ });
    await expect(nodeLabel).toHaveCount(1);
    await expect(nodeLabel).toBeVisible();

    if (name === 'feederror') {
      await expect(page.locator('h1.cc-statement')).toContainText('The weather model is unavailable');
    } else {
      // Weather fetch is aborted, so the app falls back to the seeded (old) cache and must say so.
      await expect(currency).toContainText('Cached model run');
    }
    if (name === 'stale') {
      await expect(currency.locator('.ax-state').filter({ hasText: 'STALE' })).toBeVisible();
      await expect(overview.getByText('No current reading').first()).toBeVisible();
    }

    expect(await hasHorizontalOverflow(page), 'page must not scroll horizontally').toBe(false);

    // Accessibility: fail on serious/critical, report the rest. The globe intro has ended (scrolled away, or done) and finite
    // reveal animations are waited for, so mid-fade opacity does not produce false colour-contrast results.
    await expect(page.getByTestId('globe-hero')).toHaveAttribute('data-globe-intro', 'done', { timeout: 8_000 });
    await settleFiniteAnimations(page).catch(() => undefined);
    const axe = await new AxeBuilder({ page })
      .include('#overview')
      .include('[data-testid="globe-hero"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const summary = axe.violations.map((v) => `${v.impact ?? 'unknown'} ${v.id} (${v.nodes.length}): ${v.help}`);
    await testInfo.attach(`axe-${name}.json`, { body: JSON.stringify(axe.violations, null, 2), contentType: 'application/json' });
    const minor = axe.violations.filter((v) => v.impact !== 'serious' && v.impact !== 'critical');
    if (minor.length) {
      testInfo.annotations.push({ type: 'axe (minor/moderate)', description: minor.map((v) => `${v.impact} ${v.id}`).join(', ') });
    }
    const blocking = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    const blockingIds = blocking.map((v) => `${v.impact} ${v.id}: ${v.help}`);
    expect(blockingIds, summary.join('\n')).toEqual([]);

    // Diagnostics only: the block is what guarantees no quota use; this records that the app did try (and was refused).
    testInfo.annotations.push({ type: 'open-meteo requests aborted', description: String(blockedOpenMeteoRequests(context).length) });
  });
}

/*
 * Phase 2B, Stage 4: automated accessibility audit of the motion work. axe (WCAG 2.x A/AA and best practice), accessibility-tree
 * snapshots of the navigation, column, currency strip and telemetry rail, a keyboard walk through the Overview, and the status-label
 * morph's exposure to assistive technology. Automated only: no screen reader is involved.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support';

async function open(page: Page, fixture = 'normal') {
  await page.goto(`/?preview&fixture=${fixture}`);
  await expect(page.locator('#overview .cc-currency')).toContainText(fixture === 'feederror' ? 'unavailable' : 'Cached model run', {
    timeout: 15_000,
  });
  await expect(page.locator('#overview .cc')).toHaveAttribute('data-reveal-state', 'done', { timeout: 3_000 });
  await expect(page.locator('#overview .cc-currency .ax-state').filter({ hasText: /^Node/ })).toHaveCount(1);
}

for (const fixture of ['normal', 'stale', 'gatewayoffline']) {
  test(`axe, WCAG 2.x A/AA and best practice: Overview and navigation (${fixture})`, async ({ page }, info) => {
    await open(page, fixture);
    const r = await new AxeBuilder({ page })
      .include('#overview')
      .include('#primary-nav')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    const all = r.violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.help}`);
    info.annotations.push({ type: `axe ${fixture}`, description: all.length ? all.join(' | ') : 'no violations' });
    await info.attach(`axe-${fixture}.json`, { body: JSON.stringify(r.violations, null, 2), contentType: 'application/json' });
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });
}

test('accessibility tree: one current nav item, named lanes with units, labels that contain the visible text', async ({ page }, info) => {
  await open(page);
  for (const [name, sel] of [
    ['nav', '#primary-nav'],
    ['column', '.cc-column'],
    ['currency', '#overview .cc-currency'],
    ['rail', '#overview .cc-rail'],
    ['reveal-controls', '#overview .cc-reveal-controls'],
  ] as const) {
    const snap = await page.locator(sel).first().ariaSnapshot();
    await info.attach(`aria-${name}.yml`, { body: snap, contentType: 'text/yaml' });
  }
  // Exactly one navigation item is current, and it is "location" (in-page), not "page".
  const current = await page
    .locator('#primary-nav [aria-current]')
    .evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-current')}:${e.textContent?.trim()}`));
  expect(current).toEqual(['location:Overview']);
  // Every lane is reachable and named with its value and unit (or says it is not available).
  const lanes = await page
    .locator('.cc-column .cc-col-lane')
    .evaluateAll((els) => els.map((e) => [e.getAttribute('role'), e.getAttribute('tabindex'), e.getAttribute('aria-label')]));
  expect(lanes.length).toBeGreaterThanOrEqual(3);
  for (const [role, tab, label] of lanes) {
    expect(role).toBe('img');
    expect(tab).toBe('0');
    expect(label).toMatch(/^\d+ m: (\d+(\.\d)? m\/s|wind not available)/);
  }
  // WCAG 2.5.3 label in name: each control's accessible name contains its visible text.
  for (const sel of ['.cc-reveal-btn', '.cc-column__toggle']) {
    for (const el of await page.locator(sel).all()) {
      const visible = (await el.innerText()).trim();
      const name = (await el.getAttribute('aria-label')) ?? visible;
      expect(name.toLowerCase(), `${sel}: "${name}" must contain "${visible}"`).toContain(visible.toLowerCase());
    }
  }
});

test('keyboard: Tab reaches the reveal controls, the column toggle and every lane, each with a visible focus indicator', async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, 'keyboard walk is a desktop path');
  await open(page);
  await page
    .locator('body')
    .click({ position: { x: 5, y: 5 } })
    .catch(() => undefined);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const seen: string[] = [];
  const noIndicator: string[] = [];
  for (let i = 0; i < 90; i += 1) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const lane = el.closest('.cc-col-lane');
      const bg = lane?.querySelector('.cc-col-lanebg');
      const indicator =
        (cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px') ||
        (cs.boxShadow !== 'none' && cs.boxShadow !== '') ||
        (bg ? getComputedStyle(bg).stroke !== 'rgba(0, 0, 0, 0)' && getComputedStyle(bg).stroke !== 'transparent' : false);
      return {
        id: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? el.tagName,
        inOverview: Boolean(el.closest('#overview')),
        indicator,
      };
    });
    if (!f) continue;
    if (f.inOverview) {
      seen.push(f.id);
      if (!f.indicator) noIndicator.push(f.id);
    }
    if (seen.some((s) => /^180 m/.test(s))) break;
  }
  info.annotations.push({ type: 'tab order (Overview)', description: seen.join(' > ') });
  expect(seen).toContain('Skip introduction animation');
  expect(seen).toContain('Replay introduction animation');
  expect(seen.some((s) => /wind flow animation/.test(s))).toBe(true);
  expect(seen.filter((s) => /^\d+ m:/.test(s)).length).toBeGreaterThanOrEqual(3);
  expect(noIndicator, 'every focused element must show a focus indicator').toEqual([]);
});

test('status-label morph: assistive technology never sees two labels at once', async ({ page }) => {
  await page.goto('/?motionlab');
  await expect(page.getByTestId('motion-lab')).toBeVisible();
  const morph = page.getByTestId('state-morph');
  await morph.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const w = window as unknown as { __maxExposed: number; __maxInDom: number };
    w.__maxExposed = 0;
    w.__maxInDom = 0;
    const tick = () => {
      const spans = Array.from(document.querySelectorAll('.ml-morph__chip .cc-morph > span'));
      w.__maxInDom = Math.max(w.__maxInDom, spans.length);
      w.__maxExposed = Math.max(w.__maxExposed, spans.filter((s) => s.getAttribute('aria-hidden') !== 'true').length);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (const name of ['Show stale', 'Show no packet', 'Show gateway error', 'Show fresh']) {
    await morph.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(250);
  }
  const { maxExposed, maxInDom } = await page.evaluate(() => {
    const w = window as unknown as { __maxExposed: number; __maxInDom: number };
    return { maxExposed: w.__maxExposed, maxInDom: w.__maxInDom };
  });
  expect(maxInDom, 'the outgoing label is still in the DOM while it fades (expected)').toBeGreaterThanOrEqual(2);
  expect(maxExposed, 'but only one label may be exposed to assistive technology').toBe(1);
});

test('no live regions were added by the motion work', async ({ page }, info) => {
  await open(page);
  const regions = await page
    .locator('#overview [aria-live], #overview [role="status"], #overview [role="alert"]')
    .evaluateAll((els) =>
      els.map(
        (e) => `${e.tagName.toLowerCase()}[${e.getAttribute('aria-live') ?? e.getAttribute('role')}] ${e.textContent?.trim().slice(0, 50)}`,
      ),
    );
  info.annotations.push({ type: 'live regions in Overview', description: regions.join(' | ') || 'none' });
  expect(
    await page.locator('#overview .cc-reveal-controls [aria-live], #overview .cc-morph[aria-live], .cc-column [aria-live]').count(),
  ).toBe(0);
});

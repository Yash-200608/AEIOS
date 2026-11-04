/*
 * Separate views: every sidebar item opens its own view (its own URL '#/<viewId>', one <h1>, Back and Forward work), with a short
 * cinematic transition that ends in data-view-state="idle". Only the open view is mounted. On narrow layouts the drawer closes and
 * focus moves to the new view's heading. Under reduced motion the swap is instant.
 */
import type { Page } from '@playwright/test';
import {
  collectProblems,
  currentNav,
  expect,
  hasHorizontalOverflow,
  isCompact,
  navTo,
  openView,
  PREVIEW,
  stage,
  stageIdle,
  test,
  VIEW_KEYS,
  VIEW_LABELS,
  type ViewKey,
} from './support';

const hash = (page: Page) => page.evaluate(() => window.location.hash);
const search = (page: Page) => page.evaluate(() => window.location.search);
/** The heading a view change moves focus to: the ViewHero title, or on the Overview its situation statement. */
const heading = (page: Page, view: ViewKey) =>
  view === 'overview'
    ? page.locator('[data-testid="globe-hero"] [data-view-heading]') // the visible landing title, not the h1 below the fold
    : page.locator(`[data-view-id="${view}"] [data-view-heading]`);

/** Everything that must be true once a view is open and settled. */
async function expectViewOpen(page: Page, view: ViewKey) {
  await expect(stage(page)).toHaveAttribute('data-view', view);
  await stageIdle(page);
  await expect.poll(() => hash(page)).toBe(`#/${view}`);
  expect(await search(page), 'the preview query string is kept').toBe('?preview&fixture=normal');
  await expect(page.locator('[data-view-id]'), 'only the open view is mounted').toHaveCount(1);
  await expect(page.locator(`[data-view-id="${view}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-view-id="${view}"] h1`)).toHaveCount(1);
  if (view !== 'overview') await expect(heading(page, view)).toHaveText(VIEW_LABELS[view]);
  expect(await currentNav(page)).toEqual([`page:${VIEW_LABELS[view]}`]);
  await expect(page.locator('.breadcrumb b')).toHaveText(VIEW_LABELS[view]);
  // The settled frame is fully shown, with no transform left behind.
  const frame = await page
    .locator('.view-stage__frame')
    .evaluate((el) => ({ o: getComputedStyle(el).opacity, t: getComputedStyle(el).transform }));
  expect(frame.o).toBe('1');
  expect(frame.t).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
}

test('every sidebar item opens its own view: heading, URL, one mounted view, focus on the heading, settled transition', async ({
  page,
}) => {
  test.slow(); // eleven views
  const problems = collectProblems(page);
  await openView(page, 'overview');
  // Start from the end of the list so the first step (to Air quality) is a real change.
  for (const view of [...VIEW_KEYS.slice(1), 'overview' as const]) {
    await navTo(page, view);
    await expectViewOpen(page, view);
    await expect(heading(page, view)).toBeFocused();
    expect(await page.evaluate(() => window.scrollY), 'a new view starts at its top').toBeLessThan(2);
    if (await isCompact(page)) {
      await expect(page.locator('#primary-nav')).not.toHaveClass(/is-open/);
      await expect(page.locator('.menu-button')).toHaveAttribute('aria-expanded', 'false');
    }
    expect(await hasHorizontalOverflow(page), `${view}: no horizontal overflow`).toBe(false);
  }
  expect(problems).toEqual([]);
});

test('the transition reports "entering" with one accent sweep, then settles at "idle"', async ({ page }) => {
  await openView(page, 'overview');
  await page.evaluate(() => {
    const w = window as unknown as { __states: string[] };
    w.__states = [];
    const el = document.querySelector('[data-testid="view-stage"]')!;
    new MutationObserver(() => w.__states.push(el.getAttribute('data-view-state') ?? '')).observe(el, {
      attributes: true,
      attributeFilter: ['data-view-state'],
    });
  });
  await navTo(page, 'forecast');
  await expect(page.locator('.view-stage__scan')).toHaveCount(1);
  await stageIdle(page, 2_000); // 220 ms out + 420 ms in, with a 1.5 s failsafe
  const states = await page.evaluate(() => (window as unknown as { __states: string[] }).__states);
  expect(states[0]).toBe('entering');
  expect(states.at(-1)).toBe('idle');
  await expectViewOpen(page, 'forecast');
});

test('Back and Forward move between views; the URL and the current item follow', async ({ page }) => {
  await openView(page, 'overview');
  await navTo(page, 'forecast');
  await expectViewOpen(page, 'forecast');
  await navTo(page, 'station');
  await expectViewOpen(page, 'station');

  await page.goBack();
  await expectViewOpen(page, 'forecast');
  await expect(heading(page, 'forecast')).toBeFocused();
  await page.goBack();
  await expect(stage(page)).toHaveAttribute('data-view', 'overview');
  await stageIdle(page);
  expect(await currentNav(page)).toEqual(['page:Overview']);
  await page.goForward();
  await expectViewOpen(page, 'forecast');
});

test('a deep link opens its view on first load, without stealing focus', async ({ page }) => {
  await page.goto(`${PREVIEW}#/station`);
  await expectViewOpen(page, 'station');
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByTestId('globe-hero')).toHaveCount(0);
});

test('legacy anchors are rewritten to routes; an unknown route opens the Overview', async ({ page }) => {
  await page.goto(`${PREVIEW}#smoke`);
  await expectViewOpen(page, 'smoke');
  await page.goto(`${PREVIEW}#pm-forecast`); // a section inside the AEIOS model view
  await expectViewOpen(page, 'aeios');
  await page.goto(`${PREVIEW}#/nope`);
  await expect(stage(page)).toHaveAttribute('data-view', 'overview');
  expect(await currentNav(page)).toEqual(['page:Overview']);
});

test('an Overview destination opens its view; no other item is ever current on the way', async ({ page }) => {
  await openView(page, 'overview');
  await page.evaluate(() => {
    const w = window as unknown as { __seen: string[] };
    w.__seen = [];
    new MutationObserver(() => {
      const cur = document.querySelector('#primary-nav button[aria-current]')?.textContent?.trim() ?? '';
      if (w.__seen.at(-1) !== cur) w.__seen.push(cur);
    }).observe(document.querySelector('#primary-nav')!, { attributes: true, subtree: true, attributeFilter: ['aria-current', 'class'] });
  });
  await page.locator('.cc-dest a', { hasText: 'Check the forecast' }).click();
  await expectViewOpen(page, 'forecast');
  await expect(heading(page, 'forecast')).toBeFocused();
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen.filter((s) => s !== 'Forecast')).toEqual([]);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toBe('none');
});

test('rapid clicks: the last view wins and nothing is left mid-transition', async ({ page }) => {
  await openView(page, 'overview');
  // Activate three items as fast as a click does (works with the drawer closed on narrow layouts).
  await page.evaluate(
    (labels) => {
      const items = Array.from(document.querySelectorAll<HTMLButtonElement>('#primary-nav button'));
      for (const label of labels) items.find((b) => b.textContent?.trim() === label)?.click();
    },
    [VIEW_LABELS.station, VIEW_LABELS.forecast, VIEW_LABELS.satellite],
  );
  await expectViewOpen(page, 'satellite');
});

test('the current item returns to the top of its view without a new history entry; the skip link keeps the route', async ({ page }) => {
  await openView(page, 'forecast');
  const entries = await page.evaluate(() => window.history.length);
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  await navTo(page, 'forecast');
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 3_000 }).toBeLessThan(2);
  await expect(heading(page, 'forecast')).toBeFocused();
  expect(await page.evaluate(() => window.history.length)).toBe(entries);
  await expect.poll(() => hash(page)).toBe('#/forecast');

  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  expect(await hash(page)).toBe('#/forecast');
  await expect(stage(page)).toHaveAttribute('data-view', 'forecast');
});

test('keyboard: Enter on a sidebar item opens the view and focus lands on its heading', async ({ page }) => {
  await openView(page, 'overview');
  test.skip(await isCompact(page), 'the sidebar is a drawer on narrow layouts (covered by the first test)');
  await page.locator('#primary-nav').getByRole('button', { name: 'Simulation lab', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expectViewOpen(page, 'simulation');
  await expect(heading(page, 'simulation')).toBeFocused();
});

test('narrow layouts: the drawer closes on navigation, focus goes to the heading, Escape returns focus to the menu button', async ({
  page,
}) => {
  await openView(page, 'overview');
  test.skip(!(await isCompact(page)), 'the sidebar is not a drawer at this width');
  await navTo(page, 'air-quality');
  await expect(page.locator('#primary-nav')).not.toHaveClass(/is-open/);
  await expect(heading(page, 'air-quality')).toBeFocused();
  await page.locator('.menu-button').click();
  await expect(page.locator('#primary-nav')).toHaveClass(/is-open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#primary-nav')).not.toHaveClass(/is-open/);
  await expect(page.locator('.menu-button')).toBeFocused();
  await expect(stage(page)).toHaveAttribute('data-view', 'air-quality');
});

test('leaving a view releases its WebGL: no globe or scene canvas is left behind', async ({ page }) => {
  await openView(page, 'overview');
  await expect(page.locator('[data-testid="globe-canvas-host"] canvas')).toHaveCount(1);
  await navTo(page, 'atmosphere');
  await stageIdle(page);
  await expect(page.locator('[data-testid="globe-canvas-host"]')).toHaveCount(0);
  await expect(page.locator('#atmosphere [data-scene-active] canvas')).toHaveCount(1);
  await navTo(page, 'station');
  await stageIdle(page);
  await expect(page.locator('[data-scene-active], [data-testid="globe-canvas-host"]')).toHaveCount(0);
});

test('views that show the weather model state a cached run in their own hero band; the others do not', async ({ page }) => {
  // The fixture's seeded run is old and Open-Meteo is blocked, so the shell serves a stale cached run.
  await openView(page, 'overview');
  for (const view of ['forecast', 'dispersion', 'atmosphere', 'simulation', 'station', 'smoke'] as const) {
    await navTo(page, view);
    await stageIdle(page);
    const notice = page.locator(`[data-view-id="${view}"] .view-hero .view-model-notice`);
    if (['station', 'smoke'].includes(view)) {
      await expect(notice).toHaveCount(0);
    } else {
      await expect(notice).toHaveText(/^Cached model run · fetched \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2} IST$/);
      await expect(notice).toBeVisible();
      expect(await notice.evaluate((el) => el.closest('[aria-live], [role="status"], [role="alert"]'))).toBeNull();
    }
  }
});

test('turning reduced motion on while a view is open keeps that view: no remount, no jump to the top, no focus move', async ({ page }) => {
  await openView(page, 'overview');
  await navTo(page, 'atmosphere');
  await stageIdle(page);
  const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const y = Math.min(400, max);
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
  await expect(heading(page, 'atmosphere')).toBeFocused(); // where the navigation put it
  await page.evaluate(() => {
    const w = window as unknown as { __view: Element; __canvas: Element | null };
    w.__view = document.querySelector('[data-view-id]')!;
    w.__canvas = document.querySelector('#atmosphere [data-scene-active] canvas');
  });
  const before = await page.evaluate(() => ({ y: Math.round(window.scrollY), focused: document.activeElement?.tagName }));
  await page.evaluate(() => document.documentElement.classList.add('aeios-force-reduced-motion'));
  await expect(page.locator('#atmosphere [data-scene-active]')).toHaveAttribute('data-scene-active', 'false');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const w = window as unknown as { __view: Element; __canvas: Element | null };
    return {
      y: Math.round(window.scrollY),
      focused: document.activeElement?.tagName,
      sameView: w.__view.isConnected,
      sameCanvas: w.__canvas ? w.__canvas.isConnected : true,
    };
  });
  expect(after).toEqual({ ...before, sameView: true, sameCanvas: true });
  // The next change follows the new setting: an instant swap.
  await navTo(page, 'station');
  expect(await stage(page).getAttribute('data-view-state')).toBe('idle');
  await expect(page.locator('[data-view-id]')).toHaveCount(1);
  await page.evaluate(() => document.documentElement.classList.remove('aeios-force-reduced-motion'));
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the view change is an instant swap: never "entering", no sweep, no hidden start state', async ({ page }) => {
    await openView(page, 'overview');
    await page.evaluate(() => {
      const w = window as unknown as { __states: string[] };
      w.__states = [];
      const el = document.querySelector('[data-testid="view-stage"]')!;
      new MutationObserver(() => w.__states.push(el.getAttribute('data-view-state') ?? '')).observe(el, {
        attributes: true,
        attributeFilter: ['data-view-state'],
      });
    });
    for (const view of ['forecast', 'station', 'overview'] as const) {
      await navTo(page, view);
      // Synchronously after the click: the new view alone, settled, fully opaque.
      const now = await page.evaluate(() => ({
        state: document.querySelector('[data-testid="view-stage"]')?.getAttribute('data-view-state'),
        views: document.querySelectorAll('[data-view-id]').length,
        opacity: getComputedStyle(document.querySelector('.view-stage__frame')!).opacity,
        scans: document.querySelectorAll('.view-stage__scan').length,
      }));
      expect(now).toEqual({ state: 'idle', views: 1, opacity: '1', scans: 0 });
      await expectViewOpen(page, view);
      await expect(heading(page, view)).toBeFocused();
    }
    expect(await page.evaluate(() => (window as unknown as { __states: string[] }).__states)).not.toContain('entering');
  });
});

/*
 * Scroll takeover: gliding mouse-wheel scrolling (src/motion/smoothWheel.ts). The wheel eases toward its target instead of
 * jumping; keyboard, scrollbar and scripted scrolls stay native and stop a glide at once; inner scrollers keep their own wheel.
 * Every view that has a header band (all but the command deck and the Briefing) pins while the content scrolls up over
 * it (the band is masked away under the content; its title words sink back into their masks). Reduced motion: native wheel, no
 * pin anywhere.
 */
import type { Page } from '@playwright/test';
import { VIEW_KEYS, expect, hasHorizontalOverflow, openView, scrollToY, test, type ViewKey } from './support';

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

/** Wheel events go to the element under the pointer: put it in the middle of the viewport, whatever its size. */
async function pointAtCentre(page: Page) {
  const size = page.viewportSize() ?? { width: 1280, height: 800 };
  await page.mouse.move(Math.round(size.width / 2), Math.round(size.height / 2));
}

test.describe('gliding wheel', () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, 'touch layouts keep native scrolling (coarse pointer)'));

  test('is on with a fine pointer; a wheel notch glides instead of jumping and arrives', async ({ page }) => {
    await openView(page, 'briefing');
    await expect(page.locator('html')).toHaveAttribute('data-smooth-wheel', 'on');
    await pointAtCentre(page);
    const y0 = await scrollY(page);
    // Record every scroll position (independent of frame timing, which varies between engines).
    await page.evaluate(() => {
      const seen: number[] = [];
      (window as unknown as { __seen: number[] }).__seen = seen;
      window.addEventListener('scroll', () => seen.push(window.scrollY), { passive: true });
    });
    await page.mouse.wheel(0, 400);
    await expect.poll(() => scrollY(page), { timeout: 1_500 }).toBeGreaterThan(y0 + 395);
    await expect.poll(() => scrollY(page), { timeout: 1_500 }).toBeLessThan(y0 + 405);
    const seen = await page.evaluate(() => (window as unknown as { __seen: number[] }).__seen);
    const between = new Set(seen.filter((y) => y > y0 + 1 && y < y0 + 395).map(Math.round));
    expect(between.size, `a glide passes through intermediate positions (saw ${seen.join(', ')})`).toBeGreaterThanOrEqual(3);
  });

  test('keyboard and scripted scrolls stay native and stop a glide at once', async ({ page }) => {
    await openView(page, 'briefing');
    await pointAtCentre(page);
    await page.mouse.wheel(0, 1200);
    // Wheel input reaches the page asynchronously: wait until the glide is under way, but well short of its target.
    await expect.poll(() => scrollY(page), { intervals: [16] }).toBeGreaterThan(20);
    expect(await scrollY(page)).toBeLessThan(1150);
    await scrollToY(page, 0); // like Home, a scrollbar drag or scrollIntoView mid-glide
    await page.waitForTimeout(500);
    expect(await scrollY(page), 'the glide must not drag the page back down').toBeLessThan(3);
    await page.locator('body').press('End');
    await expect.poll(() => scrollY(page)).toBeGreaterThan(500);
  });

  test('ctrl+wheel and wheels over an inner scroller are not taken over', async ({ page }) => {
    await openView(page, 'briefing');
    // An inner scroller that can still scroll keeps the wheel.
    await page.evaluate(() => {
      const box = document.createElement('div');
      box.id = 'inner-scroller';
      box.style.cssText = 'position:fixed;left:20px;top:120px;width:240px;height:160px;overflow:auto;z-index:99;background:#000';
      box.innerHTML = '<div style="height:2000px"></div>';
      document.body.appendChild(box);
    });
    const y0 = await scrollY(page);
    await page.mouse.move(120, 200);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.locator('#inner-scroller').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await scrollY(page)).toBe(y0);
    const notPrevented = await page.evaluate(() => {
      const event = new WheelEvent('wheel', { deltaY: 200, ctrlKey: true, bubbles: true, cancelable: true });
      document.querySelector('main')?.dispatchEvent(event);
      return !event.defaultPrevented;
    });
    expect(notPrevented, 'ctrl+wheel belongs to browser zoom').toBe(true);
  });

  test('reduced motion turns it off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openView(page, 'briefing');
    await expect(page.locator('html')).toHaveAttribute('data-smooth-wheel', 'off');
  });
});

// ------------------------------------------------------------------------------------------------ pinned view heroes

const heroTrack = (page: Page, view: ViewKey) => page.locator(`[data-view-id="${view}"] [data-testid="view-hero-track"]`);
const band = (page: Page, view: ViewKey) => heroTrack(page, view).locator('.view-hero');
const progressOf = async (page: Page, view: ViewKey) =>
  Number.parseFloat((await band(page, view).getAttribute('data-hero-progress')) ?? 'NaN');

/** Window scroll position at progress `p` through a view hero's runway. */
async function heroY(page: Page, view: ViewKey, p: number): Promise<number> {
  return heroTrack(page, view).evaluate((el, progress) => {
    const runway = el.querySelector<HTMLElement>('.view-hero-track__runway')?.offsetHeight ?? 0;
    return Math.round(window.scrollY + el.getBoundingClientRect().top - 12 + runway * progress);
  }, p);
}

test.describe('pinned view heroes', () => {
  for (const view of VIEW_KEYS.filter((key) => key !== 'overview' && key !== 'briefing')) {
    test(`${view}: the band pins, the content keeps its place and scrolls over it, then the band leaves`, async ({ page }) => {
      await openView(page, view);
      await expect(heroTrack(page, view)).toHaveAttribute('data-pinned', 'true');
      // The runway is cancelled out in layout: the track takes exactly the band plus one 32 px gap, as before the scene existed
      // (measured from layout boxes, not screen positions, which entrance transforms move).
      const footprint = await heroTrack(page, view).evaluate((el) => {
        const bandEl = el.querySelector<HTMLElement>('.view-hero')!;
        return el.offsetHeight + Number.parseFloat(getComputedStyle(el).marginBottom) - bandEl.offsetHeight;
      });
      expect(Math.abs(footprint - 32), `layout gap under the band (${footprint})`).toBeLessThan(1);
      // With the test fixture some views are shorter than the runway; extra room at the end lets the whole scene be scrolled.
      await page.locator(`[data-view-id="${view}"]`).evaluate((el) => {
        const spacer = document.createElement('div');
        spacer.style.height = '1600px';
        el.appendChild(spacer);
      });

      await scrollToY(page, await heroY(page, view, 0.5));
      await expect.poll(() => progressOf(page, view)).toBeGreaterThan(0.4);
      expect(Math.abs((await band(page, view).boundingBox())!.y - 12), 'pinned at the top').toBeLessThan(2);
      const firstWord = band(page, view).locator('.view-hero__word-inner').first();
      expect(await firstWord.evaluate((el) => getComputedStyle(el).translate), 'the first title word has sunk').not.toBe('none');

      await scrollToY(page, (await heroY(page, view, 1)) + 300);
      await expect.poll(async () => (await band(page, view).boundingBox())!.y).toBeLessThan(-100);
      expect(await hasHorizontalOverflow(page)).toBe(false);
    });
  }

  test('focus moving to a control in a covered band scrolls back to it; the shell-focused heading does not', async ({ page }) => {
    await openView(page, 'forecast');
    // A control in the band (some views put actions in its right slot).
    await band(page, 'forecast')
      .locator('.view-hero__main')
      .evaluate((el) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'band-control';
        button.textContent = 'Band control';
        el.appendChild(button);
      });
    await scrollToY(page, await heroY(page, 'forecast', 0.7));
    await expect.poll(() => progressOf(page, 'forecast')).toBeGreaterThan(0.5);
    // The heading is focused by the shell with preventScroll (it scrolls itself): left alone.
    await band(page, 'forecast')
      .locator('h1')
      .evaluate((el: HTMLElement) => el.focus({ preventScroll: true }));
    await page.waitForTimeout(200);
    expect(await progressOf(page, 'forecast')).toBeGreaterThan(0.5);
    // A control the user moves focus to is brought back into view.
    await page.locator('#band-control').focus();
    await expect.poll(() => progressOf(page, 'forecast')).toBeLessThan(0.02);
  });

  test('reduced motion: no pin, no runway, no exit', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openView(page, 'forecast');
    await expect(heroTrack(page, 'forecast')).toHaveAttribute('data-pinned', 'false');
    await expect(heroTrack(page, 'forecast').locator('.view-hero-track__runway')).toHaveCount(0);
    await scrollToY(page, 400);
    await expect.poll(() => progressOf(page, 'forecast')).toBe(0);
  });
});

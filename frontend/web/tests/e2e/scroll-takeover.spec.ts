/*
 * Scroll takeover: gliding mouse-wheel scrolling (src/motion/smoothWheel.ts) and the pinned globe descent on the Overview
 * (GlobeHero.tsx). The wheel eases toward its target instead of jumping; keyboard, scrollbar and scripted scrolls stay native and
 * stop a glide at once; inner scrollers keep their own wheel. The globe hero pins over a runway while scrolling flies the camera
 * down to the site through three captions, then releases. Every other view's header band pins while the content scrolls up over
 * it (the band is masked away under the content; its title words sink back into their masks). Reduced motion: native wheel, no
 * pin anywhere.
 */
import type { Page } from '@playwright/test';
import { VIEW_KEYS, expect, hasHorizontalOverflow, intAttr, openView, scrollToY, test, type ViewKey } from './support';

const hero = (page: Page) => page.getByTestId('globe-hero');
const track = (page: Page) => page.getByTestId('globe-track');
const host = (page: Page) => page.getByTestId('globe-canvas-host');
const scrollY = (page: Page) => page.evaluate(() => window.scrollY);
const descent = async (page: Page) => Number.parseFloat((await hero(page).getAttribute('data-globe-descent')) ?? 'NaN');

/** Wheel events go to the element under the pointer: put it in the middle of the viewport, whatever its size. */
async function pointAtCentre(page: Page) {
  const size = page.viewportSize() ?? { width: 1280, height: 800 };
  await page.mouse.move(Math.round(size.width / 2), Math.round(size.height / 2));
}

async function skipIntro(page: Page) {
  if ((await hero(page).getAttribute('data-globe-intro')) === 'playing')
    await page.getByRole('button', { name: 'Skip globe intro' }).click();
  await expect(hero(page)).toHaveAttribute('data-globe-intro', 'done');
}

/** Window scroll position at which the track has progressed `p` (0..1) through its runway. */
async function trackY(page: Page, p: number): Promise<number> {
  return track(page).evaluate((el, progress) => {
    const heroEl = el.querySelector<HTMLElement>('[data-testid="globe-hero"]');
    const pinTop = Number.parseFloat(heroEl?.style.getPropertyValue('--globe-pin-top') || '12');
    const r = el.getBoundingClientRect();
    const runway = r.height - (heroEl?.offsetHeight ?? 0);
    return Math.round(window.scrollY + r.top - pinTop + runway * progress);
  }, p);
}

async function readyPinned(page: Page) {
  await openView(page, 'overview');
  await expect(hero(page)).toHaveAttribute('data-globe-status', 'ready', { timeout: 5_000 });
  await expect(track(page)).toHaveAttribute('data-globe-pinned', 'true');
}

test.describe('gliding wheel', () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, 'touch layouts keep native scrolling (coarse pointer)'));

  test('is on with a fine pointer; a wheel notch glides instead of jumping and arrives', async ({ page }) => {
    await openView(page, 'overview');
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
    await openView(page, 'overview');
    await skipIntro(page);
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
    await openView(page, 'overview');
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
    await openView(page, 'overview');
    await expect(page.locator('html')).toHaveAttribute('data-smooth-wheel', 'off');
  });
});

test.describe('pinned globe descent', () => {
  test('the hero pins over the runway while the descent advances through three chapters, then releases', async ({ page }) => {
    await readyPinned(page);
    await skipIntro(page);
    await expect(hero(page)).toHaveAttribute('data-globe-chapter', '0');
    let previous = -1;
    const chapters: string[] = [];
    for (const p of [0.05, 0.25, 0.55, 0.85, 0.99]) {
      await scrollToY(page, await trackY(page, p));
      await expect.poll(() => descent(page)).toBeGreaterThan(previous);
      previous = await descent(page);
      const { top, pinTop } = await hero(page).evaluate((el) => ({
        top: el.getBoundingClientRect().top,
        pinTop: Number.parseFloat((el as HTMLElement).style.getPropertyValue('--globe-pin-top')),
      }));
      // (from 0.86 the hero recedes with a scale, which moves its box; it is still pinned, checked at 0.85)
      if (p <= 0.85) expect(Math.abs(top - pinTop), `pinned at p=${p} (top ${top}, pin ${pinTop})`).toBeLessThan(2);
      chapters.push((await hero(page).getAttribute('data-globe-chapter')) ?? '');
    }
    expect(chapters).toEqual(['0', '1', '2', '3', '3']);
    // Past the runway the hero scrolls away with the page.
    await scrollToY(page, (await trackY(page, 1)) + 600);
    await expect.poll(() => hero(page).evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(-300);
    expect(await hasHorizontalOverflow(page)).toBe(false);
  });

  test('scrolling draws frames even while the loop is paused, and the copy fades out', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the Pause control is covered elsewhere; this checks scroll-driven frames');
    await readyPinned(page);
    await skipIntro(page);
    await page.getByRole('button', { name: 'Pause globe rotation' }).click();
    await expect(host(page)).toHaveAttribute('data-globe-active', 'false');
    const f0 = await intAttr(host(page), 'data-globe-frames');
    await scrollToY(page, await trackY(page, 0.4));
    await expect.poll(() => intAttr(host(page), 'data-globe-frames')).toBeGreaterThan(f0);
    await expect.poll(() => page.locator('.globe-hero__copy').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.05);
  });

  test('scrolling during the intro hands over to the scroll (intro done)', async ({ page }) => {
    await readyPinned(page);
    await expect(hero(page)).toHaveAttribute('data-globe-intro', 'playing');
    await scrollToY(page, await trackY(page, 0.3));
    await expect(hero(page)).toHaveAttribute('data-globe-intro', 'done');
  });

  test('focus entering the faded copy scrolls back to where it is visible', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard focus check on desktop layouts');
    await readyPinned(page);
    await skipIntro(page);
    await scrollToY(page, await trackY(page, 0.5));
    await expect.poll(() => descent(page)).toBeGreaterThan(0.4);
    await page.getByRole('button', { name: /Open the command center/ }).focus();
    await expect.poll(() => descent(page)).toBeLessThan(0.02);
  });

  test('reduced motion: nothing pins and the hero has no descent', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openView(page, 'overview');
    await expect(hero(page)).toHaveAttribute('data-globe-status', 'ready', { timeout: 5_000 });
    await expect(track(page)).toHaveAttribute('data-globe-pinned', 'false');
    await expect(page.locator('.globe-track__runway')).toHaveCount(0);
    await scrollToY(page, 600);
    await expect.poll(() => descent(page)).toBe(0);
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
  for (const view of VIEW_KEYS.filter((key) => key !== 'overview')) {
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

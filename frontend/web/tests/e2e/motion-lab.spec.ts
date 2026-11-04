/*
 * Motion Lab (/?motionlab, development only) against the shared test contract:
 * reveal roots, atmospheric flow, story scroll, change signals and the 3D scene monitor.
 */
import type { Page } from '@playwright/test';
import { expect, intAttr, isInViewport, scrollOffScreen, scrollToY, test } from './support';

async function openLab(page: Page) {
  await page.goto('/?motionlab');
  await expect(page.getByTestId('motion-lab')).toBeVisible();
  await page.waitForFunction(() => typeof window.__motionLab?.gsapTweens === 'function');
}
const gsapTweens = (page: Page) => page.evaluate(() => window.__motionLab!.gsapTweens());
const scrollTriggers = (page: Page) => page.evaluate(() => window.__motionLab!.scrollTriggers());

// ---------------------------------------------------------------- (1) Mission Reveal, Motion and GSAP twin
const REVEALS = [
  { engine: 'Motion', id: 'reveal-motion', skip: 'Skip reveal', replay: 'Replay reveal' },
  { engine: 'GSAP', id: 'reveal-gsap', skip: 'Skip GSAP reveal', replay: 'Replay GSAP reveal' },
] as const;
const GROUPS = ['situation', 'currency', 'assessment', 'evidence', 'telemetry', 'outlook'];

for (const r of REVEALS) {
  test.describe(`mission reveal (${r.engine})`, () => {
    test('plays, then is done within 2.5 s; Skip ends it at once; Replay plays again', async ({ page }) => {
      await openLab(page); // the 2.5 s budget runs from mount; dev-server module loading is not part of the reveal
      const root = page.getByTestId(r.id);
      for (const g of GROUPS) expect(await root.locator(`[data-reveal="${g}"]`).count(), `group ${g}`).toBeGreaterThan(0);
      await expect(root).toHaveAttribute('data-reveal-state', /^(playing|done)$/);
      await expect(root).toHaveAttribute('data-reveal-state', 'done', { timeout: 2_500 });

      await root.getByRole('button', { name: r.replay, exact: true }).click();
      await expect(root).toHaveAttribute('data-reveal-state', 'playing', { timeout: 1_000 });
      await root.getByRole('button', { name: r.skip, exact: true }).click();
      await expect(root).toHaveAttribute('data-reveal-state', 'done', { timeout: 300 });
      // Skipped means the end state: every group fully shown.
      await expect
        .poll(() => root.locator('[data-reveal]').evaluateAll((els) => els.filter((el) => getComputedStyle(el).opacity !== '1').length), {
          timeout: 500,
        })
        .toBe(0);

      await root.getByRole('button', { name: r.replay, exact: true }).click();
      await expect(root).toHaveAttribute('data-reveal-state', 'playing', { timeout: 1_000 });
      await expect(root).toHaveAttribute('data-reveal-state', 'done', { timeout: 2_500 });
    });

    test('scrolling and focus keep working while the reveal plays', async ({ page }) => {
      await openLab(page);
      const root = page.getByTestId(r.id);
      await expect(root).toHaveAttribute('data-reveal-state', 'done', { timeout: 2_500 });
      const replay = root.getByRole('button', { name: r.replay, exact: true });

      // Scroll during playback (real wheel input, not a programmatic scroll).
      await replay.click();
      await expect(root).toHaveAttribute('data-reveal-state', 'playing', { timeout: 1_000 });
      const y0 = await page.evaluate(() => window.scrollY);
      const box = await root.boundingBox();
      await page.mouse.move((box?.x ?? 0) + 20, Math.max(5, (box?.y ?? 0) + 20));
      await page.mouse.wheel(0, 300);
      await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 1_000 }).not.toBe(y0);
      await expect(root).toHaveAttribute('data-reveal-state', 'done', { timeout: 2_500 });

      // Focus a control outside the reveal during playback; the reveal must not steal or block it.
      await scrollToY(page, 0);
      await replay.click();
      await expect(root).toHaveAttribute('data-reveal-state', 'playing', { timeout: 1_000 });
      const outside = page.getByTestId('atmos-flow').getByRole('button', { name: /^(Pause|Resume) wind flow$/ });
      await outside.focus();
      await expect(outside).toBeFocused();
      expect(await root.getAttribute('data-reveal-state'), 'focus must have happened during playback').toBe('playing');
      await expect(root).toHaveAttribute('data-reveal-state', 'done', { timeout: 2_500 });
      await expect(outside).toBeFocused();
    });
  });
}

test('mission reveal (GSAP): five replays leave no orphaned tweens', async ({ page }) => {
  await openLab(page);
  const root = page.getByTestId('reveal-gsap');
  await expect(root).toHaveAttribute('data-reveal-state', 'done', { timeout: 2_500 });
  const replay = root.getByRole('button', { name: 'Replay GSAP reveal', exact: true });
  await replay.click();
  await expect(root).toHaveAttribute('data-reveal-state', 'done', { timeout: 2_500 });
  const baseline = await gsapTweens(page);
  for (let i = 0; i < 5; i += 1) {
    await replay.click();
    await expect(root).toHaveAttribute('data-reveal-state', 'playing', { timeout: 1_000 });
    await expect(root).toHaveAttribute('data-reveal-state', 'done', { timeout: 2_500 });
  }
  expect(await gsapTweens(page)).toBeLessThanOrEqual(baseline);
});

// ---------------------------------------------------------------- (2) Atmospheric flow
test('atmospheric flow: draws while in view, stops on Pause and off-screen', async ({ page }) => {
  await openLab(page);
  const flow = page.getByTestId('atmos-flow');
  await flow.scrollIntoViewIfNeeded();
  await expect(flow).toHaveAttribute('data-flow-active', 'true');

  const f0 = await intAttr(flow, 'data-flow-frames');
  await page.waitForTimeout(1_000);
  expect(await intAttr(flow, 'data-flow-frames')).toBeGreaterThan(f0);

  const toggle = flow.getByRole('button', { name: /^(Pause|Resume) wind flow$/ });
  await expect(toggle).toHaveAccessibleName('Pause wind flow');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(250); // let the last batched counter write land
  const f1 = await intAttr(flow, 'data-flow-frames');
  await page.waitForTimeout(1_000);
  expect(await intAttr(flow, 'data-flow-frames'), 'paused: no frames drawn').toBe(f1);

  // Resume, confirm it runs again, then scroll it away.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => intAttr(flow, 'data-flow-frames'), { timeout: 2_000 }).toBeGreaterThan(f1);
  await scrollOffScreen(page, flow);
  await expect(flow).toHaveAttribute('data-flow-active', 'false');
  await page.waitForTimeout(250);
  const f2 = await intAttr(flow, 'data-flow-frames');
  await page.waitForTimeout(1_000);
  expect(await intAttr(flow, 'data-flow-frames'), 'off-screen: no frames drawn').toBe(f2);
});

// ---------------------------------------------------------------- (3) Story scroll
test('story scroll: six chapters reveal in normal flow; ScrollTrigger variant cleans up; no snapping', async ({ page }) => {
  await openLab(page);
  const story = page.getByTestId('story-scroll');
  await expect(story).toHaveAttribute('data-engine', 'motion');
  for (let i = 1; i <= 6; i += 1) await expect(story.locator(`[data-story-chapter="${i}"]`)).toHaveCount(1);
  const snapTypes = () =>
    page.evaluate(() => [getComputedStyle(document.documentElement).scrollSnapType, getComputedStyle(document.body).scrollSnapType]);
  const chaptersNotShown = () =>
    story
      .locator('[data-story-chapter]')
      .evaluateAll((els) => els.filter((el) => getComputedStyle(el).opacity !== '1').map((el) => el.getAttribute('data-story-chapter')));

  // Scroll down in steps, as a reader would, so each chapter passes through the viewport.
  async function readToBottom() {
    await scrollToY(page, 0);
    for (let step = 0; step < 200; step += 1) {
      const atBottom = await page.evaluate(() => {
        window.scrollBy({ top: Math.round(window.innerHeight * 0.5), behavior: 'instant' });
        return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      });
      await page.waitForTimeout(120);
      if (atBottom) return;
    }
  }

  await readToBottom();
  await expect.poll(chaptersNotShown, { timeout: 3_000 }).toEqual([]);
  expect(await snapTypes()).toEqual(['none', 'none']);

  await story.getByRole('button', { name: 'Use ScrollTrigger', exact: true }).click();
  await expect(story).toHaveAttribute('data-engine', 'scrolltrigger');
  await readToBottom();
  await expect.poll(chaptersNotShown, { timeout: 3_000 }).toEqual([]);
  expect(await snapTypes()).toEqual(['none', 'none']);

  await story.getByRole('button', { name: 'Use Motion', exact: true }).click();
  await expect(story).toHaveAttribute('data-engine', 'motion');
  await expect.poll(() => scrollTriggers(page), { message: 'ScrollTriggers left after switching back to Motion' }).toBe(0);
  expect(await snapTypes()).toEqual(['none', 'none']);
});

// ---------------------------------------------------------------- (4) Change signals
test('change signals: each fires once and clears; nothing loops', async ({ page }) => {
  await openLab(page);
  const panel = page.getByTestId('change-signals');
  await panel.scrollIntoViewIfNeeded();
  const SIGNALS = [
    { button: 'Simulate new packet', signal: 'new-packet' },
    { button: 'Simulate node going stale', signal: 'stale' },
    { button: 'Simulate alert raised', signal: 'alert-raised' },
  ] as const;
  for (const s of SIGNALS) {
    await panel.getByRole('button', { name: 'Reset signals', exact: true }).click();
    await expect(page.locator('[data-signal]')).toHaveCount(0, { timeout: 2_500 });
    await panel.getByRole('button', { name: s.button, exact: true }).click();
    const marked = page.locator(`[data-signal="${s.signal}"]`);
    await expect(marked).toHaveCount(1, { timeout: 1_000 });
    await expect(marked).toHaveCount(0, { timeout: 2_500 });
    // Once only: it must not come back on its own.
    for (let i = 0; i < 6; i += 1) {
      await page.waitForTimeout(250);
      expect(await page.locator('[data-signal]').count(), `${s.signal} re-fired`).toBe(0);
    }
  }
  // No infinite (looping) animation anywhere in the panel.
  const loops = await panel.evaluate(
    (root) =>
      document
        .getAnimations()
        .filter((a) => a.effect instanceof KeyframeEffect && a.effect.target instanceof Node && root.contains(a.effect.target))
        .filter((a) => a.effect?.getComputedTiming().iterations === Infinity).length,
  );
  expect(loops).toBe(0);
});

// ---------------------------------------------------------------- (5) 3D scene monitor
test('3D scene monitor: renders in view, stops rendering off-screen', async ({ page }) => {
  await openLab(page);
  const monitor = page.getByTestId('scene-monitor');
  const host = monitor.locator('[data-scene-frames]');
  await monitor.scrollIntoViewIfNeeded();
  expect(await isInViewport(host)).toBe(true);
  await expect(host).toHaveAttribute('data-scene-active', 'true', { timeout: 5_000 });
  const f0 = await intAttr(host, 'data-scene-frames');
  await expect.poll(() => intAttr(host, 'data-scene-frames'), { timeout: 3_000 }).toBeGreaterThan(Number.isNaN(f0) ? 0 : f0);

  await scrollOffScreen(page, host);
  await expect(host).toHaveAttribute('data-scene-active', 'false');
  await page.waitForTimeout(250);
  const f1 = await intAttr(host, 'data-scene-frames');
  await page.waitForTimeout(1_500);
  expect(await intAttr(host, 'data-scene-frames'), 'off-screen: no WebGL frames').toBe(f1);
});

// ---------------------------------------------------------------- (6) Reference-derived demonstrations
test('status label morph: each state swaps the label', async ({ page }) => {
  await openLab(page);
  const morph = page.getByTestId('state-morph');
  await morph.scrollIntoViewIfNeeded();
  for (const [button, state, text] of [
    ['Show stale', 'stale', /stale/i],
    ['Show no packet', 'nodata', /no data|no packet|never/i],
    ['Show gateway error', 'unavailable', /unavailable|error/i],
    ['Show fresh', 'fresh', /fresh/i],
  ] as const) {
    await morph.getByRole('button', { name: button, exact: true }).click();
    await expect(morph).toHaveAttribute('data-state', state);
    await expect(morph.locator('.ml-morph__chip')).toContainText(text);
    await expect(morph.locator('.ml-morph__chip .ax-state')).toHaveCount(1, { timeout: 1_500 }); // the outgoing label is gone
  }
});

test('atmospheric flow: the mixing layer rises once; selecting a lane quiets the others', async ({ page }) => {
  await openLab(page);
  const flow = page.getByTestId('atmos-flow');
  await flow.scrollIntoViewIfNeeded();
  await expect(flow).toHaveAttribute('data-enter', 'done');
  await expect
    .poll(() => flow.locator('.ml-flow__mix').evaluate((el) => getComputedStyle(el).transform), { timeout: 2_000 })
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  const lanes = flow.locator('.ml-lane');
  await lanes.first().focus();
  await expect(lanes.first()).toHaveClass(/is-hot/);
  await expect
    .poll(
      () =>
        lanes
          .nth(1)
          .locator('.ml-streak')
          .first()
          .evaluate((el) => getComputedStyle(el).opacity),
      { timeout: 1_500 },
    )
    .toBe('0.35');
  await expect
    .poll(() =>
      lanes
        .first()
        .locator('.ml-streak')
        .first()
        .evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe('1');
});

test('story scroll: the chapter in the middle of the viewport is marked, and the page is never snapped', async ({ page }) => {
  await openLab(page);
  const story = page.getByTestId('story-scroll');
  await story.scrollIntoViewIfNeeded();
  await page.locator('[data-story-chapter="4"]').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(page.locator('[data-story-chapter="4"]')).toHaveAttribute('data-active', 'true');
  await expect(story.locator('a[aria-current="location"]')).toHaveCount(1);
  await expect(story.locator('a[aria-current="location"]')).toContainText('4.');
  await expect(page.locator('[data-story-chapter][data-active="true"]')).toHaveCount(1);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollSnapType)).toBe('none');
});

test('status label morph: polling again changes nothing, a real change swaps the label', async ({ page }) => {
  await openLab(page);
  const morph = page.getByTestId('state-morph');
  await morph.scrollIntoViewIfNeeded();
  await morph.getByRole('button', { name: 'Show stale', exact: true }).click();
  await expect(morph.locator('.ml-morph__chip .ax-state')).toHaveCount(1, { timeout: 1_500 });
  await page.evaluate(() => {
    const w = window as unknown as { __node: Element | null; __minOpacity: number };
    w.__node = document.querySelector('.ml-morph__chip .ax-state');
    w.__minOpacity = 1;
    const tick = () => {
      document
        .querySelectorAll('.ml-morph__chip .cc-morph > span')
        .forEach((s) => (w.__minOpacity = Math.min(w.__minOpacity, Number(getComputedStyle(s).opacity))));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let i = 0; i < 3; i += 1) await morph.getByRole('button', { name: 'Poll again (same state)' }).click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as { __node: Element }).__node.isConnected)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __minOpacity: number }).__minOpacity)).toBe(1);
  await expect(morph).toHaveAttribute('data-polls', '3');
  await morph.getByRole('button', { name: 'Show no packet', exact: true }).click();
  await expect(morph.locator('.ml-morph__chip .ax-state')).toHaveCount(1, { timeout: 1_500 });
  expect(await page.evaluate(() => (window as unknown as { __node: Element }).__node.isConnected)).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { __minOpacity: number }).__minOpacity)).toBeLessThan(1);
});

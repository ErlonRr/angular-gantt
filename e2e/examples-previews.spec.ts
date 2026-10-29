// The live previews on /examples (Angular site): four inert charts in cards that hug their plan
// (184 px for 178-182 px of rows). Playwright hides scrollbars by default, which hides this bug: with
// them drawn, a scrollbar that appears takes room from the viewport, the chart's fill-the-width rule
// (`fitToWidth`) answers by re-filling it, and that makes the scrollbar go away, every frame ("the
// scrolls flicker"). A preview is a picture: it never shows a scrollbar and never changes size.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { TARGETS } from '../playwright.config';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

const PREVIEWS = '.exs-mini .gantry-canvas-viewport';
const FRAMES = 30;

/** Each preview viewport's distinct sizes and scrollbar thicknesses over `FRAMES` animation frames. */
function sampleViewports(page: Page): Promise<string[][]> {
  return page.evaluate(
    ([selector, frames]) =>
      new Promise<string[][]>(resolve => {
        const viewports = [...document.querySelectorAll<HTMLElement>(selector)];
        const seen = viewports.map(() => new Set<string>());
        let n = 0;
        const tick = (): void => {
          viewports.forEach((v, i) =>
            seen[i]?.add(
              `scrollbars ${v.offsetWidth - v.clientWidth}x${v.offsetHeight - v.clientHeight} · client ${v.clientWidth}x${v.clientHeight}`,
            ),
          );
          if (++n < Number(frames)) requestAnimationFrame(tick);
          else resolve(seen.map(s => [...s]));
        };
        requestAnimationFrame(tick);
      }),
    [PREVIEWS, FRAMES] as const,
  );
}

test('the previews on /examples show no scrollbar and keep their size, whatever the card width', async ({ page }) => {
  await page.goto(`http://localhost:${TARGETS.angular.port}/examples`);
  const previews = page.locator('.exs-mini');
  await expect(previews).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await expect(previews.nth(i).locator('.gantt-bars-layer > [data-task-id]').first()).toBeVisible();
  }
  // The lazy preview asks for its second page 1.6 s in: wait for it, then the sizes are final
  await expect(previews.nth(2).locator('.gantt-bars-layer > [data-task-id]')).toHaveCount(6, { timeout: 10_000 });

  // The page itself scrolls: a browser that draws overlay scrollbars cannot show the loop
  const pageScrollbar = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
  test.skip(pageScrollbar === 0, 'this browser draws overlay scrollbars');

  // The wide layout (card 534 px), a middle one and the narrowest two-column one
  for (const width of [1400, 1080, 880, 616]) {
    await page.setViewportSize({ width, height: 820 });
    await page.waitForTimeout(400);
    const states = await sampleViewports(page);
    expect(states, `${width} px: four previews`).toHaveLength(4);
    states.forEach((distinct, i) => {
      expect(distinct, `${width} px: preview ${i} (one size, no scrollbar)`).toHaveLength(1);
      expect(distinct[0], `${width} px: preview ${i}`).toMatch(/^scrollbars 0x0 /);
    });
  }
});

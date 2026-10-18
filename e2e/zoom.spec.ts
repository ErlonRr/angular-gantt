// Zoom of Gantry 2 phase 9 (D16) in both bindings, through the `Gantt` harness of ./fixtures:
// - Ctrl + wheel zooms one level per 100 px of wheel, anchored at the pointer: the date under the
//   pointer stays there (within one header cell of the new level), and the wheel is the chart's
//   (prevented: the page itself does not zoom);
// - the toolbar's Fit button and `fitToScreen()` pick a level at which the whole plan fits and
//   scroll it into view;
// - a zoom from the toolbar (Month → Hour) keeps the date at the viewport's centre.
// A date is measured in days from a reference task's start: (scrollLeft + x − that bar's x) / px
// per day of the level (the reference task starts at local midnight, so its x is exact).
import { test, expect, BINDINGS, Gantt, LEVEL_PX_PER_DAY, PLAN, frames } from './fixtures';
import { day, type FixtureTask } from './paint-fixture';

/** One cell of the bottom header tier of each built-in level, in days. */
const CELL_DAYS: Record<string, number> = { Hour: 1 / 24, Day: 1, Week: 7, Month: 31, Quarter: 92, Year: 183 };

/** Days from `ref`'s start to viewport x `x` (px from the viewport's left edge) at the current level. */
async function dayAt(g: Gantt, ref: string, x: number): Promise<{ level: string; days: number }> {
  const level = (await g.level())!;
  const vp = await g.viewportMetrics();
  const x0 = (await g.barVisual(ref)).x;
  return { level, days: (vp.scrollLeft + x - x0) / LEVEL_PX_PER_DAY[level] };
}

/** A plan of ten months around `NOW`: wide enough to scroll at the Month level. */
const WIDE: FixtureTask[] = [
  { id: 'early', name: 'Early work', start: day(-150), end: day(-100) },
  { id: 'ref', name: 'Reference', start: day(0), end: day(5) },
  { id: 'late', name: 'Late work', start: day(100), end: day(150) },
];

for (const binding of BINDINGS) {
  test.describe(`zoom · ${binding}`, () => {
    test('Ctrl + wheel keeps the date under the pointer (±1 cell); the page does not zoom', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: { viewMode: 'Week', initialScroll: false } });
      // Every wheel reaching the window: was it prevented (the browser would zoom the page)?
      await page.evaluate(() => {
        const w = window as unknown as { __wheels: { ctrl: boolean; prevented: boolean }[] };
        w.__wheels = [];
        window.addEventListener('wheel', e => w.__wheels.push({ ctrl: e.ctrlKey, prevented: e.defaultPrevented }));
      });
      const pageZoom = () =>
        page.evaluate(() => [window.devicePixelRatio, window.innerWidth, window.visualViewport?.scale]);
      const zoom0 = await pageZoom();

      // The pointer over the timeline, 60 % across
      const vp = await g.viewportMetrics();
      const x = Math.round(vp.clientWidth * 0.6);
      await page.mouse.move(vp.left + x, vp.top + 200);
      const before = await dayAt(g, 'scope', x);
      expect(before.level).toBe('Week');

      // Zoom in one level
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -100);
      await page.keyboard.up('Control');
      await expect.poll(() => g.level()).toBe('Day');
      await frames(page);
      await expect
        .poll(async () => Math.abs((await dayAt(g, 'scope', x)).days - before.days))
        .toBeLessThanOrEqual(CELL_DAYS['Day']);
      const zoomedIn = await dayAt(g, 'scope', x);
      test.info().annotations.push({
        type: 'anchor',
        description: `${binding}: ${before.days.toFixed(3)} d → ${zoomedIn.days.toFixed(3)} d`,
      });

      // And back out
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, 100);
      await page.keyboard.up('Control');
      await expect.poll(() => g.level()).toBe('Week');
      await frames(page);
      await expect
        .poll(async () => Math.abs((await dayAt(g, 'scope', x)).days - before.days))
        .toBeLessThanOrEqual(CELL_DAYS['Week']);

      // Each level change is one `view-mode-change`
      expect((await g.events('view-mode-change')).map(e => e.detail['viewMode'])).toEqual(['Day', 'Week']);
      // The chart took the wheels: prevented, so the page did not zoom
      const wheels = await page.evaluate(
        () => (window as unknown as { __wheels: { ctrl: boolean; prevented: boolean }[] }).__wheels,
      );
      expect(wheels.length).toBeGreaterThan(0);
      expect(wheels.every(w => w.ctrl && w.prevented)).toBe(true);
      expect(await pageZoom()).toEqual(zoom0);
    });

    test('the Fit button and fitToScreen() zoom to a level where the whole plan is in view', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      const ids = PLAN.map(t => t.id);
      expect(await g.level()).toBe('Day');
      expect(await g.inView(ids)).not.toEqual([]);

      const fit = chart.get('[data-focus-key="fit"]');
      await expect(fit).toHaveAttribute('aria-label', 'Fit to screen');
      await fit.click();
      await expect.poll(() => g.level()).not.toBe('Day');
      const fitted = (await g.level())!;
      await expect.poll(() => g.inView(ids)).toEqual([]);
      await expect.poll(() => g.liveText()).toContain(`Zoom: ${fitted}`);

      // Back to the Day level, scrolled to the plan's end: the API fits the same way
      await g.call('setViewMode', 'Day');
      await expect.poll(() => g.level()).toBe('Day');
      await g.call('scrollToDate', day(24), 'instant');
      await expect.poll(() => g.inView(ids)).not.toEqual([]);
      await g.call('fitToScreen');
      await expect.poll(() => g.level()).toBe(fitted);
      await expect.poll(() => g.inView(ids)).toEqual([]);
      await frames(page);
    });

    test('zooming from Month to Hour keeps the date at the centre (±1 cell)', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: WIDE, options: { viewMode: 'Month', initialScroll: false } });
      // Centre the afternoon of day 3
      await g.call('scrollToDate', day(3, 15), 'instant');
      const vp = await g.viewportMetrics();
      const centre = vp.clientWidth / 2;
      await expect.poll(async () => Math.abs((await dayAt(g, 'ref', centre)).days - (3 + 15 / 24))).toBeLessThan(1);
      const before = await dayAt(g, 'ref', centre);
      expect(before.level).toBe('Month');

      await chart.get('[data-focus-key="zoom:Hour"]').click();
      await expect.poll(() => g.level()).toBe('Hour');
      await frames(page);
      await expect
        .poll(async () => Math.abs((await dayAt(g, 'ref', centre)).days - before.days))
        .toBeLessThanOrEqual(CELL_DAYS['Hour']);
      const after = await dayAt(g, 'ref', centre);
      test.info().annotations.push({
        type: 'centre',
        description: `${binding}: ${before.days.toFixed(4)} d → ${after.days.toFixed(4)} d`,
      });
    });
  });
}

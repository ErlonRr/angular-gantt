// Touch on the timeline (Gantry 2 phase 9, D13 and D16) in both bindings, with real touch events
// sent through the Chrome DevTools Protocol (`TouchScreen` in ./fixtures, a `hasTouch` context):
// Chromium runs its own gesture handling on them (`touch-action`, panning, taps → clicks).
// - a swipe that starts on a bar pans the timeline and drags nothing;
// - a 350 ms long-press, then a move, drags the bar (the timeline does not pan meanwhile);
//   releasing commits it (`task-dragged`);
// - a tap opens the bar's tooltip, another tap closes it;
// - a two-finger pinch zooms in (fingers apart) and out (together), the page itself does not zoom;
// - dragging close to the viewport's edge auto-scrolls the timeline.
// The long-press is measured, not slept: the drag ghost shows once the press has been held for
// 350 ms, so the time from the touch to the ghost is a lower bound of the delay.
import { test, expect, BINDINGS, Gantt, LEVELS, LEVEL_PX_PER_DAY, TouchScreen, type Chart } from './fixtures';

test.use({ hasTouch: true });

const LONG_PRESS = 350;

/** The centre of task `id`'s bar body, in client px. */
async function barCentre(chart: Chart, g: Gantt, id: string) {
  const b = await chart.box(g.bar(id).locator('.gantt-bar-body'));
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

for (const binding of BINDINGS) {
  test.describe(`touch · ${binding}`, () => {
    test('a swipe that starts on a bar pans the timeline and drags nothing', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      const touch = await TouchScreen.attach(page);
      const v0 = await g.barVisual('scope');
      const left0 = (await g.viewportMetrics()).scrollLeft;
      const from = await barCentre(chart, g, 'scope');

      await touch.swipe(from, { x: from.x - 250, y: from.y }, 8);
      await expect.poll(async () => (await g.viewportMetrics()).scrollLeft).toBeGreaterThan(left0 + 100);
      await expect(chart.get('.gantt-drag-preview')).toHaveCount(0);
      expect(await g.events('task-dragged')).toEqual([]);
      expect(await g.events('task-resized')).toEqual([]);
      expect((await g.barVisual('scope')).x).toBe(v0.x);
      // Not a tap either
      await expect(chart.get('.gantt-tooltip')).toBeHidden();
    });

    test('a 350 ms long-press, then a move, drags the bar without panning; releasing commits it', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      const touch = await TouchScreen.attach(page);
      const ghost = chart.get('.gantt-drag-preview');
      const v0 = await g.barVisual('scope');
      const left0 = (await g.viewportMetrics()).scrollLeft;
      const from = await barCentre(chart, g, 'scope');

      const t0 = Date.now();
      await touch.down(from);
      const early = await ghost.count();
      if (Date.now() - t0 < LONG_PRESS - 50) expect(early, 'dragging before the long-press').toBe(0);
      await expect(ghost).toHaveCount(1);
      expect(Date.now() - t0).toBeGreaterThanOrEqual(LONG_PRESS);

      // Three days later; the readout chip follows, the timeline stays put
      const day = LEVEL_PX_PER_DAY['Day'];
      await touch.slide(from, { x: from.x + 3 * day, y: from.y }, 6);
      await expect(chart.get('.gantt-drag-readout')).toContainText('·');
      expect((await g.viewportMetrics()).scrollLeft).toBe(left0);
      await touch.up();

      await expect.poll(() => g.events('task-dragged')).toHaveLength(1);
      expect((await g.events('task-dragged'))[0].detail).toMatchObject({ taskId: 'scope', daysMoved: 3 });
      await expect.poll(async () => (await g.barVisual('scope')).x).toBe(v0.x + 3 * day);
      await expect(ghost).toHaveCount(0);
      expect((await g.viewportMetrics()).scrollLeft).toBe(left0);
    });

    test('a tap opens the tooltip, another tap closes it', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      const touch = await TouchScreen.attach(page);
      const tooltip = chart.get('.gantt-tooltip');
      const at = await barCentre(chart, g, 'scope');

      await touch.tap(at);
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText('Scope');
      await expect(g.bar('scope')).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!);
      await touch.tap(at);
      await expect(tooltip).toBeHidden();

      // A tap somewhere else on the page closes it too
      await touch.tap(at);
      await expect(tooltip).toBeVisible();
      await touch.tap({ x: 60, y: 660 });
      await expect(tooltip).toBeHidden();
      expect(await g.events('task-dragged')).toEqual([]);
    });

    test('a two-finger pinch zooms in and out; the page does not zoom', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: { viewMode: 'Month', initialScroll: false } });
      const touch = await TouchScreen.attach(page);
      const scale = () => page.evaluate(() => window.visualViewport?.scale ?? 1);
      const scale0 = await scale();
      // Over the timeline, below the rows
      const vp = await g.viewportMetrics();
      const centre = { x: vp.left + vp.clientWidth / 2, y: vp.top + vp.clientHeight - 60 };
      const index = async () => LEVELS.indexOf((await g.level())!);
      const month = LEVELS.indexOf('Month');

      await touch.pinch(centre, 100, 180);
      await expect.poll(index).toBeLessThan(month);
      const zoomedIn = await index();
      await touch.pinch(centre, 180, 100);
      await expect.poll(index).toBeGreaterThan(zoomedIn);

      expect(await scale()).toBe(scale0);
      await expect(chart.get('.gantt-drag-preview')).toHaveCount(0);
      expect(await g.events('task-dragged')).toEqual([]);
      expect((await g.events('view-mode-change')).length).toBeGreaterThanOrEqual(2);
    });

    test('dragging a bar to the viewport edge auto-scrolls the timeline', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      const touch = await TouchScreen.attach(page);
      const from = await barCentre(chart, g, 'scope');
      const vp = await g.viewportMetrics();
      const left0 = vp.scrollLeft;

      await touch.down(from);
      await expect(chart.get('.gantt-drag-preview')).toHaveCount(1);
      // Into the 32 px zone at the right edge, then hold still
      const edge = { x: vp.left + vp.clientWidth - 10, y: from.y };
      await touch.slide(from, edge, 10);
      await expect.poll(async () => (await g.viewportMetrics()).scrollLeft).toBeGreaterThan(left0 + 150);
      await touch.up();

      // The bar moved by the finger's travel plus the scroll
      await expect.poll(() => g.events('task-dragged')).toHaveLength(1);
      const moved = (await g.events('task-dragged'))[0].detail['daysMoved'] as number;
      expect(moved).toBeGreaterThan((edge.x - from.x + 150) / LEVEL_PX_PER_DAY['Day']);
      await expect(chart.get('.gantt-drag-preview')).toHaveCount(0);
    });
  });
}

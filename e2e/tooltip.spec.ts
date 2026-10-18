// The task tooltip of Gantry 2 phase 9 (D10, WCAG 1.4.13 "Content on hover or focus") in both
// bindings, through the `Gantt` harness of ./fixtures:
// - hover opens it after `tooltip.showDelay` (320 ms); the pointer can move onto it and it stays
//   (hoverable); leaving both closes it;
// - Esc closes it without moving focus or the pointer (dismissible), and it stays closed while the
//   pointer rests on that bar; Esc first closes the tooltip, then clears the selection (D24);
// - keyboard focus on a bar opens it at once, with `aria-describedby` on the bar pointing at it;
// - `tooltip.trigger: 'hover'` ignores focus and `'focus'` ignores hover;
// - `tooltip.render` replaces the built-in content (and Angular's `<ng-template ganttTooltip>`
//   wins over it).
// The 320 ms delay is measured, not slept: the time from the pointer move to the tooltip showing
// is a lower bound of the delay. Checks that something stays closed (or open) wait a fixed time:
// there is nothing to poll for.
import type { Page } from '@playwright/test';
import { test, expect, BINDINGS, DEFAULT_OPTIONS, Gantt, focused, type Chart } from './fixtures';

const SHOW_DELAY = 320;
const HIDE_DELAY = 120;

/** The centre of task `id`'s bar body, in client px. */
async function barCentre(chart: Chart, g: Gantt, id: string) {
  const b = await chart.box(g.bar(id).locator('.gantt-bar-body'));
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Longer than both tooltip delays: what is closed (or open) now stays so. */
const outlast = (page: Page) => page.waitForTimeout(SHOW_DELAY + HIDE_DELAY + 200);

/** A point inside the chart, off the timeline (the task list's empty bottom). */
const OFF_TIMELINE = { x: 60, y: 660 };

for (const binding of BINDINGS) {
  test.describe(`tooltip · ${binding}`, () => {
    test('hover opens it after the delay; the pointer can move onto it and it stays (1.4.13)', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      const tooltip = chart.get('.gantt-tooltip');
      const at = await barCentre(chart, g, 'scope');

      const t0 = Date.now();
      await page.mouse.move(at.x, at.y);
      const early = await tooltip.isVisible();
      if (Date.now() - t0 < SHOW_DELAY - 50) expect(early, 'open before the show delay').toBe(false);
      await expect(tooltip).toBeVisible();
      expect(Date.now() - t0).toBeGreaterThanOrEqual(SHOW_DELAY);
      await expect(tooltip).toHaveAttribute('role', 'tooltip');
      await expect(tooltip).toContainText('Scope');
      // Anchored to the bar: below it (or above), not over it
      const bar = await chart.box(g.bar('scope').locator('.gantt-bar-body'));
      const box = await chart.box(tooltip);
      expect(box.y >= bar.y + bar.height || box.y + box.height <= bar.y).toBe(true);

      // Onto the tooltip in one move: it stays open past the hide delay
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await outlast(page);
      await expect(tooltip).toBeVisible();

      // Off both: it closes
      await page.mouse.move(OFF_TIMELINE.x, OFF_TIMELINE.y);
      await expect(tooltip).toBeHidden();
    });

    test('Esc closes it without moving focus or the pointer; then Esc clears the selection (D24)', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      const tooltip = chart.get('.gantt-tooltip');
      await g.call('setSelectedTasks', ['research']);
      const research = chart.get('.gantt-tl-row[data-task-id="research"]');
      await expect(research).toHaveAttribute('aria-selected', 'true');
      const at = await barCentre(chart, g, 'scope');

      // Focus outside the chart: Esc closes the tooltip, focus stays on the page's control
      await g.focusBefore();
      await page.mouse.move(at.x, at.y);
      await expect(tooltip).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(tooltip).toBeHidden();
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('e2e-before');
      // The pointer still rests on the bar (and moves on it): the tooltip stays closed
      await page.mouse.move(at.x + 3, at.y);
      await outlast(page);
      await expect(tooltip).toBeHidden();
      // Leaving the bar and coming back opens it again
      await page.mouse.move(OFF_TIMELINE.x, OFF_TIMELINE.y);
      await page.mouse.move(at.x, at.y);
      await expect(tooltip).toBeVisible();

      // Focus inside the chart (a task-list row): Esc closes the tooltip first, focus and selection stay
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      const row = await focused(chart);
      expect(row?.kind).toBe('row');
      await expect(tooltip).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(tooltip).toBeHidden();
      expect(await focused(chart)).toEqual(row);
      await expect(research).toHaveAttribute('aria-selected', 'true');
      // With no tooltip open, Esc clears the selection
      await page.keyboard.press('Escape');
      await expect(research).toHaveAttribute('aria-selected', 'false');
      expect(await focused(chart)).toEqual(row);
    });

    test('keyboard focus on a bar opens it at once, and the bar is aria-describedby it', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      // A show delay no test waits for: only the focus can open it
      await g.open({ options: { ...DEFAULT_OPTIONS, tooltip: { showDelay: 60_000 } } });
      const tooltip = chart.get('.gantt-tooltip');
      await g.focusBefore();
      expect((await g.tabTo('bar')).taskId).toBe('plan');
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText('Planning');
      const id = await tooltip.getAttribute('id');
      expect(id).toBeTruthy();
      await expect(g.bar('plan')).toHaveAttribute('aria-describedby', id!);

      // The next bar takes it over
      await page.keyboard.press('ArrowDown');
      await expect(tooltip).toContainText('Scope');
      await expect(g.bar('scope')).toHaveAttribute('aria-describedby', id!);
      await expect(g.bar('plan')).not.toHaveAttribute('aria-describedby', /.+/);

      // Focus leaves the bars: it closes at once, nothing describes the bars any more
      await page.keyboard.press('Shift+Tab');
      expect((await focused(chart))?.kind).toBe('toggle');
      await expect(tooltip).toBeHidden();
      await expect(chart.get('.gantt-bars-layer > [aria-describedby]')).toHaveCount(0);
    });

    test("tooltip.trigger: 'hover' ignores focus, 'focus' ignores hover", async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      const tooltip = chart.get('.gantt-tooltip');

      await g.open({ options: { ...DEFAULT_OPTIONS, tooltip: { trigger: 'hover' } } });
      await g.focusBefore();
      await g.tabTo('bar');
      await outlast(page);
      await expect(tooltip).toBeHidden();
      await expect(chart.get('.gantt-bars-layer > [aria-describedby]')).toHaveCount(0);
      const at = await barCentre(chart, g, 'scope');
      await page.mouse.move(at.x, at.y);
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText('Scope');

      await g.open({ options: { ...DEFAULT_OPTIONS, tooltip: { trigger: 'focus' } } });
      await page.mouse.move(OFF_TIMELINE.x, OFF_TIMELINE.y);
      await page.mouse.move(at.x, at.y);
      await outlast(page);
      await expect(tooltip).toBeHidden();
      await g.focusBefore();
      await g.tabTo('bar');
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText('Planning');
    });

    test('tooltip.render replaces the built-in content', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tooltipRender: true });
      const tooltip = chart.get('.gantt-tooltip');
      const at = await barCentre(chart, g, 'scope');
      await page.mouse.move(at.x, at.y);
      await expect(tooltip).toBeVisible();
      await expect(tooltip.locator('.gantt-tooltip-custom')).toHaveText('Custom: Scope');
      await expect(tooltip.locator('.gantt-tooltip-rows')).toHaveCount(0);
    });
  });
}

test('angular › <ng-template ganttTooltip> wins over tooltip.render', async ({ chart, page }) => {
  const g = new Gantt(chart, 'angular');
  await g.open({ tooltipRender: true, tooltipTemplate: true });
  const tooltip = chart.get('.gantt-tooltip');
  const at = await barCentre(chart, g, 'scope');
  await page.mouse.move(at.x, at.y);
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('.gantt-tooltip-custom .fixture-tooltip')).toHaveText('Template: Scope');
  await expect(tooltip).not.toContainText('Custom:');
  await expect(tooltip.locator('.gantt-tooltip-rows')).toHaveCount(0);
});

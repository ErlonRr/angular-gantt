// The chart states of Gantry 2 phase 9 (D11, contract §3c "States") in both bindings, through the
// `Gantt` harness of ./fixtures, each checked with axe (WCAG 2.0–2.2 A and AA):
// - `loading`: a skeleton over the body while there are no rows, and the host region is busy
//   (`aria-busy`, through ElementInternals for the Web Component — read from Chromium's
//   accessibility tree); over rows already shown, only busy;
// - `errorMessage`: a `role=alert` box with the title, the message and a Retry that emits `retry`
//   with `{ source: 'error' }`; cleared by the consumer;
// - no tasks: the empty box with `labels.emptyState`, or the consumer's own content
//   (`slot="empty"` / `[ganttEmpty]`);
// - a data source whose first page fails: the error box, whose Retry emits `{ source: 'dataSource' }`
//   and loads the page again;
// - what the box covers (the timeline, the splitter, the task-list rows) is inert: out of the tab
//   order, focus on it moves to Retry; the task-list header row above the box keeps the list's tab
//   stop, also without rows.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect, BINDINGS, Gantt, PLAN, SEL, focused, type Binding, type Chart } from './fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const HOST: Record<Binding, string> = { vanilla: 'gantry-element', angular: 'gantry' };

/** No axe violation inside the chart. */
async function expectAxeClean(page: Page, binding: Binding): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).include(HOST[binding]).withTags(WCAG).analyze();
  expect(
    violations.flatMap(v =>
      v.nodes.map(n => `${v.id} (${v.impact ?? '?'}): ${n.target.join(' » ')}\n  ${n.failureSummary ?? ''}`),
    ),
  ).toEqual([]);
}

/** Whether the chart's region is busy in Chromium's accessibility tree (host attribute or ElementInternals). */
async function axBusy(chart: Chart): Promise<boolean> {
  const cdp = await chart.page.context().newCDPSession(chart.page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodes } = await cdp.send('Accessibility.queryAXTree', {
      nodeId: root.nodeId,
      role: 'region',
      accessibleName: 'Gantt chart timeline',
    });
    if (nodes.length !== 1) throw new Error(`${nodes.length} chart regions`);
    // Chromium reports the boolean as 1 / 0
    return nodes[0].properties?.some(p => p.name === 'busy' && !!p.value.value) ?? false;
  } finally {
    await cdp.detach();
  }
}

for (const binding of BINDINGS) {
  test.describe(`states · ${binding}`, () => {
    test.beforeEach(async ({ page }) => {
      // No skeleton shimmer or transitions: axe sees the final state
      await page.emulateMedia({ reducedMotion: 'reduce' });
    });

    test('loading: a skeleton and a busy region while there are no rows; over shown rows only busy', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: [], loading: true });
      const state = chart.get('.gantt-state');
      await expect(state).toHaveClass(/(^|\s)gantt-state--loading(\s|$)/);
      await expect(state.locator('.gantt-skeleton')).toHaveAttribute('aria-hidden', 'true');
      expect(await state.locator('.gantt-skeleton-row').count()).toBeGreaterThan(3);
      await expect(state.locator('[role="alert"]')).toHaveCount(0);
      await expect.poll(() => axBusy(chart)).toBe(true);
      if (binding === 'angular') await expect(chart.host()).toHaveAttribute('aria-busy', 'true');
      else expect(await chart.host().evaluate(el => el.matches(':state(loading)'))).toBe(true);
      await expectAxeClean(page, binding);

      // The tasks arrive
      await g.set({ tasks: PLAN, loading: false });
      await expect(chart.get('.gantt-state')).toHaveCount(0);
      await expect(chart.get(SEL.row).first()).toBeVisible();
      await expect.poll(() => axBusy(chart)).toBe(false);

      // Loading again over the shown rows: busy, the rows stay, no skeleton
      await g.set({ loading: true });
      await expect.poll(() => axBusy(chart)).toBe(true);
      await expect(chart.get('.gantt-state')).toHaveCount(0);
      await expect(chart.get(SEL.row).first()).toBeVisible();
      await g.set({ loading: false });
      await expect.poll(() => axBusy(chart)).toBe(false);
    });

    test('errorMessage: an alert with the message; Retry emits retry { source: "error" }', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ errorMessage: 'The server is unavailable.' });
      // The error wins over the rows
      const box = chart.get('.gantt-state.gantt-state--error .gantt-state-box');
      await expect(box).toBeVisible();
      await expect(box).toHaveAttribute('role', 'alert');
      await expect(box.locator('.gantt-state-title')).toHaveText('Couldn’t show the chart');
      await expect(box.locator('.gantt-state-message')).toHaveText('The server is unavailable.');
      await expectAxeClean(page, binding);

      // Retry from the keyboard, then with the pointer
      const retry = box.locator('.gantt-state-retry');
      await expect(retry).toHaveAttribute('data-focus-key', 'retry');
      await expect(retry).toHaveAccessibleName('Retry');
      await retry.focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => g.events('retry')).toEqual([{ type: 'retry', detail: { source: 'error' } }]);
      await retry.click();
      await expect.poll(async () => (await g.events('retry')).length).toBe(2);

      // The consumer clears it: the rows are back; a blank message shows no error
      await g.set({ errorMessage: null });
      await expect(chart.get('.gantt-state')).toHaveCount(0);
      await expect(chart.get(SEL.row).first()).toBeVisible();
      await g.set({ errorMessage: '   ' });
      await expect(chart.get('.gantt-state')).toHaveCount(0);
    });

    test('no tasks: the empty box with labels.emptyState', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: [] });
      const box = chart.get('.gantt-state.gantt-state--empty .gantt-state-box');
      await expect(box).toBeVisible();
      await expect(box.locator('.gantt-state-message')).toHaveText('No tasks to show');
      await expect(box).not.toHaveAttribute('role', 'alert');
      await expect(chart.get('.gantt-state-retry')).toHaveCount(0);
      await expect.poll(() => axBusy(chart)).toBe(false);
      await expectAxeClean(page, binding);

      await g.set({ tasks: PLAN });
      await expect(chart.get('.gantt-state')).toHaveCount(0);
      await expect(chart.get(SEL.row).first()).toBeVisible();
    });

    test('no tasks: custom empty content (slot="empty" / [ganttEmpty]) replaces the message', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: [], emptyContent: 'Nothing planned yet' });
      const box = chart.get('.gantt-state.gantt-state--empty .gantt-state-box');
      await expect(box).toBeVisible();
      const custom = chart.host().locator('.fixture-empty');
      await expect(custom).toBeVisible();
      await expect(custom).toHaveText('Nothing planned yet');
      // Shown inside the state box
      const inner = await chart.box(custom);
      const outer = await chart.box(box);
      expect(inner.x).toBeGreaterThanOrEqual(outer.x);
      expect(inner.y).toBeGreaterThanOrEqual(outer.y);
      expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
      expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 0.5);
      // The fallback message is not shown
      await expect(box.locator('.gantt-state-message')).toBeHidden();
      await expectAxeClean(page, binding);

      // Tasks arrive: the state and its content go
      await g.set({ tasks: PLAN });
      await expect(chart.get('.gantt-state')).toHaveCount(0);
      await expect(custom).toBeHidden();
      await expect(chart.get(SEL.row).first()).toBeVisible();
    });

    test('a failing first data-source page: Retry emits { source: "dataSource" } and the page loads again', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ dataSource: { failures: 1 } });
      const box = chart.get('.gantt-state.gantt-state--error .gantt-state-box');
      await expect(box).toBeVisible();
      await expect(box).toHaveAttribute('role', 'alert');
      await expect(box.locator('.gantt-state-message')).toHaveText('Couldn’t load tasks');
      expect(await g.fetches()).toBe(1);
      // The failure is the state's; the task-list footer is not rendered over it
      await expect(chart.get('.gantt-load-more-btn')).toHaveCount(0);
      await expectAxeClean(page, binding);

      await box.locator('.gantt-state-retry').click();
      await expect.poll(() => g.events('retry')).toEqual([{ type: 'retry', detail: { source: 'dataSource' } }]);
      await expect.poll(() => g.fetches()).toBe(2);
      await expect(chart.get('.gantt-state')).toHaveCount(0);
      await expect(chart.get(`${SEL.row}[data-task-id="plan"]`)).toBeVisible();
      await expect(chart.get(SEL.row)).toHaveCount(PLAN.length);
    });

    test('the box covers the body: focus moves to Retry, Tab skips everything under it', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      await g.focusBefore();
      expect((await g.tabTo('bar')).kind).toBe('bar');

      await g.set({ errorMessage: 'The server is unavailable.' });
      await expect.poll(async () => (await focused(chart))?.kind).toBe('retry');
      await expectAxeClean(page, binding);
      // Tab from the start: toolbar, the task list's header cell (above the box), Retry, and out
      await page.locator('#e2e-before').focus();
      const stops: string[] = [];
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        const f = await focused(chart);
        if (!f) break;
        stops.push(f.kind);
      }
      expect(stops).toEqual(['toolbar', 'column-header', 'retry']);

      // Ready again: the rows and bars are back in the tab order
      await g.set({ errorMessage: null });
      await expect(chart.get('.gantt-state')).toHaveCount(0);
      await page.locator('#e2e-before').focus();
      expect((await g.tabTo('bar')).kind).toBe('bar');
    });

    test('axe: a chart without rows keeps a task-list tab stop (scrollable-region-focusable)', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      for (const setup of [
        { tasks: [], loading: true },
        { tasks: [] },
        { tasks: [], emptyContent: 'Nothing planned yet' },
        { dataSource: { failures: 1 } },
      ]) {
        await g.open(setup);
        await expect(chart.get('.gantt-state')).toBeVisible();
        // The first header cell (above the state box) is the task list's one tab stop
        await expect(chart.get('.gantt-tl-col-header[tabindex="0"]')).toHaveCount(1);
        await expectAxeClean(page, binding);
      }
    });
  });
}

// Row hover across the panes (Gantry 2 phase 10, D4), in both bindings through the Phase 9 harness:
// - a mouse over a task-list row tints its timeline row (`rect.gantt-row-hover`, at the row's y and
//   height) and marks the row itself (`.gantt-tl-row--hover`);
// - a mouse over the timeline marks the task-list row at that y and tints the same timeline row;
// - scrolling either pane (the wheel over the task list or over the timeline) clears both.
import type { Page } from '@playwright/test';
import { test, expect, Gantt, BINDINGS, PLAN, extraTasks, frames, type Chart } from './fixtures';

/** More rows than the box shows: both panes scroll vertically. */
const TASKS = [...PLAN, ...extraTasks(30)];

/** What the chart shows as hovered: the tint's box in page px, and the task-list rows marked hovered. */
interface Hovered {
  tint: { top: number; height: number } | null;
  rows: { id: string | null; top: number; height: number }[];
}

function hovered(chart: Chart): Promise<Hovered> {
  return chart.evalRoot(root => {
    const tint = root.querySelector('rect.gantt-row-hover');
    const box = tint?.getBoundingClientRect();
    return {
      tint: box ? { top: Math.round(box.top), height: Math.round(box.height) } : null,
      rows: [...root.querySelectorAll('.gantt-tl-row--hover')].map(r => {
        const b = r.getBoundingClientRect();
        return { id: r.getAttribute('data-task-id'), top: Math.round(b.top), height: Math.round(b.height) };
      }),
    };
  });
}

/** The task-list row of `id`, its tint on the timeline at the same y and height: nothing else hovered. */
async function expectHovered(chart: Chart, id: string): Promise<void> {
  const row = await chart.box(chart.get(`.gantt-tl-row[data-task-id="${id}"]`));
  const top = Math.round(row.y);
  const height = Math.round(row.height);
  await expect
    .poll(() => hovered(chart))
    .toEqual({ tint: { top, height }, rows: [{ id, top, height }] } satisfies Hovered);
}

async function expectNothingHovered(chart: Chart): Promise<void> {
  await expect.poll(() => hovered(chart)).toEqual({ tint: null, rows: [] } satisfies Hovered);
}

/** Hover the timeline in its empty left edge, at the vertical centre of task-list row `id`. */
async function hoverTimelineRow(page: Page, chart: Chart, id: string): Promise<void> {
  const vp = await chart.box(chart.viewport());
  const row = await chart.box(chart.get(`.gantt-tl-row[data-task-id="${id}"]`));
  await page.mouse.move(vp.x + 4, row.y + row.height / 2);
  await page.mouse.move(vp.x + 8, row.y + row.height / 2);
}

for (const binding of BINDINGS) {
  test.describe(`row hover · ${binding}`, () => {
    test('a task-list row tints its timeline row', async ({ chart }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: TASKS });
      await expectNothingHovered(chart);
      await chart.get('.gantt-tl-row[data-task-id="research"]').hover();
      await expectHovered(chart, 'research');
      await chart.get('.gantt-tl-row[data-task-id="docs"]').hover();
      await expectHovered(chart, 'docs');
      // Leaving the chart clears it
      await chart.page.mouse.move(1300, 780);
      await expectNothingHovered(chart);
    });

    test('a timeline row marks its task-list row', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: TASKS });
      await hoverTimelineRow(page, chart, 'specs');
      await expectHovered(chart, 'specs');
      // Over a bar too
      await chart.get('.gantt-bars-layer > [data-task-id="research"] .gantt-bar-body').hover();
      await expectHovered(chart, 'research');
    });

    test('scrolling either pane clears it', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: TASKS });

      // The wheel over the task list scrolls both panes
      await chart.get('.gantt-tl-row[data-task-id="research"]').hover();
      await expectHovered(chart, 'research');
      const before = (await g.viewportMetrics()).scrollTop;
      await page.mouse.wheel(0, 120);
      await expect.poll(async () => (await g.viewportMetrics()).scrollTop).toBeGreaterThan(before);
      await frames(page);
      await expectNothingHovered(chart);

      // The wheel over the timeline
      await hoverTimelineRow(page, chart, 'extra-5');
      await expectHovered(chart, 'extra-5');
      const middle = (await g.viewportMetrics()).scrollTop;
      await page.mouse.wheel(0, 120);
      await expect.poll(async () => (await g.viewportMetrics()).scrollTop).toBeGreaterThan(middle);
      await frames(page);
      await expectNothingHovered(chart);
    });
  });
}

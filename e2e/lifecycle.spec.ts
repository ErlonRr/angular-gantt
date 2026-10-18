// The Web Component's lifecycle in a real browser (happy-dom has no `moveBefore`): a move with
// `moveBefore()` calls `connectedMoveCallback` instead of a disconnect / connect, so scroll,
// selection and focus survive it and nothing is rebuilt. A reconnect starts a new frame scheduler
// and repaints every region, which the `gantry:flush` performance measures reveal (spying on the
// lifecycle callbacks can't work: the browser captures them when the element is defined).
//
// Plain Playwright `test`, not the shared fixture: its fixed clock replaces `performance` and
// `requestAnimationFrame` with fakes, which would drop the measures.
import { test, expect } from '@playwright/test';
import { Chart, SEL } from './fixtures';
import { TARGETS } from '../playwright.config';

type Gantry = HTMLElement & {
  tasks: { id: string }[];
  setSelectedTasks(ids: string[]): void;
  getSelectedTasks(): { id: string }[];
};

/** Repaints (`gantry:flush` measures) during the next three frames after `action` runs in the page. */
async function flushesAfter(chart: Chart, action: (el: Element) => void): Promise<number> {
  return chart.host().evaluate(async (el, src) => {
    const frames = (n: number) =>
      new Promise<void>(resolve => {
        const step = (left: number) => (left ? requestAnimationFrame(() => step(left - 1)) : resolve());
        step(n);
      });
    (globalThis as { __GANTRY_PERF__?: boolean }).__GANTRY_PERF__ = true;
    await frames(3); // settle whatever was pending
    performance.clearMeasures('gantry:flush');
    // The callback crosses into the page as source text: rebuild it there
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    (new Function(`return (${src})`)() as (e: Element) => void)(el);
    await frames(3);
    return performance.getEntriesByName('gantry:flush').length;
  }, action.toString());
}

test('moveBefore() keeps scroll, selection and focus and rebuilds nothing (connectedMoveCallback)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const chart = new Chart(page);
  await chart.open(`http://localhost:${TARGETS.vanilla.port}/`);
  const supported = await page.evaluate(
    () => typeof (Element.prototype as { moveBefore?: unknown }).moveBefore === 'function',
  );
  test.skip(!supported, 'this browser has no Element.moveBefore');

  // Enough rows to scroll, then scroll both axes, select a mounted row and focus it
  await chart.host().evaluate(el => {
    const g = el as Gantry;
    const base = new Date();
    g.tasks = [
      ...g.tasks,
      ...Array.from({ length: 60 }, (_, i) => ({
        id: `mv-${i}`,
        name: `Move task ${i + 1}`,
        start: new Date(base.getFullYear(), base.getMonth(), base.getDate() - 20 + (i % 30)),
        end: new Date(base.getFullYear(), base.getMonth(), base.getDate() - 10 + (i % 30)),
      })),
    ];
  });
  // The grid counts every row, mounted or not (rows are windowed: how many mount depends on the height)
  await expect
    .poll(() => chart.evalRoot(root => Number(root.querySelector('[aria-rowcount]')?.getAttribute('aria-rowcount'))))
    .toBeGreaterThan(60);
  await expect(chart.get(SEL.row).nth(10)).toBeAttached();
  await chart.viewport().evaluate(v => {
    v.scrollTop = 300;
    v.scrollLeft = 400;
  });
  await expect.poll(() => chart.viewport().evaluate(v => v.scrollTop)).toBeGreaterThan(0);
  // The rows follow the scroll on the next frame: pick one only once they have
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const id = await chart.get(SEL.row).nth(6).getAttribute('data-task-id');
  expect(id).toBeTruthy();
  await chart.host().evaluate((el, taskId) => (el as Gantry).setSelectedTasks([taskId]), id!);
  await chart.get(`${SEL.row}[data-task-id="${id}"]`).focus();

  const state = () =>
    chart.host().evaluate((el, viewportSel) => {
      const g = el as Gantry;
      const viewport = g.shadowRoot!.querySelector<HTMLElement>(viewportSel)!;
      const focused = g.shadowRoot!.activeElement;
      return {
        top: viewport.scrollTop,
        left: viewport.scrollLeft,
        selected: g.getSelectedTasks().map(t => t.id),
        focusedRow: focused?.getAttribute('data-task-id') ?? null,
        parent: g.parentElement?.className ?? '',
      };
    }, '.gantry-canvas-viewport');

  const before = await state();
  expect(before.top).toBeGreaterThan(0);
  expect(before.selected).toEqual([id]);
  expect(before.focusedRow).toBe(id);

  // The atomic move into a new container that doesn't change the layout (`display: contents`, same
  // place): no repaint at all — a resize would legitimately repaint, a reconnect would rebuild
  const moved = await flushesAfter(chart, el => {
    const box = document.createElement('div');
    box.className = 'moved-here';
    box.style.display = 'contents';
    el.after(box);
    (box as unknown as { moveBefore(node: Node, child: Node | null): void }).moveBefore(el, null);
  });
  expect(moved).toBe(0);
  expect(await state()).toEqual({ ...before, parent: 'moved-here' });

  // Positive control: a real disconnect + connect does repaint, so the count above means something
  const reconnected = await flushesAfter(chart, el => {
    const parent = el.parentElement!;
    el.remove();
    parent.append(el);
  });
  expect(reconnected).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

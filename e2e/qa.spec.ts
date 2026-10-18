// The invariants that regress most often, checked on every binding:
// render, header/row alignment, scroll sync, drag, panel collapse, table view.
import { test, expect, SEL, type Chart } from './fixtures';
import type { Page, TestInfo } from '@playwright/test';
import { TARGETS } from '../playwright.config';

const PAGES = [
  { name: 'vanilla', url: `http://localhost:${TARGETS.vanilla.port}/`, extraRows: 60 },
  { name: 'react', url: `http://localhost:${TARGETS.react.port}/` },
  { name: 'vue', url: `http://localhost:${TARGETS.vue.port}/` },
  { name: 'svelte', url: `http://localhost:${TARGETS.svelte.port}/` },
  { name: 'angular-roadmap', url: `http://localhost:${TARGETS.angular.port}/roadmap` },
  { name: 'angular-demo', url: `http://localhost:${TARGETS.angular.port}/demo` },
  { name: 'angular-lazy', url: `http://localhost:${TARGETS.angular.port}/lazy` },
  { name: 'angular-custom-bar', url: `http://localhost:${TARGETS.angular.port}/custom-bar` },
];

/** Rows of the task-list grid, mounted or not (`aria-rowcount`; rows are windowed, only those in view exist). */
function gridRows(chart: Chart): Promise<number> {
  return chart.evalRoot(root => Number(root.querySelector('[aria-rowcount]')?.getAttribute('aria-rowcount') ?? 0));
}

/** Append generated tasks to the Web Component so virtual scrolling and scroll sync get exercised. */
async function addRows(chart: Chart, n: number): Promise<void> {
  const before = await gridRows(chart);
  await chart.host().evaluate((el, count) => {
    const g = el as HTMLElement & { tasks: unknown[] };
    const base = new Date();
    const extra = Array.from({ length: count }, (_, i) => ({
      id: `qa-${i}`,
      name: `QA task ${i + 1}`,
      progress: (i * 7) % 100,
      start: new Date(base.getFullYear(), base.getMonth(), base.getDate() - 20 + (i % 30)),
      end: new Date(base.getFullYear(), base.getMonth(), base.getDate() - 10 + (i % 30)),
    }));
    g.tasks = [...g.tasks, ...extra];
  }, n);
  await expect.poll(() => gridRows(chart)).toBeGreaterThanOrEqual(before + n);
}

/** `GANTRY_E2E_OPTIONS='{"viewMode":"Day"}'` merges a configuration into every Web Component target. */
const EXTRA_OPTIONS = process.env['GANTRY_E2E_OPTIONS'] ? JSON.parse(process.env['GANTRY_E2E_OPTIONS']) : null;

/** Screenshots for human review: test-results/e2e/shots/<page>-<label>.png (also attached to the report). */
async function shot(page: Page, info: TestInfo, name: string, label: string): Promise<void> {
  const body = await page.screenshot({ path: `test-results/e2e/shots/${name}-${label}.png` });
  await info.attach(`${name}-${label}`, { body, contentType: 'image/png' });
}

/** Top of the first visible task-list row and of the canvas row with the same index. */
function rowAlignment(chart: Chart) {
  return chart.evalRoot(root => {
    const sel = { row: '.gantt-tl-row', rect: '.gantt-rows rect' };
    const row = [...root.querySelectorAll<HTMLElement>(sel.row)].find(r => r.getBoundingClientRect().height > 0);
    const rects = [...root.querySelectorAll<SVGRectElement>(sel.rect)];
    if (!row || !rects.length) return null;
    const idx = Number(row.getAttribute('aria-rowindex')) - 2;
    const rh = rects[0].getBoundingClientRect().height;
    const canvasTop = rects
      .find(r => Math.round(Number(r.getAttribute('y')) / rh) === idx)
      ?.getBoundingClientRect().top;
    return { panelTop: row.getBoundingClientRect().top, canvasTop: canvasTop ?? null };
  });
}

for (const p of PAGES) {
  test.describe(p.name, () => {
    test.beforeEach(async ({ chart }) => {
      await chart.open(p.url);
      if (p.extraRows) await addRows(chart, p.extraRows);
      if (EXTRA_OPTIONS) {
        await chart.host().evaluate((el, o) => {
          const g = el as HTMLElement & { options?: object };
          if ('options' in g) g.options = { ...g.options, ...o };
        }, EXTRA_OPTIONS);
      }
    });

    test('renders rows, bars and header tiers', async ({ chart, page }, info) => {
      await expect(chart.get(SEL.row).first()).toBeVisible();
      expect(await chart.get('.gantt-bars-layer [data-task-id]').count()).toBeGreaterThan(0);
      expect(await chart.get(SEL.tier).count()).toBeGreaterThan(0);
      await shot(page, info, p.name, 'initial');
    });

    test('task-list and timeline headers have the same height', async ({ chart }) => {
      const panel = await chart.box(chart.get(SEL.colHeaders).first());
      const timeline = await chart.box(chart.get(SEL.timelineHeader).first());
      expect(Math.abs(panel.height - timeline.height)).toBeLessThanOrEqual(0.5);
    });

    test('rows line up and stay in sync while scrolling', async ({ chart }) => {
      const before = await rowAlignment(chart);
      expect(before?.canvasTop).not.toBeNull();
      expect(Math.abs(before!.panelTop - before!.canvasTop!)).toBeLessThanOrEqual(0.5);

      const vp = chart.viewport();
      const scrollable = await vp.evaluate(el => el.scrollHeight > el.clientHeight + 4);
      test.skip(!scrollable, 'not enough rows to scroll');
      await vp.evaluate(el => {
        el.scrollTop = Math.min(300, el.scrollHeight - el.clientHeight);
      });
      await expect
        .poll(async () => {
          const [a, b] = await Promise.all([
            vp.evaluate(el => el.scrollTop),
            chart.panel().evaluate(el => el.scrollTop),
          ]);
          return Math.abs(a - b);
        })
        .toBeLessThanOrEqual(1);
      await expect
        .poll(async () => {
          const a = await rowAlignment(chart);
          return a?.canvasTop == null ? Infinity : Math.abs(a.panelTop - a.canvasTop);
        })
        .toBeLessThanOrEqual(0.5);
    });

    test('drags a task bar with the mouse', async ({ chart, page }, info) => {
      const vp = chart.viewport();
      // Bring the first task bar into view
      await chart.evalRoot(root => {
        const v = root.querySelector<HTMLElement>('.gantry-canvas-viewport');
        const bar = root.querySelector('.gantt-bars-layer [data-bar-type="task"] .gantt-bar-body');
        if (v && bar) v.scrollLeft += bar.getBoundingClientRect().left - v.getBoundingClientRect().left - 160;
      });
      const vb = await chart.box(vp);
      const bars = chart.get(SEL.taskBar);
      let target: { id: string; x: number; y: number; left: number; room: number } | null = null;
      for (let i = 0; i < (await bars.count()) && !target; i++) {
        const b = await bars.nth(i).boundingBox();
        if (
          b &&
          b.width > 40 &&
          b.x > vb.x &&
          b.x + 40 < vb.x + vb.width &&
          b.y > vb.y + 40 &&
          b.y + b.height < vb.y + vb.height
        ) {
          const id = await bars.nth(i).evaluate(el => el.closest('[data-task-id]')!.getAttribute('data-task-id')!);
          target = {
            id,
            x: b.x + Math.min(20, b.width / 3),
            y: b.y + b.height / 2,
            left: b.x,
            room: vb.x + vb.width - b.x,
          };
        }
      }
      test.skip(!target, 'no fully visible task bar');
      const dx = Math.max(40, Math.min(120, target!.room - 60));
      await page.mouse.move(target!.x, target!.y);
      await page.mouse.down();
      await page.mouse.move(target!.x + dx, target!.y, { steps: 6 });
      await page.mouse.up();
      const moved = chart.get(`.gantt-bars-layer [data-task-id="${target!.id}"] .gantt-bar-body`);
      await expect.poll(async () => ((await moved.boundingBox())?.x ?? target!.left) - target!.left).toBeGreaterThan(0);
      await expect(chart.get('.gantt-drag-preview')).toHaveCount(0);
      await shot(page, info, p.name, 'after-drag');
    });

    test('collapses the panel and restores its last width', async ({ chart }) => {
      const toggle = chart.get(SEL.toggle).first();
      test.skip(!(await toggle.count()), 'panel is not collapsible');
      const before = (await chart.box(chart.panel())).width;
      await toggle.click();
      await expect.poll(async () => Math.round((await chart.panel().boundingBox())?.width ?? -1)).toBe(0);
      await toggle.click();
      await expect
        .poll(async () => Math.abs(((await chart.panel().boundingBox())?.width ?? 0) - before))
        .toBeLessThanOrEqual(1);
    });

    test('table view gives the task list the full width and more columns', async ({ chart, page }, info) => {
      const pills = chart.get(SEL.viewPills);
      test.skip(!(await pills.count()), 'no view switch');
      const splitColumns = await chart.get('.gantt-tl-col-header').count();
      await pills.nth(1).click();
      await expect.poll(() => chart.get('.gantt-tl-col-header').count()).toBeGreaterThan(splitColumns);
      // Header cells and the first row's cells share their x positions
      const misaligned = await chart.evalRoot(root => {
        const heads = [...root.querySelectorAll('.gantt-tl-col-header')].map(h => h.getBoundingClientRect());
        const row = [...root.querySelectorAll('.gantt-tl-row')].find(r => r.getBoundingClientRect().height > 0);
        const cells = row ? [...row.querySelectorAll('.gantt-tl-cell')].map(c => c.getBoundingClientRect()) : [];
        return heads.length !== cells.length
          ? -1
          : heads.filter((h, i) => Math.abs(h.left - cells[i].left) > 0.5).length;
      });
      expect(misaligned).toBe(0);
      await expect
        .poll(async () => {
          const [panel, main] = await Promise.all([
            chart.panel().boundingBox(),
            chart.get(SEL.main).first().boundingBox(),
          ]);
          return Math.abs((panel?.width ?? 0) - (main?.width ?? -10));
        })
        .toBeLessThanOrEqual(2);
      await shot(page, info, p.name, 'table');
      await pills.nth(0).click();
    });
  });
}

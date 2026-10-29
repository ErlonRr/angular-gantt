// The three resource cases of the gallery (Gantry 2 phase 14) in all five frameworks, one
// interaction each through the page's own markup, so the options and the `resources` reach the chart in
// every wrapper:
// - `resource-load`: the chart opens in the resource view (load paths, no bars) and its status is the
//   shared module's `overloadSummary`; the Rows control switches to the tasks (bars, no load paths) and
//   back, the toolbar's Rows button moves the control too; "Highlight over-allocation" and "Show
//   unassigned" take the hatched part and the Unassigned row away;
// - `resource-panel`: typing `Ana, Bo 50%` in a task's Resources cell (the plan, on top) changes the
//   workload chart below it and the status line; undo restores both;
// - `resource-capacity`: Ana's capacity 50 → 100 % removes her over-allocation (status and `over` path),
//   and "Working calendar" off puts the weekend's load back.
// The expected texts come from the cases' shared modules (the same functions the pages call) with the
// frozen clock of the fixtures. Pages: the Angular site (`/examples/<id>`) and each Vite app
// (`examples.html#/<id>`, `#/examples/<id>`), as in gallery.spec.ts; no console error (the `pageErrors`
// fixture).
import type { Locator, Page } from '@playwright/test';
import { test, expect, NOW } from './fixtures';
import { TARGETS } from '../playwright.config';
import {
  GALLERY_FRAMEWORKS,
  galleryCase,
  type CaseId,
  type GalleryFramework,
} from '../apps/demo-kit/src/gallery/catalog';
import {
  RESOURCE_LOAD_INITIAL,
  loadOptions,
  loadResources,
  loadTasks,
  overloadSummary,
} from '../apps/demo-kit/src/gallery/cases/resource-load';
import {
  PANEL_INITIAL,
  panelBottomOptions,
  panelResources,
  panelTasks,
} from '../apps/demo-kit/src/gallery/cases/resource-panel';
import {
  CAPACITIES,
  CAPACITY_INITIAL,
  capacityOptions,
  capacityResources,
  capacitySummary,
  capacityTasks,
  type CapacityState,
} from '../apps/demo-kit/src/gallery/cases/resource-capacity';

function caseUrl(fw: GalleryFramework, id: CaseId): string {
  const origin = `http://localhost:${TARGETS[fw].port}`;
  if (fw === 'angular') return `${origin}/examples/${id}`;
  if (fw === 'vanilla') return `${origin}/examples.html#/${id}`;
  return `${origin}/#/examples/${id}`;
}

/** Open the case and wait until its first chart paints load rows; returns the charts. */
async function openCase(page: Page, fw: GalleryFramework, id: CaseId, charts = 1): Promise<Locator> {
  await page.goto(caseUrl(fw, id));
  await expect(page.locator('h1')).toHaveText(galleryCase(id).title);
  const all = page.locator('.gs-case').locator('gantry, gantry-element');
  await expect(all).toHaveCount(charts);
  await expect(load(all.last(), 'bars').first()).toBeAttached({ timeout: 15_000 });
  return all;
}

/** `path.gantt-load-<kind>` of a chart, optionally in the group of `rowId`. */
const load = (chart: Locator, kind: 'bars' | 'over' | 'hatch' | 'cap', rowId?: string): Locator =>
  chart.locator(`g.gantt-load ${rowId ? `g.gantt-load-row[data-row-id="${rowId}"] ` : ''}path.gantt-load-${kind}`);

/** The task bars of a chart. */
const taskBars = (chart: Locator): Locator => chart.locator('.gantt-bars-layer > [data-task-id]');

/** The cell of `id` in `column`. */
const cell = (chart: Locator, id: string, column: string): Locator =>
  chart.locator(`.gantt-tl-cell[data-focus-key="cell:${id}:${column}"]`);

/** `data-focus-key` of the element focused inside `chart` (its shadow root, or Angular's light DOM). */
function focusKey(chart: Locator): Promise<string | null> {
  return chart.evaluate(host => {
    const active = host.shadowRoot ? host.shadowRoot.activeElement : document.activeElement;
    if (!active || (!host.shadowRoot && !host.contains(active))) return null;
    return active.getAttribute('data-focus-key');
  });
}

/** The page's status line (`p.gs-case-status`). */
const statusOf = (page: Page): Locator => page.locator('.gs-case p.gs-case-status');

/** A button of the segmented control `control` of `caseId` (`<case>-<control>`), by its label. */
const choice = (page: Page, caseId: string, control: string, label: string): Locator =>
  page
    .locator(`.gs-case [aria-labelledby="${caseId}-${control}-label"] button`)
    .filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) });

/** `d` of the bars of `rowId`. */
const barsPath = (chart: Locator, rowId: string): Promise<string | null> =>
  load(chart, 'bars', rowId).first().getAttribute('d');

for (const fw of GALLERY_FRAMEWORKS) {
  test.describe(`gallery resource cases · ${fw}`, () => {
    test('resource-load: the load rows, the Rows control and the toolbar button, the hatch and the Unassigned row', async ({
      page,
    }) => {
      const charts = await openCase(page, fw, 'resource-load');
      const chart = charts.first();
      const tasks = loadTasks(NOW);
      const resources = loadResources();
      const summary = overloadSummary(tasks, resources, loadOptions(RESOURCE_LOAD_INITIAL, NOW));
      expect(summary).toContain('over capacity'); // the data is built so some people are over
      await expect(statusOf(page)).toHaveText(summary);
      await expect(taskBars(chart)).toHaveCount(0);
      await expect(chart.locator('g.gantt-load-row[data-row-id="unassigned"]')).toHaveCount(1);
      await expect(load(chart, 'over').first()).toBeAttached();
      await expect(load(chart, 'hatch').first()).toBeAttached();

      // Highlight off: plain load; on again
      const highlight = page.getByRole('switch', { name: 'Highlight over-allocation' });
      await highlight.uncheck();
      await expect(load(chart, 'over')).toHaveCount(0);
      await expect(load(chart, 'hatch')).toHaveCount(0);
      await highlight.check();
      await expect(load(chart, 'over').first()).toBeAttached();

      // Show unassigned off: its row goes
      const unassigned = page.getByRole('switch', { name: 'Show unassigned' });
      await unassigned.uncheck();
      await expect(chart.locator('g.gantt-load-row[data-row-id="unassigned"]')).toHaveCount(0);
      await unassigned.check();
      await expect(chart.locator('g.gantt-load-row[data-row-id="unassigned"]')).toHaveCount(1);

      // Rows → Tasks: the plan's bars, no load; the status (the load of the same data) is the same
      await choice(page, 'resource-load', 'rows', 'Tasks').click();
      await expect(taskBars(chart)).toHaveCount(tasks.length);
      await expect(chart.locator('g.gantt-load')).toHaveCount(0);
      await expect(statusOf(page)).toHaveText(summary);

      // The toolbar's button brings the resources back, and the Rows control follows
      const toolbar = chart.getByRole('button', { name: 'Show resources' });
      await expect(toolbar).toHaveAttribute('aria-pressed', 'false');
      await toolbar.click();
      await expect(toolbar).toHaveAttribute('aria-pressed', 'true');
      await expect(taskBars(chart)).toHaveCount(0);
      await expect(load(chart, 'bars').first()).toBeAttached();
      await expect(choice(page, 'resource-load', 'rows', 'Resources')).toHaveAttribute('aria-pressed', 'true');
    });

    test('resource-panel: a new assignment in the plan moves the workload below it; undo restores it', async ({
      page,
    }) => {
      const charts = await openCase(page, fw, 'resource-panel', 2);
      const plan = charts.first();
      const workload = charts.last();
      const resources = panelResources();
      const before = panelTasks(NOW);
      const options = panelBottomOptions(PANEL_INITIAL, NOW);
      const initial = overloadSummary(before, resources, options);
      const edited = overloadSummary(
        before.map(t => (t.id === 'wireframes' ? { ...t, resources: ['ana', { resourceId: 'bo', units: 50 }] } : t)),
        resources,
        options,
      );
      expect(edited).not.toBe(initial); // the edit is worth making
      await expect(statusOf(page)).toHaveText(initial);
      await expect(taskBars(plan)).not.toHaveCount(0);
      await expect(taskBars(workload)).toHaveCount(0);
      const overBefore = await load(workload, 'over').count();
      const anaBefore = await barsPath(workload, 'res:ana');

      const field = cell(plan, 'wireframes', 'resources');
      await field.focus();
      await page.keyboard.press('F2');
      await expect.poll(() => focusKey(plan)).toBe('editor:wireframes:resources');
      await page.keyboard.press('Control+a');
      await page.keyboard.type('Ana, Bo 50%');
      await page.keyboard.press('Enter');
      await expect(field).toHaveText('Ana, Bo 50%');
      await expect(statusOf(page)).toHaveText(edited);
      await expect.poll(() => barsPath(workload, 'res:ana')).not.toBe(anaBefore);
      await expect.poll(() => load(workload, 'over').count()).not.toBe(overBefore);

      // Undo: the cell, the status and the workload are back
      await expect.poll(() => focusKey(plan)).toBe('cell:wireframes:resources');
      await page.keyboard.press('Control+z');
      await expect(field).toHaveText('Bo');
      await expect(statusOf(page)).toHaveText(initial);
      await expect.poll(() => barsPath(workload, 'res:ana')).toBe(anaBefore);
      await expect(load(workload, 'over')).toHaveCount(overBefore);
    });

    test("resource-capacity: Ana's capacity and the working calendar move the over-allocation", async ({ page }) => {
      const charts = await openCase(page, fw, 'resource-capacity');
      const chart = charts.first();
      const tasks = capacityTasks(NOW);
      const summaryOf = (state: CapacityState) =>
        capacitySummary(tasks, capacityResources(state), capacityOptions(state, NOW));
      const initial = summaryOf(CAPACITY_INITIAL);
      const full = summaryOf({ ...CAPACITY_INITIAL, anaCapacity: 100 });
      const noCalendar = summaryOf({ ...CAPACITY_INITIAL, calendar: false });
      // The data is built so each control changes the text
      expect(new Set([initial, full, noCalendar]).size).toBe(3);
      await expect(statusOf(page)).toHaveText(initial);
      await expect(taskBars(chart)).toHaveCount(0);
      await expect(load(chart, 'over', 'res:ana')).toHaveCount(1);
      const withCalendar = await barsPath(chart, 'res:ana');
      const line50 = await load(chart, 'cap', 'res:ana').first().getAttribute('d');

      // 100 %: the capacity line moves up, her over-allocation is gone
      const capacity = (value: number) =>
        choice(page, 'resource-capacity', 'capacity', CAPACITIES.find(c => c.value === value)!.label);
      await capacity(100).click();
      await expect(statusOf(page)).toHaveText(full);
      await expect(load(chart, 'over', 'res:ana')).toHaveCount(0);
      await expect(load(chart, 'hatch', 'res:ana')).toHaveCount(0);
      expect(await load(chart, 'cap', 'res:ana').first().getAttribute('d')).not.toBe(line50);
      await capacity(50).click();
      await expect(statusOf(page)).toHaveText(initial);
      await expect(load(chart, 'over', 'res:ana')).toHaveCount(1);

      // Working calendar off: the weekend and the holiday carry load again
      const calendar = page.getByRole('switch', { name: 'Working calendar' });
      await calendar.uncheck();
      await expect(statusOf(page)).toHaveText(noCalendar);
      await expect.poll(() => barsPath(chart, 'res:ana')).not.toBe(withCalendar);
      await calendar.check();
      await expect(statusOf(page)).toHaveText(initial);
      await expect.poll(() => barsPath(chart, 'res:ana')).toBe(withCalendar);
    });
  });
}

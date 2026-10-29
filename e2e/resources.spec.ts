// The resource view (Gantry 2 phase 14) in both bindings, with the same test body for the Web Component
// (`<gantry-element>` in the playground page) and Angular (the showcase's `/fixture` route), through the
// `Gantt` harness of ./fixtures. The week of Monday 2026-10-12 (Day view: 48 px a day), four people
// (Ana 100 %, Bo 50 %, and Cy and Di in the Eng team), five tasks:
//   Design  Mon 12 – Wed 14  Ana          Test   Tue 13 – Wed 14  Bo, 100 % of a person (Bo has 50 %)
//   Build   Thu 15 – Sun 18  Ana          API    Mon 12 – Thu 15  Cy and Di      Docs Fri 16 – Sun 18  nobody
// so Bo is over capacity on Tue 13 and Wed 14 and nobody else is.
// - `rows` unset: the tasks, no load layer, no Rows button, whatever `resources` holds;
// - `rows: 'resources'`: a row per person, per team and Unassigned, a `g.gantt-load` with one group per row
//   (bars, the part over capacity with its hatch, the dashed capacity line), no bars, accessible row names;
// - over-allocation off and the Unassigned row off, collapsing the team unmounts its members' paths;
// - a working calendar leaves the weekend without load;
// - hovering a day opens the tooltip with that day's load and the tasks adding up to it, Esc closes it;
// - the Rows button flips the mode (`aria-pressed`), `state-change` and `getState()` carry `rows`,
//   `setState` restores it; the table view lists the Capacity and Peak load columns;
// - the Resources cell: `Ana, Bo 50%` is one change that undo reverts, an unknown name is refused;
// - exports: the SVG has the load paths and the hatch, the CSV the resource columns;
// - both bindings paint the same `d` strings, texts and exports after the same gestures.
// Each test opens a fresh chart.
import type { Locator, Page } from '@playwright/test';
import { test, expect, BINDINGS, Gantt, type Binding, type Chart } from './fixtures';
import { day, type FixtureResource, type FixtureTask } from './paint-fixture';

/** px per day in the Day view */
const PX = 48;
const BOX = { width: 1400, height: 700 };

/** `month`/`dom` of 2026 as the fixture's local ISO date-time. */
const at = (month: number, dom: number): string =>
  day(Math.round((Date.UTC(2026, month - 1, dom) - Date.UTC(2026, 9, 14)) / 86_400_000));

const RESOURCES: FixtureResource[] = [
  { id: 'ana', name: 'Ana' },
  { id: 'bo', name: 'Bo', capacity: 50 },
  { id: 'cy', name: 'Cy', group: 'Eng' },
  { id: 'di', name: 'Di', group: 'Eng' },
];

const TASKS: FixtureTask[] = [
  { id: 'design', name: 'Design', start: at(10, 12), end: at(10, 15), resources: ['ana'] },
  { id: 'build', name: 'Build', start: at(10, 15), end: at(10, 19), resources: ['ana'] },
  { id: 'test', name: 'Test', start: at(10, 13), end: at(10, 15), resources: [{ resourceId: 'bo', units: 100 }] },
  { id: 'api', name: 'API', start: at(10, 12), end: at(10, 17), resources: ['cy', 'di'] },
  { id: 'docs', name: 'Docs', start: at(10, 16), end: at(10, 19) },
];

/** The tasks, no resource view. */
const TASKS_OPTIONS: Record<string, unknown> = { viewMode: 'Day', initialScroll: false, panel: { width: 640 } };
/** The resource view with the toolbar's Rows button. */
const OPTIONS: Record<string, unknown> = {
  ...TASKS_OPTIONS,
  rows: 'resources',
  toolbar: { rowsToggle: true },
};

/** The rows of the resource view, in order (`data-focus-key="row:<id>"`). */
const RESOURCE_ROWS = ['res:ana', 'res:bo', 'team:Eng', 'res:cy', 'res:di', 'unassigned'];
const TASK_ROWS = ['design', 'api', 'test', 'build', 'docs'];

const LABELS: Record<string, string> = {
  'res:ana': 'Ana, capacity 100%, peak load 100%, never over capacity',
  'res:bo': 'Bo, capacity 50%, peak load 100%, 2 days over capacity',
  'team:Eng': 'Eng, capacity 200%, peak load 200%, never over capacity',
  'res:cy': 'Cy, capacity 100%, peak load 100%, never over capacity',
  'res:di': 'Di, capacity 100%, peak load 100%, never over capacity',
};

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Open the chart on `options` (default: the resource view) and return the harness. */
async function openChart(
  chart: Chart,
  binding: Binding,
  options: Record<string, unknown> = OPTIONS,
  extra: { tasks?: FixtureTask[] } = {},
): Promise<Gantt> {
  const g = new Gantt(chart, binding);
  await g.open({ tasks: extra.tasks ?? TASKS, resources: RESOURCES, options, box: BOX, stateEvents: true });
  return g;
}

/** The ids of the task list's rows, in order (`row:<id>`). */
const rowIds = (g: Gantt): Promise<string[]> =>
  g.chart.evalRoot(root =>
    [...root.querySelectorAll('.gantt-tl-row')].map(r => (r.getAttribute('data-focus-key') ?? '').replace(/^row:/, '')),
  );

/** The text of the cell of `id` in `column`. */
const cellText = async (g: Gantt, id: string, column: string): Promise<string> =>
  ((await cell(g, id, column).textContent()) ?? '').trim();

/** The cell of `id` in `column` (`data-focus-key="cell:<id>:<column>"`). */
const cell = (g: Gantt, id: string, column: string): Locator =>
  g.chart.get(`.gantt-tl-cell[data-focus-key="cell:${id}:${column}"]`);

/** The ids of the load rows painted, in order. */
const loadRowIds = (g: Gantt): Promise<string[]> =>
  g.chart.evalRoot(root =>
    [...root.querySelectorAll('g.gantt-load-row')].map(r => r.getAttribute('data-row-id') ?? ''),
  );

/** How many `path.<kind>` the load layer holds, optionally in the group of `rowId`. */
const paths = (g: Gantt, kind: 'bars' | 'over' | 'hatch' | 'cap', rowId?: string): Locator =>
  g.chart.get(`g.gantt-load ${rowId ? `g.gantt-load-row[data-row-id="${rowId}"] ` : ''}path.gantt-load-${kind}`);

/** The `d` of every path of the load layer, by row and kind. */
const loadPaths = (g: Gantt): Promise<Record<string, string>> =>
  g.chart.evalRoot(root => {
    const out: Record<string, string> = {};
    for (const row of root.querySelectorAll('g.gantt-load-row')) {
      for (const p of row.querySelectorAll('path')) {
        out[`${row.getAttribute('data-row-id')}/${p.getAttribute('class')}`] = p.getAttribute('d') ?? '';
      }
    }
    return out;
  });

/** The accessible name of every row of the task list (`aria-label`), by row id. */
const rowLabels = (g: Gantt): Promise<Record<string, string | null>> =>
  g.chart.evalRoot(root =>
    Object.fromEntries(
      [...root.querySelectorAll('.gantt-tl-row')].map(r => [
        (r.getAttribute('data-focus-key') ?? '').replace(/^row:/, ''),
        r.getAttribute('aria-label'),
      ]),
    ),
  );

/** The Rows button of the toolbar. */
const rowsButton = (g: Gantt): Locator => g.chart.get('.gantt-toolbar button[data-focus-key="rows"]');

/** The open tooltip's title and rows, `label → value`, or `null` while it is hidden. */
function tooltip(chart: Chart): Promise<{ title: string; rows: [string, string][] } | null> {
  return chart.evalRoot(root => {
    const t = root.querySelector('.gantt-tooltip');
    if (!t || getComputedStyle(t).display === 'none') return null;
    return {
      title: t.querySelector('.gantt-tooltip-title')?.textContent?.trim() ?? '',
      rows: [...t.querySelectorAll('dl dt')].map(
        dt => [dt.textContent?.trim() ?? '', dt.nextElementSibling?.textContent?.trim() ?? ''] as [string, string],
      ),
    };
  });
}

/** Move the pointer `dx` px into `box` (client px), at its vertical middle. */
async function hover(page: Page, box: Box, dx: number): Promise<void> {
  await page.mouse.move(box.x + dx, box.y + box.height / 2);
}

/** The latest state `state-change` carried. */
async function lastState(g: Gantt): Promise<{ rows?: string } | undefined> {
  return (await g.events('state-change')).at(-1)?.detail;
}

/** The assignments of `id` in the latest task list a `tasks-change` carried. */
async function assignmentsOf(g: Gantt, id: string): Promise<unknown> {
  const changes = (await g.events('tasks-change')).map(
    e => e.detail as { tasks: { id: string; resources?: unknown }[] },
  );
  return changes.at(-1)?.tasks.find(t => t.id === id)?.resources;
}

/** Focus a cell, press F2 and wait until its editor has focus. */
async function editCell(g: Gantt, id: string, column: string): Promise<void> {
  await cell(g, id, column).focus();
  await g.page.keyboard.press('F2');
  await expect.poll(() => g.chart.focusedKey()).toBe(`editor:${id}:${column}`);
}

/** `exportSvg()` and `exportCsv()` as strings. */
async function exports(g: Gantt): Promise<{ svg: string; csv: string }> {
  return { svg: await g.callAsync<string>('exportSvg'), csv: await g.callAsync<string>('exportCsv') };
}

for (const binding of BINDINGS) {
  test.describe(`resources · ${binding}`, () => {
    test('rows unset: the tasks, no load layer and no Rows button, whatever the resources hold', async ({ chart }) => {
      const g = await openChart(chart, binding, TASKS_OPTIONS);
      expect(await rowIds(g)).toEqual(TASK_ROWS);
      await expect(g.chart.get('g.gantt-load')).toHaveCount(0);
      await expect(rowsButton(g)).toHaveCount(0);
      await expect(g.chart.get('.gantt-bars-layer > [data-task-id]')).toHaveCount(TASK_ROWS.length);
      expect(await g.call<{ rows?: string }>('getState')).toMatchObject({ rows: 'tasks' });
      // The Resources cell reads the assignments as text, the resource columns are not on by default
      await g.set({ options: { ...TASKS_OPTIONS, panel: { width: 640, columns: ['name', 'resources'] } } });
      expect(await cellText(g, 'api', 'resources')).toBe('Cy, Di');
      expect(await cellText(g, 'test', 'resources')).toBe('Bo');
      expect(await cellText(g, 'docs', 'resources')).toBe('');
    });

    test('rows: resources: a row per person, team and Unassigned, a load layer, no bars', async ({ chart }) => {
      const g = await openChart(chart, binding);
      expect(await rowIds(g)).toEqual(RESOURCE_ROWS);
      await expect.poll(() => loadRowIds(g)).toEqual(RESOURCE_ROWS);
      // Nothing of the tasks view is drawn: no bar, no arrow
      await expect(g.chart.get('.gantt-bars-layer > [data-task-id]')).toHaveCount(0);
      await expect(g.chart.get('g.gantt-arrow')).toHaveCount(0);
      // The default columns: name, capacity, peak load
      const names = { 'res:ana': 'Ana', 'res:bo': 'Bo', 'team:Eng': 'Eng', 'res:cy': 'Cy', 'res:di': 'Di' };
      for (const [id, name] of Object.entries(names)) {
        await expect(cell(g, id, 'name')).toContainText(name);
      }
      expect(await cellText(g, 'res:ana', 'capacity')).toBe('100%');
      expect(await cellText(g, 'res:bo', 'capacity')).toBe('50%');
      expect(await cellText(g, 'team:Eng', 'capacity')).toBe('200%');
      expect(await cellText(g, 'res:bo', 'load')).toBe('100%');
      expect(await cellText(g, 'team:Eng', 'load')).toBe('200%');
      // The team row is a group; Unassigned has no capacity
      await expect(g.chart.get('.gantt-tl-row[data-focus-key="row:team:Eng"]')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(await cellText(g, 'unassigned', 'capacity')).toBe('');
      expect(await cellText(g, 'unassigned', 'load')).toBe('100%');
      // Every load group draws its bars; each person with a capacity has the dashed line, Unassigned has none
      await expect(paths(g, 'bars')).toHaveCount(RESOURCE_ROWS.length);
      await expect(paths(g, 'cap')).toHaveCount(RESOURCE_ROWS.length - 1);
      await expect(paths(g, 'cap', 'unassigned')).toHaveCount(0);
      // Ana's load is one block, Mon 12 to Sun 18 (7 days), the load of both of her tasks back to back
      const ana = await chart.box(paths(g, 'bars', 'res:ana'));
      expect(ana.width).toBe(7 * PX);
      // The layer is decoration: hidden from the accessibility tree and from the pointer
      await expect(g.chart.get('g.gantt-load')).toHaveAttribute('aria-hidden', 'true');
      await expect(g.chart.get('g.gantt-load')).toHaveAttribute('pointer-events', 'none');
    });

    test('over capacity: Bo only, with the hatch; over-allocation off draws none of it', async ({ chart }) => {
      const g = await openChart(chart, binding);
      await expect(paths(g, 'over')).toHaveCount(1);
      await expect(paths(g, 'over', 'res:bo')).toHaveCount(1);
      await expect(paths(g, 'hatch')).toHaveCount(1);
      await expect(paths(g, 'hatch', 'res:bo')).toHaveCount(1);
      await expect(paths(g, 'over', 'res:ana')).toHaveCount(0);
      // Tue 13 and Wed 14: two days; the part over the line is 50 % of a person
      const over = await chart.box(paths(g, 'over', 'res:bo'));
      expect(over.width).toBe(2 * PX);
      const bars = await chart.box(paths(g, 'bars', 'res:bo'));
      expect(bars.width).toBe(2 * PX);
      expect(over.y + over.height).toBeCloseTo(bars.y, 0);
      // The hatch pattern is only there while some row is over capacity
      await expect(g.chart.get('g.gantt-load pattern')).toHaveCount(1);

      await g.set({ options: { ...OPTIONS, resourceView: { overallocation: false } } });
      await expect(paths(g, 'over')).toHaveCount(0);
      await expect(paths(g, 'hatch')).toHaveCount(0);
      await expect(g.chart.get('g.gantt-load pattern')).toHaveCount(0);
      // The load is the same height, drawn as plain load
      await expect(paths(g, 'bars', 'res:bo')).toHaveCount(1);
      expect((await chart.box(paths(g, 'bars', 'res:bo'))).height).toBeGreaterThan(bars.height);
      // The number is still there, and so is the row name
      expect(await cellText(g, 'res:bo', 'load')).toBe('100%');
      expect((await rowLabels(g))['res:bo']).toBe(LABELS['res:bo']);

      await g.set({ options: OPTIONS });
      await expect(paths(g, 'over')).toHaveCount(1);
    });

    test('the Unassigned row goes with resourceView.unassigned; collapsing the team unmounts its members', async ({
      chart,
      page,
    }) => {
      const g = await openChart(chart, binding);
      await g.set({ options: { ...OPTIONS, resourceView: { unassigned: false } } });
      await expect.poll(() => rowIds(g)).toEqual(RESOURCE_ROWS.filter(id => id !== 'unassigned'));
      await expect.poll(() => loadRowIds(g)).toEqual(RESOURCE_ROWS.filter(id => id !== 'unassigned'));
      await g.set({ options: OPTIONS });
      await expect.poll(() => rowIds(g)).toEqual(RESOURCE_ROWS);

      // ← collapses the team: Cy and Di leave the list and their paths are unmounted, the team's stay
      const team = g.chart.get('.gantt-tl-row[data-focus-key="row:team:Eng"]');
      await team.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(team).toHaveAttribute('aria-expanded', 'false');
      await expect.poll(() => rowIds(g)).toEqual(['res:ana', 'res:bo', 'team:Eng', 'unassigned']);
      await expect.poll(() => loadRowIds(g)).toEqual(['res:ana', 'res:bo', 'team:Eng', 'unassigned']);
      await page.keyboard.press('ArrowRight');
      await expect(team).toHaveAttribute('aria-expanded', 'true');
      await expect.poll(() => loadRowIds(g)).toEqual(RESOURCE_ROWS);
    });

    test('a working calendar leaves the weekend without load', async ({ chart }) => {
      const g = await openChart(chart, binding);
      // Docs (Fri 16 – Sun 18) loads Unassigned for three days; Ana's two tasks run Mon 12 – Sun 18
      const before = await loadPaths(g);
      expect((await chart.box(paths(g, 'bars', 'unassigned'))).width).toBe(3 * PX);
      expect((await chart.box(paths(g, 'bars', 'res:ana'))).width).toBe(7 * PX);

      await g.set({ options: { ...OPTIONS, calendar: true } });
      await expect
        .poll(async () => (await loadPaths(g))['unassigned/gantt-load-bars'])
        .not.toBe(before['unassigned/gantt-load-bars']);
      // Friday only; Ana works Monday to Friday
      expect((await chart.box(paths(g, 'bars', 'unassigned'))).width).toBe(PX);
      expect((await chart.box(paths(g, 'bars', 'res:ana'))).width).toBe(5 * PX);
      // The numbers are the same peaks
      expect(await cellText(g, 'res:ana', 'load')).toBe('100%');
      expect(await cellText(g, 'res:bo', 'load')).toBe('100%');

      await g.set({ options: OPTIONS });
      await expect
        .poll(async () => (await loadPaths(g))['unassigned/gantt-load-bars'])
        .toBe(before['unassigned/gantt-load-bars']);
    });

    test('hovering a day opens its tooltip: the load, the capacity, the part over it and the tasks that add up to it', async ({
      chart,
      page,
    }) => {
      const g = await openChart(chart, binding);
      expect(await tooltip(chart)).toBeNull();
      // Bo's load starts on Tue 13: the middle of that first day
      const bars = await chart.box(paths(g, 'bars', 'res:bo'));
      await hover(page, bars, PX / 2);
      await expect
        .poll(() => tooltip(chart))
        .toEqual({
          title: 'Bo',
          rows: [
            ['Oct 13, 2026', ''],
            ['Load', '100%'],
            ['Capacity', '50%'],
            ['Over capacity', '50%'],
            ['Test', '100%'],
          ],
        });
      // The second day of the same block, then a day with no load at all
      await hover(page, bars, PX * 1.5);
      await expect.poll(async () => (await tooltip(chart))?.rows[0]).toEqual(['Oct 14, 2026', '']);
      await page.keyboard.press('Escape');
      await expect.poll(() => tooltip(chart)).toBeNull();

      // Ana on Mon 12: one task, never over capacity
      const ana = await chart.box(paths(g, 'bars', 'res:ana'));
      await hover(page, ana, PX / 2);
      await expect
        .poll(() => tooltip(chart))
        .toEqual({
          title: 'Ana',
          rows: [
            ['Oct 12, 2026', ''],
            ['Load', '100%'],
            ['Capacity', '100%'],
            ['Design', '100%'],
          ],
        });
    });

    test('resource rows are named in full; the rows of the tasks view have no such name', async ({ chart }) => {
      const g = await openChart(chart, binding);
      expect(await rowLabels(g)).toEqual({ ...LABELS, unassigned: 'Unassigned, Load 100%' });
      await g.set({ options: TASKS_OPTIONS });
      await expect.poll(() => rowIds(g)).toEqual(TASK_ROWS);
      expect(Object.values(await rowLabels(g)).every(l => l === null)).toBe(true);
    });

    test('the Rows button flips the mode; state-change and getState() carry it; setState restores it', async ({
      chart,
    }) => {
      const g = await openChart(chart, binding);
      const button = rowsButton(g);
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(button).toHaveAccessibleName('Show resources');
      expect(await g.call<{ rows?: string }>('getState')).toMatchObject({ rows: 'resources' });

      await g.clearEvents();
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'false');
      await expect.poll(() => rowIds(g)).toEqual(TASK_ROWS);
      await expect(g.chart.get('g.gantt-load')).toHaveCount(0);
      await expect(g.chart.get('.gantt-bars-layer > [data-task-id]')).toHaveCount(TASK_ROWS.length);
      // Debounced: one state-change, and it carries the mode
      await expect.poll(async () => (await lastState(g))?.rows).toBe('tasks');
      expect(await g.call<{ rows?: string }>('getState')).toMatchObject({ rows: 'tasks' });

      // setState brings the resource view back
      const state = await g.call<Record<string, unknown>>('getState');
      await g.call('setState', { ...state, rows: 'resources' });
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => rowIds(g)).toEqual(RESOURCE_ROWS);
      await expect(g.chart.get('g.gantt-load')).toHaveCount(1);
      await expect(g.chart.get('.gantt-bars-layer > [data-task-id]')).toHaveCount(0);
      expect(await g.call<{ rows?: string }>('getState')).toMatchObject({ rows: 'resources' });
    });

    test('the table view lists the Capacity and Peak load columns of every row', async ({ chart }) => {
      const g = await openChart(chart, binding, { ...OPTIONS, view: 'table' });
      await expect(cell(g, 'res:bo', 'capacity')).toHaveText('50%');
      await expect(cell(g, 'res:bo', 'load')).toHaveText('100%');
      await expect(cell(g, 'team:Eng', 'load')).toHaveText('200%');
      await expect(cell(g, 'unassigned', 'load')).toHaveText('100%');
      const headers = await chart.evalRoot(root => root.querySelector('.gantt-tl-col-headers')?.textContent ?? '');
      expect(headers).toContain('Capacity');
      expect(headers).toContain('Peak load');
    });

    test('the Resources cell: Ana, Bo 50% is one change that undo reverts; an unknown name is refused', async ({
      chart,
      page,
    }) => {
      const g = await openChart(chart, binding, {
        ...TASKS_OPTIONS,
        editing: true,
        panel: { width: 640, columns: ['name', 'resources'] },
      });
      await expect(cell(g, 'build', 'resources')).toHaveText('Ana');
      await editCell(g, 'build', 'resources');
      await page.keyboard.type('Ana, Bo 50%');
      await page.keyboard.press('Enter');
      await expect(cell(g, 'build', 'resources')).toHaveText('Ana, Bo 50%');
      expect((await g.events('before-change'))[0].detail).toMatchObject({
        change: { source: 'cell', column: 'resources', updates: [{ taskId: 'build' }] },
      });
      expect((await g.events('task-updated')).map(e => (e.detail as { fields: string[] }).fields)).toEqual([
        ['resources'],
      ]);
      expect(await g.events('tasks-change')).toHaveLength(1);
      expect(await assignmentsOf(g, 'build')).toEqual(['ana', { resourceId: 'bo', units: 50 }]);

      // Undo reverts it: the cell and the model
      await cell(g, 'build', 'resources').focus();
      await page.keyboard.press('Control+z');
      await expect(cell(g, 'build', 'resources')).toHaveText('Ana');
      await expect.poll(async () => (await g.events('tasks-change')).length).toBe(2);
      expect(await assignmentsOf(g, 'build')).toEqual(['ana']);

      // An unknown name keeps the editor open with its message and changes nothing
      await editCell(g, 'docs', 'resources');
      await page.keyboard.type('Zed');
      await page.keyboard.press('Enter');
      const field = g.chart.get('.gantt-tl-cell--editing .gantt-tl-editor');
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(g.chart.get('.gantt-tl-editor-error')).toContainText('Zed');
      await page.keyboard.press('Escape');
      await expect(field).toHaveCount(0);
      await expect(cell(g, 'docs', 'resources')).toHaveText('');
      expect(await g.events('tasks-change')).toHaveLength(2);
    });

    test('exports: the SVG draws the load, the over part and the hatch; the CSV lists the resource columns', async ({
      chart,
    }) => {
      const g = await openChart(chart, binding);
      const { svg, csv } = await exports(g);
      expect(svg).toContain('gantt-load-bars');
      expect(svg).toContain('gantt-load-over');
      expect(svg).toContain('gantt-load-hatch');
      expect(svg).toContain('gantt-load-cap');
      expect(svg).toContain('<pattern');
      expect(svg).not.toContain('var(');
      // One hatch pattern, and the hatched path points at it
      const id = /<pattern id="([^"]+)"/.exec(svg)?.[1];
      expect(id).toBeTruthy();
      expect(svg).toContain(`url(#${id})`);
      expect(csv.split(/\r?\n/).filter(Boolean)).toEqual([
        'Task Name,Capacity,Peak load',
        'Ana,100,100',
        'Bo,50,100',
        'Eng,200,200',
        'Cy,100,100',
        'Di,100,100',
        'Unassigned,,100',
      ]);
    });
  });
}

// ── Both bindings, the same gestures ──────────────────────────────────────────────────────────────

/** What one binding drew and exported in the parity test. */
interface Run {
  rows: string[];
  labels: Record<string, string | null>;
  paths: Record<string, string>;
  tooltip: Awaited<ReturnType<typeof tooltip>>;
  calendarPaths: Record<string, string>;
  plainPaths: Record<string, string>;
  csv: string;
  svg: string;
}

test('both bindings draw the same load, say the same texts and export the same files', async ({ chart, page }) => {
  const runs: Run[] = [];
  for (const binding of BINDINGS) {
    const g = await openChart(chart, binding);
    const rows = await rowIds(g);
    const labels = await rowLabels(g);
    const drawn = await loadPaths(g);
    const bars = await chart.box(paths(g, 'bars', 'res:bo'));
    await hover(page, bars, PX / 2);
    await expect.poll(() => tooltip(chart)).not.toBeNull();
    const shown = await tooltip(chart);
    await page.keyboard.press('Escape');
    await g.set({ options: { ...OPTIONS, calendar: true } });
    await expect
      .poll(async () => (await loadPaths(g))['unassigned/gantt-load-bars'])
      .not.toBe(drawn['unassigned/gantt-load-bars']);
    const calendarPaths = await loadPaths(g);
    await g.set({ options: { ...OPTIONS, resourceView: { overallocation: false, unassigned: false } } });
    await expect.poll(() => paths(g, 'over').count()).toBe(0);
    const plainPaths = await loadPaths(g);
    await g.set({ options: OPTIONS });
    await expect.poll(() => paths(g, 'over').count()).toBe(1);
    const { svg, csv } = await exports(g);
    runs.push({
      rows,
      labels,
      paths: drawn,
      tooltip: shown,
      calendarPaths,
      plainPaths,
      csv,
      // The two bindings number their patterns on their own: compare the drawing, not the id
      svg: svg.replace(/gantry-export-\d+/g, 'gantry-export-N'),
    });
  }
  const [vanilla, angular] = runs;
  expect(angular).toEqual(vanilla);
});

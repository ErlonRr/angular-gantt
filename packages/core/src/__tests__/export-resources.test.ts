// ─────────────────────────────────────────────────────────────
//  Tests — the resource view in the exports (Phase 14 step 2.2, D17):
//  `createExportSource({ resources, rows })`, the model's load rows
//  (`ExportTimeline.load`), the SVG (three paths per row, the over-
//  capacity hatch pattern, no bars or arrows), print pages, and the
//  CSV values of the Resources, Capacity and Peak load columns. With
//  `rows: 'tasks'` every export is the one it was before (D18).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { exportChartCsv, csvCellValue } from '../export/csv';
import { buildExportModel } from '../export/model';
import { exportChartPages } from '../export/paginate';
import { exportChartSvg } from '../export/svg';
import { exportTimeline, createExportSource, type GanttHeadlessInput } from '../export/source';
import { resolveExportCall } from '../export/files';
import { sanitizeSvgMarkup } from '../export/sanitize';
import { buildColumnContext } from '../render/columns';
import { dateReadingOf, resolveConfig } from '../render/config';
import { indexResources } from '../resources/model';
import type { ColumnDef, GanttFlatRow, GanttOptions, GanttResource, GanttTask } from '../types';

const d = (day: number, month = 9) => new Date(2026, month, day);
const NOW = new Date(2026, 9, 14, 10, 0);

const RESOURCES: GanttResource[] = [
  { id: 'ana', name: 'Ana', capacity: 100 },
  { id: 'bo', name: 'Bo', capacity: 50, color: '#0EA5E9' },
  { id: 'cy', name: 'Cy', group: 'Eng' },
  { id: 'di', name: 'Di', group: 'Eng' },
  { id: 'ed', name: 'Ed', capacity: 200 },
];

// Ana is double-booked on 14–15 Oct, Bo works over her half-time capacity on 19–22 Oct, Ed's task crosses
// the US daylight-saving change (1 Nov), Review has nobody and a milestone carries no load
const TASKS: GanttTask[] = [
  { id: 't1', name: 'Design', start: d(12), end: d(16), resources: ['ana'] },
  {
    id: 't2',
    name: 'Build',
    start: d(14),
    end: d(22),
    resources: [
      { resourceId: 'ana', units: 100 },
      { resourceId: 'bo', units: 50 },
    ],
  },
  { id: 't3', name: 'Test', start: d(19), end: d(23), resources: [{ resourceId: 'bo', units: 100 }] },
  { id: 't4', name: 'API', start: d(13), end: d(21), resources: ['cy', 'di'] },
  { id: 't5', name: 'Docs', start: d(20), end: d(4, 10), resources: [{ resourceId: 'ed', units: 150 }] },
  { id: 't6', name: 'Review', start: d(26), end: d(28), resources: [] },
  { id: 't7', name: 'Launch', start: d(15), end: d(15), resources: ['ana'] },
];

/** The rows of the resource view, in order. */
const ROW_IDS = ['res:ana', 'res:bo', 'team:Eng', 'res:cy', 'res:di', 'res:ed', 'unassigned'];

function sourceOf(input: Partial<GanttHeadlessInput> = {}, options: GanttOptions = {}) {
  return createExportSource({
    tasks: TASKS,
    resources: RESOURCES,
    now: NOW,
    panelWidth: 300,
    options: { viewMode: 'Day', locale: 'en-US', rows: 'resources', ...options },
    ...input,
  });
}

const modelOf = (source: ReturnType<typeof sourceOf>) =>
  buildExportModel(source, resolveExportCall(source.config, 'svg'));
const ids = (svg: string) => [...svg.matchAll(/\sid="([^"]*)"/g)].map(m => m[1]);
const count = (text: string, part: string) => text.split(part).length - 1;
const lines = (csv: string) => csv.split('\r\n');

describe('createExportSource — the resource view', () => {
  it('projects the resources into the shown rows and keeps the utilization they came from', () => {
    const s = sourceOf();
    expect(s.rows.map(r => r.task.id)).toEqual(ROW_IDS);
    expect(s.tasks.map(t => t.id)).toEqual(ROW_IDS);
    expect(s.utilization?.rows.size).toBe(ROW_IDS.length);
    expect([...(s.utilization?.rows.keys() ?? [])].sort()).toEqual([...ROW_IDS].sort());
    // The row height is the resource row's (1.5 × 36), no critical path, no rollup
    expect(s.config.rowHeight).toBe(54);
    expect(s.critical.size).toBe(0);
    expect(s.columnCtx.resources?.list.map(r => r.id)).toEqual(RESOURCES.map(r => r.id));
    expect(s.columnCtx.rows).toBe('resources');
  });

  it('collapses a team: its members are not shown rows', () => {
    const s = sourceOf({ collapsedIds: ['team:Eng'] });
    expect(s.rows.map(r => r.task.id)).toEqual(['res:ana', 'res:bo', 'team:Eng', 'res:ed', 'unassigned']);
    expect(s.allRows.map(r => r.task.id)).toEqual(ROW_IDS);
  });

  it('takes `rows` from the input over the options, and leaves the Unassigned row out on request', () => {
    expect(sourceOf({ rows: 'tasks' }).rows.map(r => r.task.id)).toEqual(
      sourceOf({}, { rows: 'tasks' }).rows.map(r => r.task.id),
    );
    expect(sourceOf({ rows: 'resources' }, { rows: 'tasks' }).rows.map(r => r.task.id)).toEqual(ROW_IDS);
    const s = sourceOf({}, { resourceView: { unassigned: false } });
    expect(s.rows.map(r => r.task.id)).not.toContain('unassigned');
  });

  it('is the tasks chart as it was in tasks mode, resources or not (D18)', () => {
    const plain = createExportSource({
      tasks: TASKS,
      now: NOW,
      panelWidth: 300,
      options: { viewMode: 'Day', locale: 'en-US' },
    });
    const withResources = sourceOf({}, { rows: 'tasks' });
    expect(withResources.utilization).toBeNull();
    expect(plain.utilization).toBeNull();
    expect(withResources.rows.map(r => r.task.id)).toEqual(plain.rows.map(r => r.task.id));
    expect(exportChartSvg(withResources, { idPrefix: 'x' })).toBe(exportChartSvg(plain, { idPrefix: 'x' }));
    expect(exportChartCsv(withResources, { columns: 'visible' })).toBe(exportChartCsv(plain, { columns: 'visible' }));
    expect(exportChartSvg(plain, { idPrefix: 'x' })).not.toContain('gantt-load');
    expect(modelOf(plain).timeline?.load).toEqual([]);
  });
});

describe('buildExportModel — the load rows', () => {
  it('has one load per shown row, aligned with the rows, and no bars or arrows', () => {
    const s = sourceOf();
    const m = modelOf(s);
    const tl = m.timeline!;
    expect(m.rows.map(r => r.id)).toEqual(ROW_IDS);
    expect(tl.load).toHaveLength(ROW_IDS.length);
    expect(tl.load!.every(l => l !== null)).toBe(true);
    expect(tl.bars).toEqual([]);
    expect(tl.arrows).toEqual([]);
    expect(m.bodyHeight).toBe(ROW_IDS.length * 54);
  });

  it('draws the load up to the capacity, the part above it, and the capacity line', () => {
    const tl = modelOf(sourceOf()).timeline!;
    const load = (id: string) => tl.load![ROW_IDS.indexOf(id)]!;
    // Ana and Bo are over capacity: an over path and its hatch; the others are not
    expect(ROW_IDS.filter(id => load(id).over !== '' && load(id).hatch)).toEqual(['res:ana', 'res:bo']);
    expect(ROW_IDS.filter(id => load(id).over === '' && !load(id).hatch)).toEqual([
      'team:Eng',
      'res:cy',
      'res:di',
      'res:ed',
      'unassigned',
    ]);
    // Every row with a capacity has its line; the Unassigned row has none
    expect(load('unassigned').cap).toBeNull();
    expect(ROW_IDS.filter(id => load(id).cap === null)).toEqual(['unassigned']);
    expect(load('res:ana').cap).toMatch(/^M\S+ \S+H\S+$/);
    // Paints are concrete: the resource's colour, else the bar colour; the over colour and the line
    const theme = modelOf(sourceOf()).theme;
    expect(load('res:bo').barsFill).toBe('#0EA5E9');
    expect(load('res:ana').barsFill).toBe(theme.barColor);
    expect(load('res:ana').overFill).toBe(theme.overallocatedColor);
    expect(load('res:ana').capStroke).toBe(theme.textSecondary);
    for (const l of tl.load!) for (const c of [l!.barsFill, l!.overFill, l!.capStroke]) expect(c).not.toContain('var(');
  });

  it('leaves the over-capacity part out with `resourceView.overallocation: false`', () => {
    const tl = modelOf(sourceOf({}, { resourceView: { overallocation: false } })).timeline!;
    expect(tl.load!.every(l => l!.over === '' && !l!.hatch)).toBe(true);
    // All of Ana's load is one bar, up to her peak
    expect(tl.load![0]!.bars).not.toBe('');
  });

  it('puts the bars on local midnights, over the daylight-saving change too', () => {
    const s = sourceOf();
    const { timeline } = exportTimeline(s, 'all');
    const px = timeline.pxPerDay;
    const m = modelOf(s);
    const xs = (path: string) => [...path.matchAll(/[MH](-?[\d.]+)/g)].map(x => Number(x[1]));
    for (const l of m.timeline!.load!) {
      for (const x of [...xs(l!.bars), ...xs(l!.over)])
        expect(Math.abs(x / px - Math.round(x / px))).toBeLessThan(0.01);
    }
    // Ed's task covers 1 Nov: the load runs on without a gap
    expect(m.timeline!.load![ROW_IDS.indexOf('res:ed')]!.bars.match(/M/g)).toHaveLength(1);
  });

  it('leaves the weekends and holidays without load with a working calendar', () => {
    const open = modelOf(sourceOf()).timeline!.load![0]!.bars;
    const working = modelOf(sourceOf({}, { calendar: true, nonWorkingTime: { holidays: [d(21)] } })).timeline!.load![0]!
      .bars;
    expect(open.match(/M/g)).toHaveLength(1);
    // Fri 16 | gap | Mon 19–Tue 20 | the Wednesday holiday
    expect(working.match(/M/g)!.length).toBeGreaterThanOrEqual(2);
    expect(working).not.toBe(open);
  });
});

describe('exportChartSvg — the resource view', () => {
  const svg = exportChartSvg(sourceOf(), { idPrefix: 'rv' });

  it('draws a group per row with the bars, the over part with its hatch, and the capacity line', () => {
    expect(count(svg, '<g class="gantt-load">')).toBe(1);
    expect(count(svg, 'class="gantt-load-row"')).toBe(ROW_IDS.length);
    for (const id of ROW_IDS) expect(svg).toContain(`<g class="gantt-load-row" data-task-id="${id}"`);
    expect(count(svg, 'class="gantt-load-bars"')).toBe(ROW_IDS.length);
    expect(count(svg, 'class="gantt-load-over"')).toBe(2);
    expect(count(svg, 'class="gantt-load-hatch"')).toBe(2);
    expect(count(svg, 'class="gantt-load-cap"')).toBe(ROW_IDS.length - 1);
    expect(svg).toContain('fill="url(#rv-over-hatch)"');
    expect(svg).toContain('stroke-dasharray="4 3"');
  });

  it('has no bar, arrow or critical path, and no `var(`', () => {
    expect(svg).not.toContain('class="gantt-bar ');
    expect(svg).not.toContain('gantt-bar--');
    expect(svg).not.toContain('class="gantt-arrow"');
    expect(svg).not.toContain('gantt-arrow--critical');
    expect(svg).not.toContain('var(');
    // The task list is the resource rows
    expect(svg).toContain('data-task-id="res:ana"');
  });

  it('defines the over-capacity pattern once, with ids that are unique', () => {
    expect(count(svg, 'id="rv-over-hatch"')).toBe(1);
    expect(count(svg, '<pattern ')).toBe(1);
    const all = ids(svg);
    expect(new Set(all).size).toBe(all.length);
    // The pattern's lines are in the over colour
    const theme = modelOf(sourceOf()).theme;
    expect(svg).toMatch(new RegExp(`<pattern id="rv-over-hatch"[\\s\\S]*?stroke="${theme.overallocatedColor}"`));
  });

  it('writes the pattern only while a row is over capacity', () => {
    const calm = exportChartSvg(sourceOf({}, { resourceView: { overallocation: false } }), { idPrefix: 'rv' });
    expect(calm).not.toContain('over-hatch');
    expect(calm).not.toContain('gantt-load-over');
    expect(calm).not.toContain('gantt-load-hatch');
    expect(calm).toContain('gantt-load-bars');
  });

  it('survives the sanitiser unchanged and is the same twice (pure, DOM-free)', () => {
    expect(sanitizeSvgMarkup(svg)).toBe(svg);
    expect(exportChartSvg(sourceOf(), { idPrefix: 'rv' })).toBe(svg);
  });

  it('keeps the non-working shading behind the load, and its own hatch pattern', () => {
    const shaded = exportChartSvg(sourceOf({}, { nonWorkingTime: { style: 'hatch' } }), { idPrefix: 'rv' });
    expect(shaded).toContain('id="rv-hatch"');
    expect(shaded).toContain('id="rv-over-hatch"');
    expect(shaded.indexOf('class="gantt-bands"')).toBeLessThan(shaded.indexOf('class="gantt-load"'));
    const all = ids(shaded);
    expect(new Set(all).size).toBe(all.length);
  });

  it('draws the dark theme with the dark over colour', () => {
    const dark = sourceOf({ dark: true });
    const out = exportChartSvg(dark, { idPrefix: 'rv' });
    expect(out).toContain(`fill="${dark.theme.overallocatedColor}"`);
    expect(dark.theme.overallocatedColor).not.toBe(sourceOf().theme.overallocatedColor);
  });
});

describe('exportChartPages — the resource view', () => {
  it('draws every page with the load of its rows and no dangling pattern', () => {
    const doc = exportChartPages(sourceOf(), {
      paper: { width: 105, height: 148, unit: 'mm' },
      orientation: 'landscape',
      fit: 'none',
      pageNumbers: false,
    });
    expect(doc.pages.length).toBeGreaterThan(1);
    const seen = new Set<string>();
    doc.pages.forEach((page, i) => {
      const prefix = `gantry-print-${i + 1}`;
      for (const m of page.svg.matchAll(/class="gantt-load-row" data-task-id="([^"]+)"/g)) seen.add(m[1]);
      // A page that refers to the pattern defines it, once
      if (page.svg.includes(`url(#${prefix}-over-hatch)`)) expect(count(page.svg, `id="${prefix}-over-hatch"`)).toBe(1);
      else expect(page.svg).not.toContain(`id="${prefix}-over-hatch"`);
      const all = ids(page.svg);
      expect(new Set(all).size).toBe(all.length);
      expect(page.svg).not.toContain('var(');
    });
    // Every row is on some page
    expect([...seen].sort()).toEqual([...ROW_IDS].sort());
  });
});

describe('exportChartCsv — the resource view', () => {
  it('writes the capacity and the peak load of every resource row as numbers', () => {
    const csv = lines(exportChartCsv(sourceOf(), { columns: ['name', 'capacity', 'load'] }));
    expect(csv).toEqual([
      'Task Name,Capacity,Peak load',
      'Ana,100,200',
      'Bo,50,150',
      'Eng,200,200',
      'Cy,100,100',
      'Di,100,100',
      'Ed,200,150',
      'Unassigned,,100',
    ]);
  });

  it('writes them as the cells show them with `values: "display"`', () => {
    const csv = lines(exportChartCsv(sourceOf(), { columns: ['capacity', 'load'], values: 'display' }));
    expect(csv.slice(0, 3)).toEqual(['Capacity,Peak load', '100%,200%', '50%,150%']);
  });

  it('writes the assignments of a task by resource id, units left out at 100', () => {
    const csv = lines(exportChartCsv(sourceOf({}, { rows: 'tasks' }), { columns: ['id', 'resources'] }));
    expect(csv).toEqual([
      'ID,Resources',
      't1,ana',
      't4,"cy, di"',
      't2,"ana, bo 50%"',
      't7,ana',
      't3,bo',
      't5,ed 150%',
      't6,',
    ]);
  });

  it('leaves the Resources column blank on a resource row and the others on a task row', () => {
    const resourceRows = lines(exportChartCsv(sourceOf(), { columns: ['resources'] }));
    expect(new Set(resourceRows.slice(1))).toEqual(new Set(['""']));
    const taskRows = lines(exportChartCsv(sourceOf({}, { rows: 'tasks' }), { columns: ['capacity', 'load'] }));
    expect(new Set(taskRows.slice(1))).toEqual(new Set([',']));
  });

  it('keeps the resource columns out of `columns: "all"` while the chart has no use for them (D18)', () => {
    const header = (csv: string) => lines(csv)[0].split(',');
    const plain = createExportSource({ tasks: TASKS, now: NOW, options: { viewMode: 'Day' } });
    const tail = (h: string[]) => h.slice(-3);
    expect(tail(header(exportChartCsv(plain, { columns: 'all' })))).toEqual([
      'Baseline start',
      'Baseline end',
      'Variance',
    ]);
    // Resources in a tasks chart: the Resources column; in the resource view: Capacity and Peak load
    expect(tail(header(exportChartCsv(sourceOf({}, { rows: 'tasks' }), { columns: 'all' })))).toEqual([
      'Baseline end',
      'Variance',
      'Resources',
    ]);
    expect(tail(header(exportChartCsv(sourceOf(), { columns: 'all' })))).toEqual(['Variance', 'Capacity', 'Peak load']);
  });
});

describe('csvCellValue — the resource columns', () => {
  const ctxOf = (resources?: GanttResource[]) =>
    buildColumnContext({
      tasks: TASKS,
      config: dateReadingOf(resolveConfig({})),
      now: NOW,
      ...(resources ? { resources: indexResources(resources) } : {}),
    });
  const column = (key: string): ColumnDef => ({ key, label: key, width: 80, builtin: true });
  const rowOf = (task: GanttTask): GanttFlatRow => ({
    task,
    level: 0,
    hasChildren: false,
    isCollapsed: false,
    hidden: false,
    visibleIndex: 0,
    barType: 'task',
  });

  it('reads the assignments through the context’s index, blank without one', () => {
    const t2 = TASKS[1];
    expect(csvCellValue(column('resources'), rowOf(t2), ctxOf(RESOURCES), 'data')).toBe('ana, bo 50%');
    expect(csvCellValue(column('resources'), rowOf(t2), ctxOf(), 'data')).toBe('');
    // Unknown ids are ignored, as everywhere
    const stray = { ...t2, resources: ['nobody', 'ed'] };
    expect(csvCellValue(column('resources'), rowOf(stray), ctxOf(RESOURCES), 'data')).toBe('ed');
  });

  it('is blank for capacity and load on a task row', () => {
    const ctx = ctxOf(RESOURCES);
    expect(csvCellValue(column('capacity'), rowOf(TASKS[0]), ctx, 'data')).toBe('');
    expect(csvCellValue(column('load'), rowOf(TASKS[0]), ctx, 'data')).toBe('');
  });
});

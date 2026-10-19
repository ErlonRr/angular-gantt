// ─────────────────────────────────────────────────────────────
//  Tests — the headless export source (`createExportSource`, Phase 12
//  D27): the Web Component's rows pipeline by hand, collapse seeding,
//  sort, rollup copies, columns, panel width, view, theme; the export
//  theme (`exportTheme`), the export timeline (`exportTimeline`, D6)
//  and the shared helpers (`exportColumnCatalogue`, `exportSegments`)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  createExportSource,
  exportColumnCatalogue,
  exportSegments,
  exportTheme,
  exportTimeline,
  type ChartExportSource,
} from '../export/source';
import { resolveConfig } from '../render/config';
import { buildTimeline } from '../render/timeline';
import { bottomScale, unitStart } from '../render/scales';
import { DarkTheme, LightTheme, resolveTheme } from '../render/theme';
import { quantizeNow } from '../render/today';
import { createStyleResolver } from '../render/styles';
import { buildBuiltinColumns, buildColumnContext, DEFAULT_PANEL_COLUMNS } from '../render/columns';
import { applyRollups, computeRollups } from '../gantt-rollup';
import { columnComparator, filterVisible, flattenTree, normalizeTasks, reindexVisible, sortTree } from '../gantt-data';
import { calendarDays } from '../gantt-math';
import { DEFAULT_LABELS, type ColumnDef, type GanttOptions, type GanttTask } from '../types';

const NOW = new Date(2026, 2, 4, 10, 30);
const d = (m: number, day: number) => new Date(2026, m, day);

/** A group with two linked children, a collapsed group, a milestone and a loose task. */
const TASKS: GanttTask[] = [
  { id: 'g', name: 'Design', start: d(2, 2), end: d(2, 20), type: 'group' },
  { id: 'a', name: 'Sketches', start: d(2, 2), end: d(2, 9), parentId: 'g', progress: 100 },
  { id: 'b', name: 'Mockups', start: d(2, 9), end: d(2, 20), parentId: 'g', progress: 40, dependency: 'a' },
  { id: 'h', name: 'Build', start: d(2, 16), end: d(3, 10), type: 'group', collapsed: true },
  { id: 'c', name: 'Backend', start: d(2, 16), end: d(3, 3), parentId: 'h', style: { color: '#123456' } },
  { id: 'e', name: 'Frontend', start: d(2, 23), end: d(3, 10), parentId: 'h' },
  { id: 'm', name: 'Launch', start: d(3, 10), end: d(3, 10), type: 'milestone', dependency: 'h' },
  { id: 'z', name: 'Audit', start: d(2, 5), end: d(2, 12) },
];

const source = (options: GanttOptions = {}, extra: Partial<Parameters<typeof createExportSource>[0]> = {}) =>
  createExportSource({ tasks: TASKS, options, now: NOW, ...extra });

const ids = (rows: readonly { task: { id: string } }[]) => rows.map(r => r.task.id);

describe('createExportSource — rows', () => {
  it('runs the rows pipeline of the Web Component (normalise → rollups → flatten → shown rows)', () => {
    const options: GanttOptions = { viewMode: 'Week', rollup: true };
    const s = source(options);
    const cfg = resolveConfig(options);
    const tasks = normalizeTasks([...TASKS]);
    const nowDay = quantizeNow(NOW, bottomScale(cfg.scales).unit);
    const dates = { endDateMode: cfg.endDateMode, normalizeDateOnly: cfg.normalizeDateOnly };
    const rollups = computeRollups(tasks, cfg.rollup, { now: nowDay, dates });
    const all = applyRollups(flattenTree(tasks, new Set(['h'])), rollups, cfg.rollup);
    expect(s.allRows).toEqual(all);
    expect(s.rows).toEqual(reindexVisible(filterVisible(all)));
    expect(s.tasks).toEqual(tasks);
    expect(s.columnCtx).toEqual(buildColumnContext({ tasks, config: dates, now: NOW }));
  });

  it('seeds the collapsed rows from task.collapsed and groupBar.collapsed; collapsedIds wins', () => {
    expect(ids(source().rows)).toEqual(['g', 'a', 'b', 'z', 'h', 'm']);
    expect(
      source()
        .allRows.filter(r => r.hidden)
        .map(r => r.task.id),
    ).toEqual(['c', 'e']);
    expect(ids(source({ groupBar: { collapsed: true } }).rows)).toEqual(['g', 'z', 'h', 'm']);
    expect(ids(source({}, { collapsedIds: [] }).rows)).toEqual(['g', 'a', 'b', 'z', 'h', 'c', 'e', 'm']);
    expect(ids(source({}, { collapsedIds: new Set(['g']) }).rows)).toEqual(['g', 'z', 'h', 'c', 'e', 'm']);
    // Shown rows are reindexed from 0
    expect(source().rows.map(r => r.visibleIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('sorts every level by a column, each subtree under its parent (columnComparator)', () => {
    const s = source({}, { sort: { key: 'name', dir: 'desc' }, collapsedIds: [] });
    expect(ids(s.rows)).toEqual(['m', 'g', 'a', 'b', 'h', 'e', 'c', 'z']);
    const cfg = resolveConfig({});
    const tasks = normalizeTasks([...TASKS]);
    const builtins = buildBuiltinColumns(DEFAULT_LABELS);
    const ctx = buildColumnContext({ tasks, config: cfg, now: NOW });
    const byHand = sortTree(
      flattenTree(tasks, new Set()),
      columnComparator('start', 'asc', { column: builtins.find(c => c.key === 'start'), ctx }),
    );
    expect(ids(source({}, { sort: { key: 'start', dir: 'asc' }, collapsedIds: [] }).allRows)).toEqual(ids(byHand));
  });

  it('puts rolled-up copies on the parent rows and keeps the tasks raw', () => {
    const s = source({ rollup: true }, { collapsedIds: [] });
    const row = s.rows.find(r => r.task.id === 'g')!;
    const raw = s.tasks.find(t => t.id === 'g')!;
    expect(row.task).not.toBe(raw);
    expect(raw.progress).toBeUndefined();
    // (7 days × 100 + 11 days × 40) / 18, rounded
    expect(row.task.progress).toBe(Math.round((7 * 100 + 11 * 40) / 18));
    expect(source({}).rows.find(r => r.task.id === 'g')!.task).toBe(source({}).tasks.find(t => t.id === 'g'));
  });

  it('computes the critical path only with criticalPath', () => {
    expect(source().critical.size).toBe(0);
    const s = source({ criticalPath: true });
    expect(s.critical.size).toBeGreaterThan(0);
    expect([...s.critical].every(id => TASKS.some(t => t.id === id))).toBe(true);
  });

  it('resolves row styles with the chart resolver (rule, critical, day)', () => {
    const options: GanttOptions = { styles: { rule: row => (row.task.id === 'z' ? { color: '#ff0000' } : null) } };
    const s = source(options);
    const z = s.rows.find(r => r.task.id === 'z')!;
    expect(s.rowStyle(z).color).toBe('#ff0000');
    const cfg = resolveConfig(options);
    const byHand = createStyleResolver({ config: cfg, now: quantizeNow(NOW, 'day') });
    expect(s.rowStyle(z)).toEqual(byHand(z));
  });

  it('takes now, annotations, customBar and showLegend from the input', () => {
    const annotation = { x1: d(2, 10), label: { text: 'Review' } };
    const customBar = () => null;
    const s = source({ annotations: [{ x1: d(2, 1) }] }, { annotations: [annotation], customBar, showLegend: true });
    expect(s.now).toBe(NOW);
    expect(s.annotations).toEqual([annotation]);
    expect(source({ annotations: [annotation] }).annotations).toEqual([annotation]);
    expect(source().annotations).toEqual([]);
    expect(s.customBar).toBe(customBar);
    expect(s.showLegend).toBe(true);
    expect(source().showLegend).toBe(false);
    expect(source().customBar).toBeNull();
    // Headless: no viewport, no pane width, no sync group
    expect([s.viewport, s.tableWidth, s.shared]).toEqual([null, null, null]);
  });

  it('reads the current time when no now is given', () => {
    const before = Date.now();
    const s = createExportSource({ tasks: TASKS });
    expect(s.now.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('createExportSource — columns, view, panel, theme', () => {
  it('resolves the split, table and catalogue columns at their widths', () => {
    const s = source();
    expect(s.columns.split.map(c => c.key)).toEqual([...DEFAULT_PANEL_COLUMNS]);
    expect(s.columns.table.map(c => c.key)).toEqual([
      'name',
      'type',
      'status',
      'start',
      'end',
      'duration',
      'progress',
      'predecessors',
    ]);
    expect(s.columns.all.map(c => c.key)).toEqual(buildBuiltinColumns(DEFAULT_LABELS).map(c => c.key));
    expect(source({ panel: { columns: ['name', 'type'] } }).columns.split.map(c => c.key)).toEqual(['name', 'type']);
    expect(source({ baseline: true }).columns.table.map(c => c.key)).toContain('variance');
  });

  it('merges custom columns over the built-ins (options.columns over the input), widths clamped', () => {
    const owner: ColumnDef = { key: 'owner', label: 'Owner', width: 10 };
    const name: ColumnDef = { key: 'name', label: 'Task', width: 2000 };
    const s = source({}, { columns: [name, owner] });
    expect(s.columns.split.map(c => [c.key, c.width])).toEqual([
      ['name', 800],
      ['owner', 40],
    ]);
    expect(s.columns.split[0].label).toBe('Task');
    // The catalogue: every built-in (the consumer's in its place), then the consumer's own
    const keys = s.columns.all.map(c => c.key);
    expect(keys.slice(0, -1)).toEqual(buildBuiltinColumns(DEFAULT_LABELS).map(c => c.key));
    expect(keys.at(-1)).toBe('owner');
    expect(s.columns.all.find(c => c.key === 'name')!.label).toBe('Task');
    expect(source({ columns: [owner] }, { columns: [name] }).columns.split.map(c => c.key)).toEqual(['owner']);
  });

  it('exportColumnCatalogue keeps the built-in order and appends new keys', () => {
    const b = (key: string) => ({ key, label: key, width: 50 });
    expect(exportColumnCatalogue([b('x'), { ...b('b'), width: 90 }], [b('a'), b('b')])).toEqual([
      b('a'),
      { ...b('b'), width: 90 },
      b('x'),
    ]);
  });

  it('defaults the view to options.view, chart with panel.collapsed, else split', () => {
    expect(source().view).toBe('split');
    expect(source({ view: 'table' }).view).toBe('table');
    expect(source({ panel: { collapsed: true } }).view).toBe('chart');
    expect(source({ view: 'table' }, { view: 'chart' }).view).toBe('chart');
  });

  it('defaults the panel width to panel.width in px, else the split columns', () => {
    const sum = source().columns.split.reduce((w, c) => w + c.width, 0);
    expect(source().panelWidth).toBe(sum);
    expect(source({ panel: { width: 320 } }).panelWidth).toBe(320);
    expect(source({ panel: { width: '40%' } }).panelWidth).toBe(sum);
    expect(source({ panel: { width: 320 } }, { panelWidth: 500 }).panelWidth).toBe(500);
  });

  it('resolves the theme from dark and options.theme', () => {
    expect(source().theme).toEqual(LightTheme);
    expect(source().dark).toBe(false);
    expect(source({ darkMode: true }).theme).toEqual(DarkTheme);
    expect(source({ darkMode: 'auto' }).dark).toBe(false);
    const s = source({ darkMode: true, theme: { barColor: '#00ff00' } }, { dark: false });
    expect(s.dark).toBe(false);
    expect(s.theme).toEqual(resolveTheme(false, { barColor: '#00ff00' }));
    expect(s.themeOverrides).toEqual({ barColor: '#00ff00' });
    expect(source().themeOverrides).toBeNull();
  });
});

describe('exportTheme', () => {
  const s = source({ darkMode: true, theme: { barColor: '#00ff00' } });
  it('current is the theme shown, light / dark that palette with the overrides', () => {
    expect(exportTheme(s, 'current')).toBe(s.theme);
    expect(exportTheme(s, 'light')).toEqual({ ...LightTheme, barColor: '#00ff00' });
    expect(exportTheme(s, 'dark')).toEqual({ ...DarkTheme, barColor: '#00ff00' });
  });
});

describe('exportSegments', () => {
  it('gives a collapsed rolled-up parent its children on the timeline it is given', () => {
    const s = source({ rollup: { segments: true } });
    const h = s.rows.find(r => r.task.id === 'h')!;
    const g = s.rows.find(r => r.task.id === 'g')!;
    const toX = (date: Date) => Math.round(calendarDays(date, false) - calendarDays(d(2, 1), false)) * 10;
    const segs = s.segments(h, toX)!;
    expect(segs.map(x => x.x)).toEqual([150, 220]);
    // The child's style colour, else the theme token
    expect(segs.map(x => x.paint)).toEqual(['#123456', 'var(--gantt-bar)']);
    // Another timeline moves them
    expect(s.segments(h, date => toX(date) + 100)!.map(x => x.x)).toEqual([250, 320]);
    // Expanded parents and leaf rows: none
    expect(s.segments(g, toX)).toBeNull();
    expect(
      s.segments(
        s.rows.find(r => r.task.id === 'z')!,
        toX,
      ),
    ).toBeNull();
    // Without `rollup.segments`
    expect(source({ rollup: true }).segments(h, toX)).toBeNull();
    expect(source().segments(h, toX)).toBeNull();
  });

  it('is what the bindings call with their rollups, rows and styles', () => {
    const s = source({ rollup: { segments: true } });
    const fn = exportSegments({ config: s.config, rollups: new Map(), allRows: s.allRows, rowStyle: s.rowStyle });
    expect(
      fn(
        s.rows.find(r => r.task.id === 'h')!,
        () => 0,
      ),
    ).toBeNull();
  });
});

describe('exportTimeline', () => {
  const natural = (s: ChartExportSource) =>
    buildTimeline({
      tasks: [...s.tasks],
      config: s.config,
      i18n: s.i18n,
      now: quantizeNow(s.now, bottomScale(s.config.scales).unit),
    });

  it("'all' draws the natural range, without the viewport fill", () => {
    const s = source({ viewMode: 'Day' });
    const { timeline, x0, x1 } = exportTimeline(s, 'all');
    const nat = natural(s);
    expect(timeline.start).toEqual(nat.start);
    expect(timeline.totalWidth).toBe(nat.totalWidth);
    expect([x0, x1]).toEqual([0, nat.totalWidth]);
    // The quantised now: the current day's cell, as on screen
    const current = timeline.tiers.at(-1)!.cells.find(c => c.isCurrent)!;
    expect(current.start).toEqual(d(2, 4));
  });

  it("'visible' is the viewport (all while unmeasured), the fill to its edge with fitToWidth only", () => {
    const s = source({ viewMode: 'Day' });
    const total = natural(s).totalWidth;
    expect(exportTimeline(s, 'visible').x1).toBe(total);
    const at = (viewport: { x0: number; x1: number }, options: GanttOptions = { viewMode: 'Day' }) =>
      exportTimeline({ ...source(options), viewport }, 'visible');
    const v = at({ x0: 120.4, x1: 480.6 });
    expect([v.x0, v.x1]).toEqual([120, 481]);
    expect(v.timeline.totalWidth).toBe(total);
    // Past the natural end: extended by whole cells with fitToWidth (as on screen), else clamped
    const wide = at({ x0: 100, x1: total + 250 });
    expect(wide.x1).toBe(total + 250);
    expect(wide.timeline.totalWidth).toBeGreaterThanOrEqual(total + 250);
    expect(wide.timeline.start).toEqual(natural(s).start);
    const fixed = at({ x0: 100, x1: total + 250 }, { viewMode: 'Day', fitToWidth: false });
    expect([fixed.x1, fixed.timeline.totalWidth]).toEqual([total, total]);
    // A degenerate viewport draws everything
    expect(at({ x0: 50, x1: 50 }).x0).toBe(0);
  });

  it('dates inside the range clip it exactly', () => {
    const s = source({ viewMode: 'Day' });
    const { timeline, x0, x1 } = exportTimeline(s, { start: d(2, 9), end: d(2, 16) });
    expect(timeline.start).toEqual(natural(s).start);
    expect(x0).toBe(timeline.toX(d(2, 9)));
    expect(x1 - x0).toBe(7 * s.config.pxPerDay);
  });

  it('dates past the range extend it by whole bottom cells, then clip', () => {
    const s = source({ viewMode: 'Week' });
    const start = d(0, 14);
    const end = d(5, 3);
    const { timeline, x0, x1 } = exportTimeline(s, { start, end });
    expect(timeline.start).toEqual(unitStart(start, 'week', 1, s.config.weekStart));
    expect(timeline.start <= start).toBe(true);
    expect(x0).toBe(timeline.toX(start));
    expect(x1).toBe(timeline.toX(end));
    expect(timeline.totalWidth).toBeGreaterThanOrEqual(x1);
    // Reversed dates are swapped; invalid or equal ones draw everything
    expect(exportTimeline(s, { start: end, end: start })).toMatchObject({ x0, x1 });
    expect(exportTimeline(s, { start: new Date(NaN), end }).x0).toBe(0);
    expect(exportTimeline(s, { start, end: start }).x1).toBe(exportTimeline(s, 'all').x1);
  });

  it('reads date-only UTC dates as local days', () => {
    const s = source({ viewMode: 'Day' });
    const local = exportTimeline(s, { start: d(2, 9), end: d(2, 16) });
    const utc = exportTimeline(s, { start: new Date(Date.UTC(2026, 2, 9)), end: new Date(Date.UTC(2026, 2, 16)) });
    expect([utc.x0, utc.x1]).toEqual([local.x0, local.x1]);
  });

  it("keeps the sync group's shared range", () => {
    const s = source({ viewMode: 'Day' });
    const shared = { range: { start: d(0, 5), end: d(5, 1) } };
    const { timeline, x1 } = exportTimeline({ ...s, shared }, 'all');
    expect(timeline.start).toEqual(d(0, 5));
    expect(x1).toBe(timeline.totalWidth);
    const dated = exportTimeline({ ...s, shared }, { start: d(2, 9), end: d(2, 16) });
    expect(dated.timeline.start).toEqual(d(0, 5));
  });
});

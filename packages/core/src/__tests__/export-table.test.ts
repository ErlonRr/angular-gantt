// ─────────────────────────────────────────────────────────────
//  Tests — export/table.ts (Phase 12, step 2.2): the task list of an
//  image export, laid out as both painters draw it (widths and flex
//  fill, alignment, indent / chevron / icon, status dot, fitted texts)
//  (runs under test:tz: dates are built with new Date(y, m, d, h))
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { buildTablePart, EXPORT_TABLE, type ExportCell, type ExportTableOptions } from '../export/table';
import type { ChartExportSource } from '../export/source';
import { buildBuiltinColumns, buildColumnContext, computeCellVisual, COLUMN_CELL_INSET } from '../render/columns';
import { resolveConfig } from '../render/config';
import { resolveTheme } from '../render/theme';
import { estimateTextWidth } from '../render/bars';
import { filterVisible, flattenTree, reindexVisible } from '../gantt-data';
import {
  DEFAULT_FORMATS,
  DEFAULT_LABELS,
  TaskType,
  type ColumnDef,
  type GanttFlatRow,
  type GanttOptions,
  type GanttTask,
  type ResolvedTaskStyle,
} from '../types';

const day = (m: number, d: number, h = 0) => new Date(2026, m, d, h);
const NOW = day(9, 9, 12);
const LIGHT = resolveTheme(false);
const DARK = resolveTheme(true);
const builtins = buildBuiltinColumns(DEFAULT_LABELS);
const builtin = (key: string, over: Partial<ColumnDef> = {}): ColumnDef => {
  const col = builtins.find(c => c.key === key);
  if (!col) throw new Error(`no built-in column ${key}`);
  return { ...col, ...over };
};

const TASKS: GanttTask[] = [
  { id: 'p', name: 'Project Alpha', start: day(9, 5), end: day(9, 20), type: TaskType.Group },
  { id: 'a', name: 'Design', start: day(9, 5), end: day(9, 10), progress: 45, parentId: 'p' },
  {
    id: 'm',
    name: 'Launch',
    start: day(9, 20),
    end: day(9, 20),
    type: TaskType.Milestone,
    parentId: 'p',
    dependency: 'a',
  },
  {
    id: 'b',
    name: 'Build',
    start: day(9, 12),
    end: day(9, 15),
    progress: 100,
    baseline: { start: day(9, 11), end: day(9, 14) },
  },
  // A group-typed task without children: the painters' icon follows the children, not the type
  { id: 'g', name: 'Empty group', start: day(9, 16), end: day(9, 18), type: TaskType.Group },
];

function rowsOf(tasks: GanttTask[], collapsed: string[] = []): GanttFlatRow[] {
  return reindexVisible(filterVisible(flattenTree(tasks, new Set(collapsed))));
}

function sourceOf(
  tasks: GanttTask[] = TASKS,
  { options = {}, styles = {} }: { options?: GanttOptions; styles?: Record<string, ResolvedTaskStyle> } = {},
): ChartExportSource {
  const config = resolveConfig(options);
  const rows = rowsOf(tasks);
  return {
    config,
    i18n: { labels: DEFAULT_LABELS, formats: DEFAULT_FORMATS },
    theme: LIGHT,
    dark: false,
    themeOverrides: null,
    tasks,
    rows,
    allRows: flattenTree(tasks),
    columns: { split: [], table: [], all: builtins },
    columnCtx: buildColumnContext({ tasks, config, now: NOW }),
    rowStyle: row => styles[row.task.id] ?? {},
    segments: () => null,
    critical: new Set(),
    annotations: [],
    now: NOW,
    view: 'split',
    panelWidth: 400,
    tableWidth: null,
    shared: null,
    showLegend: false,
    viewport: null,
    customBar: null,
  };
}

const opts = (over: Partial<ExportTableOptions> = {}): ExportTableOptions => ({
  width: 400,
  headerHeight: 48,
  theme: LIGHT,
  fontPx: 12,
  ...over,
});

const build = (columns: ColumnDef[], over: Partial<ExportTableOptions> = {}, source = sourceOf()) =>
  buildTablePart(source, source.rows, columns, opts(over));

/** The cell of row `id` in column `key`. */
function cell(table: ReturnType<typeof build>, id: string, key: string): ExportCell {
  const i = table.header.cells.findIndex(c => c.key === key);
  const found = table.rows.find(r => r.id === id)?.cells[i];
  if (!found) throw new Error(`no cell ${id}/${key}`);
  return found;
}

const col = (key: string, width: number, over: Partial<ColumnDef> = {}): ColumnDef => ({
  key,
  label: key.toUpperCase(),
  width,
  ...over,
});

describe('buildTablePart: widths', () => {
  it('lays the columns out left to right; the flex column fills the width', () => {
    const t = build([builtin('name', { width: 200 }), builtin('start', { width: 112 })], { width: 400 });
    expect(t.width).toBe(400);
    expect(t.header.cells.map(c => [c.key, c.x, c.width])).toEqual([
      ['name', 0, 288],
      ['start', 288, 112],
    ]);
  });

  it('without a flex column the last one grows (columnsGridTemplate)', () => {
    const t = build([col('a', 100), col('b', 50)], { width: 300 });
    expect(t.header.cells.map(c => c.width)).toEqual([100, 200]);
  });

  it('the first flex column grows, not a later one', () => {
    const t = build([col('a', 100), col('b', 50, { flex: true }), col('c', 50, { flex: true })], { width: 400 });
    expect(t.header.cells.map(c => c.width)).toEqual([100, 250, 50]);
  });

  it('columns wider than the width keep their widths and widen the table (max(sum, width))', () => {
    const t = build([col('a', 300, { flex: true }), col('b', 200)], { width: 400 });
    expect(t.width).toBe(500);
    expect(t.header.cells.map(c => [c.x, c.width])).toEqual([
      [0, 300],
      [300, 200],
    ]);
  });

  it('table view: the table view pane width (or the sum when wider) is the width', () => {
    const cols = [builtin('id'), builtin('name'), builtin('start'), builtin('end'), builtin('progress')];
    const sum = cols.reduce((s, c) => s + c.width, 0);
    expect(build(cols, { width: sum + 100 }).width).toBe(sum + 100);
    expect(build(cols, { width: 10 }).width).toBe(sum);
  });

  it('no columns: an empty header and empty rows at the width asked for', () => {
    const t = build([], { width: 250 });
    expect(t.width).toBe(250);
    expect(t.header.cells).toEqual([]);
    expect(t.rows.every(r => r.cells.length === 0)).toBe(true);
  });

  it('unreadable widths count as 0', () => {
    const t = build([col('a', Number.NaN), col('b', -5), col('c', 40)], { width: Number.NaN });
    expect(t.width).toBe(40);
    expect(t.header.cells.map(c => c.width)).toEqual([0, 0, 40]);
  });
});

describe('buildTablePart: header', () => {
  it('header background, borders and labels by alignment', () => {
    const t = build([col('a', 100), col('b', 101, { align: 'center' }), col('c', 80, { align: 'end' })], {
      width: 281,
    });
    expect(t.header.fill).toBe(LIGHT.headerBackground);
    expect(t.header.border).toEqual({ stroke: LIGHT.borderColor, width: 1, dash: null });
    expect(t.border).toEqual(t.header.border);
    expect(t.header.cells.map(c => c.label)).toEqual([
      { text: 'A', x: 8, anchor: 'start' },
      // content box 108…192: centre 150 = x + (width − 1) / 2
      { text: 'B', x: 150, anchor: 'middle' },
      // 8 px padding and the 1 px right border before the end
      { text: 'C', x: 201 + 80 - 9, anchor: 'end' },
    ]);
  });

  it('a long label is fitted to the cell with an ellipsis', () => {
    const label = 'A very long column label that cannot fit';
    const t = build([col('a', 80, { label })], { width: 80 });
    const text = t.header.cells[0]?.label.text ?? '';
    expect(text.endsWith('…')).toBe(true);
    expect(estimateTextWidth(text, 12)).toBeLessThanOrEqual(80 - COLUMN_CELL_INSET);
  });
});

describe('buildTablePart: rows and the name cell', () => {
  const cols = [builtin('name', { width: 240 }), builtin('start')];

  it('one row per shown row, in order, one cell per column', () => {
    const t = build(cols);
    expect(t.rows.map(r => r.id)).toEqual(['p', 'a', 'm', 'b', 'g']);
    expect(t.rows.every(r => r.cells.length === 2)).toBe(true);
  });

  it('collapsed children are not drawn (the rows passed in)', () => {
    const source = sourceOf();
    const rows = rowsOf(TASKS, ['p']);
    const t = buildTablePart(source, rows, cols, opts());
    expect(t.rows.map(r => r.id)).toEqual(['p', 'b', 'g']);
    expect(t.rows[0]?.cells[0]?.chevron).toBe('closed');
  });

  it('indent, chevron, icon and name at the painters offsets', () => {
    const t = build(cols);
    const lead = EXPORT_TABLE.toggle + EXPORT_TABLE.iconPx + 2 * EXPORT_TABLE.nameGap;
    expect(cell(t, 'p', 'name')).toEqual({
      text: 'Project Alpha',
      title: 'Project Alpha',
      x: 8 + lead,
      anchor: 'start',
      fill: LIGHT.textPrimary,
      indent: 0,
      chevron: 'open',
      icon: { kind: 'group', fill: LIGHT.textMuted },
      dot: null,
    });
    expect(cell(t, 'a', 'name')).toMatchObject({
      x: 8 + 16 + lead,
      indent: 16,
      chevron: null,
      fill: LIGHT.textSecondary,
      icon: { kind: 'task', fill: LIGHT.textMuted },
    });
    expect(cell(t, 'm', 'name').icon?.kind).toBe('milestone');
    // A group-typed task without children: a task icon and no chevron, as the painters
    expect(cell(t, 'g', 'name')).toMatchObject({ chevron: null, icon: { kind: 'task' } });
  });

  it('indentSize sets the indent per level', () => {
    const t = build(cols, {}, sourceOf(TASKS, { options: { indentSize: 24 } }));
    expect(cell(t, 'a', 'name').indent).toBe(24);
  });

  it('the name is laid out from the start whatever the column align', () => {
    const t = build([builtin('name', { width: 240, align: 'center' })]);
    expect(cell(t, 'b', 'name')).toMatchObject({ anchor: 'start', x: 8 + 42 });
  });

  it("the icon takes the row style's colour, resolved with the export theme", () => {
    const styles = { a: { color: '#ff0000' }, b: { color: 'var(--gantt-critical)' } };
    const t = build(cols, {}, sourceOf(TASKS, { styles }));
    expect(cell(t, 'a', 'name').icon?.fill).toBe('#ff0000');
    expect(cell(t, 'b', 'name').icon?.fill).toBe(LIGHT.criticalColor);
    expect(cell(t, 'p', 'name').icon?.fill).toBe(LIGHT.textMuted);
  });

  it('a custom render on the name column changes the text, keeping indent and icon', () => {
    const name: ColumnDef = { key: 'name', label: 'Task', width: 240, render: r => `#${r.task.id} ${r.task.name}` };
    const t = build([name]);
    expect(cell(t, 'a', 'name')).toMatchObject({ text: '#a Design', indent: 16, icon: { kind: 'task' } });
  });

  it('a long name is fitted after the indent with an ellipsis; the title keeps it whole', () => {
    const long = 'An extraordinarily long task name that never fits in the column';
    const tasks: GanttTask[] = [
      { id: 'r', name: 'Root', start: day(9, 1), end: day(9, 3) },
      { id: 'c', name: long, start: day(9, 1), end: day(9, 2), parentId: 'r' },
    ];
    const t = build([builtin('name', { width: 160 })], { width: 160 }, sourceOf(tasks));
    const c = cell(t, 'c', 'name');
    expect(c.title).toBe(long);
    expect(c.text.endsWith('…')).toBe(true);
    expect(c.x + estimateTextWidth(c.text, 12)).toBeLessThanOrEqual(160 - 9);
  });

  it('a name cell with no room left shows no text', () => {
    const t = build([builtin('name', { width: 60 })], { width: 60 });
    expect(cell(t, 'a', 'name').text).toBe('');
  });
});

describe('buildTablePart: built-in columns', () => {
  const keys = [
    'id',
    'type',
    'status',
    'start',
    'end',
    'duration',
    'progress',
    'predecessors',
    'baselineStart',
    'baselineEnd',
    'variance',
  ];

  it.each(keys)('%s: the cell text is the painted text (computeCellVisual), aligned as the column', key => {
    const column = builtin(key, { width: 400 });
    const source = sourceOf(TASKS, { options: { baseline: true } });
    const t = build([column], { width: 400 }, source);
    for (const row of source.rows) {
      const c = cell(t, row.task.id, key);
      const v = computeCellVisual(column, row, source.columnCtx);
      expect(c.text).toBe(v.text);
      expect(c.title).toBe(v.text);
      expect(c.indent).toBe(0);
      expect(c.chevron).toBeNull();
      expect(c.icon).toBeNull();
      expect(c.fill).toBe(LIGHT.textSecondary);
      expect(c.anchor).toBe(column.align === 'end' ? 'end' : 'start');
      if (column.align === 'end') expect(c.x).toBe(400 - 9);
      else expect(c.x).toBe(key === 'status' ? 8 + 14 : 8);
    }
  });

  it('progress and variance are end-aligned; predecessors name the tasks', () => {
    const t = build([builtin('progress'), builtin('variance'), builtin('predecessors')], { width: 0 });
    expect(cell(t, 'a', 'progress')).toMatchObject({ text: '45%', anchor: 'end' });
    expect(cell(t, 'b', 'variance')).toMatchObject({ text: '+1d', anchor: 'end' });
    expect(cell(t, 'm', 'predecessors').text).toBe(DEFAULT_LABELS.dependency('Design', 'FS', 0));
  });
});

describe('buildTablePart: status dot', () => {
  it('the dot leads the text, its colour resolved from the status token', () => {
    const t = build([builtin('status', { width: 120 })], { width: 120 });
    // NOW is Oct 9 12:00: Design (Oct 5–10, 45 %) is in progress, Build (100 %) is done
    expect(cell(t, 'a', 'status')).toMatchObject({
      text: DEFAULT_LABELS.statusInProgress,
      x: 8 + EXPORT_TABLE.statusDot + EXPORT_TABLE.statusDotGap,
      anchor: 'start',
      dot: { cx: 8 + 4, r: 4, fill: LIGHT.statusInProgress },
    });
    expect(cell(t, 'b', 'status').dot?.fill).toBe(LIGHT.statusDone);
    expect(cell(t, 'g', 'status').dot?.fill).toBe(LIGHT.statusNotStarted);
  });

  it('centred and end-aligned: dot and text are one group', () => {
    const t = build(
      [builtin('status', { width: 201, align: 'center' }), builtin('status', { width: 120, align: 'end' })],
      {
        width: 321,
      },
    );
    const text = DEFAULT_LABELS.statusInProgress;
    const tw = estimateTextWidth(text, 12);
    const [centre, end] = t.rows.find(r => r.id === 'a')?.cells ?? [];
    // content 8…192 (centre 100); the group is dot 8 + gap 6 + text
    expect(centre?.anchor).toBe('middle');
    expect(centre?.x).toBeCloseTo(100 + 7, 6);
    expect(centre?.dot?.cx).toBeCloseTo(100 - (14 + tw) / 2 + 4, 6);
    expect(end?.anchor).toBe('end');
    expect(end?.x).toBe(201 + 120 - 9);
    expect(end?.dot?.cx).toBeCloseTo(201 + 120 - 9 - tw - 14 + 4, 6);
  });

  it('dark theme colours', () => {
    const t = build([builtin('name'), builtin('status')], { theme: DARK });
    expect(t.header.fill).toBe(DARK.headerBackground);
    expect(cell(t, 'a', 'status').dot?.fill).toBe(DARK.statusInProgress);
    expect(cell(t, 'p', 'name').fill).toBe(DARK.textPrimary);
    expect(cell(t, 'a', 'name').icon?.fill).toBe(DARK.textMuted);
  });
});

describe('buildTablePart: custom columns', () => {
  it('render gives the text; align centre and end place it', () => {
    const t = build(
      [
        col('owner', 101, { align: 'center', render: r => `Owner of ${r.task.id}` }),
        col('cost', 80, { align: 'end', render: () => '1,200' }),
      ],
      { width: 181 },
    );
    expect(cell(t, 'a', 'owner')).toMatchObject({ text: 'Owner of a', x: 50, anchor: 'middle', dot: null });
    expect(cell(t, 'a', 'cost')).toMatchObject({ text: '1,200', x: 101 + 80 - 9, anchor: 'end' });
  });

  it('without render: the task field, as text', () => {
    const tasks: GanttTask[] = [{ id: 'x', name: 'X', start: day(9, 1), end: day(9, 2), progress: 30 }];
    const t = build([col('progress', 100)], {}, sourceOf(tasks));
    expect(cell(t, 'x', 'progress').text).toBe('30');
  });

  it('a template cell draws its exportValue, else its render text, in the primary text colour', () => {
    const tpl = { template: true };
    const t = build([
      col('a', 120, { cellTemplate: tpl, exportValue: r => `export ${r.task.id}`, render: () => 'render' }),
      col('b', 120, { cellTemplate: tpl, render: r => `render ${r.task.id}` }),
      // A template on the name column replaces the whole cell: no indent, chevron or icon
      { ...builtin('name'), cellTemplate: tpl },
    ]);
    expect(cell(t, 'a', 'a')).toMatchObject({ text: 'export a', fill: LIGHT.textPrimary, dot: null });
    expect(cell(t, 'a', 'b').text).toBe('render a');
    expect(cell(t, 'a', 'name')).toMatchObject({ text: 'Design', indent: 0, chevron: null, icon: null, x: 240 + 8 });
  });
});

describe('buildTablePart: output', () => {
  it('every colour is concrete (no var())', () => {
    const styles = { a: { color: 'var(--gantt-milestone)' } };
    const t = build([builtin('name'), builtin('status'), builtin('progress')], {}, sourceOf(TASKS, { styles }));
    expect(JSON.stringify(t)).not.toContain('var(');
  });

  it('is pure: the same input gives the same table', () => {
    const cols = [builtin('name'), builtin('start'), builtin('status')];
    expect(build(cols)).toEqual(build(cols));
  });
});

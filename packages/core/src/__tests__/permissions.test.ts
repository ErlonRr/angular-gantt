// ─────────────────────────────────────────────────────────────
//  Tests — editing/permissions.ts (Phase 11 step 2.3, D9): `editRules`
//  for editable / draggable rows, rolled-up parents, milestones, group
//  bars, `enableDrag` / `enableResize` and each `editing` feature;
//  `cellEditable` for the built-in columns, custom columns and the
//  per-row `editable` function.
//  (runs under test:tz: dates are built with new Date(y, m, d))
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { flattenTree } from '../gantt-data';
import { applyRollups, computeRollups } from '../gantt-rollup';
import { buildBuiltinColumns } from '../render/columns';
import { resolveConfig } from '../render/config';
import { cellEditable, editRules, type EditRules } from '../editing/permissions';
import { DEFAULT_LABELS, type ColumnDef, type GanttFlatRow, type GanttOptions, type GanttTask } from '../types';

const d = (day: number) => new Date(2026, 0, day);
const task = (id: string, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: id,
  start: d(5),
  end: d(10),
  ...extra,
});

/** The flattened row of `id` (with the rollup copies when `options.rollup` is set, as the bindings pass them). */
function rowOf(tasks: GanttTask[], id: string, options: GanttOptions = {}): GanttFlatRow {
  let rows = flattenTree(tasks);
  const config = resolveConfig(options);
  if (config.rollup) {
    const rollups = computeRollups(tasks, config.rollup, { now: d(1), dates: config });
    rows = applyRollups(rows, rollups, config.rollup);
  }
  const row = rows.find(r => r.task.id === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
}

const rulesOf = (
  tasks: GanttTask[],
  id: string,
  options: GanttOptions = { editing: true },
  { enableDrag = true, enableResize = true } = {},
) => editRules(rowOf(tasks, id, options), { config: resolveConfig(options), enableDrag, enableResize });

const ALL: EditRules = { move: true, resize: true, progress: true, linkFrom: true, linkTo: true, cells: true };
const NONE: EditRules = { move: false, resize: false, progress: false, linkFrom: false, linkTo: false, cells: false };

describe('editRules', () => {
  it('a plain task bar with editing on: everything', () => {
    expect(rulesOf([task('a')], 'a')).toEqual(ALL);
  });

  it('editing off: drag and resize as today, nothing else (D2)', () => {
    expect(rulesOf([task('a')], 'a', {})).toEqual({ ...NONE, move: true, resize: true });
    expect(rulesOf([task('a')], 'a', { editing: false })).toEqual({ ...NONE, move: true, resize: true });
  });

  it('editable: false locks the whole row', () => {
    expect(rulesOf([task('a', { editable: false })], 'a')).toEqual(NONE);
    expect(rulesOf([task('a', { editable: true })], 'a')).toEqual(ALL);
  });

  it('draggable: false locks the dates only', () => {
    expect(rulesOf([task('a', { draggable: false })], 'a')).toEqual({ ...ALL, move: false, resize: false });
  });

  it('enableDrag off locks move and resize; enableResize off locks resize', () => {
    const tasks = [task('a')];
    expect(rulesOf(tasks, 'a', { editing: true }, { enableDrag: false })).toEqual({
      ...ALL,
      move: false,
      resize: false,
    });
    expect(rulesOf(tasks, 'a', { editing: true }, { enableResize: false })).toEqual({ ...ALL, resize: false });
  });

  it('milestones: move and link, no resize, no progress', () => {
    const tasks = [task('m', { type: 'milestone', end: d(5) })];
    expect(rulesOf(tasks, 'm')).toEqual({ ...ALL, resize: false, progress: false });
  });

  it('group bars: move, progress and links, no resize', () => {
    const tasks = [task('g', { type: 'group' }), task('k', { parentId: 'g' })];
    expect(rulesOf(tasks, 'g')).toEqual({ ...ALL, resize: false });
    // A custom bar type is drawn as a task bar
    expect(rulesOf([task('c', { barType: 'fancy' })], 'c')).toEqual(ALL);
  });

  it('a rolled-up parent: its derived dates and progress are locked, the rest is not', () => {
    const tasks = [task('p'), task('k', { parentId: 'p' })];
    expect(rulesOf(tasks, 'p', { editing: true, rollup: true })).toEqual({
      ...ALL,
      move: false,
      resize: false,
      progress: false,
    });
    expect(rulesOf(tasks, 'p', { editing: true, rollup: { dates: false } })).toEqual({ ...ALL, progress: false });
    expect(rulesOf(tasks, 'p', { editing: true, rollup: { progress: false } })).toEqual({
      ...ALL,
      move: false,
      resize: false,
    });
    // Without rollup a parent is a plain bar; its child is never rolled up
    expect(rulesOf(tasks, 'p')).toEqual(ALL);
    expect(rulesOf(tasks, 'k', { editing: true, rollup: true })).toEqual(ALL);
  });

  it('reads the raw row too (no rollup copy): the rule comes from the config, not the copy', () => {
    const tasks = [task('p'), task('k', { parentId: 'p' })];
    const raw = flattenTree(tasks).find(r => r.task.id === 'p')!;
    const config = resolveConfig({ editing: true, rollup: true });
    expect(editRules(raw, { config, enableDrag: true, enableResize: true }).move).toBe(false);
  });

  it('each editing feature turns its rules off', () => {
    const tasks = [task('a')];
    expect(rulesOf(tasks, 'a', { editing: { progress: false } })).toEqual({ ...ALL, progress: false });
    expect(rulesOf(tasks, 'a', { editing: { cells: false } })).toEqual({ ...ALL, cells: false });
    expect(rulesOf(tasks, 'a', { editing: { dependencies: false } })).toEqual({
      ...ALL,
      linkFrom: false,
      linkTo: false,
    });
    expect(rulesOf(tasks, 'a', { editing: { dependencies: { create: false } } })).toEqual({
      ...ALL,
      linkFrom: false,
      linkTo: false,
    });
    // History and controlled mode don't change what a row allows
    expect(rulesOf(tasks, 'a', { editing: { history: false, controlled: true } })).toEqual(ALL);
  });
});

describe('cellEditable', () => {
  const builtins = buildBuiltinColumns(DEFAULT_LABELS);
  const col = (key: string): ColumnDef => {
    const c = builtins.find(b => b.key === key);
    if (!c) throw new Error(`no column ${key}`);
    return c;
  };
  const custom = (extra: Partial<ColumnDef> = {}): ColumnDef => ({
    key: 'owner',
    label: 'Owner',
    width: 100,
    ...extra,
  });

  /** `col`'s cell on the row of `tasks[0]` */
  const can = (c: ColumnDef, tasks: GanttTask[], options: GanttOptions = { editing: true }, rules?: EditRules) => {
    const row = rowOf(tasks, tasks[0].id, options);
    const config = resolveConfig(options);
    return cellEditable(c, row, rules ?? editRules(row, { config, enableDrag: true, enableResize: true }), config);
  };

  it('the built-in name, start, end, duration, progress and predecessors cells are editable; the others are not', () => {
    const tasks = [task('a')];
    const editable = builtins.filter(c => can(c, tasks)).map(c => c.key);
    expect(editable).toEqual(['name', 'start', 'end', 'duration', 'progress', 'predecessors']);
  });

  it('nothing is editable with editing.cells off, editing off, or on a read-only row', () => {
    const tasks = [task('a')];
    expect(builtins.some(c => can(c, tasks, { editing: { cells: false } }))).toBe(false);
    expect(builtins.some(c => can(c, tasks, {}))).toBe(false);
    expect(builtins.some(c => can(c, [task('a', { editable: false })]))).toBe(false);
    expect(can(custom({ editable: true }), [task('a', { editable: false })])).toBe(false);
    // `editing.cells` off wins over rules that say otherwise
    expect(can(col('name'), tasks, { editing: { cells: false } }, { ...NONE, cells: true })).toBe(false);
  });

  it('each date / progress / link cell follows its row rule', () => {
    const milestone = [task('m', { type: 'milestone', end: d(5) })];
    expect(['start', 'end', 'duration', 'progress'].map(k => can(col(k), milestone))).toEqual([
      true,
      false,
      false,
      false,
    ]);
    const pinned = [task('a', { draggable: false })];
    expect(['name', 'start', 'end', 'duration', 'progress'].map(k => can(col(k), pinned))).toEqual([
      true,
      false,
      false,
      false,
      true,
    ]);
    const tasks = [task('a')];
    // Predecessors: links created or deleted here (the cell is the keyboard path to remove one)
    expect(can(col('predecessors'), tasks, { editing: { dependencies: { create: false, delete: false } } })).toBe(
      false,
    );
    expect(can(col('predecessors'), tasks, { editing: { dependencies: { create: false } } })).toBe(true);
    expect(can(col('predecessors'), tasks, { editing: { dependencies: { delete: false } } })).toBe(true);
    expect(can(col('progress'), tasks, { editing: { progress: false } })).toBe(false);
  });

  it('a rolled-up parent keeps its name and links editable, not its derived fields', () => {
    const tasks = [task('p'), task('k', { parentId: 'p' })];
    const keys = builtins.filter(c => can(c, tasks, { editing: true, rollup: true })).map(c => c.key);
    expect(keys).toEqual(['name', 'predecessors']);
  });

  it('custom columns are read-only unless editable says so; a function decides per row', () => {
    const tasks = [task('a', { data: { owner: 'Ann' } })];
    expect(can(custom(), tasks)).toBe(false);
    expect(can(custom({ editable: true }), tasks)).toBe(true);
    expect(can(custom({ editable: false }), tasks)).toBe(false);
    const seen: string[] = [];
    const perRow = custom({
      editable: row => {
        seen.push(row.task.id);
        return row.task.data?.['owner'] === 'Ann';
      },
    });
    expect(can(perRow, tasks)).toBe(true);
    expect(can(perRow, [task('b')])).toBe(false);
    expect(seen).toEqual(['a', 'b']);
  });

  it('editable on a built-in key: false turns it off, true still needs the field rule', () => {
    const tasks = [task('a')];
    expect(can({ ...col('name'), editable: false }, tasks)).toBe(false);
    expect(can({ ...col('start'), editable: () => false }, tasks)).toBe(false);
    expect(can({ ...col('end'), editable: true }, [task('m', { type: 'milestone', end: d(5) })])).toBe(false);
    // Read-only built-ins can be opted in (with your own parser), except the id
    expect(can({ ...col('type'), editable: true }, tasks)).toBe(true);
    expect(can({ ...col('status'), editable: true }, tasks)).toBe(true);
    expect(can({ ...col('id'), editable: true }, tasks)).toBe(false);
  });

  it('your column over a built-in key edits that field: the key decides, not the builtin flag', () => {
    const tasks = [task('a')];
    const own: ColumnDef = { key: 'start', label: 'Begins', width: 90, render: r => r.task.start.toDateString() };
    expect(can(own, tasks)).toBe(true);
    expect(can(own, [task('a', { draggable: false })])).toBe(false);
    expect(can({ key: 'name', label: 'Name', width: 90, cellTemplate: {} }, tasks)).toBe(true);
  });
});

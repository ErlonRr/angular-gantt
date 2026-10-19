// ─────────────────────────────────────────────────────────────
//  Tests — editing/cells.ts: built-in and custom cell editors, the edit
//  state machine and the cell keys (runs under test:tz: dates are built
//  with new Date(y, m, d, h); UTC date-only values with Date.UTC)
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  cellEditKey,
  commitCellValue,
  reduceCellEdit,
  resolveCellEditor,
  type CellEditState,
  type ResolvedCellEditor,
} from '../editing/cells';
import { editRules } from '../editing/permissions';
import { flattenTree } from '../gantt-data';
import { isUtcDateOnly } from '../gantt-math';
import { buildBuiltinColumns, buildColumnContext } from '../render/columns';
import { resolveConfig } from '../render/config';
import {
  DEFAULT_LABELS,
  TaskType,
  type ColumnDef,
  type GanttFlatRow,
  type GanttOptions,
  type GanttTask,
} from '../types';

const L = DEFAULT_LABELS;
const day = (m: number, d: number, h = 0, min = 0) => new Date(2026, m, d, h, min);
const utc = (m: number, d: number) => new Date(Date.UTC(2026, m, d));
const NOW = day(9, 1);

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: day(9, 5), end: day(9, 10), progress: 40, data: { owner: 'Ann', estimate: 8 } },
  { id: 'b', name: 'Build', start: day(9, 12), end: day(9, 20), dependency: 'a' },
  { id: 'c', name: 'Research', start: utc(9, 5), end: utc(9, 10) },
  // times that are no UTC midnight in the test:tz zones (17:00 in Los Angeles would read as date-only)
  { id: 'd', name: 'Timed', start: day(9, 5, 9, 30), end: day(9, 7, 17, 30) },
  { id: 'm', name: 'Launch', start: day(9, 25), end: day(9, 25), type: TaskType.Milestone },
  { id: 'r', name: 'Locked', start: day(9, 5), end: day(9, 10), editable: false },
  { id: 'x1', name: 'Twin', start: day(9, 5), end: day(9, 6) },
  { id: 'x2', name: 'Twin', start: day(9, 5), end: day(9, 6) },
];

const BUILTINS = buildBuiltinColumns(L);
const builtin = (key: string): ColumnDef => BUILTINS.find(c => c.key === key)!;

interface Setup {
  editor: ResolvedCellEditor | null;
  row: GanttFlatRow;
  commit: (value: string) => ReturnType<typeof commitCellValue>;
}

function setup(col: ColumnDef | string, taskId: string, options: GanttOptions = {}, tasks: GanttTask[] = TASKS): Setup {
  const config = resolveConfig({ editing: true, ...options });
  const ctx = buildColumnContext({ tasks, config, now: NOW });
  const row = flattenTree(tasks).find(r => r.task.id === taskId)!;
  const rules = editRules(row, { config, enableDrag: true, enableResize: true });
  const column = typeof col === 'string' ? builtin(col) : col;
  const editor = resolveCellEditor(column, row, { config, ctx, labels: L, rules });
  return {
    editor,
    row,
    commit: value => {
      if (!editor) throw new Error('no editor');
      return commitCellValue(editor, value, row, ctx);
    },
  };
}

const custom = (key: string, extra: Partial<ColumnDef> = {}): ColumnDef => ({
  key,
  label: key,
  width: 100,
  editable: true,
  ...extra,
});

describe('resolveCellEditor: which cells are edited', () => {
  it('none while editing.cells is off', () => {
    const config = resolveConfig({ editing: { cells: false } });
    const ctx = buildColumnContext({ tasks: TASKS, config, now: NOW });
    const row = flattenTree(TASKS)[0];
    const rules = editRules(row, { config, enableDrag: true, enableResize: true });
    expect(resolveCellEditor(builtin('name'), row, { config, ctx, labels: L, rules })).toBeNull();
    expect(setup('name', 'a', { editing: false }).editor).toBeNull();
  });

  it('the editable built-ins only; never the id, nor a read-only row', () => {
    for (const key of ['name', 'start', 'end', 'duration', 'progress', 'predecessors']) {
      expect(setup(key, 'a').editor, key).not.toBeNull();
    }
    for (const key of ['id', 'type', 'status', 'baselineStart', 'baselineEnd', 'variance']) {
      expect(setup(key, 'a').editor, key).toBeNull();
    }
    expect(setup('name', 'r').editor).toBeNull();
    expect(setup(custom('id'), 'a').editor).toBeNull();
  });

  it('a milestone: no end, duration or progress; its start moves it', () => {
    expect(setup('start', 'm').editor).not.toBeNull();
    expect(setup('end', 'm').editor).toBeNull();
    expect(setup('duration', 'm').editor).toBeNull();
    expect(setup('progress', 'm').editor).toBeNull();
  });

  it('custom columns: only when editable (a value or per row)', () => {
    expect(setup(custom('owner', { editable: undefined }), 'a').editor).toBeNull();
    const perRow = custom('owner', { editable: r => r.task.id !== 'b' });
    expect(setup(perRow, 'a').editor).not.toBeNull();
    expect(setup(perRow, 'b').editor).toBeNull();
  });
});

describe('resolveCellEditor: built-in editors', () => {
  it('name: text, trimmed and required', () => {
    const { editor, commit } = setup('name', 'a');
    expect(editor).toMatchObject({ kind: 'text', input: { type: 'text' }, value: 'Design' });
    expect(commit('  Design v2 ')).toEqual({ patch: { name: 'Design v2' } });
    expect(commit('   ')).toEqual({ error: L.errorRequired });
    expect(commit(' Design ')).toEqual({ patch: {} });
  });

  it('start: a date input; a new start keeps the duration', () => {
    const { editor, commit } = setup('start', 'a');
    expect(editor).toMatchObject({ kind: 'date', input: { type: 'date' }, value: '2026-10-05' });
    expect(commit('2026-10-08')).toEqual({ patch: { start: day(9, 8), end: day(9, 13) } });
    expect(commit('2026-09-28')).toEqual({ patch: { start: day(8, 28), end: day(9, 3) } });
    expect(commit('2026-10-05')).toEqual({ patch: {} });
    expect(commit('')).toEqual({ error: L.errorRequired });
    expect(commit('2026-02-30')).toEqual({ error: L.errorDate });
    expect(commit('soon')).toEqual({ error: L.errorDate });
  });

  it('start and end keep UTC date-only values date-only', () => {
    const start = setup('start', 'c');
    expect(start.editor?.value).toBe('2026-10-05');
    const r = start.commit('2026-10-07');
    if (!('patch' in r)) throw new Error(r.error);
    expect(r.patch.start?.getTime()).toBe(Date.UTC(2026, 9, 7));
    expect(r.patch.end?.getTime()).toBe(Date.UTC(2026, 9, 12));
    if (r.patch.start!.getTimezoneOffset() !== 0) {
      expect(isUtcDateOnly(r.patch.start!)).toBe(true);
      expect(isUtcDateOnly(r.patch.end!)).toBe(true);
    }
    const end = setup('end', 'c').commit('2026-10-15');
    expect('patch' in end && end.patch.end?.getTime()).toBe(Date.UTC(2026, 9, 15));
  });

  it('datetime-local when the value has a time or the scale is hours', () => {
    const timed = setup('start', 'd');
    expect(timed.editor).toMatchObject({ kind: 'datetime-local', value: '2026-10-05T09:30' });
    // 09:30 → 08:00 the next day: the end moves by the same amount
    expect(timed.commit('2026-10-06T08:00')).toEqual({ patch: { start: day(9, 6, 8), end: day(9, 8, 16) } });
    expect(setup('end', 'd').editor?.value).toBe('2026-10-07T17:30');

    const hourly = setup('start', 'a', { viewMode: 'Hour' });
    expect(hourly.editor).toMatchObject({ kind: 'datetime-local', input: { type: 'datetime-local' } });
    expect(hourly.editor?.value).toBe('2026-10-05T00:00');
    expect(hourly.commit('2026-10-05T06:00')).toEqual({ patch: { start: day(9, 5, 6), end: day(9, 10, 6) } });
    // a plain date typed into a text field still parses
    expect(setup({ ...builtin('start'), editor: 'text' }, 'a').commit('2026-10-06')).toEqual({
      patch: { start: day(9, 6), end: day(9, 11) },
    });
  });

  it('end: the stored end, not before the start (an inclusive end may equal it)', () => {
    const { editor, commit } = setup('end', 'a');
    expect(editor).toMatchObject({ kind: 'date', value: '2026-10-10' });
    expect(commit('2026-10-12')).toEqual({ patch: { end: day(9, 12) } });
    expect(commit('2026-10-04')).toEqual({ error: L.errorEndBeforeStart });
    expect(commit('2026-10-05')).toEqual({ patch: { end: day(9, 5) } });
    const inclusive = setup('end', 'a', { endDateMode: 'inclusive' });
    expect(inclusive.editor?.value).toBe('2026-10-10');
    expect(inclusive.commit('2026-10-05')).toEqual({ patch: { end: day(9, 5) } });
  });

  it('start keeps the duration in inclusive end mode, with a time too', () => {
    const tasks: GanttTask[] = [{ id: 'i', name: 'I', start: day(9, 5), end: day(9, 9) }];
    const s = setup('start', 'i', { endDateMode: 'inclusive', viewMode: 'Hour' }, tasks);
    // drawn Oct 5 00:00 → Oct 10 00:00; moved by 6 h it is drawn Oct 5 06:00 → Oct 10 06:00
    expect(s.commit('2026-10-05T06:00')).toEqual({ patch: { start: day(9, 5, 6), end: day(9, 10, 6) } });
    expect(s.commit('2026-10-07T00:00')).toEqual({ patch: { start: day(9, 7), end: day(9, 11) } });
  });

  it('duration: as drawn; sets the end, more than 0', () => {
    const { editor, commit } = setup('duration', 'a');
    expect(editor).toMatchObject({ kind: 'text', value: '5d' });
    expect(commit('3')).toEqual({ patch: { end: day(9, 8) } });
    expect(commit('2w')).toEqual({ patch: { end: day(9, 19) } });
    expect(commit('4h')).toEqual({ patch: { end: day(9, 5, 4) } });
    expect(commit('1.5d')).toEqual({ patch: { end: day(9, 6, 12) } });
    expect(commit('5d')).toEqual({ patch: {} });
    expect(commit('0')).toEqual({ error: L.errorDuration });
    expect(commit('soon')).toEqual({ error: L.errorDuration });
    const inclusive = setup('duration', 'a', { endDateMode: 'inclusive' });
    expect(inclusive.editor?.value).toBe('6d');
    expect(inclusive.commit('3d')).toEqual({ patch: { end: day(9, 7) } });
    expect(setup('duration', 'd').editor?.value).toBe('56h');
  });

  it('progress: a number from 0 to 100, stepped by editing.progress.step', () => {
    const { editor, commit } = setup('progress', 'a');
    expect(editor).toMatchObject({ kind: 'number', input: { type: 'number', min: 0, max: 100, step: 5 }, value: '40' });
    expect(setup('progress', 'a', { editing: { progress: { step: 10 } } }).editor?.input.step).toBe(10);
    expect(commit('45%')).toEqual({ patch: { progress: 45 } });
    expect(commit('12,5')).toEqual({ patch: { progress: 12.5 } });
    expect(commit('150')).toEqual({ error: L.errorRange(0, 100) });
    expect(commit('-1')).toEqual({ error: L.errorRange(0, 100) });
    expect(commit('lots')).toEqual({ error: L.errorNumber });
    expect(commit('')).toEqual({ error: L.errorRequired });
    expect(setup('progress', 'b').editor?.value).toBe('0');
    const narrow = setup({ ...builtin('progress'), editorOptions: { max: 80, step: 1 } }, 'a');
    expect(narrow.editor?.input).toEqual({ type: 'number', min: 0, max: 80, step: 1 });
    expect(narrow.commit('90')).toEqual({ error: L.errorRange(0, 80) });
  });

  it('predecessors: ids in, ids or unique names read back; empty removes the links', () => {
    const { editor, commit } = setup('predecessors', 'b');
    expect(editor).toMatchObject({ kind: 'text', value: 'a' });
    expect(commit('research FS+2d; a SS')).toEqual({
      patch: {
        dependency: [
          { taskId: 'c', lag: 2 },
          { taskId: 'a', type: 'SS' },
        ],
      },
    });
    expect(commit('')).toEqual({ patch: { dependency: undefined } });
    // the same links in another shape: nothing to change
    expect(commit(' A ')).toEqual({ patch: {} });
    expect(commit('reserch FS+2d')).toEqual({ error: L.errorUnknownTask('reserch') });
    expect(commit('Twin')).toEqual({ error: L.errorAmbiguousTask('Twin') });
    expect(commit('+2d')).toEqual({ error: L.errorUnknownTask('+2d') });
    expect(commit('a; design')).toEqual({ error: L.errorDuplicateLink });
    expect(commit('a; a SS')).toEqual({ patch: { dependency: [{ taskId: 'a' }, { taskId: 'a', type: 'SS' }] } });
  });

  it('a column over a built-in key keeps the built-in editor, unless it brings parse', () => {
    const rendered = custom('start', { editable: undefined, render: r => `from ${r.task.start.getDate()}` });
    expect(setup(rendered, 'a').editor).toMatchObject({ kind: 'date', value: '2026-10-05' });
    const parsed = custom('start', {
      render: () => 'week 41',
      parse: () => ({ start: day(9, 6), end: day(9, 11) }),
    });
    const p = setup(parsed, 'a');
    expect(p.editor).toMatchObject({ kind: 'text', value: 'week 41' });
    expect(p.commit('week 42')).toEqual({ patch: { start: day(9, 6), end: day(9, 11) } });
  });

  it('a custom editor on a built-in column: kind custom over the same value and parser', () => {
    const { editor, commit } = setup({ ...builtin('start'), editor: () => ({}) }, 'a');
    expect(editor).toMatchObject({ kind: 'custom', input: { type: 'date' }, value: '2026-10-05' });
    expect(commit('2026-10-06')).toEqual({ patch: { start: day(9, 6), end: day(9, 11) } });
    expect(setup({ ...builtin('name'), editor: () => ({}) }, 'a').editor).toMatchObject({
      kind: 'custom',
      input: { type: 'text' },
    });
  });

  it('the column validate runs after the built-in checks', () => {
    const col = { ...builtin('name'), validate: (p: Partial<GanttTask>) => (p.name === 'TBD' ? 'Name it' : null) };
    const { commit } = setup(col, 'a');
    expect(commit('TBD')).toEqual({ error: 'Name it' });
    expect(commit('Fine')).toEqual({ patch: { name: 'Fine' } });
    const end = { ...builtin('end'), validate: () => 'never shown' };
    expect(setup(end, 'a').commit('2026-10-01')).toEqual({ error: L.errorEndBeforeStart });
  });
});

describe('resolveCellEditor: custom columns', () => {
  it('a text editor over data[key], written to a new data object', () => {
    const { editor, row, commit } = setup(custom('owner'), 'a');
    expect(editor).toMatchObject({ kind: 'text', input: { type: 'text' }, value: 'Ann' });
    const r = commit(' Bo ');
    expect(r).toEqual({ patch: { data: { owner: 'Bo', estimate: 8 } } });
    expect('patch' in r && r.patch.data).not.toBe(row.task.data);
    expect(commit('')).toEqual({ patch: { data: { estimate: 8 } } });
    expect(setup(custom('owner'), 'b').editor?.value).toBe('');
    expect(setup(custom('owner'), 'b').commit('Cy')).toEqual({ patch: { data: { owner: 'Cy' } } });
  });

  it('a GanttTask field is written on the task; empty clears it', () => {
    const { editor, commit } = setup(custom('barColor'), 'a');
    expect(editor?.value).toBe('');
    expect(commit('#c00')).toEqual({ patch: { barColor: '#c00' } });
    const set = setup(custom('barColor'), 'x', {}, [{ ...TASKS[0], id: 'x', barColor: '#0c0' }]);
    expect(set.editor?.value).toBe('#0c0');
    expect(set.commit('')).toEqual({ patch: { barColor: undefined } });
  });

  it('the first value: exportValue, else render, else the field', () => {
    expect(setup(custom('owner', { render: r => `@${String(r.task.data?.['owner'])}` }), 'a').editor?.value).toBe(
      '@Ann',
    );
    expect(setup(custom('owner', { render: () => 'shown', exportValue: () => 'exported' }), 'a').editor?.value).toBe(
      'exported',
    );
    expect(setup(custom('estimate'), 'a').editor?.value).toBe('8');
  });

  it('a number editor writes a number and checks editorOptions min / max', () => {
    const col = custom('estimate', {
      editor: 'number',
      editorOptions: { min: 1, max: 80 },
      validate: p => (p.data?.['estimate'] === 13 ? 'Unlucky' : undefined),
    });
    const { editor, commit } = setup(col, 'a');
    expect(editor).toMatchObject({ kind: 'number', input: { type: 'number', min: 1, max: 80 }, value: '8' });
    expect(commit('12')).toEqual({ patch: { data: { owner: 'Ann', estimate: 12 } } });
    expect(commit('100')).toEqual({ error: L.errorRange(1, 80) });
    expect(commit('x')).toEqual({ error: L.errorNumber });
    expect(commit('13')).toEqual({ error: 'Unlucky' });
    expect(setup(custom('estimate', { editor: 'number', editorOptions: { min: 0 } }), 'a').commit('-2')).toEqual({
      error: L.errorRange(0, Infinity),
    });
  });

  it('a select editor carries its options and writes the text', () => {
    const options = [
      { value: 'Ann', label: 'Ann' },
      { value: 'Bo', label: 'Bo' },
    ];
    const { editor, commit } = setup(custom('owner', { editor: 'select', editorOptions: { options } }), 'a');
    expect(editor).toMatchObject({ kind: 'select', input: { type: 'select', options } });
    expect(commit('Bo')).toEqual({ patch: { data: { owner: 'Bo', estimate: 8 } } });
  });

  it('a date editor formats and parses a Date field', () => {
    const tasks: GanttTask[] = [{ ...TASKS[0], data: { due: utc(9, 30) } }];
    const { editor, commit } = setup(custom('due', { editor: 'date' }), 'a', {}, tasks);
    expect(editor).toMatchObject({ kind: 'date', value: '2026-10-30' });
    const r = commit('2026-10-31');
    expect('patch' in r && (r.patch.data?.['due'] as Date).getTime()).toBe(Date.UTC(2026, 9, 31));
    expect(commit('31/10')).toEqual({ error: L.errorDate });
  });

  it('a column parse: its patch, its thrown message, and the built-in field checks', () => {
    const col = custom('colour', {
      exportValue: r => r.task.style?.color ?? '',
      parse: v => {
        if (!v.startsWith('#')) throw new Error('Pick a colour');
        return { style: { color: v } };
      },
    });
    const { editor, commit } = setup(col, 'a');
    expect(editor).toMatchObject({ kind: 'text', value: '' });
    expect(commit('#123456')).toEqual({ patch: { style: { color: '#123456' } } });
    expect(commit('red')).toEqual({ error: 'Pick a colour' });
    const progress = custom('pct', { parse: v => ({ progress: Number(v) }) });
    expect(setup(progress, 'a').commit('120')).toEqual({ error: L.errorRange(0, 100) });
    const odd = custom('odd', {
      parse: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 42;
      },
    });
    expect(setup(odd, 'a').commit('x')).toEqual({ error: L.errorRejected });
  });

  it('a framework editor is kind custom with a text input', () => {
    expect(setup(custom('owner', { editor: { template: true } }), 'a').editor).toMatchObject({
      kind: 'custom',
      input: { type: 'text' },
      value: 'Ann',
    });
  });
});

describe('commitCellValue', () => {
  it('compares with the current task from the context', () => {
    const config = resolveConfig({ editing: true });
    const row = flattenTree(TASKS).find(r => r.task.id === 'a')!;
    const rules = editRules(row, { config, enableDrag: true, enableResize: true });
    const ctx = buildColumnContext({ tasks: TASKS, config, now: NOW });
    const editor = resolveCellEditor(builtin('name'), row, { config, ctx, labels: L, rules })!;
    const renamed = buildColumnContext({ tasks: [{ ...TASKS[0], name: 'Spec' }], config, now: NOW });
    expect(commitCellValue(editor, 'Spec', row, renamed)).toEqual({ patch: {} });
    expect(commitCellValue(editor, 'Spec', row, ctx)).toEqual({ patch: { name: 'Spec' } });
  });
});

describe('reduceCellEdit', () => {
  const start = { type: 'start', taskId: 'a', columnKey: 'name', value: 'Design' } as const;

  it('opens, types, fails, retypes and closes', () => {
    let s: CellEditState = reduceCellEdit(null, start);
    expect(s).toEqual({ taskId: 'a', columnKey: 'name', value: 'Design', initial: 'Design', error: null });
    s = reduceCellEdit(s, { type: 'input', value: '' });
    s = reduceCellEdit(s, { type: 'invalid', error: L.errorRequired });
    expect(s).toMatchObject({ value: '', initial: 'Design', error: L.errorRequired });
    s = reduceCellEdit(s, { type: 'input', value: 'D' });
    expect(s).toMatchObject({ value: 'D', error: null });
    expect(reduceCellEdit(s, { type: 'done' })).toBeNull();
  });

  it('a seed replaces the value; the first value stays', () => {
    expect(reduceCellEdit(null, { ...start, seed: 'x' })).toMatchObject({ value: 'x', initial: 'Design' });
  });

  it('keeps the state object when nothing changes; ignores input with no open cell', () => {
    const s = reduceCellEdit(null, start);
    expect(reduceCellEdit(s, { type: 'input', value: 'Design' })).toBe(s);
    const bad = reduceCellEdit(s, { type: 'invalid', error: 'e' });
    expect(reduceCellEdit(bad, { type: 'invalid', error: 'e' })).toBe(bad);
    expect(reduceCellEdit(null, { type: 'input', value: 'x' })).toBeNull();
    expect(reduceCellEdit(null, { type: 'invalid', error: 'e' })).toBeNull();
    expect(reduceCellEdit(null, { type: 'done' })).toBeNull();
  });
});

describe('cellEditKey', () => {
  const idle = (
    key: string,
    mods: Record<string, boolean> = {},
    kind: 'text' | 'number' | 'date' | 'select' | 'custom' = 'text',
  ) => cellEditKey({ key, ...mods }, { editing: false, kind });
  const busy = (key: string, mods: Record<string, boolean> = {}) =>
    cellEditKey({ key, ...mods }, { editing: true, kind: 'text' });

  it('not editing: F2 / Enter start, printable keys seed text editors', () => {
    expect(idle('F2')).toBe('start');
    expect(idle('Enter')).toBe('start');
    expect(idle('Enter', {}, 'date')).toBe('start');
    expect(idle('F2', {}, 'custom')).toBe('start');
    expect(idle('a')).toBe('seed');
    expect(idle('A', { shiftKey: true })).toBe('seed');
    expect(idle('é')).toBe('seed');
    expect(idle('t')).toBe('seed');
    expect(idle(' ')).toBeNull();
    expect(idle('ArrowDown')).toBeNull();
    expect(idle('Escape')).toBeNull();
    expect(idle('Tab')).toBeNull();
    expect(idle('Dead')).toBeNull();
  });

  it('not editing: digits only seed number editors; date, select and custom editors are not seeded', () => {
    expect(idle('7', {}, 'number')).toBe('seed');
    expect(idle('x', {}, 'number')).toBeNull();
    expect(idle('-', {}, 'number')).toBeNull();
    expect(idle('2', {}, 'date')).toBeNull();
    expect(idle('a', {}, 'select')).toBeNull();
    expect(idle('a', {}, 'custom')).toBeNull();
  });

  it('modifier combinations are not the cell’s', () => {
    expect(idle('a', { ctrlKey: true })).toBeNull();
    expect(idle('a', { metaKey: true })).toBeNull();
    expect(idle('@', { ctrlKey: true, altKey: true })).toBeNull();
    expect(idle('F2', { shiftKey: true })).toBeNull();
    expect(idle('Enter', { shiftKey: true })).toBeNull();
    expect(busy('Enter', { ctrlKey: true })).toBeNull();
    expect(busy('Tab', { altKey: true })).toBeNull();
  });

  it('editing: Enter commits, Tab / Shift+Tab commit and move, Escape cancels', () => {
    expect(busy('Enter')).toBe('commit');
    expect(busy('Enter', { shiftKey: true })).toBe('commit');
    expect(busy('Tab')).toBe('commit-next');
    expect(busy('Tab', { shiftKey: true })).toBe('commit-prev');
    expect(busy('Escape')).toBe('cancel');
    expect(busy('Escape', { altKey: true })).toBe('cancel');
    expect(busy('a')).toBeNull();
    expect(busy('F2')).toBeNull();
    expect(busy('ArrowLeft')).toBeNull();
  });
});

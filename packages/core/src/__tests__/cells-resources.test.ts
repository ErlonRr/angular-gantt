// ─────────────────────────────────────────────────────────────
//  Tests — Phase 14 (D14): the Resources cell. Its editor and seed, the text →
//  `{ resources }` patch (ids or names, units in percent), the no-op rule, the
//  labelled errors, and the change it makes through the one pipeline (event,
//  announcement, undo). (runs under test:tz: dates are built with new Date(y, m, d))
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { applyChange, invertChange, taskChange } from '../editing/changes';
import { commitCellValue, resolveCellEditor, type ResolvedCellEditor } from '../editing/cells';
import { prepareChange } from '../editing/pipeline';
import { editRules } from '../editing/permissions';
import { flattenTree } from '../gantt-data';
import { buildBuiltinColumns, buildColumnContext, findColumn } from '../render/columns';
import { dateReadingOf, resolveConfig } from '../render/config';
import { indexResources } from '../resources/model';
import { projectResourceRows } from '../resources/rows';
import { computeResourceUtilization } from '../resources/utilization';
import {
  DEFAULT_LABELS,
  type ColumnDef,
  type GanttFlatRow,
  type GanttLabels,
  type GanttOptions,
  type GanttResource,
  type GanttTask,
} from '../types';

const L = DEFAULT_LABELS;
const d = (day: number) => new Date(2026, 9, day);
const NOW = d(1);

const RESOURCES: GanttResource[] = [
  { id: 'ana', name: 'Ana' },
  { id: 'bo', name: 'Bo', capacity: 50 },
  { id: 'sam1', name: 'Sam' },
  { id: 'sam2', name: 'Sam' },
  { id: 'a,b', name: 'Doe, Jane' },
];
const TASKS: GanttTask[] = [
  { id: 'design', name: 'Design', start: d(12), end: d(16), resources: ['ana', { resourceId: 'bo', units: 50 }] },
  { id: 'plain', name: 'Plain', start: d(12), end: d(16), resources: [{ resourceId: 'ana', units: 100 }] },
  { id: 'bare', name: 'Bare', start: d(12), end: d(16) },
  { id: 'ghosts', name: 'Ghosts', start: d(12), end: d(16), resources: ['ghost', 'ana'] },
  { id: 'locked', name: 'Locked', start: d(12), end: d(16), editable: false, resources: ['ana'] },
];

const BUILTINS = buildBuiltinColumns(L, undefined, undefined, undefined, true);
const resourcesColumn = findColumn(BUILTINS, BUILTINS, 'resources')!;

interface Setup {
  editor: ResolvedCellEditor | null;
  row: GanttFlatRow;
  commit: (value: string) => ReturnType<typeof commitCellValue>;
}

function setup(
  taskId: string,
  options: GanttOptions = {},
  extra: { column?: ColumnDef; resources?: GanttResource[] | null; labels?: GanttLabels; tasks?: GanttTask[] } = {},
): Setup {
  const tasks = extra.tasks ?? TASKS;
  const config = resolveConfig({ editing: true, ...options });
  const index = extra.resources === null ? undefined : indexResources(extra.resources ?? RESOURCES);
  const ctx = buildColumnContext({ tasks, config, now: NOW, resources: index });
  const row = flattenTree(tasks).find(r => r.task.id === taskId)!;
  const rules = editRules(row, { config, enableDrag: true, enableResize: true });
  const labels = extra.labels ?? L;
  const editor = resolveCellEditor(extra.column ?? resourcesColumn, row, { config, ctx, labels, rules });
  return {
    editor,
    row,
    commit: value => {
      if (!editor) throw new Error('no editor');
      return commitCellValue(editor, value, row, ctx);
    },
  };
}

const patchOf = (r: ReturnType<typeof commitCellValue>) => {
  if ('error' in r) throw new Error(`error: ${r.error}`);
  return r.patch;
};
const errorOf = (r: ReturnType<typeof commitCellValue>) => {
  if (!('error' in r)) throw new Error(`no error: ${JSON.stringify(r.patch)}`);
  return r.error;
};

describe('the Resources cell: which cells are edited', () => {
  it('an editable task gets a text editor seeded with its assignments', () => {
    const s = setup('design');
    expect(s.editor?.kind).toBe('text');
    expect(s.editor?.input.type).toBe('text');
    expect(s.editor?.value).toBe('Ana, Bo 50%');
    expect(setup('bare').editor?.value).toBe('');
    // Units of 100 are left out, ids that name no resource too
    expect(setup('plain').editor?.value).toBe('Ana');
    expect(setup('ghosts').editor?.value).toBe('Ana');
  });

  it('a name with a separator is written by its id, so the text reads back', () => {
    const tasks: GanttTask[] = [{ id: 'x', name: 'X', start: d(12), end: d(14), resources: ['a,b', 'bo'] }];
    const s = setup('x', {}, { tasks });
    expect(s.editor?.value).toBe('a,b, Bo');
  });

  it('none while editing.cells is off, editing is off or the task is read-only', () => {
    expect(setup('design', { editing: { cells: false } }).editor).toBeNull();
    expect(setup('design', { editing: false }).editor).toBeNull();
    expect(setup('locked').editor).toBeNull();
  });

  it('none on the rows of the resource view, which are read-only', () => {
    const config = resolveConfig({ editing: true, rows: 'resources' });
    const dates = dateReadingOf(config);
    const index = indexResources(RESOURCES);
    const utilization = computeResourceUtilization(TASKS, index, dates, { unassigned: true });
    const tasks = projectResourceRows({
      tasks: TASKS,
      index,
      utilization,
      view: config.resourceView,
      labels: L,
      dates,
    });
    const ctx = buildColumnContext({ tasks, config, now: NOW, resources: index, rows: 'resources' });
    const rows = flattenTree(tasks, undefined, { order: 'input' });
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      const rules = editRules(row, { config, enableDrag: true, enableResize: true });
      for (const key of ['resources', 'capacity', 'load', 'name']) {
        const col = findColumn(BUILTINS, BUILTINS, key)!;
        expect(resolveCellEditor(col, row, { config, ctx, labels: L, rules }), `${row.task.id} ${key}`).toBeNull();
      }
    }
  });

  it('the Capacity and Peak load cells are never editable', () => {
    for (const key of ['capacity', 'load']) {
      const col = findColumn(BUILTINS, BUILTINS, key)!;
      expect(setup('design', {}, { column: col }).editor, key).toBeNull();
    }
  });
});

describe('the Resources cell: text → patch', () => {
  it('reads ids and names, case-insensitively, and keeps the order typed', () => {
    expect(patchOf(setup('bare').commit('Ana'))).toEqual({ resources: ['ana'] });
    expect(patchOf(setup('bare').commit('bo, ANA'))).toEqual({ resources: ['bo', 'ana'] });
    expect(patchOf(setup('bare').commit('Bo; Ana'))).toEqual({ resources: ['bo', 'ana'] });
  });

  it('reads the units after a name; 100 is left out', () => {
    expect(patchOf(setup('bare').commit('Ana 50%, Bo 150%'))).toEqual({
      resources: [
        { resourceId: 'ana', units: 50 },
        { resourceId: 'bo', units: 150 },
      ],
    });
    expect(patchOf(setup('bare').commit('Ana 100%'))).toEqual({ resources: ['ana'] });
    expect(patchOf(setup('bare').commit('Ana 12.5 %'))).toEqual({ resources: [{ resourceId: 'ana', units: 12.5 }] });
  });

  it('a duplicate of one resource keeps the first', () => {
    expect(patchOf(setup('bare').commit('Ana 50%, ana'))).toEqual({ resources: [{ resourceId: 'ana', units: 50 }] });
  });

  it('an empty text unassigns the task', () => {
    const patch = patchOf(setup('design').commit('  '));
    expect(patch).toEqual({ resources: undefined });
    expect('resources' in patch).toBe(true);
  });

  it('commits nothing when the text is the seed', () => {
    expect(patchOf(setup('design').commit('Ana, Bo 50%'))).toEqual({});
    expect(patchOf(setup('bare').commit(''))).toEqual({});
  });

  it('commits nothing when the assignments are the same, however they are written', () => {
    // `{ resourceId: 'ana', units: 100 }` and `'ana'` load the same
    expect(patchOf(setup('plain').commit('ana'))).toEqual({});
    expect(patchOf(setup('design').commit('Bo 50%, Ana')).resources).toBeDefined();
    expect(patchOf(setup('design').commit('ana, bo 50%'))).toEqual({});
  });

  it('keeps an unknown id the app listed when the text still names the same resources', () => {
    expect(patchOf(setup('ghosts').commit('ana'))).toEqual({});
    expect(patchOf(setup('ghosts').commit('Ana, Bo'))).toEqual({ resources: ['ana', 'bo'] });
  });

  it('a custom column keyed resources with its own parse is the consumer’s', () => {
    const own: ColumnDef = { key: 'resources', label: 'Who', width: 100, parse: v => ({ resources: [v.trim()] }) };
    // Not the built-in column: editable only when it says so (Phase 14 D18)
    expect(setup('bare', {}, { column: own }).editor).toBeNull();
    const s = setup('bare', {}, { column: { ...own, editable: true } });
    expect(s.editor).not.toBeNull();
    expect(patchOf(s.commit('zed'))).toEqual({ resources: ['zed'] });
  });
});

describe('the Resources cell: errors', () => {
  it('an unknown resource names itself', () => {
    expect(errorOf(setup('bare').commit('Ana, Zed'))).toBe(L.errorUnknownResource('Zed'));
    expect(errorOf(setup('bare').commit('Zed'))).toBe('No resource “Zed”');
  });

  it('a name shared by several resources is ambiguous; its id is not', () => {
    expect(errorOf(setup('bare').commit('Sam'))).toBe(L.errorAmbiguousResource('Sam'));
    expect(patchOf(setup('bare').commit('sam2'))).toEqual({ resources: ['sam2'] });
  });

  it('units that are not above 0, or a percentage alone, are rejected', () => {
    expect(errorOf(setup('bare').commit('Ana 0%'))).toBe(L.errorRejected);
    expect(errorOf(setup('bare').commit('50%'))).toBe(L.errorRejected);
  });

  it('the messages come from the labels', () => {
    const it: GanttLabels = {
      ...L,
      errorUnknownResource: ref => `Risorsa «${ref}» sconosciuta`,
      errorAmbiguousResource: ref => `«${ref}» è ambiguo`,
    };
    expect(errorOf(setup('bare', {}, { labels: it }).commit('Zed'))).toBe('Risorsa «Zed» sconosciuta');
    expect(errorOf(setup('bare', {}, { labels: it }).commit('Sam'))).toBe('«Sam» è ambiguo');
  });

  it('no resources property: any name is unknown, and an empty text is no change', () => {
    const none = setup('design', {}, { resources: null });
    expect(none.editor?.value).toBe('');
    expect(errorOf(none.commit('Ana'))).toBe(L.errorUnknownResource('Ana'));
    expect(patchOf(none.commit(''))).toEqual({});
  });

  it('the editor throws the message from parse, as every cell does', () => {
    const s = setup('bare');
    expect(() => s.editor?.parse('Zed')).toThrow(L.errorUnknownResource('Zed'));
    expect(s.editor?.validate({ resources: ['ana'] })).toBeNull();
  });
});

describe('the Resources cell: the change through the pipeline', () => {
  const tasks = TASKS;
  const config = resolveConfig({ editing: true });
  const run = (taskId: string, text: string) => {
    const s = setup(taskId);
    const patch = patchOf(s.commit(text));
    const task = tasks.find(t => t.id === taskId)!;
    const change = taskChange(task, patch, 'cell', { column: 'resources' });
    return { patch, task, change, prepared: prepareChange(change, { tasks, config, labels: L }) };
  };

  it('is one task-updated of the field resources, with no date op', () => {
    const { change, prepared } = run('bare', 'Ana, Bo 50%');
    expect(change.ops).toEqual([]);
    expect(change.updates).toHaveLength(1);
    expect(change.updates[0]?.after).toEqual({ resources: ['ana', { resourceId: 'bo', units: 50 }] });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.events.map(e => e.type)).toEqual(['task-updated']);
    const detail = prepared.events[0]?.detail as { taskId: string; fields: string[]; source: string };
    expect(detail).toMatchObject({ taskId: 'bare', fields: ['resources'], source: 'cell' });
    expect(prepared.proposed.find(t => t.id === 'bare')?.resources).toEqual(['ana', { resourceId: 'bo', units: 50 }]);
  });

  it('is announced as an edit of the Resources column', () => {
    const { prepared } = run('bare', 'Ana');
    if (!prepared.ok) throw new Error(prepared.message);
    expect(prepared.announcement).toBe(L.describeEdit('Bare', L.colResources));
    expect(prepared.announcement).toContain('Resources');
  });

  it('undo restores the assignments the app had, redo applies them again', () => {
    const { change, prepared, task } = run('design', 'Ana');
    if (!prepared.ok) throw new Error(prepared.message);
    const after = applyChange(tasks, change);
    expect(after.find(t => t.id === 'design')?.resources).toEqual(['ana']);
    const undone = applyChange(after, invertChange(change, 'undo'));
    expect(undone.find(t => t.id === 'design')?.resources).toEqual(task.resources);
    const redone = applyChange(undone, invertChange(invertChange(change, 'undo'), 'redo'));
    expect(redone.find(t => t.id === 'design')?.resources).toEqual(['ana']);
  });

  it('unassigning is a change that undo takes back', () => {
    const { change, prepared } = run('design', '');
    if (!prepared.ok) throw new Error(prepared.message);
    expect(change.updates[0]?.before).toEqual({ resources: ['ana', { resourceId: 'bo', units: 50 }] });
    expect(change.updates[0]?.after).toEqual({ resources: undefined });
    const after = applyChange(tasks, change);
    expect(after.find(t => t.id === 'design')?.resources).toBeUndefined();
    const undone = applyChange(after, invertChange(change, 'undo'));
    expect(undone.find(t => t.id === 'design')?.resources).toEqual(tasks[0]?.resources);
  });

  it('is rejected for a read-only task like any other edit', () => {
    const locked = tasks.find(t => t.id === 'locked')!;
    const change = taskChange(locked, { resources: ['bo'] }, 'cell', { column: 'resources' });
    expect(prepareChange(change, { tasks, config, labels: L }).ok).toBe(false);
  });
});

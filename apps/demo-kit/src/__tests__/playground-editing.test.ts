import { describe, expect, it } from 'vitest';
import { resolveConfig, type GanttChange, type GanttOptions } from '@gantryjs/core';
import { GANTRY_EVENTS } from '@gantryjs/vanilla';
import {
  PLAYGROUND_DEFAULTS,
  PLAYGROUND_EDIT_EVENTS,
  PLAYGROUND_SECTIONS,
  changedKeys,
  controlEnabled,
  decodeState,
  editEventText,
  encodeState,
  playgroundCode,
  playgroundOptions,
  withValue,
  type PlaygroundKey,
  type PlaygroundState,
} from '../playground';
import { FRAMEWORKS } from '../site';

const TODAY = new Date(2026, 9, 14);
const SECTION = PLAYGROUND_SECTIONS.find(s => s.title === 'Editing');
const ON: PlaygroundState = { ...PLAYGROUND_DEFAULTS, editing: 'on' };
/** Every Editing control away from its default. */
const CHANGED: PlaygroundState = {
  ...ON,
  editCells: false,
  progressStep: 10,
  linkDelete: false,
  linkParentChild: true,
  historyLimit: 50,
  toolbarUndo: false,
};
const SUB_KEYS: PlaygroundKey[] = [
  'editCells',
  'editProgress',
  'progressStep',
  'linkCreate',
  'linkDelete',
  'linkParentChild',
  'historyLimit',
  'toolbarUndo',
];
const control = (key: PlaygroundKey) => PLAYGROUND_SECTIONS.flatMap(s => s.controls).find(c => c.key === key)!;
/** `toolbar.undo` of the options the playground runs. */
const undoOf = (o: GanttOptions) => (o.toolbar === false ? null : o.toolbar?.undo);

describe('playground: Editing section', () => {
  it('has the switch, then one control per feature', () => {
    expect(SECTION?.controls.map(c => [c.key, c.kind, c.option])).toEqual([
      ['editing', 'segmented', 'editing'],
      ['editCells', 'check', 'editing.cells'],
      ['editProgress', 'check', 'editing.progress'],
      ['progressStep', 'range', 'editing.progress.step'],
      ['linkCreate', 'check', 'editing.dependencies.create'],
      ['linkDelete', 'check', 'editing.dependencies.delete'],
      ['linkParentChild', 'check', 'editing.dependencies.parentChild'],
      ['historyLimit', 'range', 'editing.history.limit'],
      ['toolbarUndo', 'check', 'toolbar.undo'],
    ]);
    const editing = control('editing');
    expect(editing.kind === 'segmented' && editing.choices).toEqual([
      ['off', 'Off'],
      ['on', 'On'],
    ]);
    const step = control('progressStep');
    expect(step.kind === 'range' && [step.min, step.max, step.unit]).toEqual([1, 25, '%']);
    const limit = control('historyLimit');
    expect(limit.kind === 'range' && [limit.min, limit.max]).toEqual([10, 200]);
  });

  it('starts from the core defaults: off, and every feature but parent–child links once on', () => {
    expect(PLAYGROUND_DEFAULTS.editing).toBe('off');
    expect(resolveConfig(playgroundOptions(PLAYGROUND_DEFAULTS, TODAY)).editing.enabled).toBe(false);
    const core = resolveConfig({ editing: true });
    const toolbar = core.toolbar === false ? null : core.toolbar;
    expect(PLAYGROUND_DEFAULTS.editCells).toBe(core.editing.cells);
    expect(PLAYGROUND_DEFAULTS.editProgress).toBe(core.editing.progress !== false);
    expect(PLAYGROUND_DEFAULTS.progressStep).toBe(core.editing.progress === false ? null : core.editing.progress.step);
    expect(PLAYGROUND_DEFAULTS.linkCreate).toBe(core.editing.dependencies.create);
    expect(PLAYGROUND_DEFAULTS.linkDelete).toBe(core.editing.dependencies.delete);
    expect(PLAYGROUND_DEFAULTS.linkParentChild).toBe(core.editing.dependencies.parentChild);
    expect(PLAYGROUND_DEFAULTS.historyLimit).toBe(core.editing.history === false ? null : core.editing.history.limit);
    expect(PLAYGROUND_DEFAULTS.toolbarUndo).toBe(toolbar?.undo);
    // Every default fits its control
    for (const c of SECTION?.controls ?? []) {
      expect(withValue(CHANGED, c.key, PLAYGROUND_DEFAULTS[c.key])[c.key], c.key).toBe(PLAYGROUND_DEFAULTS[c.key]);
    }
  });

  it('disables the feature controls while editing is off, the step while the grip is off', () => {
    for (const key of SUB_KEYS) {
      expect(controlEnabled(control(key), PLAYGROUND_DEFAULTS), key).toBe(false);
      expect(controlEnabled(control(key), ON), key).toBe(true);
    }
    expect(controlEnabled(control('editing'), PLAYGROUND_DEFAULTS)).toBe(true);
    expect(controlEnabled(control('progressStep'), { ...ON, editProgress: false })).toBe(false);
    // Controls of the other sections always apply
    for (const c of PLAYGROUND_SECTIONS.filter(s => s !== SECTION).flatMap(s => s.controls)) {
      expect(controlEnabled(c, PLAYGROUND_DEFAULTS), c.key).toBe(true);
    }
  });

  it('maps on to `editing: true`, and each change to the object form the chart resolves', () => {
    expect(playgroundOptions(ON, TODAY).editing).toBe(true);
    expect(undoOf(playgroundOptions(ON, TODAY))).toBeUndefined();
    const o = playgroundOptions(CHANGED, TODAY);
    expect(o.editing).toEqual({
      cells: false,
      progress: { step: 10 },
      dependencies: { delete: false, parentChild: true },
      history: { limit: 50 },
    });
    expect(undoOf(o)).toBe(false);
    const c = resolveConfig(o);
    expect(c.editing).toMatchObject({
      enabled: true,
      cells: false,
      progress: { step: 10 },
      dependencies: { create: true, delete: false, parentChild: true },
      history: { limit: 50, coalesceMs: 800 },
      controlled: false,
    });
    expect(c.toolbar === false ? null : c.toolbar.undo).toBe(false);
    // The grip off drops its step; no link allowed reads `false`
    const off = { ...CHANGED, editProgress: false, linkCreate: false, linkDelete: false, linkParentChild: false };
    expect(playgroundOptions(off, TODAY).editing).toMatchObject({ progress: false, dependencies: false });
    expect(resolveConfig(playgroundOptions(off, TODAY)).editing).toMatchObject({
      progress: false,
      dependencies: { create: false, delete: false, parentChild: false },
    });
    // Parent–child links stay allowed for cells and the API with both gestures off
    const api = { ...off, linkParentChild: true };
    expect(playgroundOptions(api, TODAY).editing).toMatchObject({
      dependencies: { create: false, delete: false, parentChild: true },
    });
  });

  it('leaves the features out while editing is off, whatever their values', () => {
    const o = playgroundOptions({ ...CHANGED, editing: 'off' }, TODAY);
    expect(o.editing).toBeUndefined();
    expect(undoOf(o)).toBeUndefined();
    expect(resolveConfig(o).editing.enabled).toBe(false);
  });

  it('round-trips through a link and drops invalid values', () => {
    expect(changedKeys(CHANGED)).toEqual([
      'editing',
      'editCells',
      'progressStep',
      'linkDelete',
      'linkParentChild',
      'historyLimit',
      'toolbarUndo',
    ]);
    expect(decodeState(encodeState(CHANGED))).toEqual(CHANGED);
    const forged = btoa(
      JSON.stringify({
        editing: true,
        editCells: 'no',
        progressStep: 0,
        historyLimit: 500,
        linkParentChild: 1,
        toolbarUndo: null,
      }),
    );
    expect(decodeState(forged)).toEqual(PLAYGROUND_DEFAULTS);
    expect(decodeState(btoa(JSON.stringify({ editing: 'maybe' }))).editing).toBe('off');
  });

  it('prints the section only once editing is on, then only the changed features, in every framework', () => {
    for (const { id } of FRAMEWORKS) {
      const plain = playgroundCode({ ...CHANGED, editing: 'off' }, id, TODAY);
      for (const word of ['editing', 'undo', 'cells', 'dependencies', 'history']) {
        expect(plain, `${id} ${word}`).not.toMatch(new RegExp(`\\b${word}:`));
      }
      expect(playgroundCode(ON, id, TODAY), id).toContain('editing: true');
      const code = playgroundCode(CHANGED, id, TODAY);
      expect(code, id).toContain('cells: false');
      expect(code, id).toContain('progress: { step: 10 }');
      expect(code, id).toContain('dependencies: { delete: false, parentChild: true }');
      expect(code, id).toContain('history: { limit: 50 }');
      expect(code, id).toContain('toolbar: { undo: false }');
      expect(code, id).not.toContain('undefined');
    }
  });
});

describe('playground: editing events', () => {
  const NAMES: Record<string, string> = { design: 'Design', build: 'Build' };
  const nameOf = (id: string) => NAMES[id] ?? id;
  const move: GanttChange = {
    source: 'drag',
    updates: [
      {
        taskId: 'design',
        before: { start: new Date(2026, 9, 1), end: new Date(2026, 9, 5) },
        after: { start: new Date(2026, 9, 3), end: new Date(2026, 9, 7) },
      },
    ],
    ops: [
      {
        op: 'move',
        event: {
          taskId: 'design',
          oldStart: new Date(2026, 9, 1),
          oldEnd: new Date(2026, 9, 5),
          newStart: new Date(2026, 9, 3),
          newEnd: new Date(2026, 9, 7),
          daysMoved: 2,
        },
      },
    ],
  };

  it('lists the 7 editing events of the Web Component, in the order they fire', () => {
    expect(PLAYGROUND_EDIT_EVENTS).toEqual([
      'before-change',
      'task-progress-changed',
      'dependency-created',
      'dependency-deleted',
      'task-updated',
      'tasks-change',
      'history-change',
    ]);
    for (const event of PLAYGROUND_EDIT_EVENTS) expect(Object.keys(GANTRY_EVENTS), event).toContain(event);
  });

  it('words each event with the task names', () => {
    const before = editEventText(
      'before-change',
      { change: move, tasks: [], defaultPrevented: false, preventDefault: () => undefined },
      nameOf,
    );
    expect(before).toMatch(/^drag · Design .+/);
    expect(before).not.toContain('design');
    expect(editEventText('tasks-change', { tasks: [], change: move, applied: true }, nameOf)).toBe(
      'drag · applied · 0 tasks',
    );
    expect(editEventText('tasks-change', { tasks: [], change: move, applied: false }, nameOf)).toContain('not applied');
    expect(editEventText('task-progress-changed', { taskId: 'design', oldProgress: 40, newProgress: 45 }, nameOf)).toBe(
      'Design · 40% → 45%',
    );
    expect(editEventText('dependency-created', { fromId: 'design', toId: 'build', type: 'FS', lag: 0 }, nameOf)).toBe(
      'Design → Build · FS',
    );
    expect(editEventText('dependency-deleted', { fromId: 'design', toId: 'build', type: 'SS', lag: 2 }, nameOf)).toBe(
      'Design → Build · SS +2d',
    );
    const task = { id: 'design', name: 'Design', start: new Date(2026, 9, 3), end: new Date(2026, 9, 7) };
    expect(
      editEventText(
        'task-updated',
        { taskId: 'design', task, previous: task, fields: ['start', 'end'], source: 'drag' },
        nameOf,
      ),
    ).toBe('Design · start, end');
    expect(
      editEventText(
        'history-change',
        { canUndo: true, canRedo: false, undoLabel: 'x', redoLabel: null, undoCount: 2, redoCount: 0 },
        nameOf,
      ),
    ).toBe('2 to undo · 0 to redo');
  });
});

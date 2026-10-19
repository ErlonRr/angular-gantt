// The editing scaffold in Angular (Gantry 2 phase 11, step 3.2, plan §3c / D2–D8 / D19 / D20), the
// Web Component's `scaffold-p11.test.ts`:
// - every change goes through the chart's editor: a pointer drop or resize (the canvas outputs), a
//   keyboard move-mode commit, the API; the outputs fire in D5 order (beforeChange → op events →
//   taskUpdated → tasksChange → historyChange), with or without `editing`;
// - `beforeChange` vetoes through `preventDefault()`; a `series` write during it counts as handled;
//   controlled mode applies nothing and keeps no history; a rejected change is announced;
// - the edits are written to the raw input: `[(series)]` (untouched tasks keep their objects) or the
//   data source (`patch`: the edit survives the next page);
// - undo / redo restore the app's own values (UTC date-only dates included), move-mode commits
//   coalesce, `canUndo` / `canRedo` are signals; ↑/↓ in move mode change the progress;
// - `(rowClick)` emits the row from both panes; `focusTask()`, the `gantry-linking` class, the bar
//   visuals' edit shapes and the progress preview.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ANNOUNCE_DEBOUNCE,
  DEFAULT_LABELS,
  DependencyType,
  TaskType,
  ViewMode,
  type DependencyChangeEvent,
  type GanttBeforeChangeEvent,
  type GanttFlatRow,
  type GanttHistoryState,
  type GanttOptions,
  type GanttTask,
  type GanttTasksChangeEvent,
  type TaskDragEvent,
  type TaskProgressEvent,
  type TaskUpdatedEvent,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttEditorService } from './editing/gantt-editor.service';
import { GanttDataSource } from './datasource/gantt-datasource';

const day = (d: number) => new Date(2026, 2, d);

/** Two tasks and a milestone; `b` depends on nothing yet. */
const editTasks = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(4), end: day(10), progress: 50 },
  { id: 'm', name: 'Launch', type: TaskType.Milestone, start: day(12), end: day(12) },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [(series)]="tasks"
    [dataSource]="ds()"
    [options]="options()"
    (beforeChange)="onBefore($event)"
    (taskDragged)="log('taskDragged', $event)"
    (taskResized)="log('taskResized', $event)"
    (taskProgressChanged)="log('taskProgressChanged', $event)"
    (dependencyCreated)="log('dependencyCreated', $event)"
    (dependencyDeleted)="log('dependencyDeleted', $event)"
    (taskUpdated)="log('taskUpdated', $event)"
    (tasksChange)="log('tasksChange', $event)"
    (historyChange)="log('historyChange', $event)"
    (rowClick)="clicks.push($event)"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(editTasks());
  readonly ds = signal<GanttDataSource | null>(null);
  readonly options = signal<GanttOptions>({ viewMode: ViewMode.Day, initialScroll: false });
  readonly events: [string, unknown][] = [];
  readonly clicks: GanttFlatRow[] = [];
  /** What `beforeChange` does besides being logged */
  before: (e: GanttBeforeChangeEvent) => void = () => undefined;
  readonly gantt = viewChild.required(GantryComponent);

  log(type: string, detail: unknown): void {
    this.events.push([type, detail]);
  }
  onBefore(e: GanttBeforeChangeEvent): void {
    this.log('beforeChange', e);
    this.before(e);
  }
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  editor: GanttEditorService;
  canvas: GanttCanvasComponent;
  set(change: () => void): Promise<void>;
  $(sel: string): HTMLElement;
}

async function mount(setup?: (h: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  return {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    editor: debug.injector.get(GanttEditorService),
    canvas: f.debugElement.query(By.directive(GanttCanvasComponent)).componentInstance as GanttCanvasComponent,
    async set(change) {
      change();
      await f.whenStable();
    },
    $(sel) {
      const el = host.querySelector<HTMLElement>(sel);
      if (!el) throw new Error(`no element for ${sel}`);
      return el;
    },
  };
}

const names = (c: Chart) => c.h.events.map(([type]) => type);
const detail = <T>(c: Chart, type: string): T => c.h.events.find(([t]) => t === type)?.[1] as T;
const task = (c: Chart, id: string) => c.h.tasks().find(t => t.id === id);
const bar = (c: Chart, id: string) => c.$(`.gantt-bars-layer > [data-task-id="${id}"]`);
const active = () => document.activeElement;
const live = (c: Chart) => c.$('.gantt-sr-live').textContent;

/** A real keydown (bubbling, cancelable) on `target`; returns whether the chart used it. */
function press(target: Element | null, key: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  (target ?? document.body).dispatchEvent(e);
  return e.defaultPrevented;
}

/** Focus `id`'s bar and press Enter on it (move mode), with a render after each. */
async function startEdit(c: Chart, id: string): Promise<void> {
  await c.set(() => bar(c, id).focus());
  expect(press(active(), 'Enter')).toBe(true);
  await c.f.whenStable();
}

/** Lets a debounced announcement reach the live region, then waits for the render. */
async function settle(c: Chart): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ANNOUNCE_DEBOUNCE + 20));
  await c.f.whenStable();
}

/** A pointer drop of `a` two days later (what the canvas emits after a drag). */
const dropA = (c: Chart, from = day(2), to = day(4)): void => {
  const end = task(c, 'a')!.end;
  c.canvas.taskDragged.emit({
    taskId: 'a',
    oldStart: from,
    oldEnd: end,
    newStart: to,
    newEnd: new Date(end.getTime() + (to.getTime() - from.getTime())),
    daysMoved: 2,
  });
};

afterEach(() => vi.restoreAllMocks());

describe('<gantry> change pipeline (phase 11 scaffold)', () => {
  it('a pointer drop goes through the pipeline, in D5 order, written to [(series)] (editing off)', async () => {
    const c = await mount();
    const before = c.h.tasks();
    dropA(c);
    expect(names(c)).toEqual(['beforeChange', 'taskDragged', 'taskUpdated', 'tasksChange']);
    const after = c.h.tasks();
    expect(after).not.toBe(before);
    expect(after[0]).toMatchObject({ start: day(4), end: day(8) });
    // Untouched tasks keep their objects; the event carries the series now
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    const changed = detail<GanttTasksChangeEvent>(c, 'tasksChange');
    expect(changed.applied).toBe(true);
    expect(changed.tasks).toBe(after);
    expect(changed.change.source).toBe('drag');
    expect(detail<TaskDragEvent>(c, 'taskDragged')).toMatchObject({ taskId: 'a', newStart: day(4), daysMoved: 2 });
    const updated = detail<TaskUpdatedEvent>(c, 'taskUpdated');
    expect(updated).toMatchObject({ taskId: 'a', fields: ['start', 'end'], source: 'drag' });
    expect(updated.previous.start).toEqual(day(2));
    // Editing off: no history
    expect(c.gantt.canUndo()).toBe(false);
    expect(c.gantt.undo()).toBe(false);
    await c.f.whenStable();
    expect(c.layout.tasks()[0]).toMatchObject({ start: day(4), end: day(8) });
  });

  it('a resize, a keyboard commit and the API go through it too; history-change last with editing on', async () => {
    const c = await mount(h => h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: true }));
    c.canvas.taskResized.emit({
      taskId: 'b',
      edge: 'end',
      handle: 'right',
      oldStart: day(4),
      oldEnd: day(10),
      newStart: day(4),
      newEnd: day(12),
      daysDelta: 2,
    });
    expect(names(c)).toEqual(['beforeChange', 'taskResized', 'taskUpdated', 'tasksChange', 'historyChange']);
    expect(task(c, 'b')!.end).toEqual(day(12));
    expect(detail<GanttHistoryState>(c, 'historyChange')).toMatchObject({ canUndo: true, undoCount: 1 });
    expect(c.gantt.canUndo()).toBe(true);

    c.h.events.length = 0;
    await c.f.whenStable();
    await startEdit(c, 'a');
    press(active(), 'ArrowRight');
    press(active(), 'Enter');
    expect(names(c)).toEqual(['beforeChange', 'taskDragged', 'taskUpdated', 'tasksChange', 'historyChange']);
    expect(detail<GanttTasksChangeEvent>(c, 'tasksChange').change).toMatchObject({
      source: 'keyboard',
      coalesceKey: 'kbd:a',
    });

    c.h.events.length = 0;
    await c.f.whenStable();
    expect(c.gantt.addDependency('a', 'b')).toBe(true);
    expect(names(c)).toEqual(['beforeChange', 'dependencyCreated', 'taskUpdated', 'tasksChange', 'historyChange']);
    expect(detail<DependencyChangeEvent>(c, 'dependencyCreated')).toEqual({
      fromId: 'a',
      toId: 'b',
      type: DependencyType.FS,
      lag: 0,
    });
    expect(task(c, 'b')!.dependency).toEqual([{ taskId: 'a', type: DependencyType.FS, lag: 0 }]);

    c.h.events.length = 0;
    await c.f.whenStable();
    expect(c.gantt.removeDependency('a', 'b')).toBe(true);
    expect(names(c)).toEqual(['beforeChange', 'dependencyDeleted', 'taskUpdated', 'tasksChange', 'historyChange']);
    expect(task(c, 'b')!.dependency).toBeUndefined();
    // Nothing left to remove
    expect(c.gantt.removeDependency('a', 'b')).toBe(false);
  });

  it('beforeChange vetoes with preventDefault(): nothing applied, announced', async () => {
    const c = await mount(h => h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: true }));
    c.h.before = e => e.preventDefault();
    const before = c.h.tasks();
    dropA(c);
    expect(names(c)).toEqual(['beforeChange']);
    expect(c.h.tasks()).toBe(before);
    expect(c.gantt.canUndo()).toBe(false);
    expect(c.editor.rejection).toEqual({ code: 'vetoed', message: DEFAULT_LABELS.errorRejected });
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorRejected));
    // The proposed tasks were in the detail
    const proposed = detail<GanttBeforeChangeEvent>(c, 'beforeChange').tasks;
    expect(proposed.find(t => t.id === 'a')?.start).toEqual(day(4));
  });

  it('a series write during beforeChange counts as handled; controlled mode applies nothing, keeps no history', async () => {
    const c = await mount(h => h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: true }));
    const mine = editTasks().map(t => (t.id === 'a' ? { ...t, name: 'Mine' } : t));
    c.h.before = () => c.gantt.series.set(mine);
    dropA(c);
    expect(names(c)).toEqual(['beforeChange', 'taskDragged', 'taskUpdated', 'tasksChange']);
    expect(detail<GanttTasksChangeEvent>(c, 'tasksChange').applied).toBe(false);
    expect(c.h.tasks()).toBe(mine);
    expect(c.gantt.canUndo()).toBe(false);

    c.h.events.length = 0;
    c.h.before = () => undefined;
    await c.set(() => c.h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: { controlled: true } }));
    dropA(c);
    expect(names(c)).toEqual(['beforeChange', 'taskDragged', 'taskUpdated', 'tasksChange']);
    const changed = detail<GanttTasksChangeEvent>(c, 'tasksChange');
    expect(changed.applied).toBe(false);
    expect(changed.tasks.find(t => t.id === 'a')?.start).toEqual(day(4));
    expect(c.h.tasks()).toBe(mine);
    expect(c.gantt.canUndo()).toBe(false);
  });

  it('a rejected change (a cycle) is announced and emits nothing', async () => {
    const c = await mount(h =>
      h.tasks.set(editTasks().map(t => (t.id === 'b' ? { ...t, dependency: [{ taskId: 'a' }] } : t))),
    );
    expect(c.gantt.addDependency('b', 'a')).toBe(false);
    expect(c.h.events).toEqual([]);
    expect(c.editor.rejection).toEqual({ code: 'cycle', message: DEFAULT_LABELS.errorCycle });
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorCycle));
  });

  it('undo / redo restore the app’s own values (UTC date-only dates), as signals and events', async () => {
    const utc = (d: number) => new Date(Date.UTC(2026, 2, d));
    const original: GanttTask = { id: 'a', name: 'Alpha', start: utc(2), end: utc(6) };
    const c = await mount(h => {
      h.tasks.set([original, { id: 'b', name: 'Beta', start: utc(4), end: utc(10) }]);
      h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: true });
    });
    c.canvas.taskDragged.emit({
      taskId: 'a',
      oldStart: utc(2),
      oldEnd: utc(6),
      newStart: utc(5),
      newEnd: utc(9),
      daysMoved: 3,
    });
    expect(task(c, 'a')!.start.getTime()).toBe(utc(5).getTime());
    expect(c.gantt.canUndo()).toBe(true);
    expect(c.gantt.canRedo()).toBe(false);

    c.h.events.length = 0;
    expect(c.gantt.undo()).toBe(true);
    expect(names(c)).toEqual(['beforeChange', 'taskDragged', 'taskUpdated', 'tasksChange', 'historyChange']);
    expect(detail<TaskDragEvent>(c, 'taskDragged')).toMatchObject({ newStart: utc(2), daysMoved: -3 });
    // The very values the app gave
    expect(task(c, 'a')!.start).toBe(original.start);
    expect(task(c, 'a')!.end).toBe(original.end);
    expect(c.gantt.canUndo()).toBe(false);
    expect(c.gantt.canRedo()).toBe(true);
    expect(c.gantt.undo()).toBe(false);
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.announceUndo(DEFAULT_LABELS.announceMoved('Alpha', 3, 'day')));

    expect(c.gantt.redo()).toBe(true);
    expect(task(c, 'a')!.start.getTime()).toBe(utc(5).getTime());
    expect(c.gantt.canRedo()).toBe(false);

    c.h.events.length = 0;
    c.gantt.clearHistory();
    expect(names(c)).toEqual(['historyChange']);
    expect(c.gantt.canUndo()).toBe(false);
    c.gantt.clearHistory();
    expect(names(c)).toEqual(['historyChange']);
  });

  it('the history follows editing.history: trimmed to a new limit, dropped (historyChange) when it turns off', async () => {
    const c = await mount(h => h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: true }));
    dropA(c);
    dropA(c, day(4), day(6));
    expect(c.layout.historyState()).toMatchObject({ undoCount: 2 });
    c.h.events.length = 0;
    await c.set(() =>
      c.h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: { history: { limit: 1 } } }),
    );
    expect(names(c)).toEqual(['historyChange']);
    expect(c.layout.historyState()).toMatchObject({ undoCount: 1, canUndo: true });
    // A new options object with the same settings keeps it
    await c.set(() =>
      c.h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: { history: { limit: 1 } } }),
    );
    expect(names(c)).toEqual(['historyChange']);

    await c.set(() => c.h.options.set({ viewMode: ViewMode.Day, initialScroll: false }));
    expect(names(c)).toEqual(['historyChange', 'historyChange']);
    expect(detail<GanttHistoryState>(c, 'historyChange')).toMatchObject({ undoCount: 1 });
    expect(c.h.events.at(-1)?.[1]).toMatchObject({ canUndo: false, undoCount: 0 });
    expect(c.gantt.canUndo()).toBe(false);
    expect(c.gantt.undo()).toBe(false);
    // Back on: a new, empty history
    await c.set(() => c.h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: true }));
    expect(c.gantt.canUndo()).toBe(false);
    dropA(c, day(6), day(8));
    expect(c.layout.historyState()).toMatchObject({ undoCount: 1 });
  });

  it('two move-mode commits within the window are one undo step; ↑/↓ change the progress', async () => {
    const c = await mount(h => h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: true }));
    let now = 1000;
    c.editor.clock = () => now;
    await startEdit(c, 'a');
    await settle(c);
    expect(live(c)).toBe(`${DEFAULT_LABELS.announceEditStart('Alpha')} ${DEFAULT_LABELS.announceEditProgressHelp}`);
    press(active(), 'ArrowRight');
    press(active(), 'Enter');
    await c.f.whenStable();
    now = 1500;
    await startEdit(c, 'a');
    expect(press(active(), 'ArrowUp')).toBe(true);
    press(active(), 'ArrowUp');
    // The bar draws the new progress meanwhile
    expect(c.layout.progressPreview()).toEqual({ taskId: 'a', progress: 30 });
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.announceProgress('Alpha', 30));
    c.h.events.length = 0;
    press(active(), 'Enter');
    expect(c.layout.progressPreview()).toBeNull();
    expect(names(c)).toEqual(['beforeChange', 'taskProgressChanged', 'taskUpdated', 'tasksChange', 'historyChange']);
    expect(detail<TaskProgressEvent>(c, 'taskProgressChanged')).toEqual({
      taskId: 'a',
      oldProgress: 20,
      newProgress: 30,
    });
    expect(task(c, 'a')).toMatchObject({ start: day(3), progress: 30 });
    expect(c.layout.historyState()).toMatchObject({ undoCount: 1, canUndo: true });

    expect(c.gantt.undo()).toBe(true);
    expect(task(c, 'a')).toMatchObject({ start: day(2), end: day(6), progress: 20 });
  });

  it('one commit at a time; undo skips a step whose task is gone (dropped, announced)', async () => {
    const c = await mount(h => h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: true }));
    const nested: boolean[] = [];
    c.h.before = () => nested.push(c.gantt.addDependency('a', 'b'), c.gantt.undo());
    dropA(c);
    expect(nested).toEqual([false, false]);
    expect(task(c, 'a')!.start).toEqual(day(4));
    expect(task(c, 'b')!.dependency).toBeUndefined();
    c.h.before = () => undefined;

    await c.set(() => c.h.tasks.set(c.h.tasks().filter(t => t.id !== 'a')));
    c.h.events.length = 0;
    expect(c.gantt.undo()).toBe(false);
    expect(names(c)).toEqual(['historyChange']);
    expect(c.gantt.canUndo()).toBe(false);
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorUnknownTask('a')));
  });

  it('without editing.progress ↑/↓ are used and change nothing', async () => {
    const c = await mount();
    await startEdit(c, 'a');
    expect(press(active(), 'ArrowUp')).toBe(true);
    press(active(), 'Enter');
    expect(c.h.events).toEqual([]);
    expect(task(c, 'a')!.progress).toBe(20);
  });

  it('with a data source the edit is patched into it and survives the next page', async () => {
    const all = [...editTasks(), { id: 'c', name: 'Gamma', start: day(6), end: day(9) }];
    const ds = new GanttDataSource({
      fetcher: (page, size) => Promise.resolve(all.slice((page - 1) * size, page * size)),
      pageSize: 2,
    });
    const c = await mount(h => h.ds.set(ds));
    await new Promise(resolve => setTimeout(resolve));
    await c.f.whenStable();
    expect(ds.items().map(t => t.id)).toEqual(['a', 'b']);
    const series = c.h.tasks();
    dropA(c);
    expect(ds.items()[0]).toMatchObject({ start: day(4), end: day(8) });
    // The series is not the chart's source: untouched
    expect(c.h.tasks()).toBe(series);
    await ds.loadNext();
    expect(ds.items().map(t => t.id)).toEqual(['a', 'b', 'm', 'c']);
    expect(ds.items()[0]).toMatchObject({ start: day(4), end: day(8) });
    await c.f.whenStable();
    expect(c.layout.tasks().find(t => t.id === 'a')).toMatchObject({ start: day(4) });
    ds.destroy();
  });

  it('GanttDataSource.patch on static data; updateTask / appendTasks write the source silently', async () => {
    const ds = new GanttDataSource({ data: editTasks() });
    const items = ds.items();
    ds.patch(list => list as GanttTask[]);
    expect(ds.items()).toBe(items);
    ds.patch(list => list.filter(t => t.id !== 'm'));
    expect(ds.items().map(t => t.id)).toEqual(['a', 'b']);
    expect(() => ds.patch(() => null as unknown as GanttTask[])).toThrow(TypeError);

    const c = await mount(h => h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: true }));
    const before = c.h.tasks();
    c.gantt.updateTask('a', { name: 'Alpha 2' });
    c.gantt.appendTasks([{ id: 'z', name: 'Zeta', start: day(20), end: day(22) }]);
    expect(c.h.tasks().map(t => t.name)).toEqual(['Alpha 2', 'Beta', 'Launch', 'Zeta']);
    expect(c.h.tasks()[1]).toBe(before[1]);
    expect(c.h.events).toEqual([]);
    expect(c.gantt.canUndo()).toBe(false);
    // A later edit keeps them
    dropA(c);
    expect(c.h.tasks().map(t => t.name)).toEqual(['Alpha 2', 'Beta', 'Launch', 'Zeta']);
  });

  it('(rowClick) emits the row from both panes', async () => {
    const c = await mount();
    c.$('.gantt-tl-row[data-task-id="b"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    c.$('gantt-canvas svg').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 4, clientY: 4 }));
    await c.f.whenStable();
    expect(c.h.clicks.map(r => r.task.id)).toEqual(['b', 'a']);
    for (const row of c.h.clicks) {
      expect(row).toMatchObject({ level: 0, hasChildren: false });
      expect('barX' in row).toBe(false);
    }
  });

  it('focusTask() expands the ancestors and focuses the bar or the row', async () => {
    const c = await mount(h =>
      h.tasks.set([
        { id: 'g', name: 'Group', type: TaskType.Group, start: day(2), end: day(10), collapsed: true },
        { id: 'g1', name: 'Child', parentId: 'g', start: day(2), end: day(6) },
      ]),
    );
    expect(c.layout.visibleRows().map(r => r.task.id)).toEqual(['g']);
    expect(c.gantt.focusTask('nope')).toBe(false);
    expect(c.gantt.focusTask('g1')).toBe(true);
    await c.f.whenStable();
    expect(c.layout.visibleRows().map(r => r.task.id)).toEqual(['g', 'g1']);
    expect(active()?.getAttribute('data-focus-key')).toBe('bar:g1');

    expect(c.gantt.focusTask('g1', { area: 'row' })).toBe(true);
    await c.f.whenStable();
    expect(active()?.getAttribute('data-focus-key')).toBe('row:g1');

    // The view hides the bars: the row
    await c.set(() => c.gantt.setView('table'));
    expect(c.gantt.focusTask('g')).toBe(true);
    await c.f.whenStable();
    expect(active()?.getAttribute('data-focus-key')).toBe('row:g');
  });

  it('the bar visuals carry the edit shapes with editing on; a progress preview redraws only its bar', async () => {
    const c = await mount();
    expect(c.gantt.getBarVisual('a')).toMatchObject({ connectors: null, progressGrip: null });
    await c.set(() => c.h.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing: true }));
    const a = c.gantt.getBarVisual('a')!;
    const b = c.gantt.getBarVisual('b')!;
    expect(a.connectors).not.toBeNull();
    expect(a.progressGrip).not.toBeNull();
    // Milestones get no progress grip
    expect(c.gantt.getBarVisual('m')?.progressGrip).toBeNull();

    c.layout.progressPreview.set({ taskId: 'a', progress: 80 });
    const previewed = c.gantt.getBarVisual('a')!;
    expect(previewed).not.toBe(a);
    expect(previewed.progress?.path).not.toBe(a.progress?.path);
    expect(c.gantt.getBarVisual('b')).toBe(b);
    c.layout.progressPreview.set(null);
    expect(c.gantt.getBarVisual('a')).toBe(a);
  });

  it('has the gantry-linking class while a link is drawn; editCell() is false while cell editing is off', async () => {
    const c = await mount();
    expect(c.host.classList.contains('gantry-linking')).toBe(false);
    await c.set(() => c.layout.link.set({ sourceId: 'a', side: 'end', mode: 'keyboard', preview: null }));
    expect(c.host.classList.contains('gantry-linking')).toBe(true);
    await c.set(() => c.layout.link.set(null));
    expect(c.host.classList.contains('gantry-linking')).toBe(false);
    expect(c.gantt.editCell('a', 'name')).toBe(false);
  });
});

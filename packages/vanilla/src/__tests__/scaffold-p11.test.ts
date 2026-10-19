// The change pipeline of <gantry-element> (Gantry 2 phase 11, step 3.1, plan §3c): every change —
// a pointer drop, move mode, the API, undo / redo — is validated, offered as a cancelable
// `before-change`, applied to the raw input (or `dataSource.patch()`), recorded in the history,
// then reported in D5 order (op events → `task-updated` → `tasks-change` → `history-change`) and
// announced. Controlled mode and a `tasks` assignment during `before-change` apply nothing.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ANNOUNCE_DEBOUNCE,
  DEFAULT_LABELS,
  ViewMode,
  type DragHandle,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { GanttDataSource } from '../datasource/gantt-datasource';
import { getEngine } from '../engine/registry';
import type { GantryEventDetailMap } from '../types';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50, dependency: 'a' },
  { id: 'c', name: 'Gamma', start: day(14), end: day(16), progress: 0 },
];
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false };

function mount(props: Partial<GantryElement> = {}, options: GanttOptions = {}): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: plan(), options: { ...BASE, ...options }, ...props });
  document.body.appendChild(el);
  flush(el);
  return el;
}

const EVENTS = [
  'before-change',
  'task-dragged',
  'task-resized',
  'task-progress-changed',
  'dependency-created',
  'dependency-deleted',
  'task-updated',
  'tasks-change',
  'history-change',
] as const satisfies readonly (keyof GantryEventDetailMap)[];
type Logged = { [K in (typeof EVENTS)[number]]: { type: K; detail: GantryEventDetailMap[K] } }[(typeof EVENTS)[number]];

/** Every pipeline event the element fires, in order. */
function record(el: GantryElement): Logged[] {
  const log: Logged[] = [];
  for (const type of EVENTS) el.addEventListener(type, e => log.push({ type, detail: e.detail } as Logged));
  return log;
}
const types = (log: readonly Logged[]) => log.map(e => e.type);
/** The detail of the first `type` event in `log`. */
const detailOf = <K extends Logged['type']>(log: readonly Logged[], type: K): GantryEventDetailMap[K] | undefined =>
  log.find(e => e.type === type)?.detail as GantryEventDetailMap[K] | undefined;

/** A pointer drag of `id`'s bar by `days` (whole days at the Day scale), through the engine's drag. */
function dragBy(el: GantryElement, id: string, days: number, handle: DragHandle = 'bar'): void {
  const { drag, graph: G } = getEngine(el);
  const geo = G.geoById.peek().get(id)!;
  const v = G.barVisual.peek()(geo);
  const x = handle === 'right' ? v.x + v.width - 2 : handle === 'left' ? v.x + 2 : v.x + v.width / 2;
  const to = x + days * G.timeline.peek().pxPerDay;
  drag.start(geo, handle, x);
  drag.move(to);
  drag.drop(to);
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const bar = (el: GantryElement, id: string) => $<SVGGElement>(el, `.gantt-bars-layer > [data-task-id="${id}"]`)!;
const live = (el: GantryElement) => $(el, '.gantt-sr-live')!.textContent;
const taskOf = (el: GantryElement, id: string) => el.tasks.find(t => t.id === id)!;
const raw = (el: GantryElement) => getEngine(el).inputs.tasksIn.peek();

function press(el: GantryElement, key: string, init: KeyboardEventInit = {}): boolean {
  const target = el.shadowRoot!.activeElement ?? el;
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}
/** Move mode on `id`'s bar: the keys, then Enter. */
function keyboardEdit(el: GantryElement, id: string, ...keys: string[]): void {
  bar(el, id).focus();
  expect(press(el, 'Enter')).toBe(true);
  for (const key of keys) press(el, key);
  press(el, 'Enter');
}

describe('<gantry-element> change pipeline', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    el?.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('event order (D5)', () => {
    it('a pointer drag: before-change, task-dragged, task-updated, tasks-change, history-change', () => {
      el = mount({}, { editing: true });
      const log = record(el);
      const untouched = raw(el)[1];
      dragBy(el, 'a', 2);
      expect(types(log)).toEqual(['before-change', 'task-dragged', 'task-updated', 'tasks-change', 'history-change']);
      expect(detailOf(log, 'task-dragged')).toEqual({
        taskId: 'a',
        oldStart: day(2),
        oldEnd: day(6),
        newStart: day(4),
        newEnd: day(8),
        daysMoved: 2,
      });
      const change = detailOf(log, 'tasks-change')!;
      expect(change.applied).toBe(true);
      expect(change.change.source).toBe('drag');
      // The raw array itself: assigning it back changes nothing
      expect(change.tasks).toBe(raw(el));
      expect(detailOf(log, 'task-updated')).toMatchObject({ taskId: 'a', fields: ['start', 'end'], source: 'drag' });
      expect(detailOf(log, 'history-change')).toMatchObject({ canUndo: true, canRedo: false, undoCount: 1 });
      expect(taskOf(el, 'a')).toMatchObject({ start: day(4), end: day(8) });
      // Untouched tasks keep their identity
      expect(raw(el)[1]).toBe(untouched);
    });

    it('with editing off a drag still runs the pipeline, without history', () => {
      el = mount();
      const log = record(el);
      dragBy(el, 'a', 2);
      expect(types(log)).toEqual(['before-change', 'task-dragged', 'task-updated', 'tasks-change']);
      expect(el.canUndo).toBe(false);
      expect(el.undo()).toBe(false);
    });

    it('a resize: task-resized with its edge, source resize', () => {
      el = mount({}, { editing: true });
      const log = record(el);
      dragBy(el, 'a', 2, 'right');
      expect(types(log)).toEqual(['before-change', 'task-resized', 'task-updated', 'tasks-change', 'history-change']);
      expect(detailOf(log, 'task-resized')).toMatchObject({ taskId: 'a', edge: 'end', newEnd: day(8), daysDelta: 2 });
      expect(detailOf(log, 'tasks-change')?.change.source).toBe('resize');
    });

    it('move mode: one change (source keyboard, key kbd:<id>), announced by the pipeline', () => {
      el = mount({}, { editing: true });
      const log = record(el);
      keyboardEdit(el, 'a', 'ArrowRight', 'ArrowRight');
      expect(types(log)).toEqual(['before-change', 'task-dragged', 'task-updated', 'tasks-change', 'history-change']);
      expect(detailOf(log, 'tasks-change')?.change).toMatchObject({ source: 'keyboard', coalesceKey: 'kbd:a' });
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      expect(live(el)).toBe(DEFAULT_LABELS.announceMoved('Alpha', 2, 'day'));
    });

    it('the API: addDependency / removeDependency (source api), undo restores the dependency shape', () => {
      el = mount({}, { editing: true });
      const log = record(el);
      expect(el.addDependency('a', 'c')).toBe(true);
      expect(types(log)).toEqual([
        'before-change',
        'dependency-created',
        'task-updated',
        'tasks-change',
        'history-change',
      ]);
      expect(detailOf(log, 'dependency-created')).toEqual({ fromId: 'a', toId: 'c', type: 'FS', lag: 0 });
      expect(taskOf(el, 'c').dependency).toEqual([{ taskId: 'a', type: 'FS', lag: 0 }]);

      log.length = 0;
      expect(el.removeDependency('a', 'b')).toBe(true);
      expect(types(log)).toEqual([
        'before-change',
        'dependency-deleted',
        'task-updated',
        'tasks-change',
        'history-change',
      ]);
      expect(detailOf(log, 'tasks-change')?.change.source).toBe('api');
      expect(taskOf(el, 'b').dependency).toBeUndefined();
      expect(el.removeDependency('a', 'b')).toBe(false);

      expect(el.undo()).toBe(true);
      // The string shape the app gave comes back
      expect(taskOf(el, 'b').dependency).toBe('a');
    });
  });

  describe('veto (D6)', () => {
    it('detail.preventDefault() vetoes: nothing applied, nothing else emitted, announced', () => {
      el = mount({}, { editing: true });
      const log = record(el);
      el.addEventListener('before-change', e => e.detail.preventDefault());
      dragBy(el, 'a', 2);
      expect(types(log)).toEqual(['before-change']);
      expect(taskOf(el, 'a').start).toEqual(day(2));
      expect(el.canUndo).toBe(false);
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      expect(live(el)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorRejected));
      expect(getEngine(el).edit.rejection).toEqual({ code: 'vetoed', message: DEFAULT_LABELS.errorRejected });
    });

    it('event.preventDefault() vetoes too (the event is cancelable)', () => {
      el = mount({}, { editing: true });
      let cancelable = false;
      el.addEventListener('before-change', e => {
        cancelable = e.cancelable;
        e.preventDefault();
      });
      expect(el.addDependency('a', 'c')).toBe(false);
      expect(cancelable).toBe(true);
      expect(taskOf(el, 'c').dependency).toBeUndefined();
    });

    it('assigning tasks during before-change counts as handled: applied false, no history', () => {
      el = mount({}, { editing: true });
      const log = record(el);
      el.addEventListener('before-change', e => {
        el.tasks = [...e.detail.tasks];
      });
      dragBy(el, 'a', 2);
      expect(types(log)).toEqual(['before-change', 'task-dragged', 'task-updated', 'tasks-change']);
      expect(detailOf(log, 'tasks-change')?.applied).toBe(false);
      // The app's assignment stands
      expect(taskOf(el, 'a').start).toEqual(day(4));
      expect(el.canUndo).toBe(false);
    });

    it('a commit from a before-change listener is refused', () => {
      el = mount({}, { editing: true });
      const nested: boolean[] = [];
      el.addEventListener('before-change', () => nested.push(el.addDependency('a', 'c')));
      dragBy(el, 'a', 1);
      expect(nested).toEqual([false]);
      expect(taskOf(el, 'a').start).toEqual(day(3));
      expect(taskOf(el, 'c').dependency).toBeUndefined();
    });
  });

  it('controlled: the events carry the proposed tasks, applied false; nothing applied, no history', () => {
    el = mount({}, { editing: { controlled: true } });
    const log = record(el);
    dragBy(el, 'a', 2);
    expect(types(log)).toEqual(['before-change', 'task-dragged', 'task-updated', 'tasks-change']);
    const detail = detailOf(log, 'tasks-change')!;
    expect(detail.applied).toBe(false);
    expect(detail.tasks.find(t => t.id === 'a')).toMatchObject({ start: day(4), end: day(8) });
    expect(taskOf(el, 'a').start).toEqual(day(2));
    expect(getEngine(el).inputs.dragPreview.peek()).toBeNull();
    expect(el.canUndo).toBe(false);
    expect(el.undo()).toBe(false);
    // The app applies it
    el.tasks = detail.tasks;
    expect(taskOf(el, 'a').start).toEqual(day(4));
  });

  describe('history (D8)', () => {
    it('undo / redo restore the dates exactly (UTC date-only values stay date-only), announced', () => {
      const utc = (d: number) => new Date(Date.UTC(2026, 2, d));
      const start = utc(2);
      const end = utc(6);
      el = mount({ tasks: [{ id: 'u', name: 'Utc', start, end, progress: 0 }] }, { editing: true });
      const log = record(el);
      dragBy(el, 'u', 3);
      const moved = { ...raw(el)[0] };
      expect(moved.start.getTime() - start.getTime()).toBe(3 * 86_400_000);
      // Date-only stays date-only (UTC midnight) in every time zone
      expect(moved.start.getUTCHours()).toBe(0);

      log.length = 0;
      expect(el.undo()).toBe(true);
      expect(types(log)).toEqual(['before-change', 'task-dragged', 'task-updated', 'tasks-change', 'history-change']);
      expect(detailOf(log, 'tasks-change')?.change.source).toBe('undo');
      expect(detailOf(log, 'task-dragged')?.daysMoved).toBe(-3);
      // The app's own Date objects come back
      expect(raw(el)[0].start).toBe(start);
      expect(raw(el)[0].end).toBe(end);
      expect([el.canUndo, el.canRedo]).toEqual([false, true]);
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      expect(live(el)).toBe(DEFAULT_LABELS.announceUndo(DEFAULT_LABELS.announceMoved('Utc', 3, 'day')));

      expect(el.redo()).toBe(true);
      expect(raw(el)[0].start.getTime()).toBe(moved.start.getTime());
      expect(raw(el)[0].end?.getTime()).toBe(moved.end?.getTime());
      expect([el.canUndo, el.canRedo]).toEqual([true, false]);
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      expect(live(el)).toBe(DEFAULT_LABELS.announceRedo(DEFAULT_LABELS.announceMoved('Utc', 3, 'day')));
      expect(el.redo()).toBe(false);
    });

    it('two move-mode commits within coalesceMs make one step; a later one a new step', () => {
      el = mount({}, { editing: true });
      const now = vi.spyOn(performance, 'now');
      now.mockReturnValue(1000);
      keyboardEdit(el, 'a', 'ArrowRight');
      now.mockReturnValue(1500);
      keyboardEdit(el, 'a', 'ArrowRight');
      expect(getEngine(el).inputs.historyState.peek().undoCount).toBe(1);
      now.mockReturnValue(5000);
      keyboardEdit(el, 'a', 'ArrowRight');
      expect(getEngine(el).inputs.historyState.peek().undoCount).toBe(2);
      expect(taskOf(el, 'a').start).toEqual(day(5));
      el.undo();
      expect(taskOf(el, 'a').start).toEqual(day(4));
      el.undo();
      expect(taskOf(el, 'a').start).toEqual(day(2));
    });

    it('task changes from the app keep it; an undo whose task is gone is dropped and announced', () => {
      el = mount({}, { editing: true });
      dragBy(el, 'a', 1);
      dragBy(el, 'b', 1);
      el.tasks = raw(el).filter(t => t.id !== 'b');
      expect(el.canUndo).toBe(true);
      expect(el.undo()).toBe(false);
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      expect(live(el)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorUnknownTask('b')));
      // The next step undoes as usual
      expect(el.undo()).toBe(true);
      expect(taskOf(el, 'a').start).toEqual(day(2));
    });

    it('clearHistory() and turning history off empty it (history-change); canUndo / canRedo follow', () => {
      el = mount({}, { editing: true });
      const log = record(el);
      dragBy(el, 'a', 1);
      expect(el.canUndo).toBe(true);
      log.length = 0;
      el.clearHistory();
      expect(types(log)).toEqual(['history-change']);
      expect(el.canUndo).toBe(false);
      el.clearHistory();
      expect(log).toHaveLength(1);

      dragBy(el, 'a', 1);
      el.undo();
      expect([el.canUndo, el.canRedo]).toEqual([false, true]);
      log.length = 0;
      el.options = { ...BASE, editing: { history: false } };
      expect(types(log)).toEqual(['history-change']);
      expect([el.canUndo, el.canRedo]).toEqual([false, false]);
      expect(el.redo()).toBe(false);
    });
  });

  it('validation: a cycle or a self link is rejected before before-change and announced', () => {
    el = mount({}, { editing: true });
    const log = record(el);
    expect(el.addDependency('b', 'a')).toBe(false);
    expect(log).toEqual([]);
    expect(getEngine(el).edit.rejection?.code).toBe('cycle');
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    expect(live(el)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorCycle));
    expect(el.addDependency('c', 'c')).toBe(false);
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    expect(live(el)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorSelfLink));
  });

  it('a read-only task (editable: false) neither moves nor starts move mode', () => {
    const tasks = plan().map(t => (t.id === 'a' ? { ...t, editable: false } : t));
    el = mount({ tasks }, { editing: true });
    const log = record(el);
    dragBy(el, 'a', 2);
    expect(log).toEqual([]);
    expect(taskOf(el, 'a').start).toEqual(day(2));
    expect(getEngine(el).edit.rejection?.code).toBe('read-only');
    const onClick = vi.fn();
    el.addEventListener('row-click', onClick);
    bar(el, 'a').focus();
    press(el, 'Enter');
    expect(getEngine(el).inputs.dragPreview.peek()).toBeNull();
    expect(onClick).toHaveBeenCalledOnce();
  });

  describe('move mode progress (↑ / ↓)', () => {
    it('changes the progress by the step: live on the bar, task-progress-changed on Enter', () => {
      el = mount({}, { editing: { progress: { step: 10 } } });
      const { inputs: I, graph: G } = getEngine(el);
      const log = record(el);
      bar(el, 'a').focus();
      press(el, 'Enter');
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      expect(live(el)).toBe(`${DEFAULT_LABELS.announceEditStart('Alpha')} ${DEFAULT_LABELS.announceEditProgressHelp}`);
      expect(press(el, 'ArrowUp')).toBe(true);
      expect(I.progressPreview.peek()).toEqual({ taskId: 'a', progress: 30 });
      const geo = G.geoById.peek().get('a')!;
      // The bar draws the preview; the arrows' visuals stay
      expect(G.barVisual.peek()(geo)).not.toBe(G.barVisualBase.peek()(geo));
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      expect(live(el)).toBe(DEFAULT_LABELS.announceProgress('Alpha', 30));
      press(el, 'Enter');
      expect(types(log)).toEqual([
        'before-change',
        'task-progress-changed',
        'task-updated',
        'tasks-change',
        'history-change',
      ]);
      expect(detailOf(log, 'task-progress-changed')).toEqual({ taskId: 'a', oldProgress: 20, newProgress: 30 });
      expect(taskOf(el, 'a').progress).toBe(30);
      expect(I.progressPreview.peek()).toBeNull();
      expect(G.barVisual.peek()).toBe(G.barVisualBase.peek());
    });

    it('a draggable: false bar edits only its progress; with editing off it does not enter move mode', () => {
      const tasks = plan().map(t => (t.id === 'a' ? { ...t, draggable: false } : t));
      el = mount({ tasks }, { editing: true });
      bar(el, 'a').focus();
      press(el, 'Enter');
      expect(getEngine(el).inputs.dragPreview.peek()?.taskId).toBe('a');
      press(el, 'ArrowRight');
      press(el, 'ArrowDown');
      press(el, 'Enter');
      expect(taskOf(el, 'a')).toMatchObject({ start: day(2), progress: 15 });

      el.options = BASE;
      bar(el, 'a').focus();
      press(el, 'Enter');
      expect(getEngine(el).inputs.dragPreview.peek()).toBeNull();
    });
  });

  it('focusTask() expands the ancestors, pins the row and focuses the bar or the row', () => {
    const tasks: GanttTask[] = [
      { id: 'p', name: 'Phase', start: day(2), end: day(10) },
      { id: 'k', name: 'Kid', start: day(3), end: day(5), parentId: 'p' },
    ];
    el = mount({ tasks });
    el.collapseAll();
    flush(el);
    expect(bar(el, 'k')).toBeNull();
    expect(el.focusTask('k')).toBe(true);
    expect(getEngine(el).inputs.collapsedIds.peek().has('p')).toBe(false);
    expect(getEngine(el).inputs.focusedRowId.peek()).toBe('k');
    flush(el);
    expect(el.shadowRoot!.activeElement).toBe(bar(el, 'k'));
    expect(el.focusTask('p', { area: 'row' })).toBe(true);
    flush(el);
    expect(el.shadowRoot!.activeElement?.getAttribute('data-focus-key')).toBe('row:p');
    expect(el.focusTask('nope')).toBe(false);
  });

  it('with editing on, a press where a hidden progress grip would be still moves the bar (edit targets only where they are shown)', () => {
    el = mount({}, { editing: true });
    const v = el.getBarVisual('a')!;
    // The visual has the new targets; the pointer does not hit them until step 4.1 shows them
    expect(v.progressGrip).not.toBeNull();
    expect(v.connectors).not.toBeNull();
    const press = { bubbles: true, composed: true, button: 0, clientY: v.cy, pointerId: 1, pointerType: 'mouse' };
    const target = bar(el, 'a');
    target.dispatchEvent(new PointerEvent('pointerdown', { ...press, clientX: v.progressGrip!.x }));
    target.dispatchEvent(new PointerEvent('pointermove', { ...press, clientX: v.progressGrip!.x + 6 }));
    expect(getEngine(el).drag.state.peek().kind).toBe('dragging');
    target.dispatchEvent(new PointerEvent('pointerup', { ...press, clientX: v.progressGrip!.x + 6 }));
  });

  it('the link preview path is built detached (attached only while a link session shows one)', () => {
    el = mount({}, { editing: true });
    const { linkPreview } = getEngine(el).dom;
    expect(linkPreview.isConnected).toBe(false);
    expect(linkPreview.getAttribute('class')).toBe('gantt-link-preview');
    expect(linkPreview.getAttribute('pointer-events')).toBe('none');
    expect($(el, '.gantt-link-preview')).toBeNull();
  });

  it('editCell() delegates to the cell editor', () => {
    el = mount({}, { editing: true });
    const start = vi.spyOn(getEngine(el).ctx.cells, 'start').mockReturnValue(true);
    expect(el.editCell('a', 'name')).toBe(true);
    expect(start).toHaveBeenCalledWith('a', 'name');
  });

  it('a data source: the edit patches its items and survives the next page', async () => {
    vi.useRealTimers();
    let resolvePage2: (tasks: GanttTask[]) => void = () => {};
    const page2 = new Promise<GanttTask[]>(resolve => (resolvePage2 = resolve));
    const [a, b, c] = plan();
    const ds = new GanttDataSource({
      fetcher: (page: number) => (page === 1 ? Promise.resolve([a, b]) : page === 2 ? page2 : Promise.resolve([])),
      pageSize: 2,
    });
    el = mount({ tasks: [], dataSource: ds }, { editing: true });
    await vi.waitFor(() => expect(el.tasks).toHaveLength(2));
    flush(el);
    const loading = ds.loadNext();
    dragBy(el, 'a', 2);
    expect(ds.items.find(t => t.id === 'a')?.start).toEqual(day(4));
    expect(el.tasks.find(t => t.id === 'a')?.start).toEqual(day(4));
    resolvePage2([c]);
    await loading;
    expect(ds.items.map(t => [t.id, t.start])).toEqual([
      ['a', day(4)],
      ['b', day(8)],
      ['c', day(14)],
    ]);
    expect(el.tasks.map(t => t.id)).toEqual(['a', 'b', 'c']);
    // Undo patches the source again
    expect(el.undo()).toBe(true);
    expect(ds.items.find(t => t.id === 'a')?.start).toEqual(day(2));
    expect(ds.items).toHaveLength(3);
  });
});

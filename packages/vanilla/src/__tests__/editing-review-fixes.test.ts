// The Phase 11 review fixes in <gantry-element> (step 7.1), each mirrored by Angular's
// `editing-review-fixes.spec.ts`:
// - R1 controlled mode and `before-change` carry the app's own tasks (raw), not the normalised ones;
// - R2 the predecessors cell is editable with links deleted only, and keeps to the link rights;
// - R3 a commit started from `editing.validate` is refused;
// - R4 Enter / F2 / L finishing a click-mode link links to the focused bar's start (FS);
// - R5 an undo / redo step that validation rejects is dropped (a vetoed one stays);
// - K1 keys typed right after the key that opens a cell editor reach its field;
// - K3 the selected link is deselected once it is gone (the app changed the tasks, a collapse);
// - K4 a press on the selected link keeps it selected (no flicker); a press elsewhere deselects;
// - K5 the link preview follows the bars (a zoom during a keyboard session);
// - K6 a custom editor's context acts only on its own edit;
// - K7 the selected link has a halo (`path.gantt-arrow-halo`, first child, only while selected);
// - K8 `focusTask()` shows the focus ring after a pointer input.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ANNOUNCE_DEBOUNCE,
  DEFAULT_LABELS,
  ViewMode,
  hitTestBar,
  linkPreviewPathOf,
  type CellEditorContext,
  type GanttBeforeChangeEvent,
  type GanttOptions,
  type GanttTask,
  type GanttTasksChangeEvent,
  type LinkSide,
  type TaskUpdatedEvent,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import type { VanillaColumnDef } from '../types';
import '../index';

const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50, dependency: 'a' },
  { id: 'c', name: 'Gamma', start: day(14), end: day(18), progress: 0 },
];
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false };

let el: GantryElement;

function mount(
  options: GanttOptions = { editing: true },
  tasks: GanttTask[] = plan(),
  props: object = {},
): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks, options: { ...BASE, ...options }, tooltipEnabled: false, ...props });
  document.body.appendChild(el);
  flush();
  return el;
}

const engine = () => getEngine(el);
const flush = () => engine().flushSync();
const $ = <T extends Element = HTMLElement>(sel: string) => el.shadowRoot!.querySelector<T>(sel);
const active = () => el.shadowRoot!.activeElement as HTMLElement | null;
const cell = (id: string, key: string) => $(`[data-focus-key="cell:${id}:${key}"]`)!;
const bar = (id: string) => $<SVGGElement>(`.gantt-bars-layer > [data-task-id="${id}"]`)!;
const editor = () => $<HTMLInputElement>('.gantt-tl-editor');
const live = () => {
  vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
  return $('.gantt-sr-live')!.textContent;
};
const visual = (id: string) => {
  const { graph: G } = engine();
  return G.barVisual.peek()(G.geoById.peek().get(id)!);
};

/** A real keydown on what has focus (or `target`); returns whether the chart used it. */
function press(key: string, target: Element | null = active()): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true });
  (target ?? el).dispatchEvent(e);
  return e.defaultPrevented;
}
/**
 * Types `text` as fast as a test runner does: one keydown per character on whatever has focus, no
 * frame in between; a key nobody used goes into a focused text field (the browser's own action).
 */
function typeFast(text: string): void {
  for (const ch of text) {
    const target = active();
    const used = press(ch, target);
    if (!used && target instanceof HTMLInputElement) {
      target.value += ch;
      target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
  }
}
type Kind = 'mouse' | 'touch' | 'pen';
const send = (type: string, x: number, y: number, kind: Kind = 'mouse', target?: Element): PointerEvent => {
  const e = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    pointerId: 1,
    pointerType: kind,
    clientX: x,
    clientY: y,
  });
  (target ?? engine().dom.canvasContainer).dispatchEvent(e);
  return e;
};
const click = (x: number, y: number) =>
  engine().dom.canvasContainer.dispatchEvent(
    new MouseEvent('click', { bubbles: true, composed: true, clientX: x, clientY: y }),
  );

/** A point on the arrow `from → to` off every bar (canvas px = client px in happy-dom) and its key. */
function arrowPoint(from: string, to: string): { key: string; x: number; y: number } {
  const { graph: G } = engine();
  const link = G.arrowIndex.peek().links.find(l => l.from === from && l.to === to)!;
  const pts = G.arrowVisual.peek()(link)!.points;
  const rowHeight = G.config.peek().rowHeight;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let t = 0.1; t < 1; t += 0.1) {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const geo = G.geometries.peek()[Math.floor(y / rowHeight)];
      if (!geo || !hitTestBar(G.barVisual.peek()(geo), x, y, false)) return { key: link.key, x, y };
    }
  }
  throw new Error('no free point on the arrow');
}
const connector = (id: string, side: LinkSide) => {
  const c = visual(id).connectors![side];
  return { x: c.cx, y: c.cy };
};

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});
afterEach(() => {
  // happy-dom keeps focus on a node of a removed shadow tree (browsers move it to the body)
  (el?.shadowRoot?.activeElement as HTMLElement | null | undefined)?.blur();
  el?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('R1: the events carry the app’s own tasks', () => {
  // A child of a parent that is not loaded and a milestone without an end: normalised, the first
  // loses its parent and the second gets end = start
  const lazy = (): GanttTask[] => [
    { id: 'a', name: 'Alpha', start: day(2), end: day(6) },
    { id: 'kid', name: 'Kid', start: day(3), end: day(5), parentId: 'not-loaded' },
    // No end (the data may omit it: the chart reads the start)
    { id: 'm', name: 'Gate', start: day(9), type: 'milestone' } as GanttTask,
  ];

  it('controlled: before-change and tasks-change propose the raw tasks with the change', () => {
    const tasks = lazy();
    mount({ editing: { controlled: true } }, tasks);
    let before: GanttBeforeChangeEvent | null = null;
    let after: GanttTasksChangeEvent | null = null;
    let updated: TaskUpdatedEvent | null = null;
    el.addEventListener('before-change', e => (before = e.detail));
    el.addEventListener('tasks-change', e => (after = e.detail));
    el.addEventListener('task-updated', e => (updated = e.detail));
    expect(el.addDependency('a', 'kid')).toBe(true);
    const proposed = before!.tasks;
    expect(after!.applied).toBe(false);
    expect(after!.tasks).toBe(proposed);
    // The app's own objects, untouched ones identical; nothing normalised leaks
    expect(proposed[0]).toBe(tasks[0]);
    expect(proposed[2]).toBe(tasks[2]);
    expect('end' in proposed[2]).toBe(false);
    expect(proposed[1]).toMatchObject({ parentId: 'not-loaded', dependency: [{ taskId: 'a', type: 'FS', lag: 0 }] });
    expect(updated!.previous).toBe(tasks[1]);
    expect(updated!.task).toBe(proposed[1]);
    // An app that sets them keeps its data (the raw input; the `tasks` getter reads the chart's copy)
    el.tasks = after!.tasks;
    const input = engine().inputs.tasksIn.peek();
    expect(input.find(t => t.id === 'kid')?.parentId).toBe('not-loaded');
    expect('end' in input.find(t => t.id === 'm')!).toBe(false);
  });

  it('a tasks assignment during before-change: the unapplied tasks-change carries the raw tasks too', () => {
    const tasks = lazy();
    mount({ editing: true }, tasks);
    el.addEventListener('before-change', () => (el.tasks = [...tasks]));
    let after: GanttTasksChangeEvent | null = null;
    el.addEventListener('tasks-change', e => (after = e.detail));
    el.addDependency('a', 'kid');
    expect(after!.applied).toBe(false);
    expect(after!.tasks.find(t => t.id === 'kid')?.parentId).toBe('not-loaded');
    expect(after!.tasks[0]).toBe(tasks[0]);
  });
});

describe('R2: the predecessors cell with links deleted only', () => {
  const COLS: GanttOptions = { panel: { width: 500, columns: ['name', 'predecessors'] } };

  it('is editable with create off; removing a link works, adding one is refused under the cell', () => {
    mount({ ...COLS, editing: { dependencies: { create: false } } });
    expect(cell('b', 'predecessors').getAttribute('aria-readonly')).toBe('false');
    // Adding c to b's predecessors: refused with the label, the editor stays open
    expect(el.editCell('b', 'predecessors')).toBe(true);
    flush();
    const input = editor()!;
    input.value = 'a; c';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    press('Enter', input);
    flush();
    expect($('.gantt-tl-editor-error')!.textContent).toBe(DEFAULT_LABELS.errorLinkCreate);
    expect(el.tasks.find(t => t.id === 'b')?.dependency).toBe('a');
    // Emptying it removes the link (the keyboard path to delete one, D13)
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    press('Enter', input);
    flush();
    expect(editor()).toBeNull();
    expect(el.tasks.find(t => t.id === 'b')?.dependency).toBeUndefined();
  });

  it('delete off: removing a link in the cell is refused (errorLinkDelete)', () => {
    mount({ ...COLS, editing: { dependencies: { delete: false } } });
    el.editCell('b', 'predecessors');
    flush();
    const input = editor()!;
    input.value = 'c';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    press('Enter', input);
    flush();
    expect($('.gantt-tl-editor-error')!.textContent).toBe(DEFAULT_LABELS.errorLinkDelete);
    expect(el.tasks.find(t => t.id === 'b')?.dependency).toBe('a');
  });

  it('both off: read-only', () => {
    mount({ ...COLS, editing: { dependencies: { create: false, delete: false } } });
    expect(cell('b', 'predecessors').getAttribute('aria-readonly')).toBe('true');
    expect(el.editCell('b', 'predecessors')).toBe(false);
  });
});

describe('R3: one commit at a time, from validation on', () => {
  it('a commit started by editing.validate (addDependency, undo) is refused; the outer change runs', () => {
    const nested: boolean[] = [];
    let calls = 0;
    mount({
      editing: {
        validate: () => {
          calls++;
          nested.push(el.addDependency('a', 'c'), el.undo(), el.removeDependency('a', 'b'));
          return true;
        },
      },
    });
    expect(el.addDependency('b', 'c')).toBe(true);
    expect(nested).toEqual([false, false, false]);
    expect(calls).toBe(1);
    expect(el.tasks.find(t => t.id === 'c')?.dependency).toEqual([{ taskId: 'b', type: 'FS', lag: 0 }]);
    expect(el.tasks.find(t => t.id === 'b')?.dependency).toBe('a');
  });
});

describe('R4: a click-mode link finished from the keys', () => {
  it('Enter on the focused bar links to its start (FS), whatever the pointer last hovered', () => {
    mount();
    const created = vi.fn();
    el.addEventListener('dependency-created', e => created(e.detail));
    const link = engine().ctx.link;
    link.start('a', 'end', 'click', connector('a', 'end'));
    // The pointer went near c's end: FF by the pointer
    const end = connector('c', 'end');
    link.move(end.x, end.y);
    expect(engine().inputs.link.peek()?.preview).toMatchObject({ targetId: 'c', targetSide: 'end', type: 'FF' });
    // Then the keys: focus c's bar, Enter
    bar('c').focus();
    flush();
    expect(engine().inputs.link.peek()?.mode).toBe('click');
    expect(press('Enter')).toBe(true);
    expect(created).toHaveBeenCalledWith({ fromId: 'a', toId: 'c', type: 'FS', lag: 0 });
  });
});

describe('R5: an undo / redo step validation rejects is dropped', () => {
  it('undo: rejected (announced), the step dropped; a veto keeps it', () => {
    let refuse = false;
    mount({ editing: { validate: c => !(refuse && c.source === 'undo') || 'Locked by the plan' } });
    const states: boolean[] = [];
    el.addEventListener('history-change', e => states.push(e.detail.canUndo));
    el.addDependency('a', 'c');
    expect(el.canUndo).toBe(true);
    // A veto keeps the step
    const veto = (e: Event) => e.preventDefault();
    el.addEventListener('before-change', veto);
    expect(el.undo()).toBe(false);
    expect(el.canUndo).toBe(true);
    el.removeEventListener('before-change', veto);
    // Validation: dropped
    refuse = true;
    expect(el.undo()).toBe(false);
    expect(live()).toBe(DEFAULT_LABELS.announceChangeRejected('Locked by the plan'));
    expect(el.canUndo).toBe(false);
    expect(states).toEqual([true, false]);
    expect(el.undo()).toBe(false);
  });

  it('redo: rejected, the step dropped from both stacks', () => {
    let refuse = false;
    mount({ editing: { validate: c => !(refuse && c.source === 'redo') || 'No' } });
    el.addDependency('a', 'c');
    expect(el.undo()).toBe(true);
    expect(el.canRedo).toBe(true);
    refuse = true;
    expect(el.redo()).toBe(false);
    expect(el.canRedo).toBe(false);
    expect(el.canUndo).toBe(false);
  });
});

describe('K1: keys typed right after the key that opens an editor', () => {
  it('a seeded editor is mounted and focused by its key: fast typing then Enter commits the whole text', () => {
    mount();
    cell('a', 'name').focus();
    typeFast('Public');
    expect(editor()).not.toBeNull();
    expect(active()).toBe(editor());
    expect(editor()!.value).toBe('Public');
    // Enter in the same burst commits it
    expect(press('Enter')).toBe(true);
    expect(el.tasks.find(t => t.id === 'a')?.name).toBe('Public');
  });

  it('F2 and a double-click mount the field at once too', () => {
    mount();
    cell('a', 'name').focus();
    expect(press('F2')).toBe(true);
    expect(active()).toBe(editor());
    press('Escape');
    flush();
    cell('b', 'name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    expect(active()?.getAttribute('data-focus-key')).toBe('editor:b:name');
  });

  it('Tab opens the next editor at once', () => {
    mount({ editing: true, panel: { columns: ['name', 'start'] } });
    cell('a', 'name').focus();
    press('F2');
    expect(press('Tab')).toBe(true);
    expect(active()?.getAttribute('data-focus-key')).toBe('editor:a:start');
  });
});

describe('K3: the selected link goes with the link', () => {
  it('the app removing the link deselects it: made again later, it is not selected', () => {
    mount();
    const p = arrowPoint('a', 'b');
    expect(engine().ctx.link.selectAt(p.x, p.y)).toBe(true);
    el.tasks = plan().map(t => (t.id === 'b' ? { ...t, dependency: undefined } : t));
    expect(engine().inputs.selectedLinkKey.peek()).toBeNull();
    el.tasks = plan();
    flush();
    expect(engine().inputs.selectedLinkKey.peek()).toBeNull();
    expect(el.shadowRoot!.querySelectorAll('.gantt-arrow--selected')).toHaveLength(0);
  });

  it('a collapsed row hiding an end deselects it; other task changes keep it', () => {
    mount({ editing: true }, [
      { id: 'p', name: 'Parent', start: day(2), end: day(20) },
      { id: 'k', name: 'Kid', start: day(3), end: day(6), parentId: 'p' },
      { id: 'o', name: 'Other', start: day(10), end: day(14), dependency: 'k' },
    ]);
    const p = arrowPoint('k', 'o');
    engine().ctx.link.selectAt(p.x, p.y);
    el.updateTask('o', { name: 'Renamed' });
    expect(engine().inputs.selectedLinkKey.peek()).toBe(p.key);
    el.collapseAll();
    expect(engine().inputs.selectedLinkKey.peek()).toBeNull();
  });
});

describe('K4: pressing the selected link keeps it selected', () => {
  it('no flicker: the press on it keeps it, its click selects it again; a press elsewhere deselects', () => {
    mount();
    const p = arrowPoint('a', 'b');
    send('pointerdown', p.x, p.y);
    send('pointerup', p.x, p.y);
    click(p.x, p.y);
    expect(engine().inputs.selectedLinkKey.peek()).toBe(p.key);
    const writes = vi.spyOn(engine().inputs.selectedLinkKey, 'set');
    send('pointerdown', p.x, p.y);
    expect(engine().inputs.selectedLinkKey.peek()).toBe(p.key);
    send('pointerup', p.x, p.y);
    click(p.x, p.y);
    expect(writes.mock.calls.every(([key]) => key === p.key)).toBe(true);
    // A press on a bar deselects
    const v = visual('c');
    send('pointerdown', v.x + v.width / 2, v.cy);
    expect(engine().inputs.selectedLinkKey.peek()).toBeNull();
  });

  it('a press outside the canvas (the task list) deselects', () => {
    mount();
    const p = arrowPoint('a', 'b');
    engine().ctx.link.selectAt(p.x, p.y);
    send('pointerdown', 1, 1, 'mouse', cell('a', 'name'));
    expect(engine().inputs.selectedLinkKey.peek()).toBeNull();
  });
});

describe('K5: the link preview follows the bars', () => {
  it('a zoom during a keyboard session redraws the preview from the new bars', () => {
    mount();
    bar('a').focus();
    expect(press('l')).toBe(true);
    bar('c').focus();
    flush();
    const path = () => $<SVGPathElement>('path.gantt-link-preview')!.getAttribute('d');
    const before = path();
    expect(before).toBe(linkPreviewPathOf(visual('a'), 'end', { visual: visual('c'), side: 'start' }));
    el.zoomIn();
    flush();
    expect(engine().inputs.link.peek()?.mode).toBe('keyboard');
    expect(path()).not.toBe(before);
    expect(path()).toBe(linkPreviewPathOf(visual('a'), 'end', { visual: visual('c'), side: 'start' }));
  });
});

describe('K6: a custom editor’s context acts only on its own edit', () => {
  it('the first edit’s context does nothing to a later edit of the same cell', () => {
    const contexts: CellEditorContext[] = [];
    const notes: VanillaColumnDef = {
      key: 'notes',
      label: 'Notes',
      width: 120,
      editable: true,
      render: row => String((row.task.data as { notes?: string } | undefined)?.notes ?? ''),
      editor: ctx => {
        contexts.push(ctx);
        const input = document.createElement('input');
        input.value = ctx.value;
        return input;
      },
    };
    mount({ editing: true, panel: { columns: ['name', 'notes'] } }, plan(), { columns: [notes] });
    el.editCell('a', 'notes');
    flush();
    contexts[0].cancel();
    flush();
    el.editCell('a', 'notes');
    flush();
    expect(contexts).toHaveLength(2);
    const [first, second] = contexts as [CellEditorContext, CellEditorContext];
    first.setValue('stale');
    first.commit();
    first.cancel();
    expect(engine().inputs.cellEdit.peek()).toMatchObject({ taskId: 'a', columnKey: 'notes', value: '' });
    expect(first.value).toBe('');
    second.setValue('fresh');
    expect(second.value).toBe('fresh');
    second.commit();
    expect(engine().inputs.cellEdit.peek()).toBeNull();
    expect(el.tasks.find(t => t.id === 'a')?.data).toEqual({ notes: 'fresh' });
  });
});

describe('K7: the selected link has a halo', () => {
  it('path.gantt-arrow-halo, first in its group, only while selected', () => {
    mount();
    const p = arrowPoint('a', 'b');
    engine().ctx.link.selectAt(p.x, p.y);
    flush();
    const g = $('.gantt-arrows > g.gantt-arrow--selected')!;
    const halo = g.firstElementChild!;
    expect(halo.getAttribute('class')).toBe('gantt-arrow-halo');
    const line = halo.nextElementSibling!;
    const width = Number(line.getAttribute('stroke-width'));
    expect(Number(halo.getAttribute('stroke-width'))).toBe(width - 1 + 6);
    expect(halo.getAttribute('stroke-opacity')).toBe('0.3');
    expect((halo as SVGElement).style.getPropertyValue('stroke')).toBe('var(--gantt-focus-ring)');
    expect(halo.getAttribute('d')).toBe(line.getAttribute('d'));
    engine().ctx.link.deselect();
    flush();
    expect(el.shadowRoot!.querySelectorAll('.gantt-arrow-halo')).toHaveLength(0);
    expect(g.children).toHaveLength(2);
  });
});

describe('K8: focusTask() shows the focus ring after a pointer input', () => {
  it('the bar: focus({ focusVisible: true }) and its own ring, though a pointer was pressed last', () => {
    mount();
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    const focus = vi.spyOn(bar('b'), 'focus');
    expect(el.focusTask('b')).toBe(true);
    flush();
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ focusVisible: true }));
    expect(active()).toBe(bar('b'));
    expect(engine().inputs.focusVisibleBarId.peek()).toBe('b');
  });

  it('a bar a pointer focused already shows its ring; a row is focused visibly too', () => {
    mount();
    bar('c').focus();
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(engine().inputs.focusVisibleBarId.peek()).toBeNull();
    el.focusTask('c');
    expect(engine().inputs.focusVisibleBarId.peek()).toBe('c');
    flush();
    const row = $(`.gantt-tl-row[data-task-id="a"]`)!;
    const focus = vi.spyOn(row, 'focus');
    el.focusTask('a', { area: 'row' });
    flush();
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ focusVisible: true }));
  });
});

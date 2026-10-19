// Move mode (Gantry 2 phase 9, step 4.1, contract §3d): Enter / F2 on a movable bar edits it with
// the keyboard through core `KeyboardEditSession`. The preview is the pointer drag's
// (`dragPreview`: ghost, pinned row, dimmed bar), a commit emits what a drop emits and is
// announced (`announceKeyboardEdit`); Esc, Tab, blur and a pointer press cancel (D24: before
// clearing the selection), the session is modal, and a zoom or a disconnect ends it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ANNOUNCE_DEBOUNCE,
  DEFAULT_LABELS,
  TaskType,
  ViewMode,
  addDays,
  type GanttTask,
  type TaskDragEvent,
  type TaskResizeEvent,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

const day = (d: number) => new Date(2026, 2, d);
const tasks = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(4), end: day(10), progress: 50 },
  { id: 'm', name: 'Launch', type: TaskType.Milestone, start: day(12), end: day(12) },
];

function mount(props: Partial<Pick<GantryElement, 'tasks' | 'options' | 'enableResize'>> = {}): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: tasks(), options: { viewMode: ViewMode.Day, initialScroll: false }, ...props });
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const bar = (el: GantryElement, id: string) => $<SVGGElement>(el, `.gantt-bars-layer > [data-task-id="${id}"]`)!;
const preview = (el: GantryElement) => getEngine(el).inputs.dragPreview();
const live = (el: GantryElement) => $(el, '.gantt-sr-live')!.textContent;

/** A real keydown (composed, cancelable) on what has focus; returns whether the chart used it. */
function press(el: GantryElement, key: string, init: KeyboardEventInit = {}): boolean {
  const target = el.shadowRoot!.activeElement ?? el;
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

/** Focus `id`'s bar and press Enter on it. */
function startEdit(el: GantryElement, id: string): void {
  bar(el, id).focus();
  expect(press(el, 'Enter')).toBe(true);
}

describe('<gantry-element> keyboard move mode', () => {
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

  it('starts on Enter / F2: the drag preview (ghost, dimmed bar) and the instructions', () => {
    el = mount();
    startEdit(el, 'a');
    expect(preview(el)).toMatchObject({ taskId: 'a', delta: 0, unit: 'day' });
    flush(el);
    expect($(el, '.gantt-drag-preview')).not.toBeNull();
    expect(bar(el, 'a').style.getPropertyValue('opacity')).toBe('0.35');
    expect(el.shadowRoot!.activeElement).toBe(bar(el, 'a'));
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    expect(live(el)).toBe(DEFAULT_LABELS.announceEditStart('Alpha'));

    press(el, 'Escape');
    bar(el, 'b').focus();
    expect(press(el, 'F2')).toBe(true);
    expect(preview(el)?.taskId).toBe('b');
  });

  it('←/→ move by a snap unit, each step read out; Enter commits like a drop (task-dragged, announced)', () => {
    el = mount();
    const dragged: TaskDragEvent[] = [];
    el.addEventListener('task-dragged', e => dragged.push(e.detail));
    startEdit(el, 'a');
    expect(press(el, 'ArrowRight')).toBe(true);
    press(el, 'ArrowRight');
    expect(preview(el)).toMatchObject({ taskId: 'a', delta: 2 });
    expect(preview(el)?.start).toEqual(day(4));
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    // The readout chip's words (dates and duration)
    expect(live(el)).toContain('4 Mar');
    expect(dragged).toHaveLength(0);

    expect(press(el, 'Enter')).toBe(true);
    expect(preview(el)).toBeNull();
    expect(dragged).toEqual([
      { taskId: 'a', oldStart: day(2), oldEnd: day(6), newStart: day(4), newEnd: day(8), daysMoved: 2 },
    ]);
    expect(el.tasks.find(t => t.id === 'a')).toMatchObject({ start: day(4), end: day(8) });
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    expect(live(el)).toBe(DEFAULT_LABELS.announceMoved('Alpha', 2, 'day'));
    // Focus stays on the bar, out of move mode: ↓ moves to the next bar again
    flush(el);
    expect(el.shadowRoot!.activeElement).toBe(bar(el, 'a'));
  });

  it('Shift+←/→ resize the end, Alt+←/→ the start (task-resized); committing nothing says so', () => {
    el = mount();
    const resized: TaskResizeEvent[] = [];
    el.addEventListener('task-resized', e => resized.push(e.detail));
    startEdit(el, 'b');
    press(el, 'ArrowRight', { shiftKey: true });
    press(el, 'Enter');
    expect(resized).toEqual([
      {
        taskId: 'b',
        edge: 'end',
        handle: 'right',
        oldStart: day(4),
        oldEnd: day(10),
        newStart: day(4),
        newEnd: day(11),
        daysDelta: 1,
      },
    ]);

    startEdit(el, 'b');
    press(el, 'ArrowLeft', { altKey: true });
    press(el, 'Enter');
    expect(resized[1]).toMatchObject({ handle: 'left', newStart: day(3), newEnd: day(11), daysDelta: -1 });

    startEdit(el, 'b');
    press(el, 'Enter');
    expect(resized).toHaveLength(2);
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    expect(live(el)).toBe(DEFAULT_LABELS.announceEditNoChange('Beta'));
  });

  it('only moves milestones and bars with enableResize off', () => {
    el = mount();
    startEdit(el, 'm');
    press(el, 'ArrowRight', { shiftKey: true });
    expect(preview(el)).toMatchObject({ taskId: 'm', delta: 0 });
    press(el, 'ArrowRight');
    expect(preview(el)?.start).toEqual(addDays(day(12), 1));
    press(el, 'Escape');

    el.enableResize = false;
    startEdit(el, 'a');
    press(el, 'ArrowLeft', { altKey: true });
    expect(preview(el)?.start).toEqual(day(2));
  });

  it('Esc cancels first (announced, nothing emitted), the next Esc clears the selection (D24)', () => {
    el = mount();
    const onDrag = vi.fn();
    el.addEventListener('task-dragged', onDrag);
    el.setSelectedTasks(['a', 'b']);
    startEdit(el, 'a');
    press(el, 'ArrowRight');
    expect(press(el, 'Escape')).toBe(true);
    expect(preview(el)).toBeNull();
    expect(onDrag).not.toHaveBeenCalled();
    expect(el.tasks.find(t => t.id === 'a')?.start).toEqual(day(2));
    expect(el.getSelectedTasks()).toHaveLength(2);
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    expect(live(el)).toBe(DEFAULT_LABELS.announceEditCancel('Alpha'));
    press(el, 'Escape');
    expect(el.getSelectedTasks()).toHaveLength(0);
  });

  it('Tab, blur and a pointer press cancel it', () => {
    el = mount();
    startEdit(el, 'a');
    press(el, 'ArrowRight');
    // Tab is not prevented: focus moves on
    expect(press(el, 'Tab')).toBe(false);
    expect(preview(el)).toBeNull();

    startEdit(el, 'a');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(preview(el)).toBeNull();

    startEdit(el, 'a');
    $(el, '.gantt-tl-row')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(preview(el)).toBeNull();
  });

  it('is modal: other plain keys do nothing, shortcuts with a modifier stay with the browser', () => {
    el = mount({ options: { viewMode: ViewMode.Day, initialScroll: false } });
    const fit = vi.spyOn(el, 'fitToScreen');
    startEdit(el, 'a');
    expect(press(el, 'f')).toBe(true);
    expect(press(el, '+')).toBe(true);
    expect(press(el, ' ')).toBe(true);
    // ↑/↓ change the progress only with `editing.progress` (scaffold-p11.test.ts): used, nothing changes
    expect(press(el, 'ArrowDown')).toBe(true);
    expect(fit).not.toHaveBeenCalled();
    expect(el.viewMode).toBe(ViewMode.Day);
    expect(el.getSelectedTasks()).toHaveLength(0);
    expect(press(el, 'c', { ctrlKey: true })).toBe(false);
    expect(preview(el)).toMatchObject({ taskId: 'a', delta: 0 });
    expect(el.shadowRoot!.activeElement).toBe(bar(el, 'a'));
  });

  it('a zoom during move mode cancels it at the next key; a disconnect ends it', () => {
    el = mount();
    const onDrag = vi.fn();
    el.addEventListener('task-dragged', onDrag);
    startEdit(el, 'a');
    press(el, 'ArrowRight');
    el.zoomOut();
    flush(el);
    expect(press(el, 'Enter')).toBe(true);
    expect(preview(el)).toBeNull();
    expect(onDrag).not.toHaveBeenCalled();

    flush(el);
    startEdit(el, 'a');
    el.remove();
    expect(preview(el)).toBeNull();
  });

  it('does not start while a pointer drag is on, or on a bar that cannot move (activates it instead)', () => {
    el = mount({ tasks: tasks().map(t => (t.id === 'b' ? { ...t, draggable: false } : t)) });
    const onClick = vi.fn();
    el.addEventListener('row-click', onClick);
    bar(el, 'b').focus();
    press(el, 'Enter');
    expect(preview(el)).toBeNull();
    expect(onClick).toHaveBeenCalledOnce();
  });
});

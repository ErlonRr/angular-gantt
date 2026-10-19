// What opens, closes and moves the tooltip besides the pointer over the bars (Phase 9 step 4.4,
// `interaction/tooltip-triggers.ts`): keyboard focus on a bar (`focusVisibleBarId`), Escape in
// the capture phase (D24, WCAG 1.4.13), the pointer resting on the tooltip, scrolls and resizes, a
// press elsewhere, a drag or move mode starting, the row going away and option changes. Every
// listener and effect belongs to the connection. Phase 10 step 4.4: the open tooltip follows its
// row (task object, critical flag, i18n bundle; never the clock), and a keyboard focus that came
// before the first render is tried once more after it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TOOLTIP_HIDE_DELAY,
  TOOLTIP_SHOW_DELAY,
  TaskType,
  ViewMode,
  type DragPreview,
  type GanttFlatRow,
  type GanttOptions,
  type GanttTask,
  type GanttTooltipRenderContext,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

const TASKS = (): GanttTask[] => [
  { id: 'g', name: 'Group', start: new Date(2026, 2, 2), end: new Date(2026, 2, 20), type: TaskType.Group },
  { id: 'a', name: 'Alpha', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9), parentId: 'g' },
  { id: 'b', name: 'Beta', start: new Date(2026, 2, 9), end: new Date(2026, 2, 20), parentId: 'g' },
  { id: 'r', name: 'Root', start: new Date(2026, 2, 3), end: new Date(2026, 2, 6) },
];

let el: GantryElement;

function mount(extra: Partial<GantryElement> = {}): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: TASKS(), options: { viewMode: ViewMode.Day, initialScroll: false } }, extra);
  document.body.appendChild(el);
  flush(el);
  return el;
}

/** Appends the chart without painting it: its first frame is pending. */
function connectUnpainted(): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: TASKS(), options: { viewMode: ViewMode.Day, initialScroll: false } });
  document.body.appendChild(el);
  return el;
}

/** One animation frame (after the frames requested before it). */
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

const engine = () => getEngine(el);
const tip = () => el.shadowRoot!.querySelector<HTMLElement>('.gantt-tooltip')!;
const bar = (id: string) => el.shadowRoot!.querySelector<SVGGElement>(`.gantt-bars-layer [data-task-id="${id}"]`)!;
const rowOf = (id: string): GanttFlatRow =>
  engine()
    .graph.allRows.peek()
    .find(r => r.task.id === id)!;
const escape = (target: EventTarget) => {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};
/** Keyboard focus reached a bar (what the keyboard handlers write), or left the bars (`null`). */
const keyboardFocus = (id: string | null) => engine().inputs.focusVisibleBarId.set(id);

function preview(taskId: string): DragPreview {
  return {
    taskId,
    x: 10,
    width: 40,
    y: 0,
    height: 20,
    delta: 1,
    unit: 'day',
    daysDelta: 1,
    start: new Date(2026, 2, 3),
    end: new Date(2026, 2, 10),
  };
}

describe('tooltip triggers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    el?.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens at once on keyboard focus of a bar, described by it, and closes when focus leaves the bars', () => {
    mount();
    keyboardFocus('a');
    expect(tip().hidden).toBe(false);
    expect(tip().querySelector('.gantt-tooltip-title')!.textContent).toBe('Alpha');
    expect(bar('a').getAttribute('aria-describedby')).toBe(tip().id);
    // From bar to bar: follows focus, no blur in between
    keyboardFocus('b');
    expect(tip().querySelector('.gantt-tooltip-title')!.textContent).toBe('Beta');
    expect(bar('a').hasAttribute('aria-describedby')).toBe(false);
    keyboardFocus(null);
    expect(tip().hidden).toBe(true);
    expect(bar('b').hasAttribute('aria-describedby')).toBe(false);
    // trigger 'hover': focus opens nothing
    el.options = { viewMode: ViewMode.Day, initialScroll: false, tooltip: { trigger: 'hover' } };
    flush(el);
    keyboardFocus('a');
    expect(tip().hidden).toBe(true);
  });

  it('Escape closes the visible tooltip first and consumes the key; the next Escape goes on', () => {
    mount();
    const seen = vi.fn();
    el.addEventListener('keydown', seen);
    keyboardFocus('a');
    const first = escape(bar('a'));
    expect(first.defaultPrevented).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    expect(tip().hidden).toBe(true);
    // Dismissed: the focused bar does not reopen it until focus leaves it
    keyboardFocus('a');
    expect(tip().hidden).toBe(true);
    escape(bar('a'));
    expect(seen).toHaveBeenCalledTimes(1);

    // Focus elsewhere in the page: Escape closes a hover tooltip and stays the page's
    const outside = document.createElement('button');
    document.body.append(outside);
    keyboardFocus(null);
    engine().layers.tooltip.hover(rowOf('b'), bar('b'), 50);
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
    expect(tip().hidden).toBe(false);
    expect(escape(outside).defaultPrevented).toBe(false);
    expect(tip().hidden).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);

    // A pending (not yet visible) hover tooltip leaves Escape alone
    keyboardFocus(null);
    engine().layers.tooltip.hover(rowOf('r'), bar('r'), 50);
    escape(bar('r'));
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('leaves Escape to text inputs and to a drag or move mode, which dismisses the tooltip when it starts', () => {
    mount();
    const seen = vi.fn();
    el.addEventListener('keydown', seen);
    keyboardFocus('a');
    // Typing in a slotted input inside the chart keeps its Escape
    const input = document.createElement('input');
    el.appendChild(input);
    escape(input);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(tip().hidden).toBe(false);

    // Drag / move mode starts: dismissed at once, and Escape is the drag's
    engine().inputs.dragPreview.set(preview('a'));
    expect(tip().hidden).toBe(true);
    escape(bar('a'));
    expect(seen).toHaveBeenCalledTimes(2);
    // Moving the preview does not dismiss anything else
    const dismiss = vi.spyOn(engine().layers.tooltip, 'dismiss');
    engine().inputs.dragPreview.set({ ...preview('a'), x: 30 });
    expect(dismiss).not.toHaveBeenCalled();
    engine().inputs.dragPreview.set(null);
  });

  it('stays open while the pointer rests on the tooltip', () => {
    mount();
    const layer = engine().layers.tooltip;
    layer.hover(rowOf('a'), bar('a'), 50);
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
    layer.unhover();
    tip().dispatchEvent(new PointerEvent('pointerenter'));
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY * 4);
    expect(tip().hidden).toBe(false);
    tip().dispatchEvent(new PointerEvent('pointerleave'));
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY);
    expect(tip().hidden).toBe(true);
  });

  it('moves with its bar when the timeline or the page scrolls, and on resize', () => {
    mount();
    vi.spyOn(tip(), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 160, 80));
    const anchor = vi.spyOn(bar('a'), 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 100, 120, 24));
    keyboardFocus('a');
    const at = () => tip().style.getPropertyValue('translate');
    expect(at()).toBe(`${200 + 60 - 80}px ${100 + 24 + 8}px`);
    anchor.mockReturnValue(new DOMRect(150, 140, 120, 24));
    engine().dom.viewport.dispatchEvent(new Event('scroll'));
    expect(at()).toBe(`${150 + 60 - 80}px ${140 + 24 + 8}px`);
    anchor.mockReturnValue(new DOMRect(150, 40, 120, 24));
    document.body.dispatchEvent(new Event('scroll'));
    expect(at()).toBe(`${150 + 60 - 80}px ${40 + 24 + 8}px`);
    anchor.mockReturnValue(new DOMRect(100, 40, 120, 24));
    window.dispatchEvent(new Event('resize'));
    expect(at()).toBe(`${100 + 60 - 80}px ${40 + 24 + 8}px`);
  });

  it('closes on a press elsewhere, not on the tooltip itself nor on a bar', () => {
    mount({ enableDrag: false });
    const layer = engine().layers.tooltip;
    const press = (target: EventTarget, x = 0, y = 0) =>
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, clientX: x, clientY: y }));
    layer.tap(rowOf('a'), bar('a'));
    press(tip());
    expect(tip().hidden).toBe(false);
    // On a bar (by geometry, the canvas is at 0,0 in happy-dom): the canvas pointer handler's
    const v = el.getBarVisual('r')!;
    press(engine().dom.canvasContainer, v.x + v.width / 2, v.cy);
    expect(tip().hidden).toBe(false);
    // On the empty canvas, then anywhere else in the page
    press(engine().dom.canvasContainer, v.x + v.width + 200, v.cy);
    expect(tip().hidden).toBe(true);
    layer.tap(rowOf('a'), bar('a'));
    press(document.body);
    expect(tip().hidden).toBe(true);
  });

  it('closes when its row goes away, and resets when tooltipEnabled or options.tooltip change', () => {
    mount();
    keyboardFocus('a');
    expect(tip().hidden).toBe(false);
    // The group collapses: Alpha's row goes away
    el.collapseAll();
    flush(el);
    expect(tip().hidden).toBe(true);
    el.expandAll();
    flush(el);

    keyboardFocus('r');
    expect(tip().hidden).toBe(false);
    el.options = { viewMode: ViewMode.Day, initialScroll: false, tooltip: { showDelay: 500 } };
    expect(tip().hidden).toBe(true);
    // Not reset by an option change outside options.tooltip
    keyboardFocus(null);
    keyboardFocus('r');
    expect(tip().hidden).toBe(false);
    el.options = { viewMode: ViewMode.Week, initialScroll: false, tooltip: { showDelay: 500 } };
    flush(el);
    expect(tip().hidden).toBe(false);
    // Nor by a new render function alone (a framework re-render may pass a new one every time)
    el.options = { viewMode: ViewMode.Week, initialScroll: false, tooltip: { showDelay: 500, render: () => null } };
    flush(el);
    expect(tip().hidden).toBe(false);
    el.tooltipEnabled = false;
    expect(tip().hidden).toBe(true);
  });

  it('compares the resolved rules: options that resolve to the same tooltip rules keep it open', () => {
    mount();
    keyboardFocus('r');
    expect(tip().hidden).toBe(false);
    // The defaults spelled out (core resolveConfig): the same rules
    el.options = {
      viewMode: ViewMode.Day,
      initialScroll: false,
      tooltip: { trigger: 'auto', showDelay: 320, hideDelay: 120 },
    };
    flush(el);
    expect(tip().hidden).toBe(false);
    el.options = { viewMode: ViewMode.Day, initialScroll: false, tooltip: {} };
    flush(el);
    expect(tip().hidden).toBe(false);
    // A rule that resolves differently resets it
    el.options = { viewMode: ViewMode.Day, initialScroll: false, tooltip: { hideDelay: 400 } };
    expect(tip().hidden).toBe(true);
  });

  it('a keyboard focus before the first render opens the tooltip once that render is done', async () => {
    connectUnpainted();
    keyboardFocus('a');
    expect(engine().dom.bars.children).toHaveLength(0);
    expect(tip().hidden).toBe(true);
    // The engine's first frame paints, then the retry opens it
    await nextFrame();
    expect(bar('a')).not.toBeNull();
    expect(tip().hidden).toBe(false);
    expect(tip().querySelector('.gantt-tooltip-title')!.textContent).toBe('Alpha');
    expect(bar('a').getAttribute('aria-describedby')).toBe(tip().id);

    // Painted at once (flushSync): the retry still waits for its frame, then opens it
    el.remove();
    connectUnpainted();
    keyboardFocus('b');
    flush(el);
    expect(tip().hidden).toBe(true);
    await nextFrame();
    expect(tip().querySelector('.gantt-tooltip-title')!.textContent).toBe('Beta');
  });

  it('drops the retry when keyboard focus moves before it, and tries once only', async () => {
    connectUnpainted();
    const focus = vi.spyOn(engine().layers.tooltip, 'focus');
    keyboardFocus('a');
    keyboardFocus(null);
    await nextFrame();
    expect(focus).not.toHaveBeenCalled();
    expect(tip().hidden).toBe(true);
    await nextFrame();
    expect(focus).not.toHaveBeenCalled();

    // Moved to another bar before the render: only that one is tried
    el.remove();
    connectUnpainted();
    const next = vi.spyOn(engine().layers.tooltip, 'focus');
    keyboardFocus('a');
    keyboardFocus('r');
    await nextFrame();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].task.id).toBe('r');
    await nextFrame();
    expect(next).toHaveBeenCalledTimes(1);

    // Disconnected before the frame: nothing is tried
    el.remove();
    connectUnpainted();
    const gone = vi.spyOn(engine().layers.tooltip, 'focus');
    keyboardFocus('a');
    el.remove();
    await nextFrame();
    expect(gone).not.toHaveBeenCalled();
  });

  it('writes the open tooltip again when its task object, critical flag or labels change, not on clock ticks', () => {
    // The bars region's run count at each call: a refresh comes after the frame painted the bars
    const barsRuns: number[] = [];
    const render = vi.fn((_ctx: GanttTooltipRenderContext): unknown => {
      barsRuns.push(engine().regionRuns['bars'] ?? 0);
      return null;
    });
    const options: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false, tooltip: { render } };
    // Beta follows Alpha: the critical chain once the critical path is on
    const tasks = TASKS().map(t => (t.id === 'b' ? { ...t, dependency: 'a' } : t));
    mount({ tasks, options });
    keyboardFocus('b');
    expect(render).toHaveBeenCalledTimes(1);
    const title = () => tip().querySelector('.gantt-tooltip-title')!.textContent;
    const regions = { ...engine().regionRuns };
    const refresh = vi.spyOn(engine().layers.tooltip, 'refresh');

    // The clock: nothing written again (statuses are read at the next opening)
    engine().inputs.nowTick.set(new Date(2026, 2, 12, 10));
    engine().inputs.nowTick.set(new Date(2026, 2, 12, 11));
    // Other tasks, an equal options object, a collapse elsewhere: the same task, flag and labels
    const renamed = tasks.map(t => (t.id === 'r' ? { ...t, name: 'Root 2' } : t));
    el.tasks = renamed;
    el.options = { ...options };
    expect(render).toHaveBeenCalledTimes(1);
    // ...not even asked: the same content stops at the cut-off
    expect(refresh).not.toHaveBeenCalled();
    // Reading the row while it shows subscribes no region
    expect(engine().regionRuns).toEqual(regions);

    // Its task object: written in the next frame, once its bar is repainted (placed by the moved bar)
    const barsBefore = engine().regionRuns['bars'] ?? 0;
    el.tasks = renamed.map(t => (t.id === 'b' ? { ...t, name: 'Beta 2', progress: 60 } : t));
    expect(render).toHaveBeenCalledTimes(1);
    flush(el);
    expect(render).toHaveBeenCalledTimes(2);
    expect(barsRuns[1]).toBeGreaterThan(barsBefore);
    expect(render.mock.calls[1][0]).toMatchObject({ task: { name: 'Beta 2' } });
    expect(title()).toBe('Beta 2');
    expect(tip().querySelectorAll('dd.gantt-tooltip-value')[3].textContent).toBe('60%');
    expect(tip().hidden).toBe(false);
    expect(bar('b').getAttribute('aria-describedby')).toBe(tip().id);

    // The critical flag
    el.options = { ...options, criticalPath: true };
    expect(engine().graph.critical.peek()!.criticalIds.has('b')).toBe(true);
    flush(el);
    expect(render).toHaveBeenCalledTimes(3);
    expect(tip().classList.contains('gantt-tooltip--critical')).toBe(true);

    // The labels
    el.options = { ...options, criticalPath: true, labels: { ttStart: 'From' } };
    flush(el);
    expect(render).toHaveBeenCalledTimes(4);
    expect(tip().querySelector('dt')!.textContent).toBe('From');
    flush(el);
    expect(render).toHaveBeenCalledTimes(4);

    // Closed: no longer followed
    keyboardFocus(null);
    el.tasks = renamed.map(t => (t.id === 'b' ? { ...t, name: 'Beta 3' } : t));
    flush(el);
    expect(render).toHaveBeenCalledTimes(4);
  });

  it('writes the open tooltip again when its row style changes (the progress colour), not for equal fields', () => {
    const render = vi.fn((_ctx: GanttTooltipRenderContext): unknown => null);
    const options: GanttOptions = {
      viewMode: ViewMode.Day,
      initialScroll: false,
      tooltip: { render },
      styles: { task: { color: '#0EA5E9' } },
    };
    mount({ options });
    keyboardFocus('a');
    const fill = () =>
      tip().querySelector<HTMLElement>('.gantt-tooltip-fill')!.style.getPropertyValue('background-color').toUpperCase();
    expect(fill()).toBe('#0EA5E9');
    expect(render).toHaveBeenCalledTimes(1);
    // The opening's own follow-up frame (it writes nothing again)
    flush(el);
    const refresh = vi.spyOn(engine().layers.tooltip, 'refresh');

    // Equal styles in new objects: the same fields, nothing written again
    el.options = { ...options, styles: { task: { color: '#0EA5E9' } } };
    flush(el);
    expect(render).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();

    // A new colour for its row (the task object is the same): written again, after the bars
    el.options = { ...options, styles: { task: { color: '#22C55E' } } };
    flush(el);
    expect(render).toHaveBeenCalledTimes(2);
    expect(fill()).toBe('#22C55E');
    expect(engine().layers.tooltip.visibleId()).toBe('a');
    expect(bar('a').getAttribute('aria-describedby')).toBe(tip().id);

    // Its own style wins over the kind style: written again once more
    el.tasks = engine()
      .inputs.tasksIn.peek()
      .map(t => (t.id === 'a' ? { ...t, style: { color: '#F97316' } } : t));
    flush(el);
    expect(render).toHaveBeenCalledTimes(3);
    expect(fill()).toBe('#F97316');
  });

  it('binds nothing while disconnected', () => {
    mount();
    el.remove();
    keyboardFocus('a');
    expect(tip().hidden).toBe(true);
    document.body.append(el);
    flush(el);
    keyboardFocus(null);
    keyboardFocus('a');
    expect(tip().hidden).toBe(false);
  });
});

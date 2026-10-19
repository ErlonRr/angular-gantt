// Phase 11 editing through the Vue binding: the seven new events are declared as camel-cased emits,
// a handler calling `detail.preventDefault()` vetoes the change (the element keeps its tasks), and
// `@tasks-change` → `tasks.value = detail.tasks` round-trips: the element gets back the very array
// it reported (Vue's proxy unwrapped), and the next change builds on it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, type App, type VNode } from 'vue';
import type { GantryElement } from '@gantryjs/vanilla';
import {
  Gantry,
  hitTestBar,
  type GanttBeforeChangeEvent,
  type GanttOptions,
  type GanttTask,
  type GanttTasksChangeEvent,
  type TaskDragEvent,
} from '../index';

const task = (id: string, day: number, length = 10): GanttTask => ({
  id,
  name: `Task ${id}`,
  start: new Date(2026, 2, day),
  end: new Date(2026, 2, day + length),
  progress: 40,
});
const plan = (): GanttTask[] => [task('a', 2), task('b', 14)];
const EDITING: GanttOptions = { editing: true };
const CONTROLLED: GanttOptions = { editing: { controlled: true } };

/** The Phase 11 events, by Vue emit name */
const EDIT_EMITS = [
  'beforeChange',
  'tasksChange',
  'taskUpdated',
  'taskProgressChanged',
  'dependencyCreated',
  'dependencyDeleted',
  'historyChange',
];

const apps: App[] = [];

/** Mounts `render` into a connected host and waits for the element's first frame (its bars). */
async function mount(render: () => VNode): Promise<GantryElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render });
  apps.push(app);
  app.mount(host);
  const el = host.querySelector('gantry-element');
  if (!el) throw new Error('no <gantry-element>');
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  return el;
}

/**
 * Drags bar `id` by its body to the right by its own width. Bars are hit by geometry (the canvas box
 * is at 0,0 in happy-dom): the press goes where core `hitTestBar` finds the body, clear of the
 * resize grips and, with `editing` on, of the progress grip.
 */
function dragBar(el: GantryElement, id: string): void {
  const bar = el.shadowRoot!.querySelector(`.gantt-bars-layer [data-task-id="${id}"]`)!;
  const canvas = el.shadowRoot!.querySelector('.gantry-canvas-container')!;
  const v = el.getBarVisual(id)!;
  const offsets = Array.from({ length: Math.ceil(v.width / 2) }, (_, i) => (i % 2 ? -1 : 1) * Math.ceil(i / 2));
  const x = offsets.map(d => v.x + v.width / 2 + d).find(px => hitTestBar(v, px, v.cy) === 'bar');
  if (x === undefined) throw new Error(`no body to press on bar ${id}`);
  bar.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: v.cy, pointerId: 1 }),
  );
  canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x + v.width, clientY: v.cy, pointerId: 1 }));
  canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: x + v.width, clientY: v.cy, pointerId: 1 }));
}

afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('<Gantry> editing events (Vue)', () => {
  it('declares the Phase 11 emits (template names: @before-change, @tasks-change, …)', () => {
    expect(Object.keys(Gantry['emits'] as object)).toEqual(expect.arrayContaining(EDIT_EMITS));
  });

  it('vetoes a drag when the beforeChange handler calls detail.preventDefault(): the element keeps its tasks', async () => {
    const tasks = plan();
    const onBeforeChange = vi.fn((detail: GanttBeforeChangeEvent) => detail.preventDefault());
    const onTaskDragged = vi.fn();
    const onTasksChange = vi.fn();
    const el = await mount(() => h(Gantry, { tasks, onBeforeChange, onTaskDragged, onTasksChange }));
    dragBar(el, 'a');
    await nextTick();

    expect(onBeforeChange).toHaveBeenCalledOnce();
    const detail = onBeforeChange.mock.calls[0]![0];
    expect(detail.change.source).toBe('drag');
    expect(detail.defaultPrevented).toBe(true);
    expect(el.tasks).toBe(tasks);
    expect(el.tasks[0]!.start).toEqual(new Date(2026, 2, 2));
    expect(onTaskDragged).not.toHaveBeenCalled();
    expect(onTasksChange).not.toHaveBeenCalled();
  });

  it('vetoes an API change the same way', async () => {
    const tasks = plan();
    const onDependencyCreated = vi.fn();
    const onTasksChange = vi.fn();
    const el = await mount(() =>
      h(Gantry, {
        tasks,
        options: EDITING,
        onBeforeChange: (detail: GanttBeforeChangeEvent) => detail.preventDefault(),
        onDependencyCreated,
        onTasksChange,
      }),
    );
    expect(el.addDependency('a', 'b')).toBe(false);
    expect(el.tasks).toBe(tasks);
    expect(el.tasks[1]!.dependency).toBeUndefined();
    expect(el.canUndo).toBe(false);
    expect(onDependencyCreated).not.toHaveBeenCalled();
    expect(onTasksChange).not.toHaveBeenCalled();
  });

  it('round-trips tasksChange → tasks.value (a deep ref), then undoes through the same path', async () => {
    const tasks = ref(plan());
    const original = tasks.value.map(t => ({ ...t }));
    const changes: GanttTasksChangeEvent[] = [];
    const dragged: TaskDragEvent[] = [];
    const el = await mount(() =>
      h(Gantry, {
        tasks: tasks.value,
        options: EDITING,
        onTaskDragged: (detail: TaskDragEvent) => dragged.push(detail),
        onTasksChange: (detail: GanttTasksChangeEvent) => {
          changes.push(detail);
          tasks.value = detail.tasks;
        },
      }),
    );

    dragBar(el, 'a');
    await nextTick();
    expect(changes).toHaveLength(1);
    const moved = changes[0]!;
    expect(moved).toMatchObject({ applied: true, change: { source: 'drag' } });
    // The element gets back the array it reported (the ref's proxy unwrapped, not a copy)
    expect(el.tasks).toBe(moved.tasks);
    expect(moved.tasks[0]!.start).toEqual(dragged[0]!.newStart);
    expect(moved.tasks[0]!.start).not.toEqual(original[0]!.start);

    expect(el.addDependency('a', 'b')).toBe(true);
    await nextTick();
    expect(changes).toHaveLength(2);
    const linked = changes[1]!;
    expect(linked.change.source).toBe('api');
    expect(linked.tasks[0]).toBe(moved.tasks[0]);
    expect(linked.tasks[1]!.dependency).toBeDefined();
    expect(el.tasks).toBe(linked.tasks);

    expect(el.undo()).toBe(true);
    await nextTick();
    expect(changes).toHaveLength(3);
    expect(changes[2]!.change.source).toBe('undo');
    expect(el.tasks).toBe(changes[2]!.tasks);
    expect(el.tasks[1]!.dependency).toBeUndefined();
    expect(el.tasks[0]!.start).toEqual(moved.tasks[0]!.start);
  });

  it('controlled: the element applies nothing until the handler sets the proposed tasks', async () => {
    const initial = plan();
    const tasks = ref(initial);
    const changes: GanttTasksChangeEvent[] = [];
    let accept = false;
    const el = await mount(() =>
      h(Gantry, {
        tasks: tasks.value,
        options: CONTROLLED,
        onTasksChange: (detail: GanttTasksChangeEvent) => {
          changes.push(detail);
          if (accept) tasks.value = detail.tasks;
        },
      }),
    );

    dragBar(el, 'a');
    await nextTick();
    expect(changes).toHaveLength(1);
    expect(changes[0]!.applied).toBe(false);
    expect(el.tasks).toBe(initial);

    accept = true;
    dragBar(el, 'a');
    await nextTick();
    expect(changes).toHaveLength(2);
    expect(el.tasks).toBe(changes[1]!.tasks);
    expect(el.tasks[0]!.start).not.toEqual(initial[0]!.start);
    expect(el.canUndo).toBe(false);
  });
});

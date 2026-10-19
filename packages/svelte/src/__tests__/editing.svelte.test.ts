// Phase 11 editing through the Svelte binding: a callback calling `detail.preventDefault()` vetoes
// the change (the element keeps its tasks), and `onTasksChange` → `tasks = detail.tasks` round-trips
// with `$state.raw` and with `$state`: the element gets the reported tasks back (a one-level copy,
// the same items), and the next change builds on them. A `.svelte.test.ts` file, so it may use runes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import {
  Gantry,
  hitTestBar,
  type GantryElement,
  type GanttBeforeChangeEvent,
  type GanttOptions,
  type GanttTask,
  type GanttTasksChangeEvent,
  type TaskDragEvent,
} from '../index';

type Props = ComponentProps<typeof Gantry>;

const task = (id: string, day: number): GanttTask => ({
  id,
  name: `Task ${id}`,
  start: new Date(2026, 0, day),
  end: new Date(2026, 0, day + 10),
  progress: 50,
});
const plan = (): GanttTask[] => [task('a', 5), task('b', 20)];
const EDITING: GanttOptions = { editing: true };
const CONTROLLED: GanttOptions = { editing: { controlled: true } };

const teardown: (() => void)[] = [];

/** Mounts `<Gantry>` with `props`, flushes its effects and waits for the element's first frame (its bars). */
async function render(props: Props): Promise<GantryElement> {
  const target = document.createElement('div');
  document.body.append(target);
  const component = mount(Gantry, { target, props });
  flushSync();
  teardown.push(() => {
    void unmount(component);
    target.remove();
  });
  const el = target.querySelector('gantry-element');
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

/** The element holds `tasks` as a one-level copy: a new array of the same items. */
function expectCopyOf(el: GantryElement, tasks: readonly GanttTask[]): void {
  expect(el.tasks).not.toBe(tasks);
  expect(el.tasks).toHaveLength(tasks.length);
  el.tasks.forEach((t, i) => expect(t).toBe(tasks[i]));
}

afterEach(() => {
  for (const destroy of teardown.splice(0)) destroy();
  vi.restoreAllMocks();
});

describe('<Gantry> editing events (Svelte)', () => {
  it('vetoes a drag when onBeforeChange calls detail.preventDefault(): the element keeps its tasks', async () => {
    const tasks = plan();
    const onBeforeChange = vi.fn((detail: GanttBeforeChangeEvent) => detail.preventDefault());
    const onTaskDragged = vi.fn();
    const onTasksChange = vi.fn();
    const el = await render({ tasks, onBeforeChange, onTaskDragged, onTasksChange });
    const held = el.tasks;
    dragBar(el, 'a');
    flushSync();

    expect(onBeforeChange).toHaveBeenCalledOnce();
    const detail = onBeforeChange.mock.calls[0]![0];
    expect(detail.change.source).toBe('drag');
    expect(detail.defaultPrevented).toBe(true);
    expect(el.tasks).toBe(held);
    expect(el.tasks[0]).toBe(tasks[0]);
    expect(el.tasks[0]!.start).toEqual(new Date(2026, 0, 5));
    expect(onTaskDragged).not.toHaveBeenCalled();
    expect(onTasksChange).not.toHaveBeenCalled();
  });

  it('vetoes an API change the same way', async () => {
    const tasks = plan();
    const onDependencyCreated = vi.fn();
    const onTasksChange = vi.fn();
    const el = await render({
      tasks,
      options: EDITING,
      onBeforeChange: detail => detail.preventDefault(),
      onDependencyCreated,
      onTasksChange,
    });
    const held = el.tasks;
    expect(el.addDependency('a', 'b')).toBe(false);
    flushSync();
    expect(el.tasks).toBe(held);
    expect(el.tasks[1]!.dependency).toBeUndefined();
    expect(el.canUndo).toBe(false);
    expect(onDependencyCreated).not.toHaveBeenCalled();
    expect(onTasksChange).not.toHaveBeenCalled();
  });

  it('round-trips onTasksChange → a $state.raw variable, then undoes through the same path', async () => {
    const initial = plan();
    let tasks = $state.raw(initial);
    /** The app's state now (read in a closure: a bare reference would capture the first value) */
    const current = () => tasks;
    const changes: GanttTasksChangeEvent[] = [];
    const dragged: TaskDragEvent[] = [];
    const el = await render({
      get tasks() {
        return tasks;
      },
      options: EDITING,
      onTaskDragged: detail => dragged.push(detail),
      onTasksChange: detail => {
        changes.push(detail);
        tasks = detail.tasks;
      },
    });

    dragBar(el, 'a');
    flushSync();
    expect(changes).toHaveLength(1);
    const moved = changes[0]!;
    expect(moved).toMatchObject({ applied: true, change: { source: 'drag' } });
    expect(current()).toBe(moved.tasks);
    expectCopyOf(el, moved.tasks);
    expect(moved.tasks[0]!.start).toEqual(dragged[0]!.newStart);
    expect(moved.tasks[0]!.start).not.toEqual(initial[0]!.start);
    expect(moved.tasks[1]).toBe(initial[1]); // untouched tasks keep their identity

    expect(el.addDependency('a', 'b')).toBe(true);
    flushSync();
    expect(changes).toHaveLength(2);
    const linked = changes[1]!;
    expect(linked.change.source).toBe('api');
    expect(linked.tasks[0]).toBe(moved.tasks[0]);
    expect(linked.tasks[1]!.dependency).toBeDefined();
    expectCopyOf(el, linked.tasks);

    expect(el.undo()).toBe(true);
    flushSync();
    expect(changes).toHaveLength(3);
    expect(changes[2]!.change.source).toBe('undo');
    expectCopyOf(el, changes[2]!.tasks);
    expect(el.tasks[1]!.dependency).toBeUndefined();
    expect(el.tasks[0]!.start).toEqual(moved.tasks[0]!.start);
  });

  it('round-trips onTasksChange → a $state props object', async () => {
    const initial = plan();
    const changes: GanttTasksChangeEvent[] = [];
    const props: Props = $state({
      tasks: initial,
      options: EDITING,
      onTasksChange: (detail: GanttTasksChangeEvent) => {
        changes.push(detail);
        props.tasks = detail.tasks;
      },
    });
    const el = await render(props);

    dragBar(el, 'a');
    flushSync();
    expect(changes).toHaveLength(1);
    expect(changes[0]!.applied).toBe(true);
    // The items as `$state` hands them out: the element sees the moved task
    expect(el.tasks.map(t => t.id)).toEqual(['a', 'b']);
    expect(el.tasks[0]!.start).toEqual(changes[0]!.tasks[0]!.start);
    expect(el.tasks[0]!.start).not.toEqual(initial[0]!.start);

    expect(el.addDependency('a', 'b')).toBe(true);
    flushSync();
    expect(changes).toHaveLength(2);
    expect(el.tasks[1]!.dependency).toBeDefined();
    expect(el.tasks[0]!.start).toEqual(changes[0]!.tasks[0]!.start);
  });

  it('controlled: the element applies nothing until the callback sets the proposed tasks', async () => {
    const initial = plan();
    let tasks = $state.raw(initial);
    const changes: GanttTasksChangeEvent[] = [];
    let accept = false;
    const el = await render({
      get tasks() {
        return tasks;
      },
      options: CONTROLLED,
      onTasksChange: detail => {
        changes.push(detail);
        if (accept) tasks = detail.tasks;
      },
    });
    const held = el.tasks;

    dragBar(el, 'a');
    flushSync();
    expect(changes).toHaveLength(1);
    expect(changes[0]!.applied).toBe(false);
    expect(el.tasks).toBe(held);

    accept = true;
    dragBar(el, 'a');
    flushSync();
    expect(changes).toHaveLength(2);
    expectCopyOf(el, changes[1]!.tasks);
    expect(el.tasks[0]!.start).not.toEqual(initial[0]!.start);
    expect(el.canUndo).toBe(false);
  });
});

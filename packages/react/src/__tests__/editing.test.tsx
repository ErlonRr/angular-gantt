// Phase 11 editing through the React wrapper: the seven new events reach their `on*` callbacks
// (never attributes), a callback calling `detail.preventDefault()` vetoes the change (the element
// keeps its tasks), and `onTasksChange` → `setTasks` round-trips under StrictMode: the element gets
// back the very array it reported, and the next change builds on it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, StrictMode, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 0, 5), end: new Date(2026, 0, 20), progress: 60 },
  { id: 'b', name: 'Build', start: new Date(2026, 0, 21), end: new Date(2026, 1, 10), progress: 0 },
];
const EDITING: GanttOptions = { editing: true };
const CONTROLLED: GanttOptions = { editing: { controlled: true } };

/** The Phase 11 events and their callbacks */
const EDIT_EVENTS = {
  'before-change': 'onBeforeChange',
  'tasks-change': 'onTasksChange',
  'task-updated': 'onTaskUpdated',
  'task-progress-changed': 'onTaskProgressChanged',
  'dependency-created': 'onDependencyCreated',
  'dependency-deleted': 'onDependencyDeleted',
  'history-change': 'onHistoryChange',
} as const;

let host: HTMLDivElement | undefined;
let root: Root | undefined;

async function render(node: ReactNode): Promise<GantryElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  const el = host.querySelector('gantry-element');
  if (!el) throw new Error('no <gantry-element>');
  // The element paints its bars on the next frame
  await act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
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

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
  vi.restoreAllMocks();
});

describe('<Gantry> editing events (React)', () => {
  it('calls each Phase 11 callback with its event detail, never as an attribute', async () => {
    const callbacks = Object.fromEntries(Object.values(EDIT_EVENTS).map(name => [name, vi.fn()]));
    const el = await render(<Gantry {...callbacks} />);
    for (const [type, name] of Object.entries(EDIT_EVENTS)) {
      const detail = { type };
      el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
      expect(callbacks[name], name).toHaveBeenCalledExactlyOnceWith(detail);
    }
    expect(el.getAttributeNames().filter(a => a.toLowerCase().startsWith('on'))).toEqual([]);
  });

  it('vetoes a drag when onBeforeChange calls detail.preventDefault(): the element keeps its tasks', async () => {
    const onBeforeChange = vi.fn((detail: GanttBeforeChangeEvent) => detail.preventDefault());
    const onTaskDragged = vi.fn();
    const onTasksChange = vi.fn();
    const el = await render(
      <Gantry
        tasks={TASKS}
        onBeforeChange={onBeforeChange}
        onTaskDragged={onTaskDragged}
        onTasksChange={onTasksChange}
      />,
    );
    await act(async () => dragBar(el, 'a'));

    expect(onBeforeChange).toHaveBeenCalledOnce();
    const detail = onBeforeChange.mock.calls[0]![0];
    expect(detail.change.source).toBe('drag');
    expect(detail.defaultPrevented).toBe(true);
    expect(el.tasks).toBe(TASKS);
    expect(el.tasks[0]!.start).toEqual(new Date(2026, 0, 5));
    expect(onTaskDragged).not.toHaveBeenCalled();
    expect(onTasksChange).not.toHaveBeenCalled();
  });

  it('vetoes an API change the same way', async () => {
    const onDependencyCreated = vi.fn();
    const onTasksChange = vi.fn();
    const onHistoryChange = vi.fn();
    const el = await render(
      <Gantry
        tasks={TASKS}
        options={EDITING}
        onBeforeChange={detail => detail.preventDefault()}
        onDependencyCreated={onDependencyCreated}
        onTasksChange={onTasksChange}
        onHistoryChange={onHistoryChange}
      />,
    );
    let created = true;
    await act(async () => {
      created = el.addDependency('a', 'b');
    });
    expect(created).toBe(false);
    expect(el.tasks).toBe(TASKS);
    expect(el.tasks[1]!.dependency).toBeUndefined();
    expect(el.canUndo).toBe(false);
    expect(onDependencyCreated).not.toHaveBeenCalled();
    expect(onTasksChange).not.toHaveBeenCalled();
    expect(onHistoryChange).not.toHaveBeenCalled();
  });

  it('round-trips onTasksChange → setTasks under StrictMode, then undoes through the same path', async () => {
    const changes: GanttTasksChangeEvent[] = [];
    const dragged: TaskDragEvent[] = [];
    let state: GanttTask[] = TASKS;
    function App() {
      const [tasks, setTasks] = useState(TASKS);
      state = tasks;
      return (
        <Gantry
          tasks={tasks}
          options={EDITING}
          onTaskDragged={detail => dragged.push(detail)}
          onTasksChange={detail => {
            changes.push(detail);
            setTasks(detail.tasks);
          }}
        />
      );
    }
    const el = await render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    await act(async () => dragBar(el, 'a'));
    // One listener per event: StrictMode's second effect run adds no second call
    expect(changes).toHaveLength(1);
    expect(dragged).toHaveLength(1);
    const moved = changes[0]!;
    expect(moved).toMatchObject({ applied: true, change: { source: 'drag' } });
    expect(state).toBe(moved.tasks);
    expect(el.tasks).toBe(moved.tasks); // written back as it is
    expect(moved.tasks[0]!.start).toEqual(dragged[0]!.newStart);
    expect(moved.tasks[0]!.start).not.toEqual(TASKS[0]!.start);
    expect(moved.tasks[1]).toBe(TASKS[1]); // untouched tasks keep their identity

    // The next change starts from the state the app stored
    await act(async () => {
      expect(el.addDependency('a', 'b')).toBe(true);
    });
    expect(changes).toHaveLength(2);
    const linked = changes[1]!;
    expect(linked.change.source).toBe('api');
    expect(linked.tasks[0]).toBe(moved.tasks[0]);
    expect(linked.tasks[1]!.dependency).toBeDefined();
    expect(el.tasks).toBe(linked.tasks);
    expect(state).toBe(linked.tasks);

    // Undo is a change like any other: the app's state follows it
    await act(async () => {
      expect(el.undo()).toBe(true);
    });
    expect(changes).toHaveLength(3);
    expect(changes[2]!.change.source).toBe('undo');
    expect(state).toBe(changes[2]!.tasks);
    expect(el.tasks).toBe(state);
    expect(state[1]!.dependency).toBeUndefined();
    expect(state[0]!.start).toEqual(moved.tasks[0]!.start);
  });

  it('controlled: the element applies nothing until the app sets the proposed tasks', async () => {
    const changes: GanttTasksChangeEvent[] = [];
    let accept = true;
    function App() {
      const [tasks, setTasks] = useState(TASKS);
      return (
        <Gantry
          tasks={tasks}
          options={CONTROLLED}
          onTasksChange={detail => {
            changes.push(detail);
            if (accept) setTasks(detail.tasks);
          }}
        />
      );
    }
    const el = await render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    accept = false;
    await act(async () => dragBar(el, 'a'));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.applied).toBe(false);
    expect(changes[0]!.tasks[0]!.start).not.toEqual(TASKS[0]!.start);
    expect(el.tasks).toBe(TASKS); // not set by the app: unchanged

    accept = true;
    await act(async () => dragBar(el, 'a'));
    expect(changes).toHaveLength(2);
    expect(changes[1]!.applied).toBe(false);
    expect(el.tasks).toBe(changes[1]!.tasks);
    expect(el.tasks[0]!.start).not.toEqual(TASKS[0]!.start);
    expect(el.canUndo).toBe(false); // controlled charts keep no history
  });
});

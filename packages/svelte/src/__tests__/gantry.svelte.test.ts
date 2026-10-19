// The Svelte binding (Gantry 2 phase 8): every prop reaches `<gantry-element>` as a property and
// every event its callback; listeners exist before the first property write (first events are
// not lost); a cleared prop restores the element's default; the element's first frame already
// has the props; data props are copied one level (plain array or object, the consumer's items,
// no deep clone); unmounting removes the listeners. A `.svelte.test.ts` file, so it may use runes.
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { flushSync, mount, tick, unmount, type ComponentProps } from 'svelte';
import { types } from 'node:util';
import { GANTRY_EVENTS, GANTRY_PROPERTIES, type GantryProperties } from '@gantryjs/vanilla';
import {
  Gantry,
  GanttDataSource,
  ViewMode,
  createGanttSyncGroup,
  type GantryElement,
  type GanttOptions,
  type GanttTask,
} from '../index';
import Bound from './Bound.svelte';

type Name = (typeof GANTRY_PROPERTIES)[number];
/** The binding's props, plus any attribute (`dark-mode`, …) */
type Props = ComponentProps<typeof Gantry> & Record<string, unknown>;

const task = (id: string, day: number): GanttTask => ({
  id,
  name: `Task ${id}`,
  start: new Date(2026, 0, day),
  end: new Date(2026, 0, day + 4),
  progress: 50,
});

/** A non-default value for every property */
const SAMPLE: { [K in Name]-?: Exclude<GantryProperties[K], undefined> } = {
  tasks: [task('a', 5), task('b', 12)],
  columns: [{ key: 'name', label: 'Name', width: 200 }],
  options: { viewMode: ViewMode.Week },
  annotations: [{ x1: new Date(2026, 0, 9), label: { text: 'Review' } }],
  darkMode: true,
  showToolbar: false,
  enableDrag: false,
  enableResize: false,
  tooltipEnabled: false,
  showLegend: true,
  dataSource: { fetcher: () => Promise.resolve([]), initialPage: 0 },
  renderBar: () => null,
  loading: true,
  errorMessage: 'Couldn’t load the plan',
  syncGroup: createGanttSyncGroup(),
};

const proto = customElements.get('gantry-element')!.prototype as unknown as Record<string, unknown>;

/** Spies on every property setter of `<gantry-element>` (they still write the element). */
function spyWrites(): Record<Name, MockInstance<(value: unknown) => void>> {
  const spies = GANTRY_PROPERTIES.map(name => [name, vi.spyOn(proto, name, 'set')] as const);
  return Object.fromEntries(spies) as unknown as Record<Name, MockInstance<(value: unknown) => void>>;
}

const teardown: (() => void)[] = [];

/** Mounts `<Gantry>` with `props` (a plain or `$state` object) and flushes its effects. */
function render(props: Props = {}): { el: GantryElement; destroy: () => void } {
  const target = document.createElement('div');
  document.body.append(target);
  const component = mount(Gantry, { target, props });
  flushSync();
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    void unmount(component);
    target.remove();
  };
  teardown.push(destroy);
  const el = target.querySelector('gantry-element');
  if (!el) throw new Error('no <gantry-element>');
  return { el, destroy };
}

const dispatch = (el: GantryElement, type: string, detail: unknown) =>
  el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

afterEach(() => {
  for (const destroy of teardown.splice(0)) destroy();
  vi.restoreAllMocks();
});

describe('<Gantry> (Svelte binding)', () => {
  it('renders a <gantry-element> with the style and the other attributes', () => {
    const { el } = render({ class: 'chart', id: 'plan', 'aria-describedby': 'help', style: 'height: 400px' });
    expect(el.className).toBe('chart');
    expect(el.id).toBe('plan');
    expect(el.getAttribute('aria-describedby')).toBe('help');
    // Only the consumer's style: the element sizes itself (`:host`: block, 100% × 100%)
    expect(el.style.height).toBe('400px');
    expect(el.style.display).toBe('');
  });

  it('writes no inline style of its own', () => {
    expect(render({ class: 'chart' }).el.hasAttribute('style')).toBe(false);
  });

  it('forwards every GANTRY_PROPERTIES prop as an element property', () => {
    const writes = spyWrites();
    const { el } = render({ ...SAMPLE });
    for (const name of GANTRY_PROPERTIES) {
      expect(writes[name], name).toHaveBeenCalledTimes(1);
      expect(writes[name].mock.calls[0]![0], name).toEqual(SAMPLE[name]);
    }
    expect(el.darkMode).toBe(true);
    expect(el.showToolbar).toBe(false);
    expect(el.showLegend).toBe(true);
    expect(el.renderBar).toBe(SAMPLE.renderBar);
    expect(el.loading).toBe(true);
    expect(el.errorMessage).toBe(SAMPLE.errorMessage);
    // Not copied: the group is shared by identity
    expect(el.syncGroup).toBe(SAMPLE.syncGroup);
    // No prop leaks into the attributes (and no inline style)
    expect(el.getAttributeNames().filter(a => a !== 'role' && a !== 'aria-label')).toEqual([]);
  });

  it('calls every GANTRY_EVENTS callback with the event detail, reading the latest callback', () => {
    const first = Object.fromEntries(Object.values(GANTRY_EVENTS).map(cb => [cb, vi.fn()]));
    const props = $state<Props>({ ...first });
    const { el } = render(props);
    for (const [type, cb] of Object.entries(GANTRY_EVENTS)) {
      const detail = { type };
      dispatch(el, type, detail);
      expect(first[cb], cb).toHaveBeenCalledExactlyOnceWith(detail);
    }

    const adds = vi.spyOn(el, 'addEventListener');
    const second = Object.fromEntries(Object.values(GANTRY_EVENTS).map(cb => [cb, vi.fn()]));
    Object.assign(props, second);
    flushSync();
    for (const [type, cb] of Object.entries(GANTRY_EVENTS)) {
      dispatch(el, type, null);
      expect(second[cb], cb).toHaveBeenCalledOnce();
      expect(first[cb], cb).toHaveBeenCalledOnce();
    }
    expect(adds).not.toHaveBeenCalled(); // listeners stay; they read the callback when they fire
  });

  describe('first events', () => {
    it('attaches every listener before the first property write', () => {
      const adds = vi.spyOn(proto as unknown as HTMLElement, 'addEventListener');
      const writes = spyWrites();
      render({ ...SAMPLE });
      const events = new Set(Object.keys(GANTRY_EVENTS));
      const attached = adds.mock.calls.flatMap(([type], i) =>
        events.has(type) ? [adds.mock.invocationCallOrder[i]!] : [],
      );
      expect(attached).toHaveLength(events.size);
      const firstWrite = Math.min(...GANTRY_PROPERTIES.flatMap(name => writes[name].mock.invocationCallOrder));
      expect(Math.max(...attached)).toBeLessThan(firstWrite);
    });

    it('delivers the event the first options assignment fires', () => {
      const onViewModeChange = vi.fn();
      const { el } = render({ options: { viewMode: ViewMode.Week }, onViewModeChange });
      expect(el.viewMode).toBe(ViewMode.Week);
      expect(onViewModeChange).toHaveBeenCalledExactlyOnceWith({ viewMode: ViewMode.Week });
    });

    it('an event fired inside a consumer effect does not subscribe that effect to the callback', () => {
      let seen = $state(0);
      const calls: number[] = [];
      const props = $state<Props>({ onViewModeChange: () => calls.push(seen) }); // reads state
      const { el } = render(props);
      let runs = 0;
      let mode = $state<string>(ViewMode.Week);
      const stop = $effect.root(() => {
        $effect(() => {
          runs++;
          el.setViewMode(mode); // fires view-mode-change while the effect runs
        });
      });
      teardown.push(stop);
      flushSync();
      expect(runs).toBe(1);
      expect(calls).toEqual([0]);

      seen++; // state the callback read
      flushSync();
      props.onViewModeChange = () => calls.push(-1); // the callback prop
      flushSync();
      expect(runs).toBe(1);

      // The effect still re-runs on its own dependencies, and the new callback is called
      mode = ViewMode.Month;
      flushSync();
      expect(runs).toBe(2);
      expect(calls).toEqual([0, -1]);
    });

    it('a callback run by a property write does not subscribe the property effect', () => {
      const writes = spyWrites();
      let seen = $state(0);
      const props = $state<Props>({
        options: { viewMode: ViewMode.Week },
        onViewModeChange: () => void seen, // reads state while the options effect writes the element
      });
      render(props);
      expect(writes.options).toHaveBeenCalledTimes(1);
      seen++;
      flushSync();
      expect(writes.options).toHaveBeenCalledTimes(1);
    });
  });

  describe('nullable props', () => {
    it('forwards undefined when a prop is cleared, which restores the default', () => {
      const writes = spyWrites();
      const props = $state<Props>({ ...SAMPLE });
      const { el } = render(props);
      for (const name of GANTRY_PROPERTIES) props[name] = undefined;
      flushSync();
      for (const name of GANTRY_PROPERTIES) {
        expect(writes[name], name).toHaveBeenCalledTimes(2);
        expect(writes[name].mock.calls[1], name).toEqual([undefined]);
      }
      expect(el.tasks).toEqual([]);
      expect(el.options).toEqual({});
      expect(el.annotations).toEqual([]);
      expect(el.columns.map(c => c.key)).not.toEqual(['name']); // the built-in columns
      expect(el.darkMode).toBe(false);
      expect(el.showToolbar).toBe(true);
      expect(el.enableDrag).toBe(true);
      expect(el.enableResize).toBe(true);
      expect(el.tooltipEnabled).toBe(true);
      expect(el.showLegend).toBe(false);
      expect(el.dataSource).toBeNull();
      expect(el.renderBar).toBeUndefined();
      expect(el.loading).toBe(false);
      expect(el.errorMessage).toBeNull();
      expect(el.syncGroup).toBeNull();
    });

    it('a prop never set leaves the element its own value (an attribute, a property set on the element)', () => {
      const writes = spyWrites();
      const props = $state<Props>({ 'dark-mode': 'auto', 'show-legend': '' });
      const { el } = render(props);
      expect(el.darkMode).toBe('auto');
      expect(el.showLegend).toBe(true);
      for (const name of GANTRY_PROPERTIES) expect(writes[name], name).not.toHaveBeenCalled();

      el.enableDrag = false; // e.g. through bind:element
      props.tasks = [task('a', 5)];
      flushSync();
      expect(el.enableDrag).toBe(false);
      expect(el.darkMode).toBe('auto');
    });

    it('re-assigns only the prop that changed', () => {
      const writes = spyWrites();
      const props = $state<Props>({ tasks: [task('a', 5)], options: { viewMode: ViewMode.Week }, darkMode: false });
      const { el } = render(props);
      props.darkMode = 'auto';
      flushSync();
      expect(el.darkMode).toBe('auto');
      expect(writes.darkMode).toHaveBeenCalledTimes(2);
      expect(writes.tasks).toHaveBeenCalledTimes(1);
      expect(writes.options).toHaveBeenCalledTimes(1);
    });
  });

  it('the first frame already has every prop (no flash of defaults)', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => frames.push(cb));
    const target = document.createElement('div');
    document.body.append(target);
    // No flushSync: Svelte runs the effects in a microtask, as in an app
    const component = mount(Gantry, { target, props: { tasks: SAMPLE.tasks, showToolbar: false, darkMode: true } });
    teardown.push(() => {
      void unmount(component);
      target.remove();
    });
    await tick();
    const el = target.querySelector('gantry-element')!;
    expect(frames.length).toBeGreaterThan(0); // the element waits for its first frame
    const first = frames.splice(0);
    for (const frame of first) frame(performance.now());
    expect(el.shadowRoot!.querySelector('.gantt-toolbar')).toBeNull();
    expect(el.darkMode).toBe(true);
    expect(el.tasks.map(t => t.id)).toEqual(['a', 'b']);
  });

  describe('identity: a one-level copy, never a deep clone', () => {
    it('$state.raw tasks: a new plain array holding the consumer objects', () => {
      const writes = spyWrites();
      const items = [task('a', 5), task('b', 12)];
      let tasks = $state.raw(items);
      render({
        get tasks() {
          return tasks;
        },
      });
      const sent = writes.tasks.mock.calls[0]![0] as GanttTask[];
      expect(sent).not.toBe(items);
      expect(types.isProxy(sent)).toBe(false);
      expect(sent).toHaveLength(2);
      sent.forEach((t, i) => expect(t).toBe(items[i]));

      const next = [...items, task('c', 20)];
      tasks = next;
      flushSync();
      expect(writes.tasks).toHaveBeenCalledTimes(2);
      const resent = writes.tasks.mock.calls[1]![0] as GanttTask[];
      expect(resent).not.toBe(next);
      resent.forEach((t, i) => expect(t).toBe(next[i]));
    });

    it('$state tasks: a plain array (not the proxy) of the consumer items, re-sent when items are added or replaced', () => {
      const writes = spyWrites();
      const props = $state({ tasks: [task('a', 5), task('b', 12)] });
      const { el } = render(props);
      const sent = writes.tasks.mock.calls[0]![0] as GanttTask[];
      expect(types.isProxy(props.tasks)).toBe(true);
      expect(types.isProxy(sent)).toBe(false);
      sent.forEach((t, i) => expect(t).toBe(props.tasks[i])); // the same items, not snapshots

      props.tasks.push(task('c', 20));
      flushSync();
      expect(writes.tasks).toHaveBeenCalledTimes(2);
      expect(el.tasks.map(t => t.id)).toEqual(['a', 'b', 'c']);

      props.tasks[0] = { ...props.tasks[0]!, name: 'Renamed' };
      flushSync();
      expect(writes.tasks).toHaveBeenCalledTimes(3);
      expect(el.tasks[0]!.name).toBe('Renamed');

      // One level: an item's own fields are not tracked (replace the item, or use $state.raw)
      props.tasks[1]!.name = 'In place';
      flushSync();
      expect(writes.tasks).toHaveBeenCalledTimes(3);
    });

    it('$state options: a plain object, re-sent when a field changes', () => {
      const writes = spyWrites();
      const props = $state<{ options: GanttOptions }>({ options: { viewMode: ViewMode.Week, rowHeight: 40 } });
      const { el } = render(props);
      const sent = writes.options.mock.calls[0]![0];
      expect(types.isProxy(sent)).toBe(false);
      expect(sent).toEqual({ viewMode: ViewMode.Week, rowHeight: 40 });

      props.options.viewMode = ViewMode.Day;
      flushSync();
      expect(writes.options).toHaveBeenCalledTimes(2);
      expect(el.viewMode).toBe(ViewMode.Day);
    });

    it('passes functions and class instances as they are', () => {
      const writes = spyWrites();
      const renderBar = () => null;
      const dataSource = new GanttDataSource({ fetcher: () => Promise.resolve([]), initialPage: 0 });
      const { el } = render({ renderBar, dataSource });
      expect(writes.renderBar.mock.calls[0]![0]).toBe(renderBar);
      expect(writes.dataSource.mock.calls[0]![0]).toBe(dataSource);
      expect(el.dataSource).toBe(dataSource);
    });

    it('passes a plain dataSource config object as it is (only the data props are copied)', () => {
      const writes = spyWrites();
      const config = { fetcher: () => Promise.resolve([]), initialPage: 0 };
      const { el } = render({ dataSource: config });
      expect(writes.dataSource).toHaveBeenCalledOnce();
      expect(writes.dataSource.mock.calls[0]![0]).toBe(config);
      expect(el.dataSource).toBeInstanceOf(GanttDataSource);
    });
  });

  describe('unmount', () => {
    it('removes the listeners', () => {
      const callbacks = Object.fromEntries(Object.values(GANTRY_EVENTS).map(cb => [cb, vi.fn()]));
      const { el, destroy } = render({ ...callbacks });
      const removes = vi.spyOn(el, 'removeEventListener');
      destroy();
      flushSync();
      const removed = new Set(removes.mock.calls.map(([type]) => type));
      for (const type of Object.keys(GANTRY_EVENTS)) {
        expect(removed.has(type), type).toBe(true);
        dispatch(el, type, null);
      }
      for (const cb of Object.values(callbacks)) expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('bind:element', () => {
    it('binds the element, which carries the props and the imperative API', async () => {
      const target = document.createElement('div');
      document.body.append(target);
      const harness = mount(Bound, { target, props: { tasks: [task('a', 5)] } });
      teardown.push(() => {
        void unmount(harness);
        target.remove();
      });
      flushSync();
      const el = harness.bound();
      expect(el).toBe(target.querySelector('gantry-element'));
      expect(el?.tasks.map(t => t.id)).toEqual(['a']);
      expect(typeof el?.scrollToToday).toBe('function');

      harness.hide();
      await tick();
      expect(harness.bound()).toBeFalsy();
    });
  });
});

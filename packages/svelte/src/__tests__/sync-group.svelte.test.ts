// Phase 10 surface of the Svelte binding: the `syncGroup` prop. It is destructured and forwarded
// like every property, but never copied (it is not one of the `shallow()` data props): the element
// gets the consumer's group by identity, so its getters (`state`, `size`) stay live. Written once
// per change; a cleared prop forwards `undefined`, which restores the element's default (`null`);
// a group never passed is not written. A `.svelte.test.ts` file, so it may use runes.
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import { GANTRY_PROPERTIES } from '@gantryjs/vanilla';
import { Gantry, createGanttSyncGroup, type GantryElement, type GanttSyncGroup, type GanttTask } from '../index';

type Props = ComponentProps<typeof Gantry>;

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 0, 5), end: new Date(2026, 0, 9), progress: 50 },
];

const proto = customElements.get('gantry-element')!.prototype as GantryElement;
const teardown: (() => void)[] = [];

/** Mounts `<Gantry>` with `props` (a plain or `$state` object) and flushes its effects. */
function render(props: Props): GantryElement {
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
  return el;
}

afterEach(() => {
  for (const fn of teardown.splice(0)) fn();
  vi.restoreAllMocks();
});

describe('<Gantry> syncGroup (Svelte)', () => {
  it('is a prop typed as the element property', () => {
    expect(GANTRY_PROPERTIES).toContain('syncGroup');
    expectTypeOf<Props['syncGroup']>().toEqualTypeOf<GanttSyncGroup | null | undefined>();
  });

  it('passes the group by identity (not copied): its live getters reach the element', () => {
    const set = vi.spyOn(proto, 'syncGroup', 'set');
    const group = createGanttSyncGroup();
    const el = render({ tasks: TASKS, syncGroup: group });
    expect(set).toHaveBeenCalledOnce();
    expect(set.mock.calls[0]![0]).toBe(group);
    expect(el.syncGroup).toBe(group);
    // A one-level copy would have frozen `state` at its value of the moment
    group.setLevel('Week');
    expect(el.syncGroup?.state.level).toBe('Week');
    // A property, never an attribute
    expect(el.hasAttribute('syncgroup')).toBe(false);
    expect(el.hasAttribute('sync-group')).toBe(false);
  });

  it('writes the group only when it changes', () => {
    const set = vi.spyOn(proto, 'syncGroup', 'set');
    const group = createGanttSyncGroup();
    // `$state.raw`: a `$state` object would wrap the group in a proxy
    let tasks = $state.raw(TASKS);
    let current = $state.raw<GanttSyncGroup | null>(group);
    const el = render({
      get tasks() {
        return tasks;
      },
      get syncGroup() {
        return current;
      },
    });
    expect(el.syncGroup).toBe(group);

    // Another prop changed: the group is not written again
    tasks = [];
    flushSync();
    expect(set).toHaveBeenCalledOnce();

    // Another group replaces it; `null` leaves the group
    const other = createGanttSyncGroup({ zoom: false });
    current = other;
    flushSync();
    expect(el.syncGroup).toBe(other);
    current = null;
    flushSync();
    expect(el.syncGroup).toBeNull();
    expect(set.mock.calls.map(([value]) => value)).toEqual([group, other, null]);
  });

  it('forwards undefined once set, which restores the default, null', () => {
    const group = createGanttSyncGroup();
    let current = $state.raw<GanttSyncGroup | undefined>(group);
    const el = render({
      get syncGroup() {
        return current;
      },
    });
    expect(el.syncGroup).toBe(group);

    current = undefined;
    flushSync();
    expect(el.syncGroup).toBeNull();

    current = group;
    flushSync();
    expect(el.syncGroup).toBe(group);
  });

  it('never writes a group it was not given: one set on the element survives', () => {
    const set = vi.spyOn(proto, 'syncGroup', 'set');
    const props = $state<Props>({ tasks: TASKS });
    const el = render(props);
    expect(set).not.toHaveBeenCalled();
    expect(el.syncGroup).toBeNull();

    const group = createGanttSyncGroup();
    el.syncGroup = group; // e.g. through bind:element
    props.tasks = [];
    flushSync();
    expect(el.syncGroup).toBe(group);
    expect(set).toHaveBeenCalledOnce(); // only the write above
  });

  it('hands one group to several charts as the same object', () => {
    const group = createGanttSyncGroup();
    const charts = [render({ tasks: TASKS, syncGroup: group }), render({ syncGroup: group })];
    for (const el of charts) expect(el.syncGroup).toBe(group);
  });
});

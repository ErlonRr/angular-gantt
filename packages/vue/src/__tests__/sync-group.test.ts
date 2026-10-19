// Phase 10 surface of the Vue binding: the `syncGroup` prop, declared after `errorMessage` as in
// GANTRY_PROPERTIES, with `default: undefined` and exactly the element property's type. The group
// reaches the element by identity: a Vue proxy is unwrapped (`toRaw`), the group is never copied
// or watched deeply, `undefined` restores the element's default (`null`), a group never passed is
// not written, and it is never an attribute.
import { describe, it, expect, expectTypeOf, afterEach, vi } from 'vitest';
import { createApp, createSSRApp, h, nextTick, reactive, ref, shallowRef, toRaw, type App, type VNode } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { GantryElement, type GantryProperties } from '@gantryjs/vanilla';
import { Gantry, createGanttSyncGroup, type GanttSyncGroup, type GanttTask } from '../index';

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9), progress: 40 },
];

const apps: App[] = [];

function mount(render: () => VNode | VNode[]) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render });
  apps.push(app);
  app.mount(host);
  return { app, host, el: host.querySelector('gantry-element') as GantryElement };
}

/** Spies on the element's `syncGroup` setter (it still writes the element). */
function spySyncGroup() {
  return vi.spyOn(GantryElement.prototype, 'syncGroup', 'set');
}

afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('syncGroup prop', () => {
  it('is declared after errorMessage, with no default of its own', () => {
    const keys = Object.keys(Gantry['props'] as object);
    expect(keys.slice(keys.indexOf('errorMessage'), keys.indexOf('errorMessage') + 2)).toEqual([
      'errorMessage',
      'syncGroup',
    ]);
    const prop = (Gantry['props'] as Record<string, { type: unknown; default: unknown }>)['syncGroup']!;
    expect(prop.type).toBe(Object);
    expect(prop).toHaveProperty('default', undefined);
  });

  it('is typed as the element property (checked by the typecheck)', () => {
    type Declared = InstanceType<typeof Gantry>['$props']['syncGroup'];
    expectTypeOf<Exclude<Declared, undefined>>().toEqualTypeOf<GanttSyncGroup | null>();
    expectTypeOf<Exclude<GantryProperties['syncGroup'], undefined>>().toEqualTypeOf<GanttSyncGroup | null>();
  });

  it('passes the group by identity, written once per change', async () => {
    const set = spySyncGroup();
    const group = createGanttSyncGroup();
    const tasks = shallowRef(TASKS);
    const current = shallowRef<GanttSyncGroup | null>(group);
    const { el } = mount(() => h(Gantry, { tasks: tasks.value, syncGroup: current.value }));
    expect(el.syncGroup).toBe(group);
    expect(set).toHaveBeenCalledOnce();
    expect(set.mock.calls[0]![0]).toBe(group);
    // A property, never an attribute
    expect(el.hasAttribute('syncgroup')).toBe(false);
    expect(el.hasAttribute('sync-group')).toBe(false);

    // Another prop changed: the group is not written again
    tasks.value = [];
    await nextTick();
    expect(set).toHaveBeenCalledOnce();

    // Another group replaces it; `null` leaves the group
    const other = createGanttSyncGroup({ scroll: false });
    current.value = other;
    await nextTick();
    expect(el.syncGroup).toBe(other);
    current.value = null;
    await nextTick();
    expect(el.syncGroup).toBeNull();
    expect(set.mock.calls.map(([value]) => value)).toEqual([group, other, null]);
  });

  it('unwraps a group kept in reactive state (the raw group, never a copy)', async () => {
    const set = spySyncGroup();
    // A deep `ref` (or `reactive`) wraps the group in a proxy
    const group = ref(createGanttSyncGroup());
    const raw = toRaw(group.value);
    const { el } = mount(() => h(Gantry, { syncGroup: group.value }));
    expect(el.syncGroup).toBe(raw);

    // Its own state changing is not a prop change (not watched deeply)
    group.value.setLevel('Week');
    group.value.scrollTo(120);
    await nextTick();
    expect(set).toHaveBeenCalledOnce();
    expect(el.syncGroup?.state.level).toBe('Week');

    // The same group from `reactive()`
    const state = reactive({ group: raw });
    expect(mount(() => h(Gantry, { syncGroup: state.group })).el.syncGroup).toBe(raw);
  });

  it('restores the default, null, when the prop becomes undefined or is dropped', async () => {
    const group = createGanttSyncGroup();
    const props = shallowRef<Record<string, unknown>>({ syncGroup: group });
    const { el } = mount(() => h(Gantry, props.value));
    expect(el.syncGroup).toBe(group);

    props.value = { syncGroup: undefined };
    await nextTick();
    expect(el.syncGroup).toBeNull();

    props.value = { syncGroup: group };
    await nextTick();
    expect(el.syncGroup).toBe(group);
    props.value = {};
    await nextTick();
    expect(el.syncGroup).toBeNull();
  });

  it('never writes a group it was not given: one set on the element survives re-renders', async () => {
    const set = spySyncGroup();
    const tasks = shallowRef(TASKS);
    const { el } = mount(() => h(Gantry, { tasks: tasks.value }));
    expect(set).not.toHaveBeenCalled();
    expect(el.syncGroup).toBeNull();

    const group = createGanttSyncGroup();
    el.syncGroup = group; // e.g. through the template ref
    tasks.value = [];
    await nextTick();
    expect(el.syncGroup).toBe(group);
    expect(set).toHaveBeenCalledOnce(); // only the write above
  });

  it('hands one group to several charts as the same object', () => {
    const group = createGanttSyncGroup();
    const { host } = mount(() => [h(Gantry, { tasks: TASKS, syncGroup: group }), h(Gantry, { syncGroup: group })]);
    const charts = [...host.querySelectorAll('gantry-element')];
    expect(charts).toHaveLength(2);
    for (const el of charts) expect(el.syncGroup).toBe(group);
  });

  it('is not serialised by the server render', async () => {
    const render = () => h(Gantry, { class: 'chart', tasks: TASKS, syncGroup: createGanttSyncGroup() });
    expect(await renderToString(createSSRApp({ render }))).toBe('<gantry-element class="chart"></gantry-element>');
  });
});

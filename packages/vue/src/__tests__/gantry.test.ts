// The Vue binding (phase 8): props forwarded as element properties (`undefined` restores the
// element's default), events emitted with their `detail` from the very first connect, props on the
// element before it connects and paints (no flash of defaults), the consumer's own objects (Vue
// proxies unwrapped, never cloned), `expose({ element })`, listeners removed on unmount, and an
// explicit props list that matches `GANTRY_PROPERTIES`.
import { describe, it, expect, expectTypeOf, afterEach, vi } from 'vitest';
import {
  createApp,
  createSSRApp,
  defineComponent,
  h,
  isProxy,
  nextTick,
  reactive,
  ref,
  shallowReactive,
  shallowRef,
  toRaw,
  type App,
  type VNode,
} from 'vue';
import { renderToString } from 'vue/server-renderer';
import { GANTRY_EVENTS, GANTRY_PROPERTIES, GantryElement, type GantryProperties } from '@gantryjs/vanilla';
import { Gantry, GanttDataSource, ViewMode, type GanttAnnotation, type GanttOptions, type GanttTask } from '../index';

function task(id: string, day: number, length = 5): GanttTask {
  return { id, name: `Task ${id}`, start: new Date(2026, 2, day), end: new Date(2026, 2, day + length), progress: 40 };
}
const plan = (n: number) => Array.from({ length: n }, (_, i) => task(`t${i}`, 1 + i));
const camel = (s: string) => s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
const handlerOf = (type: string) => `on${camel(type).replace(/^\w/, c => c.toUpperCase())}`;

const apps: App[] = [];

/** Mounts `render` into a connected host; the element is the one `<Gantry>` renders. */
function mount(render: () => VNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render });
  apps.push(app);
  app.mount(host);
  const el = host.querySelector('gantry-element') as GantryElement;
  return { app, host, el };
}

/** Records the element's frame requests instead of running them (`run()` paints them). */
function holdFrames() {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => frames.push(cb));
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
  return {
    frames,
    run() {
      for (const cb of frames.splice(0)) cb(performance.now());
    },
  };
}

afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** Each property's type, without `undefined` and the optional / readonly modifiers */
type Defined<T> = { [K in (typeof GANTRY_PROPERTIES)[number]]-?: Exclude<T[K & keyof T], undefined> };
// (aliases: `toEqualTypeOf` compares them reliably, inline instantiations not always)
type DeclaredProps = Defined<InstanceType<typeof Gantry>['$props']>;
type ElementProps = Defined<GantryProperties>;

describe('props and emits lists', () => {
  it('declares exactly GANTRY_PROPERTIES as props, in order', () => {
    expect(Object.keys(Gantry['props'] as object)).toEqual([...GANTRY_PROPERTIES]);
  });

  it('declares each prop with exactly the element property type (checked by the typecheck)', () => {
    // The props' `satisfies` rejects a narrower element type; this rejects a wider one too
    expectTypeOf<DeclaredProps>().toEqualTypeOf<ElementProps>();
  });

  it('declares one camel-cased emit per GANTRY_EVENTS entry', () => {
    expect(Object.keys(Gantry['emits'] as object)).toEqual(Object.keys(GANTRY_EVENTS).map(camel));
  });
});

describe('rendering', () => {
  it('renders an upgraded <gantry-element> with no inline style of its own (`:host` sizes it)', () => {
    const { el } = mount(() => h(Gantry, { class: 'chart' }));
    expect(el).toBeInstanceOf(GantryElement);
    expect(el.classList.contains('chart')).toBe(true);
    expect(el.hasAttribute('style')).toBe(false);
  });

  it('passes the consumer style through as it is', () => {
    const { el } = mount(() => h(Gantry, { style: { height: '400px' } }));
    expect(el.getAttribute('style')).toBe('height: 400px;');
  });
});

describe('events', () => {
  it('emits every element event with its detail (template names: @task-dragged, @row-dblclick, …)', () => {
    const handlers = Object.fromEntries(Object.keys(GANTRY_EVENTS).map(type => [handlerOf(type), vi.fn()]));
    const { el } = mount(() => h(Gantry, handlers));
    for (const type of Object.keys(GANTRY_EVENTS)) {
      const detail = { type };
      el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
      expect(handlers[handlerOf(type)]).toHaveBeenCalledExactlyOnceWith(detail);
    }
  });

  it('delivers an event fired by the first property assignment (options.viewMode → view-mode-change)', () => {
    const onViewModeChange = vi.fn();
    mount(() => h(Gantry, { options: { viewMode: ViewMode.Week }, onViewModeChange }));
    expect(onViewModeChange).toHaveBeenCalledWith({ viewMode: ViewMode.Week });
  });

  it('delivers an event fired by the first connect (load-error of a data source that already failed)', async () => {
    const error = new Error('offline');
    const dataSource = new GanttDataSource({ fetcher: () => Promise.reject(error), retries: 0, initialPage: 0 });
    await dataSource.loadNext();
    expect(dataSource.error).toBe(error);

    const onLoadError = vi.fn();
    mount(() => h(Gantry, { dataSource, onLoadError }));
    expect(onLoadError).toHaveBeenCalledExactlyOnceWith({ error, page: 1 });
  });
});

describe('no flash of defaults', () => {
  it('sets the props before the element connects, so its first frame paints them', () => {
    const frame = holdFrames();
    const assignments: [string, boolean][] = [];
    for (const key of ['tasks', 'options', 'showToolbar'] as const) {
      const set = Object.getOwnPropertyDescriptor(GantryElement.prototype, key)!.set!;
      vi.spyOn(GantryElement.prototype, key, 'set').mockImplementation(function (this: GantryElement, v: unknown) {
        assignments.push([key, this.isConnected]);
        set.call(this, v);
      });
    }
    const tasks = plan(3);
    const { el } = mount(() => h(Gantry, { tasks, options: { rowHeight: 48 }, showToolbar: false }));

    // Each prop was assigned once, before the element was inserted
    expect(assignments).toEqual([
      ['tasks', false],
      ['options', false],
      ['showToolbar', false],
    ]);
    // Connected, its first frame requested but not painted yet
    expect(el.isConnected).toBe(true);
    expect(frame.frames.length).toBeGreaterThan(0);
    const rows = () => [...el.shadowRoot!.querySelectorAll<HTMLElement>('.gantt-tl-row')];
    expect(rows()).toHaveLength(0);

    frame.run();
    // The first paint: the consumer's tasks and row height, no toolbar
    expect(rows().map(r => r.dataset['taskId'])).toEqual(['t0', 't1', 't2']);
    expect(rows().map(r => r.style.height)).toEqual(['48px', '48px', '48px']);
    expect(el.shadowRoot!.querySelector('.gantry-toolbar-container')!.childElementCount).toBe(0);
  });
});

describe('undefined props', () => {
  it('restores the element default when a prop becomes undefined or is dropped', async () => {
    const tasks = plan(2);
    const state = shallowReactive<Record<string, unknown>>({
      tasks,
      options: { rowHeight: 48 },
      annotations: [{ x1: new Date(2026, 2, 2), label: { text: 'Kick-off' } }],
      darkMode: true,
      showToolbar: false,
      enableDrag: false,
      showLegend: true,
    });
    const { el } = mount(() => h(Gantry, { ...state }));
    expect([el.tasks, el.darkMode, el.showToolbar, el.enableDrag, el.showLegend]).toEqual([
      tasks,
      true,
      false,
      false,
      true,
    ]);

    for (const key of ['tasks', 'options', 'annotations', 'darkMode', 'showToolbar']) state[key] = undefined;
    // Dropped from the props altogether
    delete state['enableDrag'];
    delete state['showLegend'];
    await nextTick();

    expect(el.tasks).toEqual([]);
    expect(el.options).toEqual({});
    expect(el.annotations).toEqual([]);
    expect(el.darkMode).toBe(false);
    expect(el.showToolbar).toBe(true);
    expect(el.enableDrag).toBe(true);
    expect(el.showLegend).toBe(false);
  });

  it('leaves an omitted prop at the element default (no boolean casting)', () => {
    const { el } = mount(() => h(Gantry));
    expect([el.showToolbar, el.enableDrag, el.enableResize, el.tooltipEnabled]).toEqual([true, true, true, true]);
    expect([el.darkMode, el.showLegend, el.dataSource]).toEqual([false, false, null]);
  });
});

describe('object identity', () => {
  it('hands the element the very objects the consumer passed', () => {
    const tasks = plan(2);
    const options = { rowHeight: 40 };
    const annotations: GanttAnnotation[] = [{ x1: new Date(2026, 2, 2), label: { text: 'Kick-off' } }];
    const renderBar = () => null;
    const { el } = mount(() => h(Gantry, { tasks, options, annotations, renderBar }));
    expect(el.tasks).toBe(tasks);
    expect(el.options).toBe(options);
    expect(el.annotations).toBe(annotations);
    expect(el.renderBar).toBe(renderBar);
    const resources = [{ id: 'ana', name: 'Ana' }];
    expect(mount(() => h(Gantry, { resources })).el.resources).toBe(resources);

    // (a data source replaces `tasks`)
    const dataSource = new GanttDataSource({ fetcher: () => Promise.resolve([]), initialPage: 0 });
    expect(mount(() => h(Gantry, { dataSource })).el.dataSource).toBe(dataSource);
  });

  it('unwraps Vue proxies instead of passing them (the raw objects, not copies)', async () => {
    const tasks = ref(plan(2));
    const options = reactive({ rowHeight: 40 });
    const { el } = mount(() => h(Gantry, { tasks: tasks.value, options }));
    expect(isProxy(tasks.value)).toBe(true);
    expect(el.tasks).toBe(toRaw(tasks.value));
    // Reactive options: a one-level copy (see 'options'), the nested values unchanged
    expect(isProxy(el.options)).toBe(false);
    expect(el.options).toEqual(toRaw(options));

    // A class instance in a ref is a proxy too (its methods would run on the proxy)
    const dataSource = ref(new GanttDataSource({ fetcher: () => Promise.resolve([]), initialPage: 0 }));
    expect(isProxy(dataSource.value)).toBe(true);
    // (typed as its unwrapped shape, which drops the private members: `shallowRef` keeps the class type)
    const proxied = dataSource.value as unknown as GanttDataSource;
    expect(mount(() => h(Gantry, { dataSource: proxied })).el.dataSource).toBe(toRaw(proxied));

    // `map` over a reactive array returns the unchanged items as proxies: the element gets the raw items
    tasks.value = tasks.value.map(t => (t.id === 't1' ? { ...t, progress: 90 } : t));
    expect(isProxy(toRaw(tasks.value)[0])).toBe(true);
    await nextTick();
    expect(el.tasks.some(t => isProxy(t))).toBe(false);
    expect(el.tasks[0]).toBe(toRaw(toRaw(tasks.value)[0]));
    expect(el.tasks[1]?.progress).toBe(90);
  });

  it('re-renders after an in-place change of a reactive array (a shallow copy, same items)', async () => {
    const tasks = ref(plan(2));
    const { el } = mount(() => h(Gantry, { tasks: tasks.value }));
    expect(el.getBarVisual('t9')).toBeUndefined();

    tasks.value.push(task('t9', 20));
    await nextTick();
    expect(el.getBarVisual('t9')).toBeDefined();
    expect(el.tasks.map(t => t.id)).toEqual(['t0', 't1', 't9']);
    expect(el.tasks.every((t, i) => t === toRaw(tasks.value)[i])).toBe(true);

    tasks.value.splice(0, 1);
    await nextTick();
    expect(el.getBarVisual('t0')).toBeUndefined();

    // A new array is passed as is again
    tasks.value = plan(1);
    await nextTick();
    expect(el.tasks).toBe(toRaw(tasks.value));
  });
});

describe('options', () => {
  it('re-applies a reactive options object changed in place (its top-level fields)', async () => {
    const options = reactive<GanttOptions>({ viewMode: ViewMode.Day, rowHeight: 40, panel: { width: 320 } });
    const onViewModeChange = vi.fn();
    const { el } = mount(() => h(Gantry, { tasks: plan(2), options, onViewModeChange }));
    expect(el.viewMode).toBe(ViewMode.Day);
    // The row pitch
    const rowHeight = () => el.getBarVisual('t1')!.y - el.getBarVisual('t0')!.y;
    expect(rowHeight()).toBe(40);

    options.viewMode = ViewMode.Week;
    await nextTick();
    expect(el.viewMode).toBe(ViewMode.Week);
    expect(onViewModeChange).toHaveBeenLastCalledWith({ viewMode: ViewMode.Week });

    options.rowHeight = 56;
    await nextTick();
    expect(rowHeight()).toBe(56);
    expect(el.viewMode).toBe(ViewMode.Week);

    options.viewMode = ViewMode.Month;
    await nextTick();
    expect(el.viewMode).toBe(ViewMode.Month);
    // A one-level copy: never the proxy, the nested objects unchanged (and not watched)
    expect(isProxy(el.options)).toBe(false);
    expect(el.options).toEqual({ viewMode: ViewMode.Month, rowHeight: 56, panel: { width: 320 } });
    expect(el.options.panel).toBe(toRaw(options).panel);
  });
});

describe('template ref', () => {
  it('exposes only `element`, the <gantry-element>, from the first parent hook', () => {
    const gantt = shallowRef<InstanceType<typeof Gantry> | null>(null);
    let inMounted: unknown;
    const Parent = defineComponent({
      mounted() {
        inMounted = gantt.value?.element;
      },
      render: () => h(Gantry, { ref: gantt }),
    });
    const { el } = mount(() => h(Parent));
    expect(el).toBeInstanceOf(GantryElement);
    expect(gantt.value?.element).toBe(el);
    expect(inMounted).toBe(el);
    expect(typeof gantt.value?.element?.scrollToToday).toBe('function');
    // Nothing else of the component is public (`expose`)
    expect('tasks' in gantt.value!).toBe(false);
  });
});

describe('unmount', () => {
  it('removes every listener it added to the element', () => {
    // The prototype that implements addEventListener for elements (happy-dom's EventTarget)
    let target: object = GantryElement.prototype;
    while (!Object.hasOwn(target, 'addEventListener')) target = Object.getPrototypeOf(target) as object;
    const add = vi.spyOn(target as EventTarget, 'addEventListener');
    const remove = vi.spyOn(target as EventTarget, 'removeEventListener');
    const { app, el } = mount(() => h(Gantry, { onTaskDragged: vi.fn() }));
    // The binding's calls on the element (the element registers its own `keydown` too)
    const on = (spy: typeof add) =>
      spy.mock.calls
        .filter(([type], i) => spy.mock.contexts[i] === el && type in GANTRY_EVENTS)
        .map(([type, listener]) => [type, listener]);

    const added = on(add);
    expect(added.map(([type]) => type).sort()).toEqual(Object.keys(GANTRY_EVENTS).sort());
    expect(on(remove)).toEqual([]);

    app.unmount();
    apps.splice(apps.indexOf(app), 1);
    expect(on(remove)).toEqual(added);
  });

  it('still delivers the state-change the element fires while disconnecting', () => {
    const onStateChange = vi.fn();
    const { app, el } = mount(() => h(Gantry, { onStateChange }));
    el.setView('table'); // a state save pending (debounced)
    expect(onStateChange).not.toHaveBeenCalled();

    app.unmount();
    apps.splice(apps.indexOf(app), 1);
    expect(onStateChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ view: 'table' }));
  });
});

describe('hydration', () => {
  it('takes over the server-rendered element: props and listeners', async () => {
    const tasks = plan(2);
    const onViewModeChange = vi.fn();
    const render = () => h(Gantry, { tasks, options: { viewMode: ViewMode.Week }, onViewModeChange });
    const html = await renderToString(createSSRApp({ render }));

    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const ssrEl = host.querySelector('gantry-element') as GantryElement;
    const warn = vi.fn();
    const app = createSSRApp({ render });
    app.config.warnHandler = warn;
    apps.push(app);
    app.mount(host);

    expect(host.querySelector('gantry-element')).toBe(ssrEl);
    expect(warn).not.toHaveBeenCalled();
    expect(ssrEl.tasks).toBe(tasks);
    expect(onViewModeChange).toHaveBeenCalledWith({ viewMode: ViewMode.Week });
  });
});

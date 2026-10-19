// Phase 9 surface of the Vue binding: the chart-state props (`loading`, `errorMessage`) in the
// explicit props list, the `retry` emit, the listeners still on before the first property write
// with every prop written in GANTRY_PROPERTIES order, and the default slot rendered in the
// element's light DOM (`<div slot="empty">` for the empty state), on the server too.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createApp, createSSRApp, h, nextTick, ref, shallowReactive, type App, type VNode } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { GANTRY_EVENTS, GANTRY_PROPERTIES, GantryElement, type GantryProperties } from '@gantryjs/vanilla';
import { Gantry, ViewMode, createGanttSyncGroup, type GanttTask, type RetryEvent } from '../index';

type Name = (typeof GANTRY_PROPERTIES)[number];

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9), progress: 40 },
];

/** A non-default value for every property */
const SAMPLE: { [K in Name]-?: Exclude<GantryProperties[K], undefined> } = {
  tasks: TASKS,
  columns: [{ key: 'name', label: 'Name', width: 200 }],
  options: { viewMode: ViewMode.Week },
  annotations: [{ x1: new Date(2026, 2, 4), label: { text: 'Review' } }],
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

const apps: App[] = [];

function mount(render: () => VNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render });
  apps.push(app);
  app.mount(host);
  return { app, host, el: host.querySelector('gantry-element') as GantryElement };
}

afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('chart-state props', () => {
  it('declares loading and errorMessage after renderBar, as GANTRY_PROPERTIES does', () => {
    const keys = Object.keys(Gantry['props'] as object);
    const at = keys.indexOf('renderBar');
    expect(keys.slice(at, at + 3)).toEqual(['renderBar', 'loading', 'errorMessage']);
  });

  it('forwards loading and errorMessage; undefined (or dropping them) restores the defaults', async () => {
    const state = shallowReactive<Record<string, unknown>>({ loading: true, errorMessage: 'Couldn’t load the plan' });
    const { el } = mount(() => h(Gantry, { ...state }));
    expect(el.loading).toBe(true);
    expect(el.errorMessage).toBe('Couldn’t load the plan');
    expect(el.hasAttribute('loading')).toBe(false);

    state['errorMessage'] = null;
    await nextTick();
    expect(el.errorMessage).toBeNull();

    state['loading'] = undefined;
    state['errorMessage'] = 'Offline';
    await nextTick();
    expect(el.loading).toBe(false);
    delete state['errorMessage'];
    await nextTick();
    expect(el.errorMessage).toBeNull();
  });

  it('leaves loading at the element default when omitted, and casts the bare template attribute to true', () => {
    expect(mount(() => h(Gantry)).el.loading).toBe(false);
    // `<Gantry loading />` in a template passes ''
    const bare: Record<string, unknown> = { loading: '' };
    expect(mount(() => h(Gantry, bare)).el.loading).toBe(true);
  });

  it('emits retry with its detail (@retry)', () => {
    const onRetry = vi.fn<(e: RetryEvent) => void>();
    const { el } = mount(() => h(Gantry, { errorMessage: 'Offline', onRetry }));
    const detail: RetryEvent = { source: 'dataSource' };
    el.dispatchEvent(new CustomEvent('retry', { detail, bubbles: true, composed: true }));
    expect(onRetry).toHaveBeenCalledExactlyOnceWith(detail);
    expect(Object.keys(Gantry['emits'] as object)).toContain('retry');
    expect(GANTRY_EVENTS).toHaveProperty('retry', 'onRetry');
  });

  it('adds every listener, then writes every prop once, in GANTRY_PROPERTIES order, before inserting the element', () => {
    let target: object = GantryElement.prototype;
    while (!Object.hasOwn(target, 'addEventListener')) target = Object.getPrototypeOf(target) as object;
    const adds = vi.spyOn(target as EventTarget, 'addEventListener');
    const writes: [string, boolean][] = [];
    const setters = GANTRY_PROPERTIES.map(name => {
      const set = Object.getOwnPropertyDescriptor(GantryElement.prototype, name)!.set!;
      return vi.spyOn(GantryElement.prototype, name, 'set').mockImplementation(function (
        this: GantryElement,
        v: unknown,
      ) {
        writes.push([name, this.isConnected]);
        set.call(this, v);
      });
    });

    mount(() => h(Gantry, { ...SAMPLE }));

    // Each once, in order, while the element is not inserted yet
    expect(writes).toEqual(GANTRY_PROPERTIES.map(name => [name, false]));
    const attached = adds.mock.calls.flatMap(([type], i) =>
      type in GANTRY_EVENTS ? [adds.mock.invocationCallOrder[i]!] : [],
    );
    expect(attached).toHaveLength(Object.keys(GANTRY_EVENTS).length);
    const firstWrite = Math.min(...setters.flatMap(spy => spy.mock.invocationCallOrder));
    expect(Math.max(...attached)).toBeLessThan(firstWrite);
  });
});

describe('default slot', () => {
  it('renders the slot content in the light DOM of the element, kept up to date', async () => {
    const text = ref('Nothing planned yet');
    const shown = ref(true);
    const { el } = mount(() =>
      h(Gantry, { tasks: [] }, { default: () => (shown.value ? [h('div', { slot: 'empty' }, text.value)] : []) }),
    );
    const empty = el.querySelector(':scope > [slot="empty"]');
    expect(empty?.textContent).toBe('Nothing planned yet');
    expect(el.children).toHaveLength(1);

    text.value = 'Add a task to start';
    await nextTick();
    expect(el.querySelector(':scope > [slot="empty"]')).toBe(empty);
    expect(empty?.textContent).toBe('Add a task to start');

    shown.value = false;
    await nextTick();
    expect(el.querySelector('[slot="empty"]')).toBeNull();
  });

  it('renders no child without a default slot', () => {
    expect(mount(() => h(Gantry)).el.childNodes).toHaveLength(0);
  });

  it('renders the slot on the server and hydrates it without warnings', async () => {
    const render = () =>
      h(Gantry, { class: 'chart', tasks: TASKS, loading: true }, () => [
        h('div', { slot: 'empty' }, 'Nothing planned yet'),
      ]);
    const html = await renderToString(createSSRApp({ render }));
    expect(html).toBe('<gantry-element class="chart"><div slot="empty">Nothing planned yet</div></gantry-element>');

    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const server = host.querySelector('gantry-element') as GantryElement;
    const empty = server.firstElementChild;
    const warn = vi.fn();
    const app = createSSRApp({ render });
    app.config.warnHandler = warn;
    apps.push(app);
    app.mount(host);

    expect(host.querySelector('gantry-element')).toBe(server);
    expect(server.firstElementChild).toBe(empty);
    expect(server.loading).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});

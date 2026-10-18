// Property table and lifecycle (Gantry 2 phase 6, step 4.1): one table drives the properties,
// their defaults and attributes; properties set before the element is defined are honoured;
// `undefined` restores a default; one owner per connection releases every listener, timer,
// observer and subscription on disconnect; a move keeps the element's state; a move to another
// document re-adopts its stylesheets.
//
// No static import of the element module here: the first test creates an element before
// `<gantry-element>` is defined, then loads the module.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import type { GanttTask } from '@gantryjs/core';
import type { GantryElement } from '../gantry.element';
import type { GanttDataSource as DataSourceClass } from '../datasource/gantt-datasource';
import { getEngine } from '../engine/registry';
import { DEFAULTS, OBSERVED_ATTRIBUTES, PROPERTY_TABLE, type PropertyName } from '../engine/props';
import { GANTRY_PROPERTIES } from '../types';
import { getBaseSheet } from '../styles/base';

const flush = (el: GantryElement) => getEngine(el).flushSync();
const $ = <T extends Element = HTMLElement>(el: Element, sel: string) => el.shadowRoot!.querySelector<T>(sel)!;
const $$ = (el: Element, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)];

function task(id: string, day: number, length = 5): GanttTask {
  return { id, name: `Task ${id}`, start: new Date(2026, 2, day), end: new Date(2026, 2, day + length), progress: 40 };
}
const plan = (n: number) => Array.from({ length: n }, (_, i) => task(`t${i}`, 1 + (i % 20)));

let GantryElementClass: typeof GantryElement;
let GanttDataSource: typeof DataSourceClass;

function create(props: Partial<GantryElement> = {}): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, props);
  return el;
}
function mount(props: Partial<GantryElement> = {}): GantryElement {
  const el = create(props);
  document.body.appendChild(el);
  flush(el);
  return el;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('before customElements.define', () => {
  it('honours properties set on the element before it was defined (upgrade)', async () => {
    expect(customElements.get('gantry-element')).toBeUndefined();
    const el = document.createElement('gantry-element');
    el.style.height = '400px';
    const raw = el as unknown as Record<string, unknown>;
    raw['tasks'] = [task('a', 2), task('b', 4)];
    raw['options'] = { rowHeight: 48 };
    raw['showLegend'] = true;
    raw['enableDrag'] = undefined;
    document.body.append(el);

    ({ GantryElement: GantryElementClass, GanttDataSource } = await import('../index'));
    expect(el).toBeInstanceOf(GantryElementClass);
    const g = el;
    // The own data properties shadowed the accessors; the upgrade re-applied them through the setters
    for (const name of ['tasks', 'options', 'showLegend', 'enableDrag'])
      expect(Object.hasOwn(el, name), name).toBe(false);
    expect(g.tasks.map(t => t.id)).toEqual(['a', 'b']);
    expect(g.options).toEqual({ rowHeight: 48 });
    expect(g.showLegend).toBe(true);
    expect(g.enableDrag).toBe(true);
    flush(g);
    expect($$(g, '.gantt-bars-layer [data-task-id]')).toHaveLength(2);
    expect(getEngine(g).graph.config.peek().rowHeight).toBe(48);
    expect($(g, '.gantt-legend').hidden).toBe(false);
  });
});

describe('<gantry-element> properties and lifecycle', () => {
  beforeAll(async () => {
    ({ GantryElement: GantryElementClass, GanttDataSource } = await import('../index'));
  });

  describe('property table', () => {
    it('has an explicit accessor for every entry and is the source of GANTRY_PROPERTIES', () => {
      const names = PROPERTY_TABLE.map(spec => spec.name);
      for (const name of names) {
        const descriptor = Object.getOwnPropertyDescriptor(GantryElementClass.prototype, name);
        expect(typeof descriptor?.get, name).toBe('function');
        expect(typeof descriptor?.set, name).toBe('function');
      }
      expect([...GANTRY_PROPERTIES]).toEqual(names);
      // Same names, same order as before the table (the bindings iterate it)
      expect([...GANTRY_PROPERTIES]).toEqual([
        'tasks',
        'columns',
        'options',
        'annotations',
        'darkMode',
        'showToolbar',
        'enableDrag',
        'enableResize',
        'tooltipEnabled',
        'showLegend',
        'dataSource',
        'renderBar',
      ]);
      expect(Object.keys(DEFAULTS)).toEqual(names);
    });

    it('observes the table attributes plus view-mode', () => {
      expect(GantryElementClass.observedAttributes).toBe(OBSERVED_ATTRIBUTES);
      expect([...OBSERVED_ATTRIBUTES].sort()).toEqual(
        [
          'dark-mode',
          'view-mode',
          'show-toolbar',
          'enable-drag',
          'enable-resize',
          'tooltip-enabled',
          'show-legend',
        ].sort(),
      );
    });

    it('starts every property at its default, and `undefined` restores it', () => {
      const el = mount();
      const other: { [K in PropertyName]: unknown } = {
        tasks: [task('a', 2)],
        columns: [{ key: 'name', header: 'Name', width: 120 }],
        options: { rowHeight: 50 },
        annotations: [{ date: new Date(2026, 2, 3), label: 'Go' }],
        darkMode: true,
        showToolbar: false,
        enableDrag: false,
        enableResize: false,
        tooltipEnabled: false,
        showLegend: true,
        dataSource: { fetcher: () => new Promise<GanttTask[]>(() => {}) },
        renderBar: () => null,
      };
      const I = getEngine(el).inputs;
      const value = (name: PropertyName): unknown =>
        // `columns` reads back the effective columns (the built-ins by default): check its input
        name === 'columns' ? (I.columnsIn.peek() ?? undefined) : (el as unknown as Record<string, unknown>)[name];
      const raw = el as unknown as Record<string, unknown>;
      for (const { name } of PROPERTY_TABLE) {
        expect(value(name), `${name} starts at its default`).toEqual(DEFAULTS[name]);
        raw[name] = other[name];
        expect(value(name), `${name} set`).not.toEqual(DEFAULTS[name]);
        raw[name] = undefined;
        expect(value(name), `${name} reset`).toEqual(DEFAULTS[name]);
      }
      // Object defaults are copies: the table's values are never handed out
      el.tasks = undefined;
      el.options = undefined;
      expect(el.options).not.toBe(DEFAULTS.options);
      expect(Object.isFrozen(el.options)).toBe(false);
      expect(el.tasks).not.toBe(DEFAULTS.tasks);
    });

    it('`options = undefined` restores the default configuration', () => {
      const el = mount({ tasks: plan(3), options: { rowHeight: 52, bar: { height: '40%' }, locale: 'de-DE' } });
      const { graph, runs } = getEngine(el);
      // An element that never had options
      const defaultConfig = getEngine(mount()).graph.config.peek();
      expect(graph.config.peek().rowHeight).toBe(52);
      el.options = undefined;
      flush(el);
      expect(el.options).toEqual({});
      expect(graph.config.peek().rowHeight).toBe(defaultConfig.rowHeight);
      expect(graph.config.peek().bar).toEqual(defaultConfig.bar);
      expect(graph.i18n.peek().locale).toBeUndefined();
      // Assigning it again changes nothing (equal options recompute nothing)
      const configRuns = runs['config'];
      el.options = undefined;
      expect(graph.config.peek().rowHeight).toBe(defaultConfig.rowHeight);
      expect(runs['config']).toBe(configRuns);
    });

    it('reads attributes through the table; a removed attribute restores the default', () => {
      const el = mount();
      el.setAttribute('show-toolbar', 'false');
      el.setAttribute('show-legend', '');
      el.setAttribute('dark-mode', 'auto');
      el.setAttribute('view-mode', 'Week');
      expect(el.showToolbar).toBe(false);
      expect(el.showLegend).toBe(true);
      expect(el.darkMode).toBe('auto');
      expect(el.viewMode).toBe('Week');
      el.removeAttribute('show-toolbar');
      el.removeAttribute('show-legend');
      el.removeAttribute('dark-mode');
      el.removeAttribute('view-mode');
      expect(el.showToolbar).toBe(true);
      expect(el.showLegend).toBe(false);
      expect(el.darkMode).toBe(false);
      expect(el.viewMode).toBe('Week'); // removing view-mode keeps the zoom level
    });
  });

  it('delegates focus to its shadow tree', () => {
    const attach = vi.spyOn(Element.prototype, 'attachShadow');
    create();
    expect(attach).toHaveBeenCalledWith({ mode: 'open', delegatesFocus: true });
  });

  describe('one owner per connection', () => {
    /** Live listeners, by target, added on happy-dom event targets (nodes, media queries, the window) while tracking. */
    function trackListeners() {
      const live: { target: EventTarget; type: string; listener: unknown }[] = [];
      const find = (target: EventTarget, type: string, listener: unknown) =>
        live.findIndex(l => l.target === target && l.type === type && l.listener === listener);
      // The window has its own methods; a target reached twice (an override calling super) is recorded once
      for (const owner of [Object.getPrototypeOf(Node.prototype) as EventTarget, window]) {
        const add = owner.addEventListener;
        const remove = owner.removeEventListener;
        vi.spyOn(owner, 'addEventListener').mockImplementation(function (this: EventTarget, type, listener, options) {
          // happy-dom ties a `signal` option to the listener through an 'abort' listener on the signal
          if (!(this instanceof AbortSignal) && find(this, type, listener) === -1)
            live.push({ target: this, type, listener });
          add.call(this, type, listener, options);
        });
        vi.spyOn(owner, 'removeEventListener').mockImplementation(function (
          this: EventTarget,
          type,
          listener,
          options,
        ) {
          const at = find(this, type, listener);
          if (at !== -1) live.splice(at, 1);
          remove.call(this, type, listener, options);
        });
      }
      return live;
    }

    /** Pending frames, intervals and timeouts requested while tracking. */
    function trackTimers() {
      const pending = { raf: new Set<number>(), interval: new Set<unknown>(), timeout: new Set<unknown>() };
      const raf = window.requestAnimationFrame.bind(window);
      const caf = window.cancelAnimationFrame.bind(window);
      const setI = window.setInterval.bind(window);
      const clearI = window.clearInterval.bind(window);
      const setT = window.setTimeout.bind(window);
      const clearT = window.clearTimeout.bind(window);
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
        const id = raf(t => {
          pending.raf.delete(id);
          cb(t);
        });
        pending.raf.add(id);
        return id;
      });
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
        pending.raf.delete(id);
        caf(id);
      });
      vi.spyOn(window, 'setInterval').mockImplementation(((cb: () => void, ms?: number) => {
        const id = setI(cb, ms);
        pending.interval.add(id);
        return id;
      }) as typeof setInterval);
      vi.spyOn(window, 'clearInterval').mockImplementation(id => {
        pending.interval.delete(id);
        clearI(id);
      });
      vi.spyOn(window, 'setTimeout').mockImplementation(((cb: () => void, ms?: number) => {
        const id = setT(() => {
          pending.timeout.delete(id);
          cb();
        }, ms);
        pending.timeout.add(id);
        return id;
      }) as typeof setTimeout);
      vi.spyOn(window, 'clearTimeout').mockImplementation(id => {
        pending.timeout.delete(id);
        clearT(id);
      });
      return pending;
    }

    it('100 connect / disconnect cycles leave listeners balanced and nothing pending', () => {
      const el = create({ tasks: plan(40), darkMode: 'auto', options: { initialScroll: false } });
      const shadow = el.shadowRoot!;
      const live = trackListeners();
      const pending = trackTimers();
      const MQL = window.matchMedia('(prefers-color-scheme: dark)').constructor;
      const kind = (target: EventTarget): string =>
        target === el
          ? 'host'
          : target === window
            ? 'window'
            : target === document
              ? 'document'
              : target === shadow || shadow.contains(target as Node)
                ? 'internal'
                : target instanceof MQL
                  ? 'media-query'
                  : 'other';
      const count = () => {
        const byKind: Record<string, number> = {};
        for (const { target } of live) byKind[kind(target)] = (byKind[kind(target)] ?? 0) + 1;
        return byKind;
      };

      let connectedFirst: Record<string, number> | undefined;
      let disconnectedFirst: Record<string, number> | undefined;
      let started: { raf: number; interval: number } | undefined;
      for (let i = 0; i < 100; i++) {
        document.body.append(el);
        if (i === 0) started = { raf: pending.raf.size, interval: pending.interval.size };
        flush(el);
        if (i === 0) connectedFirst = count();
        if (i === 99) expect(count()).toEqual(connectedFirst);
        el.remove();
        if (i === 0) disconnectedFirst = count();
      }
      // While connected: listeners on the host, the panes and the colour-scheme query
      expect(connectedFirst!['host']).toBeGreaterThan(0);
      expect(connectedFirst!['internal']).toBeGreaterThan(0);
      expect(connectedFirst!['media-query']).toBe(1);
      // The spies do see what a connection starts: the first frame and the clock
      expect(started!.raf).toBeGreaterThan(0);
      expect(started!.interval).toBe(1);
      // Disconnected: none of them is left, however many cycles ran
      expect(disconnectedFirst).toEqual({});
      expect(count()).toEqual({});
      expect(pending.raf.size).toBe(0);
      expect(pending.interval.size).toBe(0);
      expect(pending.timeout.size).toBe(0);
    });

    it('subscribes to the data source only while connected, leaving its onChange to the consumer', async () => {
      let resolve!: (tasks: GanttTask[]) => void;
      const ds = new GanttDataSource({
        fetcher: () =>
          new Promise<GanttTask[]>(r => {
            resolve = r;
          }),
        pageSize: 5,
      });
      const onChange = vi.fn();
      ds.onChange = onChange;
      let active = 0;
      const subscribe = ds.subscribe.bind(ds);
      vi.spyOn(ds, 'subscribe').mockImplementation(listener => {
        active++;
        const off = subscribe(listener);
        return () => {
          active--;
          return off();
        };
      });
      const el = create({ dataSource: ds });
      expect(active).toBe(0);
      for (let i = 0; i < 100; i++) {
        document.body.append(el);
        expect(active).toBe(1);
        el.remove();
        expect(active).toBe(0);
      }
      expect(ds.onChange).toBe(onChange);
      document.body.append(el);
      resolve([task('x', 2)]);
      await vi.waitFor(() => expect(el.tasks.map(t => t.id)).toEqual(['x']));
      expect(onChange).toHaveBeenCalled();
      // Replacing it moves the subscription
      el.dataSource = null;
      expect(active).toBe(0);
    });

    it('a disconnect ends a bar drag and a splitter drag, removing their listeners', () => {
      const el = mount({ tasks: [task('a', 2)] });
      const { drag, inputs, dom } = getEngine(el);
      const live = trackListeners();
      const bar = $(el, '.gantt-bars-layer [data-task-id="a"]');
      bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, pointerId: 1 }));
      expect(drag.state.peek().kind).toBe('dragging');
      dom.splitter.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 300, pointerId: 2 }),
      );
      expect(dom.main.classList.contains('is-resizing')).toBe(true);
      const onState = vi.fn();
      el.addEventListener('state-change', onState);
      expect(live.some(l => l.target === dom.canvasContainer && l.type === 'pointerup')).toBe(true);
      expect(live.some(l => l.target === dom.splitter && l.type === 'pointerup')).toBe(true);

      el.remove();
      expect(drag.state.peek().kind).toBe('idle');
      expect(inputs.dragPreview.peek()).toBeNull();
      expect(dom.main.classList.contains('is-resizing')).toBe(false);
      // The splitter gesture saved the width it reached (written at once on disconnect)
      expect(onState).toHaveBeenCalledOnce();
      expect(live.filter(l => l.target !== el)).toEqual([]);
    });

    it('writes a pending state change and stops the clock when disconnected', () => {
      const el = mount({ tasks: [task('a', 2)] });
      const onState = vi.fn();
      el.addEventListener('state-change', onState);
      el.setView('chart');
      el.remove();
      expect(onState).toHaveBeenCalledOnce();
    });
  });

  it('a move inside the document (connectedMoveCallback) keeps scroll, selection and focus', () => {
    const el = mount({ tasks: plan(200), options: { initialScroll: false } });
    const engine = getEngine(el);
    const { dom, inputs } = engine;
    dom.viewport.scrollTop = 360;
    dom.viewport.dispatchEvent(new Event('scroll'));
    flush(el);
    const row = $$(el, '.gantt-tl-row')[4] as HTMLElement;
    const id = row.dataset['taskId']!;
    el.setSelectedTasks([id]);
    flush(el);
    row.focus();
    expect(el.shadowRoot!.activeElement).toBe(row);
    const disconnect = vi.spyOn(engine, 'disconnect');
    const connect = vi.spyOn(engine, 'connect');

    // What `parent.moveBefore(el, …)` runs instead of disconnectedCallback + connectedCallback
    expect(typeof GantryElementClass.prototype.connectedMoveCallback).toBe('function');
    el.connectedMoveCallback();
    flush(el);

    expect(disconnect).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(dom.viewport.scrollTop).toBe(360);
    expect(inputs.scrollTop.peek()).toBe(360);
    expect(el.getSelectedTasks().map(t => t.id)).toEqual([id]);
    expect(el.shadowRoot!.activeElement).toBe(row);
    // Still live: the next change repaints
    el.showLegend = true;
    flush(el);
    expect($(el, '.gantt-legend').hidden).toBe(false);
  });

  describe('connections started from inside an effect', () => {
    it('re-appending the element from a load-error handler leaves it alive', async () => {
      // A source already in error: connecting emits load-error synchronously, from inside the
      // connection's data-source effect
      const ds = new GanttDataSource({ fetcher: () => Promise.reject(new Error('offline')), pageSize: 5, retries: 0 });
      void ds.loadNext();
      await vi.waitFor(() => expect(ds.error).not.toBeNull());
      const el = create({ tasks: plan(10), dataSource: ds, options: { initialScroll: false } });
      let reattached = 0;
      el.addEventListener('load-error', () => {
        if (reattached++) return;
        el.remove();
        document.body.append(el);
      });
      document.body.append(el);
      flush(el);
      expect(reattached).toBeGreaterThan(0);
      expect(el.isConnected).toBe(true);
      // Still repainting after the nested reconnect
      el.showLegend = true;
      el.annotations = [{ x1: new Date(2026, 2, 5), label: { text: 'Release' } }];
      flush(el);
      expect($(el, '.gantt-legend').textContent).toContain('Release');
    });

    it("a chart appended from another chart's handler is not torn down when that chart zooms again", () => {
      const a = mount({ tasks: plan(10), options: { initialScroll: false } });
      let b: GantryElement | undefined;
      a.addEventListener('view-mode-change', () => {
        b ??= mount({ tasks: plan(5), options: { initialScroll: false } });
      });
      a.options = { initialScroll: false, viewMode: 'Week' };
      flush(a);
      expect(b).toBeDefined();
      // A zooms again: its effect re-runs; B's connection must survive it
      a.options = { initialScroll: false, viewMode: 'Day' };
      flush(a);
      b!.showLegend = true;
      b!.annotations = [{ x1: new Date(2026, 2, 5), label: { text: 'Freeze' } }];
      flush(b!);
      expect($(b!, '.gantt-legend').textContent).toContain('Freeze');
    });
  });

  describe('moving to another document', () => {
    const sheetsOf = (el: Element) => [...el.shadowRoot!.adoptedStyleSheets];
    const themeValue = (sheet: CSSStyleSheet | undefined) =>
      (sheet?.cssRules[0] as CSSStyleRule | undefined)?.style.getPropertyValue('--gantt-bar') ?? '';

    it("re-adopts the new document's base sheet and a new theme sheet", async () => {
      const el = mount({ tasks: [task('a', 2)] });
      const before = sheetsOf(el);
      expect(before).toHaveLength(2);
      expect(before[0]).toBe(getBaseSheet(document));

      const iframe = document.createElement('iframe');
      document.body.append(iframe);
      await vi.waitFor(() => expect(iframe.contentDocument?.body).toBeTruthy());
      const doc = iframe.contentDocument!;
      const realm = doc.defaultView as unknown as typeof globalThis;
      doc.body.append(el);
      // happy-dom only runs disconnectedCallback for a move across documents; a browser then runs these
      el.adoptedCallback();
      el.connectedCallback();
      flush(el);

      const after = sheetsOf(el);
      expect(after).toHaveLength(2);
      expect(after[0]).toBe(getBaseSheet(doc));
      expect(after.every(sheet => sheet instanceof realm.CSSStyleSheet)).toBe(true);
      expect(after.some(sheet => before.includes(sheet))).toBe(false);
      expect(themeValue(after[1])).not.toBe('');
      expect($$(el, '.gantt-bars-layer [data-task-id]')).toHaveLength(1);

      // Back home (connecting notices the document change by itself)
      document.body.append(el);
      flush(el);
      const home = sheetsOf(el);
      expect(home[0]).toBe(getBaseSheet(document));
      expect(home).toHaveLength(2);
      expect(themeValue(home[1])).not.toBe('');
    });

    it('falls back to a style element and host variables in a document without constructable sheets', () => {
      const el = mount({ tasks: [task('a', 2)] });
      const doc = document.implementation.createHTMLDocument('inert');
      doc.body.append(el);
      el.adoptedCallback();
      el.connectedCallback();
      flush(el);
      expect(sheetsOf(el)).toEqual([]);
      expect(el.shadowRoot!.firstChild?.nodeName).toBe('STYLE');
      expect(el.style.getPropertyValue('--gantt-bar')).not.toBe('');
      el.remove();

      // Back in a document with constructable sheets: adopted again, no fallback left behind
      document.body.append(el);
      flush(el);
      expect(sheetsOf(el)[0]).toBe(getBaseSheet(document));
      expect(sheetsOf(el)).toHaveLength(2);
      expect(el.shadowRoot!.querySelector('style')).toBeNull();
      expect(el.style.getPropertyValue('--gantt-bar')).toBe('');
    });
  });
});

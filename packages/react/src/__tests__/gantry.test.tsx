import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { act, Activity, startTransition, StrictMode, Suspense, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { GANTRY_EVENTS, GANTRY_PROPERTIES } from '@gantry/vanilla';
import { Gantry, GanttDataSource, type GantryElement, type GanttOptions, type GanttTask } from '../index';

// React only checks `act()` usage when this flag is set (as testing libraries do)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 0, 5), end: new Date(2026, 0, 20), progress: 60 },
  { id: 'b', name: 'Build', start: new Date(2026, 0, 21), end: new Date(2026, 1, 10), progress: 0 },
];

let host: HTMLDivElement | undefined;
let root: Root | undefined;

/** Renders `node` into a fresh container (re-renders the same root when called again). */
async function render(node: ReactNode): Promise<void> {
  if (!host) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(node));
}

function element(): GantryElement {
  const el = host?.querySelector('gantry-element');
  if (!el) throw new Error('no <gantry-element>');
  return el;
}

function dispatch(el: GantryElement, type: string, detail: unknown): void {
  el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

/** Spies on the element listeners the wrapper adds and removes (the element registers its own `keydown` too). */
function spyListeners() {
  // The prototype that implements addEventListener for elements (happy-dom's EventTarget)
  let target: object = HTMLElement.prototype;
  while (!Object.hasOwn(target, 'addEventListener')) target = Object.getPrototypeOf(target) as object;
  const add = vi.spyOn(target as EventTarget, 'addEventListener');
  const remove = vi.spyOn(target as EventTarget, 'removeEventListener');
  const calls = (spy: typeof add, el: GantryElement) =>
    spy.mock.calls.filter(([type], i) => spy.mock.contexts[i] === el && type in GANTRY_EVENTS).map(([type]) => type);
  return { added: (el: GantryElement) => calls(add, el), removed: (el: GantryElement) => calls(remove, el) };
}

const ALL_EVENTS = Object.keys(GANTRY_EVENTS).sort();

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
  vi.restoreAllMocks();
});

describe('<Gantry> (React wrapper)', () => {
  it('renders a <gantry-element> with the default size, the class and the native attributes', async () => {
    const errors = vi.spyOn(console, 'error');
    await render(
      <Gantry
        className="chart"
        id="plan"
        aria-describedby="help"
        style={{ height: 400 }}
        tasks={TASKS}
        showToolbar={false}
        onTaskDragged={() => undefined}
      />,
    );
    const el = element();
    expect(el.getAttribute('class')).toBe('chart');
    expect(el.id).toBe('plan');
    expect(el.getAttribute('aria-describedby')).toBe('help');
    expect(el.style.display).toBe('block');
    expect(el.style.width).toBe('100%');
    expect(el.style.height).toBe('400px');
    // Properties and callbacks are not attributes (`role` / `aria-label`: the element's ARIA
    // fallback without ElementInternals, as in happy-dom)
    const ours = el.getAttributeNames().filter(name => name !== 'role' && name !== 'aria-label');
    expect(ours.sort()).toEqual(['aria-describedby', 'class', 'id', 'style']);
    expect(errors).not.toHaveBeenCalled();
  });

  it('delivers the events fired by the first property writes', async () => {
    // A data source that already failed reports it as soon as the element gets it
    const ds = new GanttDataSource({ fetcher: () => Promise.reject(new Error('offline')), retries: 0, initialPage: 0 });
    await ds.loadNext();
    expect(ds.error).toBeInstanceOf(Error);
    const onViewModeChange = vi.fn();
    const onLoadError = vi.fn();
    await render(
      <Gantry
        options={{ viewMode: 'Week' }}
        dataSource={ds}
        onViewModeChange={onViewModeChange}
        onLoadError={onLoadError}
      />,
    );
    expect(onViewModeChange).toHaveBeenCalledExactlyOnceWith({ viewMode: 'Week' });
    expect(onLoadError).toHaveBeenCalledExactlyOnceWith({ error: ds.error, page: 1 });
  });

  it('sets the props before the element paints its first frame', async () => {
    const options: GanttOptions = { viewMode: 'Week', rowHeight: 40 };
    const seen: { tasks?: GanttTask[]; options?: GanttOptions; showToolbar?: boolean }[] = [];
    // A parent's layout effect runs after the child's, in the same commit: no frame in between
    function Probe() {
      const ref = useRef<GantryElement>(null);
      useLayoutEffect(() => {
        const el = ref.current!;
        seen.push({ tasks: el.tasks, options: el.options, showToolbar: el.showToolbar });
      }, []);
      return <Gantry ref={ref} tasks={TASKS} options={options} showToolbar={false} />;
    }
    await render(<Probe />);
    expect(seen).toEqual([{ tasks: TASKS, options, showToolbar: false }]);
  });

  it('passes the consumer objects through unchanged', async () => {
    const options: GanttOptions = { viewMode: 'Week' };
    const annotations = [{ x1: new Date(2026, 0, 10) }];
    const renderBar = () => null;
    await render(<Gantry tasks={TASKS} options={options} annotations={annotations} renderBar={renderBar} />);
    const el = element();
    expect(el.tasks).toBe(TASKS);
    expect(el.options).toBe(options);
    expect(el.annotations).toBe(annotations);
    expect(el.renderBar).toBe(renderBar);

    const next = [...TASKS, { id: 'c', name: 'Ship', start: new Date(2026, 1, 11), end: new Date(2026, 1, 11) }];
    await render(<Gantry tasks={next} options={options} annotations={annotations} renderBar={renderBar} />);
    expect(el.tasks).toBe(next);
  });

  it('restores the element default when a prop goes back to undefined', async () => {
    await render(
      <Gantry
        tasks={TASKS}
        options={{ viewMode: 'Week' }}
        annotations={[{ x1: new Date(2026, 0, 10) }]}
        darkMode
        showToolbar={false}
        enableDrag={false}
        showLegend
        dataSource={{ fetcher: () => Promise.resolve([]), initialPage: 0 }}
      />,
    );
    const el = element();
    expect(el.showToolbar).toBe(false);
    expect(el.dataSource).toBeInstanceOf(GanttDataSource);

    await render(<Gantry />);
    expect(el.options).toEqual({});
    expect(el.annotations).toEqual([]);
    expect(el.darkMode).toBe(false);
    expect(el.showToolbar).toBe(true);
    expect(el.enableDrag).toBe(true);
    expect(el.showLegend).toBe(false);
    expect(el.dataSource).toBeNull();

    await render(<Gantry tasks={TASKS} />);
    expect(el.tasks).toBe(TASKS);
    await render(<Gantry tasks={undefined} />);
    expect(el.tasks).toEqual([]);
  });

  it('leaves the element defaults (and attributes) alone for props never set', async () => {
    const proto = customElements.get('gantry-element')!.prototype as GantryElement;
    const setters = GANTRY_PROPERTIES.map(key => vi.spyOn(proto, key, 'set'));
    // An attribute passed through as a native prop is not overwritten by the unset property
    await render(<Gantry {...{ 'show-toolbar': 'false' }} />);
    expect(element().showToolbar).toBe(false);
    for (const setter of setters) expect(setter).not.toHaveBeenCalled();
  });

  it('calls the latest callbacks without re-subscribing', async () => {
    const first = vi.fn();
    const second = vi.fn();
    await render(<Gantry onSelectionChange={first} />);
    const el = element();
    const add = vi.spyOn(el, 'addEventListener');
    const remove = vi.spyOn(el, 'removeEventListener');

    await render(<Gantry onSelectionChange={second} />);
    dispatch(el, 'selection-change', { selectedIds: ['a'] });
    expect(second).toHaveBeenCalledExactlyOnceWith({ selectedIds: ['a'] });
    expect(first).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();

    // A callback removed later is simply not called
    await render(<Gantry />);
    dispatch(el, 'selection-change', { selectedIds: [] });
    expect(second).toHaveBeenCalledOnce();
  });

  it('updates the callbacks in the commit, before the layout effects of the parents', async () => {
    const first = vi.fn();
    const second = vi.fn();
    function Parent({ cb }: { cb: (detail: unknown) => void }) {
      const ref = useRef<GantryElement>(null);
      useLayoutEffect(() => dispatch(ref.current!, 'row-click', { cb: cb.name }));
      return <Gantry ref={ref} onRowClick={cb} />;
    }
    await render(<Parent cb={first} />);
    await render(<Parent cb={second} />);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('never calls a callback from a render that was not committed', async () => {
    const committed = vi.fn();
    const discarded = vi.fn();
    const never = new Promise<never>(() => undefined);
    function Suspends(): ReactNode {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- how a component suspends in React 18 (no `use()`)
      throw never;
    }
    const app = (cb: (detail: unknown) => void, suspend: boolean) => (
      <Suspense fallback={null}>
        <Gantry onSelectionChange={cb} />
        {suspend && <Suspends />}
      </Suspense>
    );
    await render(app(committed, false));
    const el = element();
    // A transition that suspends keeps the committed tree: its render (with `discarded`) is thrown away
    await act(async () => startTransition(() => root!.render(app(discarded, true))));
    expect(element()).toBe(el);
    dispatch(el, 'selection-change', { selectedIds: ['b'] });
    expect(committed).toHaveBeenCalledExactlyOnceWith({ selectedIds: ['b'] });
    expect(discarded).not.toHaveBeenCalled();
  });

  it('removes its listeners when unmounted', async () => {
    const onSelectionChange = vi.fn();
    const onRowClick = vi.fn();
    await render(<Gantry onSelectionChange={onSelectionChange} onRowClick={onRowClick} />);
    const el = element();
    await act(async () => root!.unmount());
    root = undefined;
    dispatch(el, 'selection-change', { selectedIds: ['a'] });
    dispatch(el, 'row-click', {});
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('still delivers the state-change the element fires while disconnecting', async () => {
    const onStateChange = vi.fn();
    await render(<Gantry onStateChange={onStateChange} />);
    const el = element();
    el.setView('table'); // a state save pending (debounced)
    expect(onStateChange).not.toHaveBeenCalled();

    await act(async () => root!.unmount());
    root = undefined;
    expect(el.isConnected).toBe(false);
    expect(onStateChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ view: 'table' }));
    // Then the listeners are gone
    dispatch(el, 'state-change', {});
    expect(onStateChange).toHaveBeenCalledOnce();
  });

  it('keeps one listener per event under StrictMode (effects run twice), removed on unmount', async () => {
    const listeners = spyListeners();
    const options: GanttOptions = { viewMode: 'Week' };
    const onSelectionChange = vi.fn();
    const onStateChange = vi.fn();
    await render(
      <StrictMode>
        <Gantry tasks={TASKS} options={options} onSelectionChange={onSelectionChange} onStateChange={onStateChange} />
      </StrictMode>,
    );
    const el = element();
    expect(el.tasks).toBe(TASKS);
    expect(el.options).toBe(options);
    expect(listeners.added(el).sort()).toEqual(ALL_EVENTS);
    expect(listeners.removed(el)).toEqual([]);
    dispatch(el, 'selection-change', { selectedIds: ['a'] });
    expect(onSelectionChange).toHaveBeenCalledOnce();

    el.setView('table');
    await act(async () => root!.unmount());
    root = undefined;
    expect(onStateChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ view: 'table' }));
    expect(listeners.removed(el).sort()).toEqual(ALL_EVENTS);
    expect(listeners.added(el)).toHaveLength(ALL_EVENTS.length);
  });

  it('detaches the listeners while an <Activity> hides it and attaches them once when shown again', async () => {
    const listeners = spyListeners();
    const onSelectionChange = vi.fn();
    const app = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <Gantry onSelectionChange={onSelectionChange} />
      </Activity>
    );
    await render(app('visible'));
    const el = element();
    await render(app('hidden'));
    expect(element()).toBe(el); // kept, hidden
    expect(listeners.removed(el).sort()).toEqual(ALL_EVENTS);
    dispatch(el, 'selection-change', { selectedIds: ['a'] });
    expect(onSelectionChange).not.toHaveBeenCalled();

    await render(app('visible'));
    expect(listeners.added(el)).toHaveLength(2 * ALL_EVENTS.length);
    dispatch(el, 'selection-change', { selectedIds: ['b'] });
    expect(onSelectionChange).toHaveBeenCalledExactlyOnceWith({ selectedIds: ['b'] });
  });

  it('exposes the element, with its props already set, through the ref', async () => {
    let seen: GanttTask[] | undefined;
    const ref = (el: GantryElement | null) => {
      if (el) seen = el.tasks;
    };
    await render(<Gantry ref={ref} tasks={TASKS} />);
    expect(seen).toBe(TASKS);
    expect(typeof element().scrollToToday).toBe('function');
  });

  it('hydrates the server markup', async () => {
    // As in every current browser, ARIA goes through ElementInternals: the element adds no host
    // attributes when it connects (happy-dom has none, so it would add `role` / `aria-label`)
    Object.defineProperty(HTMLElement.prototype, 'attachInternals', {
      configurable: true,
      value: () => ({ role: null, ariaLabel: null, states: new Set<string>() }),
    });
    onTestFinished(() => {
      delete (HTMLElement.prototype as Partial<HTMLElement>).attachInternals;
    });
    const onViewModeChange = vi.fn();
    const app = (
      <Gantry
        className="chart"
        tasks={TASKS}
        options={{ viewMode: 'Week' }}
        style={{ height: 300 }}
        onViewModeChange={onViewModeChange}
      />
    );
    host = document.createElement('div');
    host.innerHTML = renderToString(app);
    document.body.append(host);
    // (Rendering on the server here, where `document` exists, React 18 warns about layout effects)
    const errors = vi.spyOn(console, 'error');
    const server = element();
    await act(async () => {
      root = hydrateRoot(host!, app);
    });
    expect(element()).toBe(server);
    expect(server.tasks).toBe(TASKS);
    expect(onViewModeChange).toHaveBeenCalledExactlyOnceWith({ viewMode: 'Week' });
    expect(errors).not.toHaveBeenCalled();
  });
});

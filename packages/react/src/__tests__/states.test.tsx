// Phase 9 surface of the React binding: the chart-state props (`loading`, `errorMessage`) and the
// `retry` event come through the element tables like every other prop and event, the listeners
// still go on before the first property write, the props are written in GANTRY_PROPERTIES order,
// and children reach the element's light DOM (`<div slot="empty">` for the empty state).
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { GANTRY_EVENTS, GANTRY_PROPERTIES, type GantryProperties } from '@gantryjs/vanilla';
import { Gantry, ViewMode, createGanttSyncGroup, type GantryElement, type GanttTask, type RetryEvent } from '../index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Name = (typeof GANTRY_PROPERTIES)[number];

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 0, 5), end: new Date(2026, 0, 20), progress: 60 },
];

/** A non-default value for every property */
const SAMPLE: { [K in Name]-?: Exclude<GantryProperties[K], undefined> } = {
  tasks: TASKS,
  columns: [{ key: 'name', label: 'Name', width: 200 }],
  options: { viewMode: ViewMode.Week },
  annotations: [{ x1: new Date(2026, 0, 9), label: { text: 'Review' } }],
  resources: [{ id: 'ana', name: 'Ana' }],
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

let host: HTMLDivElement | undefined;
let root: Root | undefined;

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

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = undefined;
  root = undefined;
  vi.restoreAllMocks();
});

describe('<Gantry> chart states (React)', () => {
  it('forwards loading and errorMessage; undefined restores their defaults', async () => {
    await render(<Gantry loading errorMessage="Couldn’t load the plan" />);
    const el = element();
    expect(el.loading).toBe(true);
    expect(el.errorMessage).toBe('Couldn’t load the plan');
    // Properties, never attributes
    expect(el.hasAttribute('loading')).toBe(false);
    expect(el.hasAttribute('errormessage')).toBe(false);

    await render(<Gantry loading={false} errorMessage={null} />);
    expect(el.loading).toBe(false);
    expect(el.errorMessage).toBeNull();

    await render(<Gantry loading errorMessage="Offline" />);
    await render(<Gantry />);
    expect(el.loading).toBe(false);
    expect(el.errorMessage).toBeNull();
  });

  it('calls onRetry with the retry event detail', async () => {
    const onRetry = vi.fn<(e: RetryEvent) => void>();
    await render(<Gantry errorMessage="Offline" onRetry={onRetry} />);
    const detail: RetryEvent = { source: 'error' };
    element().dispatchEvent(new CustomEvent('retry', { detail, bubbles: true, composed: true }));
    expect(onRetry).toHaveBeenCalledExactlyOnceWith(detail);
    expect(GANTRY_EVENTS).toHaveProperty('retry', 'onRetry');
  });

  it('attaches every listener, then writes every property once in GANTRY_PROPERTIES order', async () => {
    const proto = customElements.get('gantry-element')!.prototype as GantryElement;
    let target: object = HTMLElement.prototype;
    while (!Object.hasOwn(target, 'addEventListener')) target = Object.getPrototypeOf(target) as object;
    const adds = vi.spyOn(target as EventTarget, 'addEventListener');
    const writes = GANTRY_PROPERTIES.map(name => [name, vi.spyOn(proto, name, 'set')] as const);

    await render(<Gantry {...SAMPLE} />);

    const attached = adds.mock.calls.flatMap(([type], i) =>
      type in GANTRY_EVENTS ? [adds.mock.invocationCallOrder[i]!] : [],
    );
    expect(attached).toHaveLength(Object.keys(GANTRY_EVENTS).length);
    for (const [name, spy] of writes) expect(spy, name).toHaveBeenCalledOnce();
    const order = writes.map(([name, spy]) => [name, spy.mock.invocationCallOrder[0]!] as const);
    expect(Math.max(...attached)).toBeLessThan(Math.min(...order.map(([, at]) => at)));
    expect([...order].sort((a, b) => a[1] - b[1]).map(([name]) => name)).toEqual([...GANTRY_PROPERTIES]);
  });
});

describe('<Gantry> children (React)', () => {
  it('renders its children in the light DOM of the element, kept up to date', async () => {
    const errors = vi.spyOn(console, 'error');
    await render(
      <Gantry tasks={[]}>
        <div slot="empty">Nothing planned yet</div>
      </Gantry>,
    );
    const el = element();
    const empty = el.querySelector(':scope > [slot="empty"]');
    expect(empty?.textContent).toBe('Nothing planned yet');
    expect(el.children).toHaveLength(1);

    await render(
      <Gantry tasks={[]}>
        <div slot="empty">Add a task to start</div>
      </Gantry>,
    );
    expect(el.querySelector(':scope > [slot="empty"]')).toBe(empty);
    expect(empty?.textContent).toBe('Add a task to start');

    // Several children (no key warning, as for any JSX children)
    await render(
      <Gantry tasks={[]}>
        <div slot="empty">Add a task to start</div>
        <span>Plan</span>
      </Gantry>,
    );
    expect([...el.children].map(c => c.outerHTML)).toEqual([
      '<div slot="empty">Add a task to start</div>',
      '<span>Plan</span>',
    ]);

    await render(<Gantry tasks={[]} />);
    expect(el.childNodes).toHaveLength(0);
    expect(errors).not.toHaveBeenCalled();
  });

  it('renders the children on the server and hydrates them', async () => {
    // ARIA through ElementInternals, as in browsers (see gantry.test.tsx): no host attributes added
    Object.defineProperty(HTMLElement.prototype, 'attachInternals', {
      configurable: true,
      value: () => ({ role: null, ariaLabel: null, states: new Set<string>() }),
    });
    onTestFinished(() => {
      delete (HTMLElement.prototype as Partial<HTMLElement>).attachInternals;
    });
    const app = (
      <Gantry className="chart" tasks={TASKS} loading>
        <div slot="empty">Nothing planned yet</div>
      </Gantry>
    );
    const html = renderToString(app);
    expect(html).toBe('<gantry-element class="chart"><div slot="empty">Nothing planned yet</div></gantry-element>');

    host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const errors = vi.spyOn(console, 'error');
    const server = element();
    const empty = server.firstElementChild;
    await act(async () => {
      root = hydrateRoot(host!, app);
    });
    expect(element()).toBe(server);
    expect(server.firstElementChild).toBe(empty);
    expect(server.loading).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });
});

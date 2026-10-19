// Phase 9 surface of the Svelte binding: the chart-state props (`loading`, `errorMessage`) and the
// `onRetry` callback, the listeners still on before the first property write with every property
// written in GANTRY_PROPERTIES order, and the light DOM: the `empty` snippet in a
// `<div slot="empty">`, then `children`. A `.svelte.test.ts` file, so it may use runes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount, type ComponentProps } from 'svelte';
import { GANTRY_EVENTS, GANTRY_PROPERTIES, type GantryProperties } from '@gantryjs/vanilla';
import { Gantry, ViewMode, createGanttSyncGroup, type GantryElement, type GanttTask, type RetryEvent } from '../index';
import EmptyState from './EmptyState.svelte';

type Name = (typeof GANTRY_PROPERTIES)[number];
type Props = ComponentProps<typeof Gantry>;

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: new Date(2026, 0, 5), end: new Date(2026, 0, 9), progress: 50 },
];

/** A non-default value for every property */
const SAMPLE: { [K in Name]-?: Exclude<GantryProperties[K], undefined> } = {
  tasks: TASKS,
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

/** `node`'s markup without Svelte's anchor comments */
const markup = (node: Element | null | undefined): string | undefined => node?.outerHTML.replace(/<!--[^>]*-->/g, '');
const teardown: (() => void)[] = [];

/** Mounts a component into a new target (`create`), flushes its effects and returns its element. */
function attach(create: (target: HTMLElement) => ReturnType<typeof mount>): GantryElement {
  const target = document.createElement('div');
  document.body.append(target);
  const instance = create(target);
  flushSync();
  teardown.push(() => {
    void unmount(instance);
    target.remove();
  });
  const el = target.querySelector('gantry-element');
  if (!el) throw new Error('no <gantry-element>');
  return el;
}

/** Mounts `<Gantry>` with `props` (a plain or `$state` object). */
const render = (props: Props): GantryElement => attach(target => mount(Gantry, { target, props }));

afterEach(() => {
  for (const fn of teardown.splice(0)) fn();
  vi.restoreAllMocks();
});

describe('<Gantry> chart states (Svelte)', () => {
  it('forwards loading and errorMessage; undefined restores their defaults', () => {
    const props = $state<Props>({ loading: true, errorMessage: 'Couldn’t load the plan' });
    const el = render(props);
    expect(el.loading).toBe(true);
    expect(el.errorMessage).toBe('Couldn’t load the plan');
    expect(el.hasAttribute('loading')).toBe(false);

    props.errorMessage = null;
    flushSync();
    expect(el.errorMessage).toBeNull();

    props.loading = undefined;
    props.errorMessage = undefined;
    flushSync();
    expect(el.loading).toBe(false);
    expect(el.errorMessage).toBeNull();
  });

  it('calls onRetry with the retry event detail', () => {
    const onRetry = vi.fn<(e: RetryEvent) => void>();
    const el = render({ errorMessage: 'Offline', onRetry });
    const detail: RetryEvent = { source: 'error' };
    el.dispatchEvent(new CustomEvent('retry', { detail, bubbles: true, composed: true }));
    expect(onRetry).toHaveBeenCalledExactlyOnceWith(detail);
    expect(GANTRY_EVENTS).toHaveProperty('retry', 'onRetry');
  });

  it('attaches every listener, then writes every property once in GANTRY_PROPERTIES order', () => {
    const adds = vi.spyOn(proto as unknown as HTMLElement, 'addEventListener');
    const writes = GANTRY_PROPERTIES.map(name => [name, vi.spyOn(proto, name, 'set')] as const);
    render({ ...SAMPLE });

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

describe('<Gantry> light DOM (Svelte)', () => {
  it('renders the empty snippet in a <div slot="empty">, then the children, kept up to date', () => {
    const props = $state({ text: 'Nothing planned yet' });
    const el = attach(target => mount(EmptyState, { target, props }));
    const [empty, note] = el.children;
    expect(el.children).toHaveLength(2);
    expect(markup(empty)).toBe('<div slot="empty">Nothing planned yet</div>');
    expect(markup(note)).toBe('<span class="note">Plan</span>');
    // Elements only: no whitespace text between them
    expect([...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE)).toEqual([]);

    props.text = 'Add a task to start';
    flushSync();
    expect(el.firstElementChild).toBe(empty);
    expect(empty?.textContent).toBe('Add a task to start');
  });

  it('adds and removes the slot element with the empty snippet', () => {
    const empty = createRawSnippet(() => ({ render: () => '<em>Nothing planned yet</em>' }));
    const props = $state<Props>({ empty });
    const el = render(props);
    expect(markup(el.querySelector(':scope > [slot="empty"]'))).toBe(
      '<div slot="empty"><em>Nothing planned yet</em></div>',
    );

    props.empty = undefined;
    flushSync();
    expect(el.querySelector('[slot="empty"]')).toBeNull();
  });

  it('renders a children snippet as it is (any slot attribute included)', () => {
    const children = createRawSnippet(() => ({ render: () => '<div slot="empty">Nothing planned yet</div>' }));
    const el = render({ children });
    expect(el.children).toHaveLength(1);
    expect(el.querySelector(':scope > [slot="empty"]')?.textContent).toBe('Nothing planned yet');
  });

  it('renders no element child without empty or children', () => {
    expect(render({}).children).toHaveLength(0);
  });
});

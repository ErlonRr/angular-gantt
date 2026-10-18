// Phase 9 step 4.3 — the chart states (D11, §3c): `div.gantt-state` inside `.gantry-main`, attached
// while `chartState.kind !== 'ready'` (D27): the loading skeleton from core `skeletonRows`, the
// error box (`role=alert`, Retry → `retry` event and `dataSource.retry()`), the empty box with its
// `empty` slot; the alert region left to the error box (parity with Angular); focus kept in the
// chart when Retry goes away.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bodyHeight, skeletonRows, type GanttTask, type RetryEvent, type SkeletonBlock } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { BASE_CSS } from '../styles/base';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

/** `n` one-week tasks in March 2026. */
function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + (i % 20)),
    end: new Date(2026, 2, 9 + (i % 20)),
    progress: 40,
  }));
}

function mount(
  props: Partial<Pick<GantryElement, 'tasks' | 'loading' | 'errorMessage' | 'options'>> = {},
): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, props);
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = (el: GantryElement, sel: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(sel)];
const box = (el: GantryElement) => getEngine(el).dom.stateBox;
const childClasses = (node: Element) => [...node.children].map(c => c.className);
const active = (el: GantryElement) => el.shadowRoot!.activeElement as HTMLElement | null;
const nextTask = () => new Promise<void>(r => setTimeout(r, 0));
const at = (el: HTMLElement) => ['left', 'top', 'width', 'height'].map(p => el.style.getPropertyValue(p));
const px = (b: SkeletonBlock) => [b.x, b.y, b.width, b.height].map(v => `${v}px`);

describe('chart states (Phase 9 step 4.3)', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
  });

  it('stays detached while the chart is ready (D27)', () => {
    el = mount({ tasks: plan(3) });
    expect(getEngine(el).graph.chartState().kind).toBe('ready');
    expect(box(el).isConnected).toBe(false);
    expect($(el, '.gantt-state')).toBeNull();
    // The consumer's loading over shown rows keeps the chart (busy, no box)
    el.loading = true;
    flush(el);
    expect(box(el).isConnected).toBe(false);
  });

  describe('empty', () => {
    it('shows the empty box with the empty slot, labels.emptyState as its fallback', () => {
      el = mount();
      const { main } = getEngine(el).dom;
      const state = $(el, '.gantt-state')!;
      expect(state).toBe(box(el));
      expect(state.parentNode).toBe(main);
      expect(main.lastElementChild).toBe(state);
      expect(state.className).toBe('gantt-state gantt-state--empty');
      expect(state.getAttribute('part')).toBe('state');
      expect(childClasses(state)).toEqual(['gantt-state-box']);
      const content = state.firstElementChild!;
      expect(content.hasAttribute('role')).toBe(false);
      const slot = content.firstElementChild as HTMLSlotElement;
      expect(slot.tagName).toBe('SLOT');
      expect(slot.getAttribute('name')).toBe('empty');
      expect(childClasses(slot)).toEqual(['gantt-state-message']);
      expect(slot.textContent).toBe('No tasks to show');

      el.options = { labels: { emptyState: 'Niente da mostrare' } };
      flush(el);
      expect(slot.textContent).toBe('Niente da mostrare');

      el.tasks = plan(2);
      flush(el);
      expect(state.isConnected).toBe(false);
      el.tasks = [];
      flush(el);
      expect($(el, '.gantt-state slot[name="empty"]')).toBe(slot);
    });
  });

  describe('loading', () => {
    it('draws the skeleton rows of core skeletonRows, hidden from assistive technologies', () => {
      el = mount({ loading: true });
      const { graph, inputs } = getEngine(el);
      const state = box(el);
      expect(state.className).toBe('gantt-state gantt-state--loading');
      // The skeleton is decoration; labels.loading is its text for assistive technologies
      expect(childClasses(state)).toEqual(['gantt-skeleton', 'gantt-state-message']);
      const skeleton = state.firstElementChild as HTMLElement;
      expect(skeleton.getAttribute('aria-hidden')).toBe('true');
      const message = state.lastElementChild as HTMLElement;
      expect(message.tagName).toBe('SPAN');
      expect(message.textContent).toBe('Loading…');
      expect(message.hasAttribute('aria-hidden')).toBe(false);
      // The host region is busy
      expect(el.getAttribute('aria-busy') ?? (el as unknown as { ariaBusy?: string }).ariaBusy).toBe('true');

      const expected = skeletonRows({
        viewportHeight: bodyHeight(inputs.canvasH(), graph.headerHeight()),
        rowHeight: graph.config().rowHeight,
        panelWidth: graph.panelPx(),
        timelineWidth: inputs.canvasW(),
      });
      const rows = $$(el, '.gantt-skeleton-row');
      expect(rows).toHaveLength(expected.length);
      rows.forEach((row, i) => {
        const r = expected[i];
        expect([row.style.getPropertyValue('top'), row.style.getPropertyValue('height')]).toEqual([
          `${r.y}px`,
          `${r.height}px`,
        ]);
        const name = row.querySelector<HTMLElement>('.gantt-skeleton-name');
        const bar = row.querySelector<HTMLElement>('.gantt-skeleton-bar');
        expect(name ? at(name) : null).toEqual(r.name ? px(r.name) : null);
        expect(bar ? at(bar) : null).toEqual(r.bar ? px(r.bar) : null);
        // Name first, then bar
        if (name && bar) expect(row.firstElementChild).toBe(name);
      });
    });

    it('follows the measured size and the view: no names in the chart view, no bars in the table view', () => {
      el = mount({ loading: true });
      const { inputs, graph } = getEngine(el);
      inputs.mainW.set(1000);
      inputs.canvasW.set(600);
      inputs.canvasH.set(graph.headerHeight() + 5 * graph.config().rowHeight);
      flush(el);
      expect($$(el, '.gantt-skeleton-row')).toHaveLength(5);
      expect($$(el, '.gantt-skeleton-name').length).toBeGreaterThan(0);
      expect($$(el, '.gantt-skeleton-bar').length).toBeGreaterThan(0);

      el.setView('chart');
      flush(el);
      expect($$(el, '.gantt-skeleton-name')).toHaveLength(0);
      expect($$(el, '.gantt-skeleton-bar')).toHaveLength(5);
      // The bars start at the timeline's left edge (no panel)
      const first = skeletonRows({ viewportHeight: 5 * 36, rowHeight: 36, panelWidth: 0, timelineWidth: 600 })[0];
      expect($(el, '.gantt-skeleton-bar')!.style.getPropertyValue('left')).toBe(`${first.bar!.x}px`);

      el.setView('table');
      flush(el);
      expect($$(el, '.gantt-skeleton-bar')).toHaveLength(0);
      expect($$(el, '.gantt-skeleton-name')).toHaveLength(5);
    });

    it('gives way to the rows once they arrive', () => {
      el = mount({ loading: true });
      expect(box(el).isConnected).toBe(true);
      el.tasks = plan(2);
      flush(el);
      expect(box(el).isConnected).toBe(false);
      expect($$(el, '.gantt-bars-layer [data-task-id]')).toHaveLength(2);
      el.loading = false;
      flush(el);
      expect(el.hasAttribute('aria-busy')).toBe(false);
    });
  });

  describe('error', () => {
    it("shows errorMessage in a role=alert box with Retry, over the rows, and emits retry { source: 'error' }", () => {
      el = mount({ tasks: plan(3), errorMessage: 'Server unreachable' });
      const state = box(el);
      expect(state.isConnected).toBe(true);
      expect(state.className).toBe('gantt-state gantt-state--error');
      const alert = state.firstElementChild as HTMLElement;
      expect(alert.className).toBe('gantt-state-box');
      expect(alert.getAttribute('role')).toBe('alert');
      expect(childClasses(alert)).toEqual(['gantt-state-title', 'gantt-state-message', 'gantt-state-retry']);
      expect(alert.querySelector('.gantt-state-title')!.textContent).toBe('Couldn’t show the chart');
      expect(alert.querySelector('.gantt-state-message')!.textContent).toBe('Server unreachable');
      const retry = alert.querySelector<HTMLButtonElement>('.gantt-state-retry')!;
      expect(retry.tagName).toBe('BUTTON');
      expect(retry.type).toBe('button');
      expect(retry.dataset['focusKey']).toBe('retry');
      expect(retry.textContent).toBe('Retry');
      // The box reads the failure: the alert region stays quiet
      expect($(el, '.gantt-sr-alert')!.textContent).toBe('');

      const seen: RetryEvent[] = [];
      el.addEventListener('retry', e => seen.push(e.detail));
      retry.click();
      expect(seen).toEqual([{ source: 'error' }]);

      el.options = { labels: { errorTitle: 'Errore', retry: 'Riprova' } };
      el.errorMessage = 'Server non raggiungibile';
      flush(el);
      expect(alert.querySelector('.gantt-state-title')!.textContent).toBe('Errore');
      expect(alert.querySelector('.gantt-state-message')!.textContent).toBe('Server non raggiungibile');
      expect(retry.textContent).toBe('Riprova');
    });

    it('keeps focus in the chart when Retry goes away', () => {
      el = mount({ tasks: plan(3), errorMessage: 'Offline' });
      const retry = $<HTMLButtonElement>(el, '.gantt-state-retry')!;
      retry.focus();
      expect(active(el)).toBe(retry);
      el.errorMessage = null;
      flush(el);
      expect(box(el).isConnected).toBe(false);
      expect(active(el)).not.toBeNull();
      expect(active(el)).not.toBe(retry);
      expect(el.shadowRoot!.contains(active(el))).toBe(true);
    });

    it('retries a data source whose first page failed: retry { source: "dataSource" } and dataSource.retry()', async () => {
      let fail = true;
      const fetcher = vi.fn(async (page: number, size: number) => {
        if (fail) throw new Error('offline');
        return page > 1 ? [] : plan(size);
      });
      el = mount();
      const errors: unknown[] = [];
      el.addEventListener('load-error', e => errors.push((e as CustomEvent).detail));
      el.dataSource = { fetcher, pageSize: 3, retries: 0 };
      await vi.waitFor(() => expect(el.dataSource?.error).not.toBeNull());
      flush(el);
      expect(errors).toHaveLength(1);
      expect(getEngine(el).graph.chartState()).toMatchObject({ kind: 'error', retry: 'dataSource' });
      const state = box(el);
      expect(state.className).toBe('gantt-state gantt-state--error');
      expect(state.querySelector('.gantt-state-message')!.textContent).toBe('Couldn’t load tasks');
      // One announcement: the role=alert box, not the alert region too (as Angular)
      expect($(el, '.gantt-sr-alert')!.textContent).toBe('');
      expect($(el, '.gantt-tl-load-more')).toBeNull();

      const seen: RetryEvent[] = [];
      el.addEventListener('retry', e => seen.push(e.detail));
      const retry = vi.spyOn(el.dataSource!, 'retry');
      fail = false;
      $<HTMLButtonElement>(el, '.gantt-state-retry')!.click();
      expect(seen).toEqual([{ source: 'dataSource' }]);
      expect(retry).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(el.tasks).toHaveLength(3));
      await nextTask();
      flush(el);
      expect(state.isConnected).toBe(false);
      // The retry fetched the failed first page again
      expect(fetcher.mock.calls[1]).toEqual([1, 3]);
    });

    it('still writes the alert region for a failed later page (the rows stay, the footer offers Retry)', async () => {
      const fetcher = vi.fn(async (page: number, size: number) => {
        if (page === 2) throw new Error('offline');
        return plan(size);
      });
      el = mount();
      el.dataSource = { fetcher, pageSize: 5, retries: 0 };
      await vi.waitFor(() => expect(el.tasks).toHaveLength(5));
      flush(el);
      await el.dataSource!.loadNext();
      await vi.waitFor(() => expect(el.dataSource?.error).not.toBeNull());
      flush(el);
      expect(getEngine(el).graph.chartState().kind).toBe('ready');
      expect(box(el).isConnected).toBe(false);
      expect($(el, '.gantt-sr-alert')!.textContent).toBe('Couldn’t load tasks');
    });
  });

  it('wins in core order: error > loading > empty, reusing its nodes', () => {
    el = mount({ loading: true, errorMessage: 'Nope' });
    const state = box(el);
    expect(state.className).toBe('gantt-state gantt-state--error');
    const alert = state.firstElementChild;
    el.errorMessage = null;
    flush(el);
    expect(state.className).toBe('gantt-state gantt-state--loading');
    expect(childClasses(state)).toEqual(['gantt-skeleton', 'gantt-state-message']);
    el.loading = false;
    flush(el);
    expect(state.className).toBe('gantt-state gantt-state--empty');
    el.errorMessage = 'Again';
    flush(el);
    expect(state.firstElementChild).toBe(alert);
    expect(box(el)).toBe(state);
  });

  describe('the body under the box', () => {
    /** `data-focus-key` of the task list's tab stops (exactly one expected). */
    const listStops = (el: GantryElement) =>
      $$(el, '.gantt-tasklist [tabindex="0"]').map(n => n.getAttribute('data-focus-key'));

    it('is inert while not ready (timeline, splitter, task-list rows); the header row stays reachable', () => {
      el = mount({ tasks: plan(3), errorMessage: 'Nope' });
      const { dom } = getEngine(el);
      const rows = $(el, '.gantt-tl-rows')!;
      expect(dom.viewport.inert).toBe(true);
      expect(dom.splitter.inert).toBe(true);
      expect(rows.inert).toBe(true);
      expect(dom.panel.inert).toBe(false);
      // The rows are covered: the first header cell (above the box) is the task list's tab stop
      expect(listStops(el)).toEqual(['head:name']);
      expect($(el, '.gantt-tl-col-headers')!.closest('[inert]')).toBeNull();

      el.errorMessage = null;
      flush(el);
      expect(dom.viewport.inert).toBe(false);
      expect(dom.splitter.inert).toBe(false);
      expect(rows.inert).toBe(false);
      expect(listStops(el)).toEqual(['row:t0']);
    });

    it('without rows (loading, empty, custom empty content) the first header cell is the tab stop', () => {
      for (const props of [{ loading: true }, {}, { options: { labels: { emptyState: 'Nothing' } } }]) {
        el = mount(props);
        expect(getEngine(el).graph.chartState().kind).not.toBe('ready');
        expect(listStops(el)).toEqual(['head:name']);
        el.remove();
      }
    });

    it('moves focus off a covered control: to Retry, else the toolbar tab stop', () => {
      el = mount({ tasks: plan(3) });
      $(el, '.gantt-tl-row[data-task-id="t1"]')!.focus();
      flush(el);
      el.errorMessage = 'Nope';
      flush(el);
      expect(active(el)).toBe($(el, '.gantt-state-retry'));

      el.errorMessage = null;
      flush(el);
      $(el, '.gantt-tl-row[data-task-id="t1"]')!.focus();
      flush(el);
      el.tasks = [];
      el.loading = true;
      flush(el);
      expect(active(el)?.getAttribute('data-focus-key')).toBe('zoom-out');
      // No toolbar: the task list's tab stop, the header cell above the box
      el.showToolbar = false;
      el.loading = false;
      el.tasks = plan(2);
      flush(el);
      $(el, '.gantt-tl-row[data-task-id="t0"]')!.focus();
      flush(el);
      el.tasks = [];
      flush(el);
      expect(active(el)?.getAttribute('data-focus-key')).toBe('head:name');
    });
  });

  it('re-runs only for its own inputs: a selection or a scroll leaves it alone while ready', () => {
    el = mount({ tasks: plan(30) });
    const { regionRuns } = getEngine(el);
    const runs = regionRuns['states'];
    el.setSelectedTasks(['t1']);
    const viewport = $(el, '.gantry-canvas-viewport')!;
    viewport.scrollTop = 200;
    viewport.dispatchEvent(new Event('scroll'));
    flush(el);
    expect(regionRuns['states']).toBe(runs);
  });

  it('styles the box from the header height down and stops the shimmer under reduced motion', () => {
    expect(BASE_CSS).toMatch(/\.gantt-state \{[^}]*top: var\(--gantry-header-h, 0px\)/);
    expect(BASE_CSS).toMatch(/\.gantt-state \{[^}]*position: absolute/);
    expect(BASE_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.gantt-skeleton-name, \.gantt-skeleton-bar \{ animation: none;/,
    );
    expect(BASE_CSS).toMatch(/\.gantt-state-retry \{[^}]*min-height: 32px/);
  });
});

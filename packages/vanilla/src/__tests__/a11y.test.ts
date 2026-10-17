// Accessibility of <gantry-element> (Gantry 2 phase 6, step 4.2): the host region through
// ElementInternals (role, name, custom states) or host attributes without it, no host tab stop
// or theme attribute, the internal tab stops (task-list row, splitter, timeline viewport), the
// polite live region and the focus fallback. happy-dom has no ElementInternals: the internals
// path runs against a stub, the real one is covered by e2e/a11y.spec.ts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GanttTask } from '@gantry/core';
import { GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { announce } from '../engine/announce';
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

function create(props: Partial<Pick<GantryElement, 'tasks' | 'options'>> = {}): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, props);
  return el;
}

function mount(props: Partial<Pick<GantryElement, 'tasks' | 'options'>> = {}): GantryElement {
  const el = create(props);
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel)!;
const $$ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => [
  ...el.shadowRoot!.querySelectorAll<T>(sel),
];
const tabStops = (el: GantryElement) =>
  $$(el, '.gantt-tl-row')
    .filter(r => r.getAttribute('tabindex') === '0')
    .map(r => r.dataset['taskId']);
const live = (el: GantryElement) => $(el, '.gantt-sr-live').textContent;
/** Id of the task shown at visible row `i` (rows are in date order). */
const idAt = (el: GantryElement, i: number) => getEngine(el).graph.visibleRows()[i].task.id;

/** Every text written into `region`, in order (one per announcement). */
function announcements(region: HTMLElement): string[] {
  const said: string[] = [];
  new MutationObserver(records => {
    for (const r of records) for (const n of r.addedNodes) said.push(n.textContent ?? '');
  }).observe(region, { childList: true });
  return said;
}

/** Stand-in for `ElementInternals`: ARIA properties and a `CustomStateSet`. */
interface FakeInternals {
  role: string | null;
  ariaLabel: string | null;
  states: Set<string>;
}

/** Makes `attachInternals` return `internals` (or be missing, with `undefined`) for elements created inside `fn`. */
function withInternals<T>(internals: FakeInternals | undefined, fn: () => T): T {
  Object.defineProperty(GantryElement.prototype, 'attachInternals', {
    configurable: true,
    value: internals ? () => internals : undefined,
  });
  try {
    return fn();
  } finally {
    Reflect.deleteProperty(GantryElement.prototype, 'attachInternals');
  }
}

const fakeInternals = (states: Set<string> = new Set()): FakeInternals => ({ role: null, ariaLabel: null, states });

describe('<gantry-element> accessibility', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
  });

  describe('host', () => {
    it('is not a tab stop and has no theme attribute', () => {
      el = mount({ tasks: plan(3) });
      el.darkMode = true;
      flush(el);
      expect(el.hasAttribute('tabindex')).toBe(false);
      expect(el.hasAttribute('data-theme')).toBe(false);
      expect(el.hasAttribute('style')).toBe(true); // the test's own height only
      expect(el.getAttribute('style')).not.toContain('--gantt-');
    });

    it('without attachInternals: sets role=region and aria-label from labels.ariaChart when connected', () => {
      el = withInternals(undefined, () => create({ tasks: plan(3) }));
      // Nothing on the host before it is connected (createElement must not see attributes)
      expect(el.hasAttribute('role')).toBe(false);
      expect(el.hasAttribute('aria-label')).toBe(false);

      document.body.appendChild(el);
      expect(el.getAttribute('role')).toBe('region');
      expect(el.getAttribute('aria-label')).toBe('Gantt chart timeline');

      // Kept in sync with the labels
      el.options = { labels: { ariaChart: 'Release plan' } };
      expect(el.getAttribute('aria-label')).toBe('Release plan');
      el.remove();
      el.options = { labels: { ariaChart: 'Roadmap' } };
      document.body.appendChild(el);
      expect(el.getAttribute('aria-label')).toBe('Roadmap');
    });

    it('without attachInternals: a role or aria-label set by the page wins', () => {
      el = withInternals(undefined, () => create({ tasks: plan(3) }));
      el.setAttribute('role', 'application');
      el.setAttribute('aria-label', 'My plan');
      document.body.appendChild(el);
      expect(el.getAttribute('role')).toBe('application');
      expect(el.getAttribute('aria-label')).toBe('My plan');
      el.options = { labels: { ariaChart: 'Release plan' } };
      expect(el.getAttribute('aria-label')).toBe('My plan');
    });

    it('with ElementInternals: role, name and the dark / loading / dragging states, no host attributes', () => {
      const internals = fakeInternals();
      el = withInternals(internals, () => create({ tasks: plan(3) }));
      // Set in the constructor: internals add no attributes
      expect(internals.role).toBe('region');
      expect(internals.ariaLabel).toBe('Gantt chart timeline');

      document.body.appendChild(el);
      flush(el);
      expect(el.hasAttribute('role')).toBe(false);
      expect(el.hasAttribute('aria-label')).toBe(false);
      el.options = { labels: { ariaChart: 'Release plan' } };
      expect(internals.ariaLabel).toBe('Release plan');

      expect(internals.states.has('dark')).toBe(false);
      el.darkMode = true;
      expect(internals.states.has('dark')).toBe(true);
      el.darkMode = false;
      expect(internals.states.has('dark')).toBe(false);

      const { inputs } = getEngine(el);
      inputs.loadState.set({ isLoading: true, hasMore: true, loadedCount: 0, error: false });
      expect(internals.states.has('loading')).toBe(true);
      inputs.loadState.set({ isLoading: false, hasMore: true, loadedCount: 5, error: false });
      expect(internals.states.has('loading')).toBe(false);

      const bar = $(el, '.gantt-bars-layer [data-task-id="t0"]');
      const canvas = $(el, '.gantry-canvas-container');
      bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, pointerId: 1 }));
      expect(internals.states.has('dragging')).toBe(true);
      // The drag takes keyboard focus to the timeline (Escape cancels it)
      expect(el.shadowRoot!.activeElement).toBe($(el, '.gantry-canvas-viewport'));
      canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, pointerId: 1 }));
      expect(internals.states.has('dragging')).toBe(false);
    });

    it('falls back to the legacy `--state` form where CustomStateSet rejects plain names', () => {
      class LegacyStates extends Set<string> {
        override add(value: string): this {
          if (!value.startsWith('--')) throw new DOMException('Not a custom state', 'SyntaxError');
          return super.add(value);
        }
      }
      const internals = fakeInternals(new LegacyStates());
      el = withInternals(internals, () => mount({ tasks: plan(3) }));
      el.darkMode = true;
      expect([...internals.states]).toEqual(['--dark']);
      el.darkMode = false;
      expect([...internals.states]).toEqual([]);
    });
  });

  describe('tab stops', () => {
    it('makes the timeline viewport a named tab stop', () => {
      el = mount({ tasks: plan(3) });
      const viewport = $(el, '.gantry-canvas-viewport');
      expect(viewport.getAttribute('tabindex')).toBe('0');
      expect(viewport.getAttribute('role')).toBe('group');
      expect(viewport.getAttribute('aria-label')).toBe('Gantt chart timeline');
      el.options = { labels: { ariaChart: 'Release plan' } };
      expect(viewport.getAttribute('aria-label')).toBe('Release plan');
    });

    it('makes the splitter a focusable separator beside its toggle', () => {
      el = mount({ tasks: plan(3) });
      flush(el);
      const handle = $(el, '.gantry-splitter > .gantry-splitter-handle');
      expect(handle.getAttribute('role')).toBe('separator');
      expect(handle.getAttribute('tabindex')).toBe('0');
      expect(Number(handle.getAttribute('aria-valuenow'))).toBe(Math.round(getEngine(el).graph.panelPx()));
      // The toggle is not inside the separator (its children would be presentational)
      expect(handle.querySelector('button')).toBeNull();
      expect($(el, '.gantry-splitter > .gantry-splitter-toggle')).not.toBeNull();
    });

    it("states the separator's range: from 0 (collapsible) or minWidth to the widest panel, in px", () => {
      el = mount({ tasks: plan(3) });
      const handle = $(el, '.gantry-splitter-handle');
      const value = () => ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'].map(a => Number(handle.getAttribute(a)));
      // Nothing is measured: a 1000 px host, a 6 px splitter, 40 px kept for the timeline
      expect(value()).toEqual([300, 0, 954]);

      el.options = { panel: { collapsible: false, minWidth: 150, maxWidth: 400 } };
      flush(el);
      expect(value()).toEqual([300, 150, 400]);
      // Collapsed (chart view): 0 stays inside the range
      el.setView('chart');
      flush(el);
      expect(value()).toEqual([0, 0, 400]);
    });

    it('gives the task list one tab stop: the first row in view, then the focused row', () => {
      el = mount({ tasks: plan(60) });
      expect(tabStops(el)).toEqual(['t0']);
      expect($$(el, '.gantt-tl-row').every(r => r.hasAttribute('tabindex'))).toBe(true);

      // Scrolled: the first row in view (not an overscan row above it)
      const rh = getEngine(el).graph.config().rowHeight;
      const viewport = $(el, '.gantry-canvas-viewport');
      viewport.scrollTop = 10 * rh;
      viewport.dispatchEvent(new Event('scroll'));
      flush(el);
      expect(tabStops(el)).toEqual([idAt(el, 10)]);

      // The focused row takes it, and keeps it once focus leaves the chart
      const id = idAt(el, 12);
      $(el, `.gantt-tl-row[data-task-id="${id}"]`).focus();
      flush(el);
      expect(tabStops(el)).toEqual([id]);
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();
      flush(el);
      expect(tabStops(el)).toEqual([id]);
    });

    it('names the toolbar from labels.ariaToolbar', () => {
      el = mount({ tasks: plan(3) });
      expect($(el, '.gantt-toolbar').getAttribute('aria-label')).toBe('Chart toolbar');
      el.options = { labels: { ariaToolbar: 'Strumenti' } };
      flush(el);
      expect($(el, '.gantt-toolbar').getAttribute('aria-label')).toBe('Strumenti');
    });
  });

  describe('focus fallback', () => {
    it('moves focus to the timeline viewport when the focused row goes away', () => {
      el = mount({ tasks: plan(3) });
      $(el, '.gantt-tl-row[data-task-id="t1"]').focus();
      flush(el);
      el.tasks = plan(1);
      flush(el);
      expect(el.shadowRoot!.activeElement).toBe($(el, '.gantry-canvas-viewport'));
    });

    it('in the table view (inert timeline) moves it to the task list tab stop', () => {
      el = mount({ tasks: plan(3) });
      el.setView('table');
      flush(el);
      expect($(el, '.gantry-canvas-viewport').inert).toBe(true);
      $(el, '.gantt-tl-row[data-task-id="t2"]').focus();
      flush(el);
      el.tasks = plan(2);
      flush(el);
      expect(el.shadowRoot!.activeElement).toBe($(el, '.gantt-tl-row[data-task-id="t0"]'));
    });
  });

  describe('live region', () => {
    it('is a polite status region, apart from the assertive alert', () => {
      el = mount({ tasks: plan(3) });
      const region = $(el, '.gantt-sr-live');
      expect(region.getAttribute('role')).toBe('status');
      expect(region.getAttribute('aria-live')).toBe('polite');
      expect(region).not.toBe($(el, '.gantt-sr-alert'));
      expect($(el, '.gantt-sr-alert').getAttribute('role')).toBe('alert');
      expect(region.textContent).toBe('');
    });

    it('announces changes of the selection count, not the selection found when connected', () => {
      el = create({ tasks: plan(5) });
      el.setSelectedTasks(['t0']);
      document.body.appendChild(el);
      flush(el);
      expect(live(el)).toBe('');

      el.setSelectedTasks(['t1', 't2']);
      expect(live(el)).toBe('2 tasks selected');
      el.setSelectedTasks(['t3', 't4']); // same count: nothing new to say
      expect(live(el)).toBe('2 tasks selected');
      el.setSelectedTasks(['t3']);
      expect(live(el)).toBe('1 task selected');
      el.clearSelection();
      expect(live(el)).toBe('Selection cleared');

      el.options = { labels: { announceSelection: n => `${n} selezionate` } };
      el.setSelectedTasks(['t1', 't2', 't3']);
      expect(live(el)).toBe('3 selezionate');
    });

    it('announces the data source load state, page by page', async () => {
      const pending: ((items: GanttTask[]) => void)[] = [];
      const fetcher = vi.fn(() => new Promise<GanttTask[]>(resolve => pending.push(resolve)));
      el = mount();
      const said = announcements($(el, '.gantt-sr-live'));
      el.dataSource = { fetcher, pageSize: 5, retries: 0 };
      pending.shift()!(plan(5));
      // A full page: more may follow, and the lazy-load region asks for it near the end of the list
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
      pending.shift()!([]);
      await vi.waitFor(() => expect(said.at(-1)).toBe('All 5 tasks loaded'));
      expect(said).toEqual(['Loading…', '5 tasks loaded', 'Loading…', 'All 5 tasks loaded']);
    });

    it('leaves a failed page to the alert region', async () => {
      el = mount();
      el.dataSource = { fetcher: () => Promise.reject(new Error('offline')), pageSize: 5, retries: 0 };
      expect(live(el)).toBe('Loading…');
      await vi.waitFor(() => expect(el.dataSource?.error).not.toBeNull());
      expect(live(el)).toBe('Loading…');
      expect($(el, '.gantt-sr-alert').textContent).toBe('Couldn’t load tasks');
    });

    it('makes a repeated sentence a change, so it is read again', () => {
      const region = document.createElement('div');
      announce(region, '1 task selected');
      announce(region, '1 task selected');
      expect(region.textContent).toBe('1 task selected\u00A0');
      announce(region, '1 task selected');
      expect(region.textContent).toBe('1 task selected');
    });
  });
});

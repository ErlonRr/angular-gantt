// Phase 9 step 3.1 — the Web Component scaffold: the `loading` / `errorMessage` properties and
// attributes (core `resolveChartState`), the `retry` event, `fitToScreen()`, the host's
// `aria-busy`, the static ARIA of the bars' listbox and of the treegrid, the header height with
// the marker lane, `scroll-padding-top`, the new regions and detached skeleton nodes, the tooltip
// adapter API and the tasks kept while a data source owns the list.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ANNOUNCE_DEBOUNCE,
  FOCUS_RING_MARGIN,
  HATCH_PATTERN,
  MARKER_LANE_HEIGHT,
  REPEAT_MARK,
  TOOLTIP_HIDE_DELAY,
  TOOLTIP_SHOW_DELAY,
  TaskType,
  fitScrollLeft,
  fitZoomLevel,
  timelineScrollPadding,
  type GanttAnnotation,
  type GanttFlatRow,
  type GanttTask,
} from '@gantryjs/core';
import { GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { REGIONS } from '../engine/render';
import { GANTRY_EVENTS, GANTRY_PROPERTIES } from '../types';
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

/** A group with two children, a milestone and a root task. */
function tree(): GanttTask[] {
  return [
    { id: 'g', name: 'Group', start: new Date(2026, 2, 2), end: new Date(2026, 2, 20), type: TaskType.Group },
    { id: 'a', name: 'A', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9), parentId: 'g', progress: 0 },
    { id: 'b', name: 'B', start: new Date(2026, 2, 9), end: new Date(2026, 2, 20), parentId: 'g', progress: 0 },
    { id: 'm', name: 'Launch', start: new Date(2026, 2, 20), end: new Date(2026, 2, 20), type: TaskType.Milestone },
    { id: 'r', name: 'Root', start: new Date(2026, 2, 3), end: new Date(2026, 2, 6), progress: 10 },
  ];
}

const LABELLED: GanttAnnotation[] = [{ x1: new Date(2026, 2, 10), label: { text: 'Freeze' } }];

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

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel)!;
const $$ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => [
  ...el.shadowRoot!.querySelectorAll<T>(sel),
];
const bar = (el: GantryElement, id: string) => $(el, `.gantt-bars-layer [data-task-id="${id}"]`);
const row = (el: GantryElement, id: string) => $(el, `.gantt-tl-row[data-task-id="${id}"]`);
const live = (el: GantryElement) => $(el, '.gantt-sr-live').textContent;

/** Stand-in for `ElementInternals` (happy-dom has none): ARIA properties and custom states. */
interface FakeInternals {
  role: string | null;
  ariaLabel: string | null;
  ariaBusy: string | null;
  states: Set<string>;
}

function withInternals<T>(internals: FakeInternals, fn: () => T): T {
  Object.defineProperty(GantryElement.prototype, 'attachInternals', { configurable: true, value: () => internals });
  try {
    return fn();
  } finally {
    Reflect.deleteProperty(GantryElement.prototype, 'attachInternals');
  }
}

describe('<gantry-element> Phase 9 scaffold', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('public surface', () => {
    it('appends loading and errorMessage to the property table, and retry to the events', () => {
      // Phase 10 appends syncGroup after them
      expect(GANTRY_PROPERTIES.slice(12, 14)).toEqual(['loading', 'errorMessage']);
      expect(GANTRY_EVENTS.retry).toBe('onRetry');
      expect(typeof GantryElement.prototype.fitToScreen).toBe('function');
    });

    it('drives the chart state through loading and errorMessage (properties and attributes)', () => {
      el = mount();
      const state = () => getEngine(el).graph.chartState();
      expect(state()).toMatchObject({ kind: 'empty', busy: false, message: 'No tasks to show' });

      el.loading = true;
      expect(state()).toMatchObject({ kind: 'loading', busy: true });
      el.errorMessage = 'Server unreachable';
      expect(state()).toMatchObject({ kind: 'error', title: 'Couldn’t show the chart', retry: 'event' });
      el.errorMessage = '   '; // blank: no error
      expect(state().kind).toBe('loading');
      el.errorMessage = undefined;
      expect(el.errorMessage).toBeNull();

      el.tasks = plan(2);
      expect(state()).toMatchObject({ kind: 'ready', busy: true, footer: false }); // loading over rows
      el.loading = false;
      expect(state()).toMatchObject({ kind: 'ready', busy: false });

      el.setAttribute('error-message', 'Offline');
      expect(el.errorMessage).toBe('Offline');
      expect(state().message).toBe('Offline');
      el.removeAttribute('error-message');
      expect(state().kind).toBe('ready');
      el.setAttribute('loading', '');
      expect(el.loading).toBe(true);
      el.setAttribute('loading', 'false');
      expect(el.loading).toBe(false);
    });

    it('recomputes the chart state only when its inputs change, and keeps it while rows stay', () => {
      el = mount({ tasks: plan(3) });
      const { graph, runs } = getEngine(el);
      const before = graph.chartState();
      el.tasks = plan(4);
      expect(graph.chartState()).toBe(before);
      const n = runs['chartState'];
      el.setSelectedTasks(['t1']);
      graph.chartState();
      expect(runs['chartState']).toBe(n);
    });

    it('dispatches retry as a bubbling, composed CustomEvent through ctx.emit', () => {
      el = mount();
      const seen: unknown[] = [];
      document.body.addEventListener('retry', e => seen.push((e as CustomEvent).detail));
      getEngine(el).ctx.emit('retry', { source: 'error' });
      expect(seen).toEqual([{ source: 'error' }]);
    });

    it('sets the loading custom state for the property as for a loading data source', () => {
      const internals: FakeInternals = { role: null, ariaLabel: null, ariaBusy: null, states: new Set() };
      el = withInternals(internals, () => create({ tasks: plan(2) }));
      document.body.appendChild(el);
      flush(el);
      expect(internals.states.has('loading')).toBe(false);
      el.loading = true;
      expect(internals.states.has('loading')).toBe(true);
      el.loading = false;
      expect(internals.states.has('loading')).toBe(false);
    });
  });

  describe('aria-busy', () => {
    it('goes through ElementInternals, from chartState.busy, painted with the host region', () => {
      const internals: FakeInternals = { role: null, ariaLabel: null, ariaBusy: null, states: new Set() };
      el = withInternals(internals, () => create());
      el.loading = true;
      document.body.appendChild(el);
      flush(el);
      expect(internals.ariaBusy).toBe('true');
      expect(el.hasAttribute('aria-busy')).toBe(false);
      el.loading = false;
      flush(el);
      expect(internals.ariaBusy).toBeNull();
    });

    it('falls back to a host attribute, written only once connected', () => {
      el = create({ loading: true });
      expect(el.hasAttribute('aria-busy')).toBe(false);
      document.body.appendChild(el);
      flush(el);
      expect(el.getAttribute('aria-busy')).toBe('true');
      el.tasks = plan(1);
      flush(el);
      expect(el.getAttribute('aria-busy')).toBe('true'); // loading over rows: still busy
      el.loading = false;
      flush(el);
      expect(el.hasAttribute('aria-busy')).toBe(false);
    });
  });

  describe('fitToScreen()', () => {
    it('zooms to the finest level that fits, scrolls to the first task after the paint, and announces it', () => {
      vi.useFakeTimers();
      el = mount({ tasks: plan(12), options: { viewMode: 'Hour', initialScroll: false } });
      const { graph, inputs } = getEngine(el);
      inputs.canvasW.set(900);
      flush(el);
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      const expected = fitZoomLevel({
        levels: graph.config().zoomLevels,
        extent: graph.timeline().extent,
        viewportWidth: 900,
      });
      expect(expected).not.toBeNull();
      expect(expected).not.toBe('Hour');
      const changes: string[] = [];
      el.addEventListener('view-mode-change', e => changes.push(e.detail.viewMode));

      el.fitToScreen();
      expect(el.viewMode).toBe(expected);
      expect(changes).toEqual([expected]);
      flush(el);
      // Scrolled in the coordinates of the fitted level (happy-dom lays nothing out: clientWidth 0)
      const tl = graph.timeline();
      const left = fitScrollLeft(tl, 0)!;
      expect(inputs.scrollLeft()).toBe(Math.min(Math.max(0, left), Math.max(0, tl.totalWidth - 900)));
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      expect(live(el)).toBe(`Zoom: ${expected}`);

      // Already fitted: the level stays, the fit is announced again
      el.fitToScreen();
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      expect(el.viewMode).toBe(expected);
      expect(live(el)).toBe(`Zoom: ${expected}${REPEAT_MARK}`);
    });

    it('does nothing without tasks or before the viewport is measured', () => {
      el = mount({ options: { viewMode: 'Day' } });
      getEngine(el).inputs.canvasW.set(900);
      el.fitToScreen();
      expect(el.viewMode).toBe('Day');
      el.tasks = plan(3);
      getEngine(el).inputs.canvasW.set(0);
      el.fitToScreen();
      expect(el.viewMode).toBe('Day');
    });
  });

  describe('static ARIA', () => {
    it('makes the timeline svg a listbox of the bars, named and multi-selectable per the options', () => {
      el = mount({ tasks: plan(3) });
      const svg = $(el, '.gantry-canvas-container > svg');
      expect(svg.getAttribute('role')).toBe('listbox');
      expect(svg.getAttribute('aria-orientation')).toBe('vertical');
      expect(svg.getAttribute('aria-label')).toBe('Task bars');
      expect(svg.getAttribute('aria-multiselectable')).toBe('true');
      el.options = { multiSelect: false, labels: { ariaBars: 'Barre' } };
      flush(el);
      expect(svg.getAttribute('aria-multiselectable')).toBe('false');
      expect(svg.getAttribute('aria-label')).toBe('Barre');
      // Kept up to date in the table view too
      el.setView('table');
      flush(el);
      el.options = { labels: { ariaBars: 'Balken' } };
      flush(el);
      expect(svg.getAttribute('aria-label')).toBe('Balken');
    });

    it('gives every bar the option role, selection, role description and its place in its set', () => {
      el = mount({ tasks: tree() });
      const ids = ['g', 'a', 'b', 'm', 'r'];
      for (const id of ids) expect(bar(el, id).getAttribute('role'), id).toBe('option');
      expect(bar(el, 'g').getAttribute('aria-roledescription')).toBe('summary bar');
      expect(bar(el, 'a').getAttribute('aria-roledescription')).toBe('task bar');
      expect(bar(el, 'm').getAttribute('aria-roledescription')).toBe('milestone');
      // A flat listbox (O1): the place among the visible rows g, a, b, r, m, of all 5
      const rows = getEngine(el).graph.visibleRows();
      for (const r of rows) {
        expect(bar(el, r.task.id).getAttribute('aria-posinset'), r.task.id).toBe(String(r.visibleIndex + 1));
        expect(bar(el, r.task.id).getAttribute('aria-setsize'), r.task.id).toBe('5');
      }
      expect(bar(el, 'a').getAttribute('aria-selected')).toBe('false');
      el.setSelectedTasks(['a']);
      flush(el);
      expect(bar(el, 'a').getAttribute('aria-selected')).toBe('true');
      expect(bar(el, 'b').getAttribute('aria-selected')).toBe('false');
      expect(bar(el, 'a').getAttribute('aria-label')).toContain('A');
    });

    it('stamps the same ARIA on custom bars', () => {
      el = mount({
        tasks: tree(),
        renderBar: ctx => {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.setAttribute('class', 'custom');
          if (ctx.row.task.id === 'zz') return null;
          return g;
        },
      });
      const custom = bar(el, 'b');
      expect(custom.getAttribute('class')).toContain('custom');
      expect(custom.getAttribute('role')).toBe('option');
      expect(custom.getAttribute('aria-roledescription')).toBe('task bar');
      expect(custom.getAttribute('aria-posinset')).toBe('3');
      expect(custom.getAttribute('aria-selected')).toBe('false');
    });

    it('gives the treegrid aria-colindex on header cells and cells, and posinset / setsize on rows', () => {
      el = mount({ tasks: tree() });
      const heads = $$(el, '.gantt-tl-col-header');
      expect(heads.length).toBeGreaterThan(1);
      heads.forEach((h, i) => expect(h.getAttribute('aria-colindex')).toBe(String(i + 1)));
      for (const r of $$(el, '.gantt-tl-row')) {
        const cells = [...r.querySelectorAll('.gantt-tl-cell')];
        cells.forEach((c, i) => expect(c.getAttribute('aria-colindex')).toBe(String(i + 1)));
      }
      for (const r of getEngine(el).graph.visibleRows()) {
        expect(row(el, r.task.id).getAttribute('aria-posinset'), r.task.id).toBe(String(r.posInSet));
        expect(row(el, r.task.id).getAttribute('aria-setsize'), r.task.id).toBe(String(r.setSize));
      }
      // The roots g, r, m (by start date) and the children a, b
      expect(row(el, 'g').getAttribute('aria-posinset')).toBe('1');
      expect(row(el, 'g').getAttribute('aria-setsize')).toBe('3');
      expect(row(el, 'b').getAttribute('aria-posinset')).toBe('2');
      expect(row(el, 'b').getAttribute('aria-setsize')).toBe('2');
      expect(row(el, 'm').getAttribute('aria-posinset')).toBe('3');
      // A hidden column renumbers the columns after it
      const keys = getEngine(el)
        .graph.tlColumns()
        .map(c => c.key);
      el.setColumnVisible(keys[1], false);
      flush(el);
      const after = $$(el, '.gantt-tl-col-header');
      expect(after).toHaveLength(keys.length - 1);
      after.forEach((h, i) => expect(h.getAttribute('aria-colindex')).toBe(String(i + 1)));
      const cells = [...row(el, 'a').querySelectorAll('.gantt-tl-cell')];
      cells.forEach((c, i) => expect(c.getAttribute('aria-colindex')).toBe(String(i + 1)));
    });
  });

  describe('header height and the marker lane', () => {
    it('adds the 18 px lane to the header when an annotation has a label (markers.lane auto)', () => {
      el = mount({ tasks: plan(3) });
      const { graph } = getEngine(el);
      const tiers = graph.timeline().headerHeight;
      expect(graph.headerHeight()).toBe(tiers);
      expect(graph.markerLane().height).toBe(0);

      el.annotations = [{ x1: new Date(2026, 2, 10) }]; // no label: no lane
      flush(el);
      expect(graph.headerHeight()).toBe(tiers);

      el.annotations = LABELLED;
      flush(el);
      expect(graph.headerHeight()).toBe(tiers + MARKER_LANE_HEIGHT);
      expect(graph.markerLane()).toMatchObject({ height: MARKER_LANE_HEIGHT, y: tiers });
      expect(graph.markerLane().markers.map(m => m.key)).toContain('annotation:0');
      // Everything that sizes the header follows: task-list header, vertical window, CSS variables
      expect($(el, '.gantt-tl-col-headers').style.height).toBe(`${tiers + MARKER_LANE_HEIGHT}px`);
      expect(getEngine(el).inputs.headerH()).toBe(tiers + MARKER_LANE_HEIGHT);
      expect($(el, '.gantry-wrapper').style.getPropertyValue('--gantry-header-h')).toBe(
        `${tiers + MARKER_LANE_HEIGHT}px`,
      );

      el.options = { markers: { lane: false } };
      flush(el);
      expect(graph.headerHeight()).toBe(tiers);
      el.options = { markers: { lane: true } };
      el.annotations = [];
      flush(el);
      expect(graph.headerHeight()).toBe(tiers + MARKER_LANE_HEIGHT);
    });

    it('keeps the clock out of the header height', () => {
      el = mount({ tasks: plan(3), annotations: LABELLED });
      const { graph, inputs, runs } = getEngine(el);
      graph.headerHeight();
      const n = runs['headerHeight'];
      const lane = runs['laneHeight'];
      inputs.nowTick.set(new Date(inputs.nowTick.peek().getTime() + 60_000));
      flush(el);
      graph.headerHeight();
      expect(runs['headerHeight']).toBe(n);
      expect(runs['laneHeight']).toBe(lane);
    });

    it('pads the panes below the header: the timeline by core timelineScrollPadding (a bar with its whole ring)', () => {
      el = mount({ tasks: plan(3), annotations: LABELLED });
      const h = getEngine(el).graph.headerHeight();
      const pad = timelineScrollPadding(h);
      expect(pad.top).toBe(h + FOCUS_RING_MARGIN);
      const viewport = $(el, '.gantry-canvas-viewport');
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        expect(viewport.style.getPropertyValue(`scroll-padding-${side}`)).toBe(`${pad[side]}px`);
      }
      expect($(el, '.gantry-panel').style.getPropertyValue('scroll-padding-top')).toBe(`${h}px`);
    });

    it('sets its own line height (the header layer sizes .g-header, markers.test.ts)', () => {
      expect(BASE_CSS).not.toContain('min-height: var(--gantry-header-h');
      expect(BASE_CSS).toMatch(/:host \{[^}]*line-height: normal;/);
    });
  });

  describe('regions and skeleton', () => {
    it('flushes readout after the overlay and states after the task list', () => {
      expect(REGIONS.indexOf('readout')).toBe(REGIONS.indexOf('overlay') + 1);
      expect(REGIONS.indexOf('states')).toBe(REGIONS.indexOf('tasklist') + 1);
      el = mount({ tasks: plan(2) });
      const { regionRuns } = getEngine(el);
      expect(regionRuns['readout']).toBe(1);
      expect(regionRuns['states']).toBe(1);
    });

    it('builds the optional nodes detached (D27) and the hatch from core HATCH_PATTERN', () => {
      el = mount({ tasks: plan(2) });
      const { dom } = getEngine(el);
      expect(dom.readout.className).toBe('gantt-drag-readout');
      expect(dom.readout.getAttribute('aria-hidden')).toBe('true');
      expect(dom.stateBox.className).toBe('gantt-state');
      expect(dom.stateBox.getAttribute('part')).toBe('state');
      expect(dom.barOverlay.getAttribute('class')).toBe('gantt-bar-overlay');
      expect(dom.barOverlay.getAttribute('aria-hidden')).toBe('true');
      expect(dom.barOverlay.getAttribute('pointer-events')).toBe('none');
      // The legend too while there is nothing to show (showLegend is off): step 4.3 attaches it per legendPlacement
      for (const node of [dom.readout, dom.stateBox, dom.barOverlay, dom.legend]) expect(node.isConnected).toBe(false);
      expect(dom.legend.getAttribute('part')).toBe('legend');

      const pattern = dom.defs.querySelector('pattern')!;
      expect(pattern.getAttribute('width')).toBe(String(HATCH_PATTERN.size));
      expect(pattern.getAttribute('height')).toBe(String(HATCH_PATTERN.size));
      expect(pattern.getAttribute('patternTransform')).toBe(`rotate(${HATCH_PATTERN.rotate})`);
      const line = pattern.querySelector('line')!;
      expect(line.getAttribute('y2')).toBe(String(HATCH_PATTERN.size));
      expect(line.getAttribute('stroke-width')).toBe(String(HATCH_PATTERN.strokeWidth));
      expect(line.getAttribute('stroke-opacity')).toBe(String(HATCH_PATTERN.strokeOpacity));
    });
  });

  describe('task-list footer', () => {
    it('shows only while chartState.footer: not while the first page loads', async () => {
      const fetcher = vi.fn(() => new Promise<GanttTask[]>(() => {}));
      el = mount();
      el.dataSource = { fetcher, pageSize: 5 };
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
      flush(el);
      expect(getEngine(el).graph.chartState()).toMatchObject({ kind: 'loading', footer: false });
      expect($(el, '.gantt-tl-load-more')).toBeNull();
    });

    it('offers "Load more" for a data source that waits for its first page (initialPage)', () => {
      el = mount();
      el.dataSource = { fetcher: () => Promise.resolve(plan(3)), pageSize: 3, initialPage: 0 };
      flush(el);
      expect(getEngine(el).graph.chartState()).toMatchObject({ kind: 'ready', footer: true });
      expect($(el, '.gantt-load-more-btn').textContent).toBe('Load more');
    });
  });

  describe('tooltip adapter API', () => {
    const rowOf = (id: string): GanttFlatRow =>
      getEngine(el)
        .graph.allRows.peek()
        .find(r => r.task.id === id)!;
    const tip = () => $(el, '.gantt-tooltip');

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      el = mount({ tasks: tree() });
    });

    it('hover opens after the show delay, anchored; unhover closes after the hide delay', () => {
      const t = getEngine(el).layers.tooltip;
      t.hover(rowOf('a'), bar(el, 'a'), 50);
      expect(tip().hidden).toBe(true);
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
      expect(tip().hidden).toBe(false);
      expect(tip().querySelector('.gantt-tooltip-title')!.textContent).toBe('A');
      expect(tip().style.getPropertyValue('translate')).toMatch(/^\d+px \d+px$/);
      // Another bar while open: switches at once
      t.hover(rowOf('b'), bar(el, 'b'), 80);
      expect(tip().querySelector('.gantt-tooltip-title')!.textContent).toBe('B');
      t.unhover();
      vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY - 1);
      expect(tip().hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(tip().hidden).toBe(true);
    });

    it('focus opens at once and blur closes at once, unless the pointer rests on the tooltip', () => {
      const t = getEngine(el).layers.tooltip;
      t.focus(rowOf('m'), bar(el, 'm'));
      expect(tip().hidden).toBe(false);
      t.blur();
      expect(tip().hidden).toBe(true);
      t.focus(rowOf('m'), bar(el, 'm'));
      t.enterTooltip();
      t.blur();
      t.unhover();
      vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY * 4);
      expect(tip().hidden).toBe(false);
      t.leaveTooltip();
      vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY);
      expect(tip().hidden).toBe(true);
    });

    it('tap toggles; dismiss closes now and says whether there was something to close', () => {
      const t = getEngine(el).layers.tooltip;
      t.tap(rowOf('r'), bar(el, 'r'));
      expect(tip().hidden).toBe(false);
      t.tap(rowOf('r'), bar(el, 'r'));
      expect(tip().hidden).toBe(true);
      expect(t.dismiss()).toBe(false);
      t.hover(rowOf('r'), bar(el, 'r'), 10); // pending: dismiss cancels it
      expect(t.dismiss()).toBe(true);
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
      expect(tip().hidden).toBe(true);
      t.tap(rowOf('a'), bar(el, 'a'));
      expect(t.dismiss()).toBe(true);
      expect(tip().hidden).toBe(true);
    });
  });

  describe('tasks and a data source', () => {
    it('applies the tasks assigned while a data source owned the list once it is cleared', async () => {
      el = mount({ tasks: plan(2) });
      el.dataSource = { fetcher: () => Promise.resolve([{ ...plan(1)[0], id: 'ds' }]), pageSize: 5 };
      await vi.waitFor(() => expect(el.tasks.map(t => t.id)).toEqual(['ds']));
      el.tasks = plan(3); // ignored while the data source is set
      expect(el.tasks.map(t => t.id)).toEqual(['ds']);
      el.dataSource = null;
      expect(el.tasks.map(t => t.id)).toEqual(['t0', 't1', 't2']);
      // Without a pending assignment, the loaded items stay
      el.dataSource = { fetcher: () => Promise.resolve([{ ...plan(1)[0], id: 'ds2' }]), pageSize: 5 };
      await vi.waitFor(() => expect(el.tasks.map(t => t.id)).toEqual(['ds2']));
      el.dataSource = undefined;
      expect(el.tasks.map(t => t.id)).toEqual(['ds2']);
    });
  });
});

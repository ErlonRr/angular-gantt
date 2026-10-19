// Phase 10 step 3.1 — the Web Component scaffold: the `syncGroup` property, the new inputs, the
// rollup / style / natural-range / layout-variable nodes, the root attributes of the wrapper, the
// hover region and the sync / responsive hooks (wired, inert until wave 4), and the collapse seed
// of `groupBar.collapsed`. The default output stays the 1.x one.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeBarVisual,
  createGanttSyncGroup,
  timelineRange,
  type GanttFlatRow,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { REGIONS } from '../engine/render';
import { DEFAULTS, OBSERVED_ATTRIBUTES } from '../engine/props';
import { GANTRY_PROPERTIES } from '../types';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();
const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);

/** A parent with two children (progress 0 / 100, 7 and 14 days), a second parent and a root task. */
function tree(): GanttTask[] {
  return [
    { id: 'p', name: 'Parent', start: new Date(2026, 2, 1), end: new Date(2026, 2, 3), progress: 5 },
    { id: 'a', name: 'A', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9), parentId: 'p', progress: 0 },
    { id: 'b', name: 'B', start: new Date(2026, 2, 9), end: new Date(2026, 2, 23), parentId: 'p', progress: 100 },
    { id: 'q', name: 'Other', start: new Date(2026, 2, 4), end: new Date(2026, 2, 6) },
    { id: 'c', name: 'C', start: new Date(2026, 2, 4), end: new Date(2026, 2, 6), parentId: 'q', progress: 50 },
    { id: 'r', name: 'Root', start: new Date(2026, 2, 3), end: new Date(2026, 2, 6), progress: 10 },
  ];
}

function create(props: Partial<GantryElement> = {}): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  // Assigned in key order: `{ tasks, options }` is the wrappers' order
  Object.assign(el, props);
  return el;
}

function mount(props: Partial<GantryElement> = {}): GantryElement {
  const el = create(props);
  document.body.appendChild(el);
  flush(el);
  return el;
}

/** The value of `name` in the element's `:host` theme sheet. */
function hostVar(el: GantryElement, name: string): string {
  for (const sheet of [...el.shadowRoot!.adoptedStyleSheets].reverse()) {
    const rule = sheet.cssRules[0] as CSSStyleRule | undefined;
    if (rule?.selectorText === ':host') return rule.style.getPropertyValue(name).trim();
  }
  throw new Error('no theme sheet adopted');
}

const rowOf = (el: GantryElement, id: string): GanttFlatRow =>
  getEngine(el)
    .graph.allRows.peek()
    .find(r => r.task.id === id)!;

describe('<gantry-element> Phase 10 scaffold', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
  });

  describe('syncGroup property', () => {
    it('is appended to the property table without an attribute, default null', () => {
      expect(GANTRY_PROPERTIES.at(-1)).toBe('syncGroup');
      expect(DEFAULTS.syncGroup).toBeNull();
      expect(OBSERVED_ATTRIBUTES).not.toContain('sync-group');
      const descriptor = Object.getOwnPropertyDescriptor(GantryElement.prototype, 'syncGroup');
      expect(typeof descriptor?.get).toBe('function');
      expect(typeof descriptor?.set).toBe('function');
    });

    it('keeps the group by identity, and `undefined` or `null` restores null', () => {
      el = mount({ tasks: tree() });
      const group = createGanttSyncGroup();
      expect(el.syncGroup).toBeNull();
      el.syncGroup = group;
      expect(el.syncGroup).toBe(group);
      expect(getEngine(el).inputs.syncGroup.peek()).toBe(group);
      el.syncGroup = undefined;
      expect(el.syncGroup).toBeNull();
      el.syncGroup = group;
      el.syncGroup = null;
      expect(el.syncGroup).toBeNull();
    });
  });

  describe('sync hooks', () => {
    it('connect(group) when connected and when the group changes, disconnect() when disconnected', () => {
      const group = createGanttSyncGroup();
      const other = createGanttSyncGroup();
      el = create({ tasks: tree(), syncGroup: group });
      const { sync } = getEngine(el).layers;
      const connect = vi.spyOn(sync, 'connect');
      const disconnect = vi.spyOn(sync, 'disconnect');
      document.body.appendChild(el);
      expect(connect).toHaveBeenCalledTimes(1);
      expect(connect).toHaveBeenLastCalledWith(group);
      el.syncGroup = other;
      expect(connect).toHaveBeenLastCalledWith(other);
      el.syncGroup = null;
      expect(connect).toHaveBeenLastCalledWith(null);
      expect(connect).toHaveBeenCalledTimes(3);
      el.remove();
      expect(disconnect).toHaveBeenCalledTimes(1);
      // Disconnected: a new group waits for the next connection
      el.syncGroup = group;
      expect(connect).toHaveBeenCalledTimes(3);
      document.body.appendChild(el);
      expect(connect).toHaveBeenLastCalledWith(group);
      expect(connect).toHaveBeenCalledTimes(4);
    });

    it('setState reports the panel width; the splitter reaches the same hook through ctx.sync', () => {
      el = mount({ tasks: tree() });
      const { layers, ctx } = getEngine(el);
      const report = vi.spyOn(layers.sync, 'reportPanel');
      el.setState({ panelWidth: 320 }, false);
      expect(report).toHaveBeenLastCalledWith(320);
      el.setState({ viewMode: 'Week' }, false);
      expect(report).toHaveBeenCalledTimes(1);
      ctx.sync.reportPanel(280);
      expect(report).toHaveBeenLastCalledWith(280);
    });

    it('a lone member: same timeline as a chart without a group; it shares its own range', () => {
      const group = createGanttSyncGroup();
      el = mount({ tasks: tree(), syncGroup: group });
      const solo = mount({ tasks: tree() });
      const tl = getEngine(el).graph.timeline.peek();
      const own = getEngine(solo).graph.timeline.peek();
      expect([tl.start, tl.end, tl.totalWidth]).toEqual([own.start, own.end, own.totalWidth]);
      expect(tl.sharedExtent).toEqual(own.extent);
      expect(getEngine(el).inputs.shared.peek()).toEqual({ range: own.range, extent: own.extent });
      solo.remove();
    });
  });

  describe('shared range and natural range', () => {
    it('the shared input widens the timeline; the natural range stays the chart own', () => {
      el = mount({ tasks: tree(), options: { initialScroll: false } });
      const { inputs: I, graph: G, runs } = getEngine(el);
      const own = G.timeline.peek();
      const natural = G.naturalRange.peek();
      expect(natural).toEqual(timelineRange({ tasks: G.tasks.peek(), config: G.config.peek(), now: G.nowDay.peek() }));
      expect(own.range).toEqual(natural.range);

      const extent = { start: new Date(2025, 10, 3), end: new Date(2026, 5, 30) };
      I.shared.set({ range: extent, extent });
      const shared = G.timeline.peek();
      expect(shared.start.getTime()).toBeLessThanOrEqual(extent.start.getTime());
      expect(shared.sharedExtent?.start).toEqual(extent.start);
      expect(G.naturalRange.peek()).toBe(natural);

      // Equal dates in new objects: no notification, no new timeline
      const timelineRuns = runs['timeline'];
      I.shared.set({ range: { ...extent }, extent: { start: new Date(extent.start), end: new Date(extent.end) } });
      expect(G.timeline.peek()).toBe(shared);
      expect(runs['timeline']).toBe(timelineRuns);
    });

    it('fitToScreen fits the shared extent inside a group', () => {
      const fitLevel = (shared: boolean): string => {
        const chart = mount({ tasks: tree(), options: { initialScroll: false } });
        const { inputs: I } = getEngine(chart);
        I.canvasW.set(800);
        if (shared) {
          const extent = { start: new Date(2024, 0, 1), end: new Date(2027, 11, 31) };
          I.shared.set({ range: extent, extent });
        }
        chart.fitToScreen();
        const level = chart.viewMode;
        chart.remove();
        return level;
      };
      const solo = fitLevel(false);
      const grouped = fitLevel(true);
      expect(grouped).not.toBe(solo);
      const levels = getEngine(mount())
        .graph.config.peek()
        .zoomLevels.map(l => l.name);
      // Three years need a coarser level than a few weeks
      expect(levels.indexOf(grouped)).toBeGreaterThan(levels.indexOf(solo));
    });
  });

  describe('rollup', () => {
    const rollupOptions: GanttOptions = {
      rollup: true,
      initialScroll: false,
      panel: { columns: ['name', 'start', 'end', 'progress'] },
    };

    it('rolled-up parent rows reach the rows, the task list and the bars; the tasks stay raw', () => {
      el = mount({ tasks: tree(), options: rollupOptions });
      const { graph: G } = getEngine(el);
      const parent = rowOf(el, 'p');
      // Duration-weighted: (7 days × 0 + 14 days × 100) / 21 = 67 %
      expect(parent.task.progress).toBe(67);
      expect(parent.task.start).toEqual(new Date(2026, 2, 2));
      expect(parent.task.end).toEqual(new Date(2026, 2, 23));
      expect(parent.task.draggable).toBe(false);
      expect(G.tasks.peek().find(t => t.id === 'p')?.progress).toBe(5);
      expect(el.tasks.find(t => t.id === 'p')?.progress).toBe(5);
      expect(G.rollups.peek().get('p')?.progress).toBe(67);

      // The task-list column shows the rolled-up value
      const cell = $(el, '[data-focus-key="cell:p:progress"]');
      expect(cell?.textContent).toContain('67%');

      // The bar spans the children and has no resize handles (not draggable)
      const v = el.getBarVisual('p')!;
      const tl = G.timeline.peek();
      expect(v.x).toBeCloseTo(tl.toX(new Date(2026, 2, 2)), 5);
      expect(v.handles).toBeNull();

      // Selection and events carry the raw task
      el.setSelectedTasks(['p']);
      expect(el.getSelectedTasks()[0]?.progress).toBe(5);
      const clicks: GanttFlatRow[] = [];
      el.addEventListener('row-click', e => clicks.push(e.detail));
      el.addEventListener('row-dblclick', e => clicks.push(e.detail));
      getEngine(el).ctx.rowClick(parent, new MouseEvent('click'));
      getEngine(el).ctx.emit('row-dblclick', parent);
      expect(clicks).toHaveLength(2);
      for (const row of clicks) {
        expect(row.task).toBe(G.tasks.peek().find(t => t.id === 'p'));
        expect(row.task.progress).toBe(5);
        expect(row.level).toBe(parent.level);
      }
    });

    it('without rollup the rows carry the raw tasks and nothing is computed per day', () => {
      el = mount({ tasks: tree(), options: { initialScroll: false } });
      const { graph: G, inputs: I, runs } = getEngine(el);
      expect(rowOf(el, 'p').task).toBe(G.tasks.peek()[0]);
      expect(G.rollups.peek().size).toBe(0);
      const rollupRuns = runs['rollups'];
      I.nowTick.set(new Date(2030, 0, 1));
      flush(el);
      expect(runs['rollups']).toBe(rollupRuns);
    });

    it('the rollups follow the day, not the minute clock', () => {
      el = mount({ tasks: tree(), options: rollupOptions });
      const { inputs: I, runs } = getEngine(el);
      const day = new Date(2026, 2, 10, 9, 0);
      I.nowTick.set(day);
      flush(el);
      const rollupRuns = runs['rollups'];
      I.nowTick.set(new Date(2026, 2, 10, 9, 1));
      flush(el);
      expect(runs['rollups']).toBe(rollupRuns);
      I.nowTick.set(new Date(2026, 2, 11, 9, 0));
      flush(el);
      expect(runs['rollups']).toBe(rollupRuns + 1);
    });

    it('sorts a parent by its rolled-up values', () => {
      el = mount({ tasks: tree(), options: rollupOptions });
      getEngine(el).inputs.sort.set({ key: 'progress', dir: 'desc' });
      const roots = getEngine(el)
        .graph.visibleRows.peek()
        .filter(r => r.level === 0)
        .map(r => r.task.id);
      // p rolls up to 67 %, q to 50 %, r keeps 10 %
      expect(roots).toEqual(['p', 'q', 'r']);
    });

    it('a collapsed parent gets its children as segments with rollup.segments, in their style colours', () => {
      el = mount({
        tasks: tree().map(t => (t.id === 'b' ? { ...t, style: { color: '#AA0000' } } : t)),
        options: { ...rollupOptions, rollup: { segments: true }, groupBar: { collapsed: true } },
      });
      const v = el.getBarVisual('p')!;
      expect(v.segments).toHaveLength(2);
      expect(v.segments?.[1]?.paint).toBe('#AA0000');
      expect(el.getBarVisual('r')?.segments).toBeNull();
      // Expanded: no segments
      el.expandAll();
      flush(el);
      expect(el.getBarVisual('p')?.segments).toBeNull();
    });
  });

  describe('row styles', () => {
    it('the resolver node applies options.styles; the visuals use it', () => {
      el = mount({
        tasks: tree(),
        options: { initialScroll: false, styles: { parent: { color: '#123456', className: 'is-parent' } } },
      });
      const { graph: G } = getEngine(el);
      expect(G.rowStyle.peek()(rowOf(el, 'p')).color).toBe('#123456');
      expect(G.rowStyle.peek()(rowOf(el, 'r')).color).toBeUndefined();
      const v = el.getBarVisual('p')!;
      expect(v.paint.body).toBe('#123456');
      expect(v.className).toBe('is-parent');
    });

    it('without styles a visual is the 1.x one (computeBarVisual without a style)', () => {
      el = mount({ tasks: tree(), options: { initialScroll: false } });
      const { graph: G } = getEngine(el);
      const geo = G.geoById.peek().get('a')!;
      const { fontPx, barTextColor } = G.metrics.peek();
      const plain = computeBarVisual({
        geo,
        cfg: G.config.peek(),
        toX: G.timeline.peek().toX,
        fontPx,
        barTextColor,
        isCritical: false,
        resizable: true,
      });
      expect(el.getBarVisual('a')).toEqual(plain);
    });

    it('a zoom keeps the resolver (it reads the style options by value)', () => {
      el = mount({ tasks: tree(), options: { initialScroll: false, styles: { parent: { color: '#123456' } } } });
      const { graph: G } = getEngine(el);
      const resolver = G.rowStyle.peek();
      el.setViewMode('Week');
      flush(el);
      expect(G.rowStyle.peek()).toBe(resolver);
    });
  });

  describe('layout variables and root attributes', () => {
    it('writes --gantt-row-height and --gantt-bar-height into the host theme sheet', () => {
      el = mount({ tasks: tree() });
      expect(hostVar(el, '--gantt-row-height')).toBe('36px');
      expect(hostVar(el, '--gantt-bar-height')).toBe('21.6px');
      el.options = { density: 'compact' };
      flush(el);
      expect(hostVar(el, '--gantt-row-height')).toBe('28px');
      el.options = { rowHeight: 50, bar: { height: 20 } };
      flush(el);
      expect(hostVar(el, '--gantt-row-height')).toBe('50px');
      expect(hostVar(el, '--gantt-bar-height')).toBe('20px');
      // Never on the host's inline style
      expect(el.getAttribute('style') ?? '').not.toContain('--gantt-row-height');
    });

    it('marks the wrapper with data-density, data-narrow and --gantry-control-size', () => {
      el = mount({ tasks: tree() });
      const wrapper = $(el, '.gantry-wrapper')!;
      expect(wrapper.getAttribute('data-density')).toBe('normal');
      expect(wrapper.hasAttribute('data-narrow')).toBe(false);
      expect(wrapper.style.getPropertyValue('--gantry-control-size')).toBe('32px');
      el.options = { density: 'comfortable' };
      flush(el);
      expect(wrapper.getAttribute('data-density')).toBe('comfortable');
      expect(wrapper.style.getPropertyValue('--gantry-control-size')).toBe('36px');
      getEngine(el).inputs.narrow.set(true);
      flush(el);
      expect(wrapper.getAttribute('data-narrow')).toBe('');
      getEngine(el).inputs.narrow.set(false);
      flush(el);
      expect(wrapper.hasAttribute('data-narrow')).toBe(false);
    });
  });

  describe('hover region and responsive hooks', () => {
    it('adds the hover region right after rows; the hover rect is detached until a row is hovered', () => {
      expect(REGIONS.indexOf('hover')).toBe(REGIONS.indexOf('rows') + 1);
      el = mount({ tasks: tree() });
      const { dom, inputs: I, regionRuns } = getEngine(el);
      expect(regionRuns['hover']).toBe(1);
      expect(dom.rowHover.getAttribute('class')).toBe('gantt-row-hover');
      expect(dom.rowHover.parentNode).toBeNull();
      expect($(el, '.gantt-row-hover')).toBeNull();
      // The menu is not the hover region's business
      I.menuOpen.set(true);
      flush(el);
      expect(regionRuns['hover']).toBe(1);
      // A hovered row attaches it (step 4.1, hover.test.ts)
      I.hoveredRowId.set('a');
      flush(el);
      expect(regionRuns['hover']).toBe(2);
      expect($(el, '.gantt-row-hover')).toBe(dom.rowHover);
    });

    it('hands the measured width to the responsive layer; setView reports a user view; getState persists its view', () => {
      el = create({ tasks: tree() });
      const { responsive } = getEngine(el).layers;
      const onWidth = vi.spyOn(responsive, 'onWidth');
      const onUserView = vi.spyOn(responsive, 'onUserView');
      document.body.appendChild(el);
      flush(el);
      expect(onWidth).toHaveBeenCalled();
      el.options = { initialScroll: false };
      expect(onWidth).toHaveBeenLastCalledWith(getEngine(el).inputs.mainW.peek());
      el.setView('chart');
      expect(onUserView).toHaveBeenLastCalledWith('chart');
      expect(el.getState().view).toBe('chart');
      // While narrow the persisted view is the wide one
      vi.spyOn(responsive, 'persistedView').mockReturnValue('split');
      expect(el.getState()).toMatchObject({ view: 'split', panelCollapsed: false });
    });
  });

  describe('groupBar.collapsed seeding', () => {
    const groups: GanttOptions = { groupBar: { collapsed: true }, initialScroll: false };
    const collapsed = (chart: GantryElement) => [...getEngine(chart).inputs.collapsedIds.peek()].sort();

    it('collapses every parent the chart has never seen, once', () => {
      el = mount({ options: groups, tasks: tree() });
      expect(collapsed(el)).toEqual(['p', 'q']);
      // The user expands one: a new array with the same ids keeps it expanded
      getEngine(el).inputs.collapsedIds.set(new Set(['q']));
      el.tasks = tree().map(t => ({ ...t }));
      expect(collapsed(el)).toEqual(['q']);
      // A new parent starts collapsed; an explicit `collapsed: false` keeps one expanded
      el.tasks = [
        ...tree(),
        { id: 'n', name: 'New', start: new Date(2026, 2, 1), end: new Date(2026, 2, 2) },
        { id: 'n1', name: 'N1', start: new Date(2026, 2, 1), end: new Date(2026, 2, 2), parentId: 'n' },
        { id: 'x', name: 'X', start: new Date(2026, 2, 1), end: new Date(2026, 2, 2), collapsed: false },
        { id: 'x1', name: 'X1', start: new Date(2026, 2, 1), end: new Date(2026, 2, 2), parentId: 'x' },
      ];
      expect(collapsed(el)).toEqual(['n', 'q']);
    });

    it('applies options set after the tasks (the wrappers order) until the first paint', () => {
      el = create({ tasks: tree(), options: groups });
      expect(collapsed(el)).toEqual(['p', 'q']);
      document.body.appendChild(el);
      flush(el);
      // Only the roots show (in start order)
      expect(
        getEngine(el)
          .graph.visibleRows.peek()
          .map(r => r.task.id),
      ).toEqual(['p', 'r', 'q']);
    });

    it('after the first paint, turning the option on collapses only new ids', () => {
      el = mount({ tasks: tree(), options: { initialScroll: false } });
      expect(collapsed(el)).toEqual([]);
      el.options = groups;
      expect(collapsed(el)).toEqual([]);
      el.tasks = [
        ...tree(),
        { id: 'n', name: 'New', start: new Date(2026, 2, 1), end: new Date(2026, 2, 2) },
        { id: 'n1', name: 'N1', start: new Date(2026, 2, 1), end: new Date(2026, 2, 2), parentId: 'n' },
      ];
      expect(collapsed(el)).toEqual(['n']);
    });

    it('re-assigning the options before the first paint does not undo an expandAll()', () => {
      el = create({ tasks: tree(), options: groups });
      el.expandAll();
      el.options = { ...groups };
      expect(collapsed(el)).toEqual([]);
    });
  });
});

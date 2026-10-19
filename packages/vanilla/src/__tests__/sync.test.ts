// Phase 10 step 4.3 — synchronised charts (`syncGroup`, core `createGanttSyncGroup`): two
// `<gantry-element>`s sharing one group union their ranges (same start, same x for a date), follow
// each other's zoom level, horizontal scroll and panel width, and never send back what they
// received (echo guard). happy-dom has no layout and fires no scroll events: each chart's viewport
// gets a width and a `scrollLeft` the "browser" clamps to the timeline, and `frame()` plays a
// browser frame (paint, then a scroll event from every viewport that moved).
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  anchoredScrollLeft,
  createGanttSyncGroup,
  DEFAULT_ZOOM_LEVELS,
  fitScrollLeft,
  fitZoomLevel,
  ViewMode,
  type GanttOptions,
  type GanttSyncGroup,
  type GanttSyncState,
  type GanttTask,
  type TimelineModel,
} from '@gantryjs/core';
import type { GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const day = (month: number, date: number, year = 2026) => new Date(year, month, date);

const EARLY: GanttTask[] = [
  { id: 'e1', name: 'E1', start: day(0, 5), end: day(0, 20) },
  { id: 'e2', name: 'E2', start: day(1, 2), end: day(1, 10) },
];
const LATE: GanttTask[] = [
  { id: 'l1', name: 'L1', start: day(4, 4), end: day(4, 22) },
  { id: 'l2', name: 'L2', start: day(6, 1), end: day(6, 15) },
];

interface ChartInit {
  tasks: GanttTask[];
  group?: GanttSyncGroup | null;
  options?: GanttOptions;
  /** Timeline viewport width (px) */
  width?: number;
}

/** Every chart of the test, in creation order (the order their scroll events fire in a frame) */
const charts: GantryElement[] = [];
/** The offset each viewport's last scroll event carried */
const announced = new WeakMap<GantryElement, number>();

/** A connected chart (not painted yet: `frame()` / `settle()` paint every chart). */
function chart({ tasks, group = null, options = {}, width = 600 }: ChartInit): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  const { dom, graph } = getEngine(el);
  Object.defineProperty(dom.viewport, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(dom.main, 'clientWidth', { configurable: true, get: () => width + 300 });
  // The browser keeps the offset inside the scroll range
  let left = 0;
  Object.defineProperty(dom.viewport, 'scrollLeft', {
    configurable: true,
    get: () => left,
    set: (v: number) => {
      left = Math.max(0, Math.min(v, graph.timeline.peek().totalWidth - width));
    },
  });
  Object.assign(el, { tasks, options: { initialScroll: false, showToday: false, ...options }, syncGroup: group });
  document.body.appendChild(el);
  charts.push(el);
  return el;
}

const viewport = (el: GantryElement) => getEngine(el).dom.viewport;
const left = (el: GantryElement) => viewport(el).scrollLeft;
const timeline = (el: GantryElement): TimelineModel => getEngine(el).graph.timeline.peek();
const panelW = (el: GantryElement) => getEngine(el).inputs.panelW.peek();

/** One browser frame: every connected chart paints, then each viewport that moved fires `scroll`. */
function frame(): void {
  for (const el of charts) if (el.isConnected) getEngine(el).flushSync();
  for (const el of charts) {
    if (!el.isConnected || left(el) === (announced.get(el) ?? 0)) continue;
    announced.set(el, left(el));
    viewport(el).dispatchEvent(new Event('scroll'));
  }
}
/** Frames until everything settled. */
function settle(): void {
  for (let i = 0; i < 8; i++) frame();
}
/** The user scrolls a chart's timeline horizontally. */
function userScroll(el: GantryElement, x: number): void {
  viewport(el).scrollLeft = x;
  settle();
}

/** A member that only listens: it receives every report the charts send (and what the group sends to all). */
function observe(group: GanttSyncGroup): Partial<GanttSyncState>[] {
  const patches: Partial<GanttSyncState>[] = [];
  group.join({ update: p => void patches.push(p) });
  patches.length = 0;
  return patches;
}
const scrolls = (patches: Partial<GanttSyncState>[]) =>
  patches.filter(p => p.scrollLeft != null).map(p => p.scrollLeft);
const levels = (patches: Partial<GanttSyncState>[]) => patches.filter(p => p.level != null).map(p => p.level);

afterEach(() => {
  for (const el of charts) el.remove();
  charts.length = 0;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('<gantry-element> sync group', () => {
  describe('range', () => {
    it('unions the ranges: every chart starts at the same date and places a date at the same x', () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group });
      const b = chart({ tasks: LATE, group, width: 400 });
      settle();
      const ta = timeline(a);
      const tb = timeline(b);
      // Each chart keeps its own natural range; the timeline covers the union
      expect(ta.range.start.getTime()).toBeLessThan(tb.range.start.getTime());
      expect(ta.start).toEqual(ta.range.start);
      expect(tb.start).toEqual(ta.start);
      expect(ta.end).toEqual(tb.range.end);
      expect(tb.end).toEqual(ta.end);
      expect(tb.totalWidth).toBe(ta.totalWidth);
      for (const d of [day(0, 5), day(3, 1), day(6, 15)]) expect(tb.toX(d)).toBe(ta.toX(d));
      expect(group.state.range).toEqual({ start: ta.range.start, end: tb.range.end });
      // The shared extent: from the first chart's first task to the second chart's last
      expect(ta.sharedExtent).toEqual({ start: ta.extent!.start, end: tb.extent!.end });
      expect(tb.sharedExtent).toEqual(ta.sharedExtent);

      // The header's first cell: same x, same label
      const firstCell = (el: GantryElement) => {
        const bottom = [...el.shadowRoot!.querySelectorAll('.g-tier')].at(-1)!;
        const cell = bottom.querySelector<HTMLElement>('.g-cell')!;
        return [cell.style.getPropertyValue('--x'), cell.textContent];
      };
      expect(firstCell(b)).toEqual(firstCell(a));
    });

    it('a chart that disconnects leaves: the range shrinks back, and it rejoins when it reconnects', () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group });
      const b = chart({ tasks: LATE, group });
      settle();
      const shared = timeline(a);
      expect(group.size).toBe(2);

      b.remove();
      settle();
      expect(group.size).toBe(1);
      const own = timeline(a);
      expect(own.end.getTime()).toBeLessThan(shared.end.getTime());
      expect(own.end).toEqual(own.range.end);
      expect(own.sharedExtent).toEqual(own.extent);
      expect(getEngine(b).inputs.shared.peek()).toBeNull();

      document.body.appendChild(b);
      settle();
      expect(group.size).toBe(2);
      expect(timeline(a).end).toEqual(shared.end);
      expect(timeline(b).start).toEqual(timeline(a).start);
    });

    it('{ range: false }: each chart keeps its own range', () => {
      const group = createGanttSyncGroup({ range: false });
      const a = chart({ tasks: EARLY, group });
      const b = chart({ tasks: LATE, group });
      settle();
      expect(timeline(b).start).toEqual(timeline(b).range.start);
      expect(timeline(b).start.getTime()).toBeGreaterThan(timeline(a).start.getTime());
      expect(timeline(a).sharedExtent).toBeNull();
      expect(getEngine(a).inputs.shared.peek()).toBeNull();
    });
  });

  describe('zoom level', () => {
    it('sends a zoom to the other charts, which do not send it back', () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Month } });
      const b = chart({ tasks: LATE, group, options: { viewMode: ViewMode.Month } });
      const patches = observe(group);
      settle();

      a.zoomIn();
      expect(a.viewMode).toBe(ViewMode.Week);
      expect(b.viewMode).toBe(ViewMode.Week);
      expect(group.state.level).toBe(ViewMode.Week);
      settle();
      expect(levels(patches)).toEqual([ViewMode.Week]);
      // Same scale, same start: a date still has one x
      expect(timeline(b).pxPerDay).toBe(timeline(a).pxPerDay);
      expect(timeline(b).start).toEqual(timeline(a).start);

      // Any chart's zoom, and the group's own
      b.setViewMode(ViewMode.Day);
      expect(a.viewMode).toBe(ViewMode.Day);
      group.setLevel(ViewMode.Month);
      expect([a.viewMode, b.viewMode]).toEqual([ViewMode.Month, ViewMode.Month]);
      expect(levels(patches)).toEqual([ViewMode.Week, ViewMode.Day, ViewMode.Month]);
    });

    it('ignores a level the chart does not have, and does not send its own instead', () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const zoomLevels = DEFAULT_ZOOM_LEVELS.filter(l => l.name !== ViewMode.Day);
      const c = chart({ tasks: LATE, group, options: { viewMode: ViewMode.Week, zoomLevels } });
      const patches = observe(group);
      settle();
      a.setViewMode(ViewMode.Day);
      settle();
      // Not its fallback (Month), which it would then have sent to every chart
      expect(c.viewMode).toBe(ViewMode.Week);
      expect(a.viewMode).toBe(ViewMode.Day);
      expect(group.state.level).toBe(ViewMode.Day);
      expect(levels(patches)).toEqual([ViewMode.Day]);
    });

    it('the chart that zooms sends its anchored scroll; the others follow it, not their own centre', () => {
      const group = createGanttSyncGroup();
      // b first: its scroll event fires before a's in every frame
      const b = chart({ tasks: LATE, group, width: 400, options: { viewMode: ViewMode.Week } });
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const patches = observe(group);
      settle();
      userScroll(a, 500);
      expect(left(b)).toBe(500);
      const before = timeline(a);
      const beforeB = timeline(b);
      patches.length = 0;

      a.zoomIn();
      settle();
      const expected = anchoredScrollLeft(before, timeline(a), 500, 600, null)!;
      // b's own centre would land elsewhere
      expect(anchoredScrollLeft(beforeB, timeline(b), 500, 400, null)).not.toBe(expected);
      expect(left(a)).toBe(expected);
      expect(left(b)).toBe(expected);
      // b's correction around its centre never reached the group
      expect(scrolls(patches)).toEqual([expected]);
    });

    it('fit to screen fits the tasks of every chart, and the others follow', () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Day } });
      const b = chart({ tasks: LATE, group, width: 400, options: { viewMode: ViewMode.Day } });
      settle();
      const level = fitZoomLevel({ levels: DEFAULT_ZOOM_LEVELS, extent: group.state.extent, viewportWidth: 600 });
      expect(level).not.toBe(
        fitZoomLevel({ levels: DEFAULT_ZOOM_LEVELS, extent: timeline(a).extent, viewportWidth: 600 }),
      );

      a.fitToScreen();
      settle();
      expect(a.viewMode).toBe(level);
      expect(b.viewMode).toBe(level);
      const x = fitScrollLeft(timeline(a), 600);
      expect(left(a)).toBe(x);
      expect(left(b)).toBe(x);
    });
  });

  describe('scroll', () => {
    it('sends a scroll to the other charts; their echo does not come back', () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, width: 400, options: { viewMode: ViewMode.Week } });
      const patches = observe(group);
      settle();

      userScroll(a, 300);
      expect(left(b)).toBe(300);
      expect(left(a)).toBe(300);
      // The windowed regions saw the jump in the same flush
      expect(getEngine(b).inputs.scrollLeft.peek()).toBe(300);
      expect(group.state.scrollLeft).toBe(300);
      expect(scrolls(patches)).toEqual([300]);

      userScroll(b, 120);
      expect(left(a)).toBe(120);
      expect(scrolls(patches)).toEqual([300, 120]);

      // A vertical scroll leaves the horizontal offset alone: nothing to send
      viewport(b).scrollTop = 40;
      viewport(b).dispatchEvent(new Event('scroll'));
      settle();
      expect(scrolls(patches)).toEqual([300, 120]);

      // The group's own scroll: every chart, nothing sent back
      group.scrollTo(250);
      settle();
      expect([left(a), left(b)]).toEqual([250, 250]);
      expect(scrolls(patches)).toEqual([300, 120, 250]);
    });

    it('a chart that cannot scroll as far clamps without pushing the others back', () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, width: 400, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, width: 900, options: { viewMode: ViewMode.Week } });
      const patches = observe(group);
      settle();
      const maxA = timeline(a).totalWidth - 400;
      const maxB = timeline(b).totalWidth - 900;
      expect(maxB).toBeLessThan(maxA);

      userScroll(a, maxA);
      expect(left(b)).toBe(maxB);
      expect(left(a)).toBe(maxA);
      expect(group.state.scrollLeft).toBe(maxA);
      expect(scrolls(patches)).toEqual([maxA]);

      // Its own scrolls still go out
      userScroll(b, 100);
      expect(left(a)).toBe(100);
    });

    it('on joining, the group scroll replaces initialScroll', () => {
      const group = createGanttSyncGroup();
      const tasks = [...EARLY, ...LATE];
      const a = chart({ tasks, group, options: { viewMode: ViewMode.Week } });
      settle();
      userScroll(a, 640);

      const c = chart({ tasks, group, options: { viewMode: ViewMode.Week, initialScroll: day(5, 1) } });
      settle();
      expect(timeline(c).toX(day(5, 1))).toBeGreaterThan(640 + 600);
      expect(left(c)).toBe(640);
      expect(left(a)).toBe(640);
    });

    it('without a group scroll, initialScroll runs and the group gets it', () => {
      const group = createGanttSyncGroup();
      const patches = observe(group);
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, width: 400, options: { viewMode: ViewMode.Week, initialScroll: 'start' } });
      settle();
      const x = left(b);
      expect(x).toBeGreaterThan(0);
      expect(left(a)).toBe(x);
      expect(scrolls(patches)).toEqual([x]);
    });

    it('two charts that scroll initially in the same frame end up together, not swapped', () => {
      const group = createGanttSyncGroup();
      const options = { viewMode: ViewMode.Week };
      const a = chart({ tasks: EARLY, group, options: { ...options, initialScroll: day(1, 1) } });
      const b = chart({ tasks: LATE, group, width: 400, options: { ...options, initialScroll: day(5, 1) } });
      frame();
      const first = left(a);
      expect(left(b)).not.toBe(first);
      settle();
      // The scroll the group heard first wins; the other chart's own never went out
      expect(left(a)).toBe(first);
      expect(left(b)).toBe(first);
      expect(group.state.scrollLeft).toBe(first);
    });

    it('a new shared start keeps the left-edge date in every chart, and the group scroll follows it', () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, width: 400, options: { viewMode: ViewMode.Week } });
      const patches = observe(group);
      settle();
      userScroll(a, 800);
      const start = timeline(a).start;
      const date = timeline(a).toDate(800);
      patches.length = 0;

      b.tasks = [...LATE, { id: 'x', name: 'X', start: day(10, 3, 2025), end: day(10, 20, 2025) }];
      settle();
      const tl = timeline(a);
      expect(tl.start.getTime()).toBeLessThan(start.getTime());
      expect(timeline(b).start).toEqual(tl.start);
      const x = left(a);
      expect(x).toBeGreaterThan(800);
      expect(Math.abs(tl.toX(date) - x)).toBeLessThanOrEqual(1);
      expect(left(b)).toBe(x);
      // Measured from the new start: one report (the charts agree), nothing bounced
      expect(group.state.scrollLeft).toBe(x);
      expect(scrolls(patches)).toEqual([x]);
    });

    it('a chart that joins with an earlier range opens at the date the others show', () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: LATE, group, options: { viewMode: ViewMode.Week } });
      settle();
      userScroll(a, 500);
      const date = timeline(a).toDate(500);

      const c = chart({ tasks: EARLY, group, width: 400, options: { viewMode: ViewMode.Week } });
      settle();
      expect(timeline(c).start).toEqual(timeline(a).start);
      expect(timeline(a).start.getTime()).toBeLessThan(timeline(a).range.start.getTime());
      expect(left(c)).toBe(left(a));
      expect(Math.abs(timeline(a).toX(date) - left(a))).toBeLessThanOrEqual(1);
      expect(group.state.scrollLeft).toBe(left(a));
    });

    it('a start correction at the scroll limit does not pull the others back', () => {
      const group = createGanttSyncGroup();
      // b first: its scroll event fires before a's in every frame
      const b = chart({ tasks: LATE, group, width: 900, options: { viewMode: ViewMode.Week } });
      const a = chart({ tasks: EARLY, group, width: 400, options: { viewMode: ViewMode.Week } });
      settle();
      userScroll(a, timeline(a).totalWidth - 400);
      expect(left(b)).toBe(timeline(b).totalWidth - 900);

      b.tasks = [...LATE, { id: 'x', name: 'X', start: day(10, 3, 2025), end: day(10, 20, 2025) }];
      settle();
      // Both kept their date at the left edge: each at the end of its own range
      expect(left(a)).toBe(timeline(a).totalWidth - 400);
      expect(left(b)).toBe(timeline(b).totalWidth - 900);
    });

    it('a group scroll waits while the table view hides the timeline', () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, options: { viewMode: ViewMode.Week } });
      settle();
      b.setView('table');
      settle();
      userScroll(a, 300);
      expect(left(b)).toBe(0);
      b.setView('split');
      settle();
      expect(left(b)).toBe(300);
      expect(left(a)).toBe(300);
    });
  });

  describe('panel width', () => {
    it('shares the width the splitter or setState sets, without saving it in the other charts', () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group });
      const b = chart({ tasks: LATE, group });
      settle();
      const onSaveB = vi.fn();
      b.addEventListener('state-change', onSaveB);

      a.setState({ panelWidth: 320 }, false);
      expect(panelW(b)).toBe(320);
      expect(b.getState().panelWidth).toBe(320);

      // The splitter's keys
      const { splitter, splitterHandle } = getEngine(a).dom;
      splitterHandle.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      );
      expect(panelW(a)).toBeGreaterThan(320);
      expect(panelW(b)).toBe(panelW(a));

      // A drag: sent when it ends
      const press = (type: string, clientX: number) =>
        splitter.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX }));
      const before = panelW(b);
      press('pointerdown', 500);
      press('pointermove', 440);
      expect(panelW(a)).toBeLessThan(before!);
      expect(panelW(b)).toBe(before);
      press('pointerup', 440);
      expect(panelW(b)).toBe(panelW(a));

      // b saved nothing (a pending save is written when the element disconnects)
      b.remove();
      expect(onSaveB).not.toHaveBeenCalled();
    });

    it('{ scroll: false, panel: false }: only the range and the level are shared', () => {
      const group = createGanttSyncGroup({ scroll: false, panel: false });
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, options: { viewMode: ViewMode.Week } });
      settle();
      userScroll(a, 300);
      expect(left(b)).toBe(0);
      a.setState({ panelWidth: 300 }, false);
      expect(panelW(b)).toBeNull();
      a.zoomOut();
      expect(b.viewMode).toBe(ViewMode.Month);
      expect(timeline(b).start).toEqual(timeline(a).start);
    });
  });

  describe('membership', () => {
    it('syncGroup = null or undefined leaves; assigning the group again rejoins with its state', () => {
      const group = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group, options: { viewMode: ViewMode.Week } });
      const b = chart({ tasks: LATE, group, options: { viewMode: ViewMode.Week } });
      settle();
      userScroll(a, 300);

      b.syncGroup = null;
      expect(group.size).toBe(1);
      expect(getEngine(b).inputs.shared.peek()).toBeNull();
      settle();
      expect(timeline(b).start).toEqual(timeline(b).range.start);
      expect(timeline(a).end).toEqual(timeline(a).range.end);
      const alone = left(b);
      userScroll(a, 500);
      expect(left(b)).toBe(alone);

      b.syncGroup = group;
      expect(group.size).toBe(2);
      settle();
      expect(timeline(b).start).toEqual(timeline(a).start);
      expect(left(b)).toBe(500);

      b.syncGroup = undefined;
      expect(b.syncGroup).toBeNull();
      expect(group.size).toBe(1);
    });

    it('moving to another group leaves the first; the same group again changes nothing', () => {
      const first = createGanttSyncGroup();
      const second = createGanttSyncGroup();
      const a = chart({ tasks: EARLY, group: first });
      settle();
      const join = vi.spyOn(first, 'join');
      getEngine(a).layers.sync.connect(first);
      expect(join).not.toHaveBeenCalled();
      expect(first.size).toBe(1);

      a.syncGroup = second;
      expect([first.size, second.size]).toEqual([0, 1]);
      expect(second.state.range).toEqual(timeline(a).range);
    });
  });
});

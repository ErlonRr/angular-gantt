// ─────────────────────────────────────────────────────────────
//  Tests — the natural timeline range (`timelineRange`), the range
//  shared by a sync group (`TimelineInput.shared`) and the model's
//  `range` / `sharedExtent`
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  buildTimeline,
  timelineRange,
  type SharedTimelineRange,
  type TimelineInput,
  type TimelineModel,
} from '../render/timeline';
import { resolveConfig } from '../render/config';
import { bottomScale } from '../render/scales';
import { calendarDays, snapRange } from '../gantt-math';
import { createGanttSyncGroup, type GanttSyncState } from '../state/sync';
import type { GanttOptions, GanttTask, ScaleFormatContext, WeekRule } from '../types';

const NOW = new Date(2026, 2, 4);

/** Two pipelines: the second starts later and ends later than the first. */
const early: GanttTask[] = [
  { id: 'a1', name: 'A1', start: new Date(2026, 0, 12), end: new Date(2026, 1, 20) },
  { id: 'a2', name: 'A2', start: new Date(2026, 1, 2), end: new Date(2026, 2, 6) },
];
const late: GanttTask[] = [
  { id: 'b1', name: 'B1', start: new Date(2026, 2, 9), end: new Date(2026, 3, 17) },
  { id: 'b2', name: 'B2', start: new Date(2026, 3, 1), end: new Date(2026, 4, 29) },
];

const config = (options: GanttOptions = {}) => resolveConfig({ viewMode: 'Week', ...options });

const build = (tasks: GanttTask[], extra: Partial<TimelineInput> = {}, options: GanttOptions = {}) =>
  buildTimeline({ tasks, config: config(options), now: NOW, ...extra });

const natural = (tasks: GanttTask[], options: GanttOptions = {}) =>
  timelineRange({ tasks, config: config(options), now: NOW });

/** The shared state a group of charts with these task sets ends up with. */
function shared(sets: GanttTask[][], options: GanttOptions = {}): SharedTimelineRange {
  const group = createGanttSyncGroup();
  for (const tasks of sets) group.join({ update: () => {} }).report(natural(tasks, options));
  return group.state;
}

const days = (d: Date) => calendarDays(d, false);

describe('timelineRange', () => {
  it('is the padded range snapped to the bottom scale, and the tasks’ extent', () => {
    const cfg = config();
    const { range, extent } = natural(early);
    expect(extent).toEqual({ start: new Date(2026, 0, 12), end: new Date(2026, 2, 6) });
    expect(range).toEqual(snapRange(early, bottomScale(cfg.scales), cfg.timelinePadding, NOW, cfg.weekStart, NOW));
    // Snapped to whole weeks (Monday) around the padded extent
    expect(range.start.getDay()).toBe(1);
    expect(range.end.getDay()).toBe(1);
    expect(range.start <= new Date(2026, 0, 12)).toBe(true);
    expect(range.end >= new Date(2026, 2, 6)).toBe(true);
  });

  it('keeps today inside the range with showToday, not without', () => {
    const later = new Date(2026, 7, 20);
    const withToday = timelineRange({ tasks: early, config: config(), now: later });
    const without = timelineRange({ tasks: early, config: config({ showToday: false }), now: later });
    expect(withToday.range.end > later).toBe(true);
    expect(without.range.end < later).toBe(true);
    expect(withToday.extent).toEqual(without.extent);
  });

  it('falls back to the range around now without tasks, with no extent', () => {
    const { range, extent } = natural([]);
    expect(extent).toBeNull();
    expect(range.start < NOW && range.end > NOW).toBe(true);
  });

  it('reads tasks as drawn: inclusive end dates cover their last day', () => {
    const one: GanttTask[] = [{ id: 'x', name: 'X', start: new Date(2026, 0, 12), end: new Date(2026, 0, 14) }];
    expect(natural(one, { endDateMode: 'inclusive' }).extent?.end).toEqual(new Date(2026, 0, 15));
    expect(natural(one).extent?.end).toEqual(new Date(2026, 0, 14));
  });

  it('is what buildTimeline reports as range and extent', () => {
    for (const tasks of [early, late, []]) {
      const tl = build(tasks);
      expect({ range: tl.range, extent: tl.extent }).toEqual(natural(tasks));
    }
  });
});

describe('buildTimeline without a shared range (unchanged)', () => {
  it('starts and ends at the natural range, with no shared extent', () => {
    const tl = build(early);
    const { range } = natural(early);
    expect(tl.start).toEqual(range.start);
    expect(tl.end).toEqual(range.end);
    expect(tl.totalWidth).toBe(Math.round((days(range.end) - days(range.start)) * tl.pxPerDay));
    expect(tl.sharedExtent).toBeNull();
  });

  it('builds the same model with shared null, undefined or empty', () => {
    const plain = build(early);
    for (const s of [null, undefined, {}, { range: null, extent: null }] as SharedTimelineRange[]) {
      const tl = build(early, { shared: s });
      expect(tl.start).toEqual(plain.start);
      expect(tl.end).toEqual(plain.end);
      expect(tl.totalWidth).toBe(plain.totalWidth);
      expect(tl.tiers).toEqual(plain.tiers);
      expect(tl.majorLines).toEqual(plain.majorLines);
      expect(tl.minorLines).toEqual(plain.minorLines);
      expect(tl.bands).toEqual(plain.bands);
      expect(tl.todayX).toBe(plain.todayX);
      expect(tl.sharedExtent).toBeNull();
    }
  });

  it('keeps range before the viewport fill (fitToWidth extends only end)', () => {
    const tl = build(early, { viewportWidth: 20_000 }, { fitToWidth: true });
    expect(tl.range).toEqual(natural(early, { fitToWidth: true }).range);
    expect(tl.start).toEqual(tl.range.start);
    expect(tl.end > tl.range.end).toBe(true);
    expect(tl.totalWidth).toBeGreaterThanOrEqual(20_000);
  });
});

describe('buildTimeline with a shared range', () => {
  const both = shared([early, late]);
  const a = build(early, { shared: both });
  const b = build(late, { shared: both });

  it('gives two task sets the same start, end and width', () => {
    expect(a.start).toEqual(b.start);
    expect(a.end).toEqual(b.end);
    expect(a.totalWidth).toBe(b.totalWidth);
    expect(a.pxPerDay).toBe(b.pxPerDay);
    // The earliest of both natural starts, the latest of both natural ends
    expect(a.start).toEqual(natural(early).range.start);
    expect(a.end).toEqual(natural(late).range.end);
  });

  it('places every date at the same x', () => {
    for (const d of [
      new Date(2026, 0, 12),
      new Date(2026, 1, 28),
      new Date(2026, 2, 8), // US DST
      new Date(2026, 2, 29), // EU DST
      new Date(2026, 3, 5), // AU DST
      new Date(2026, 4, 29),
      new Date(2026, 4, 29, 13, 30),
    ]) {
      expect(a.toX(d)).toBe(b.toX(d));
    }
    expect(a.toX(new Date(2026, 2, 10)) - a.toX(new Date(2026, 2, 5))).toBe(Math.round(5 * a.pxPerDay));
    expect(a.toDate(b.toX(new Date(2026, 3, 1)))).toEqual(new Date(2026, 3, 1));
  });

  it('draws the same header cells and grid lines', () => {
    expect(a.tiers).toEqual(b.tiers);
    expect(a.majorLines).toEqual(b.majorLines);
    expect(a.minorLines).toEqual(b.minorLines);
    expect(a.todayX).toBe(b.todayX);
  });

  it('keeps each chart’s natural range and extent', () => {
    expect(a.range).toEqual(natural(early).range);
    expect(b.range).toEqual(natural(late).range);
    expect(a.extent).toEqual(natural(early).extent);
    expect(b.extent).toEqual(natural(late).extent);
  });

  it('exposes the shared extent: the union of every chart’s tasks', () => {
    const union = { start: new Date(2026, 0, 12), end: new Date(2026, 4, 29) };
    expect(a.sharedExtent).toEqual(union);
    expect(b.sharedExtent).toEqual(union);
  });

  it('unions with its own range: a shared range inside it changes nothing', () => {
    const own = natural(early).range;
    const inside = { start: new Date(own.start.getTime() + 1), end: new Date(own.end.getTime() - 1) };
    const tl = build(early, { shared: { range: inside } });
    expect(tl.start).toEqual(own.start);
    expect(tl.end).toEqual(own.end);
  });

  it('takes start and end independently (a later shared range only extends the end)', () => {
    const own = natural(early).range;
    const later = { start: new Date(2026, 5, 1), end: new Date(2026, 6, 6) };
    const tl = build(early, { shared: { range: later } });
    expect(tl.start).toEqual(own.start);
    expect(tl.end).toEqual(later.end);
  });

  it('includes its own extent in the shared extent (before the group has it)', () => {
    const tl = build(early, { shared: { extent: { start: new Date(2026, 1, 1), end: new Date(2026, 1, 2) } } });
    expect(tl.sharedExtent).toEqual({ start: new Date(2026, 0, 12), end: new Date(2026, 2, 6) });
    // Without tasks, the shared extent is the group's
    const empty = build([], { shared: { extent: { start: new Date(2026, 1, 1), end: new Date(2026, 1, 2) } } });
    expect(empty.extent).toBeNull();
    expect(empty.sharedExtent).toEqual({ start: new Date(2026, 1, 1), end: new Date(2026, 1, 2) });
  });

  it('does not alias the shared dates', () => {
    const state = { range: { start: new Date(2025, 11, 1), end: new Date(2026, 6, 6) }, extent: null };
    const tl = build(early, { shared: state });
    expect(tl.start).toEqual(new Date(2025, 11, 1));
    expect(tl.start).not.toBe(state.range.start);
    state.range.start.setFullYear(2020);
    expect(tl.start).toEqual(new Date(2025, 11, 1));
  });

  it('ignores invalid shared dates', () => {
    const bad = { start: new Date(Number.NaN), end: new Date(2027, 0, 1) };
    const tl = build(early, { shared: { range: bad, extent: bad } });
    expect(tl.start).toEqual(natural(early).range.start);
    expect(tl.end).toEqual(natural(early).range.end);
    expect(tl.sharedExtent).toBeNull();
  });

  it('fills the viewport after the union (fitToWidth)', () => {
    const opts = { fitToWidth: true };
    const s = shared([early, late], opts);
    const wa = build(early, { shared: s, viewportWidth: 20_000 }, opts);
    const wb = build(late, { shared: s, viewportWidth: 20_000 }, opts);
    expect(wa.start).toEqual(wb.start);
    expect(wa.end).toEqual(wb.end);
    expect(wa.totalWidth).toBeGreaterThanOrEqual(20_000);
    expect(wa.range).toEqual(natural(early, opts).range);
  });

  it('aligns hour scales too', () => {
    const opts: GanttOptions = { viewMode: 'Hour' };
    const h1: GanttTask[] = [{ id: 'h1', name: 'H1', start: new Date(2026, 2, 8, 1), end: new Date(2026, 2, 8, 9) }];
    const h2: GanttTask[] = [{ id: 'h2', name: 'H2', start: new Date(2026, 2, 9, 14), end: new Date(2026, 2, 10, 3) }];
    const s = shared([h1, h2], opts);
    const t1 = build(h1, { shared: s }, opts);
    const t2 = build(h2, { shared: s }, opts);
    expect(t1.start).toEqual(t2.start);
    expect(t1.totalWidth).toBe(t2.totalWidth);
    for (const d of [new Date(2026, 2, 8, 3), new Date(2026, 2, 9, 0), new Date(2026, 2, 10, 2, 30)]) {
      expect(t1.toX(d)).toBe(t2.toX(d));
    }
  });

  it('accepts a sync group state as is', () => {
    const state: GanttSyncState = createGanttSyncGroup().state;
    const tl: TimelineModel = buildTimeline({ tasks: early, config: config(), now: NOW, shared: state });
    expect(tl.start).toEqual(natural(early).range.start);
  });
});

describe('buildTimeline header week rule', () => {
  it('passes the resolved week rule to the scale formats', () => {
    const seen: WeekRule[] = [];
    const capture = (_s: Date, _e: Date, ctx: ScaleFormatContext) => {
      seen.push(ctx.week);
      return '';
    };
    const cfg = resolveConfig({ weekNumbering: 'us', weekStart: 1, scales: [{ unit: 'week', format: capture }] });
    buildTimeline({ tasks: early, config: cfg, now: NOW });
    expect(seen.length).toBeGreaterThan(0);
    for (const w of seen) expect(w).toEqual(cfg.week);
    // Not the default rule of a Monday start (ISO, 4 minimal days)
    expect(cfg.week).toEqual({ firstDay: 1, minimalDays: 1 });
  });
});

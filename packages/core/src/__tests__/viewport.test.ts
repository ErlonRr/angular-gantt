// ─────────────────────────────────────────────────────────────
//  Tests — initial scroll, zoom anchoring and fit-to-screen scroll
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { buildTimeline, type TimelineModel } from '../render/timeline';
import { resolveConfig } from '../render/config';
import {
  initialScrollLeft,
  zoomAnchorScroll,
  anchoredScrollLeft,
  fitScrollLeft,
  clampScroll,
  START_SCROLL_MARGIN,
  VIEWPORT_FALLBACK_HEIGHT,
  bodyHeight,
  pageRowCount,
  timelineScrollPadding,
} from '../render/viewport';
import { computeBarVisual, FOCUS_RING_MARGIN, FOCUS_RING_OFFSET } from '../render/bars';
import { computeRowGeometries } from '../render/timeline';
import { flattenTree } from '../gantt-data';
import { FIT_MARGIN } from '../render/zoom';
import { calendarDays } from '../gantt-math';
import type { GanttOptions, GanttTask } from '../types';

const tasks: GanttTask[] = [
  { id: 'a', name: 'A', start: new Date(2026, 0, 12), end: new Date(2026, 1, 20) },
  { id: 'b', name: 'B', start: new Date(2026, 1, 2), end: new Date(2026, 2, 27) },
];
const VW = 800;
const timeline = (now: Date, options: GanttOptions = {}, list = tasks) =>
  buildTimeline({
    tasks: list,
    config: resolveConfig({ viewMode: 'Week', ...options }),
    viewportWidth: VW,
    now,
  });

describe('TimelineModel.extent', () => {
  it('spans the earliest start to the latest end', () => {
    const tl = timeline(new Date(2026, 1, 1));
    expect(tl.extent).toEqual({ start: new Date(2026, 0, 12), end: new Date(2026, 2, 27) });
  });

  it('is null without tasks', () => {
    expect(timeline(new Date(2026, 1, 1), {}, []).extent).toBeNull();
  });
});

describe('initialScrollLeft', () => {
  const left = (now: Date, initialScroll: GanttOptions['initialScroll'], list = tasks) => {
    const tl = timeline(now, {}, list);
    return {
      tl,
      x: initialScrollLeft({ timeline: tl, initialScroll: initialScroll ?? 'auto', viewportWidth: VW, now }),
    };
  };

  it("'auto' centres today when it falls within the tasks", () => {
    const now = new Date(2026, 1, 15);
    const { tl, x } = left(now, 'auto');
    expect(x).toBe(clampScroll(tl.toX(now) - VW / 2, tl, VW));
  });

  it("'auto' shows the first task when today is far from the tasks", () => {
    const now = new Date(2026, 9, 9);
    const { tl, x } = left(now, 'auto');
    expect(x).toBe(tl.toX(new Date(2026, 0, 12)) - START_SCROLL_MARGIN);
    // …so the first bar starts inside the viewport
    expect(tl.toX(tasks[0].start) - x!).toBeGreaterThan(0);
    expect(tl.toX(tasks[0].start) - x!).toBeLessThan(VW);
  });

  it("'auto' still centres today a little outside the span", () => {
    const now = new Date(2026, 2, 30); // 3 days after the last end: within a quarter viewport
    const { tl, x } = left(now, 'auto');
    expect(x).toBe(clampScroll(tl.toX(now) - VW / 2, tl, VW));
  });

  it("'today', 'start', a Date and false", () => {
    const now = new Date(2026, 9, 9);
    const t = left(now, 'today');
    expect(t.x).toBe(clampScroll(t.tl.toX(now) - VW / 2, t.tl, VW));
    const s = left(now, 'start');
    expect(s.x).toBe(s.tl.toX(new Date(2026, 0, 12)) - START_SCROLL_MARGIN);
    const date = new Date(2026, 2, 1);
    const d = left(now, date);
    expect(d.x).toBe(clampScroll(d.tl.toX(date) - VW / 2, d.tl, VW));
    expect(left(now, false).x).toBeNull();
  });

  it('never scrolls past either end of the timeline', () => {
    const now = new Date(2026, 9, 9);
    const { tl, x } = left(now, new Date(2030, 0, 1));
    expect(x).toBe(tl.totalWidth - VW);
    expect(left(now, new Date(2020, 0, 1)).x).toBe(0);
  });

  it("'auto' without tasks centres today", () => {
    const now = new Date(2026, 9, 9);
    const { tl, x } = left(now, 'auto', []);
    expect(x).toBe(clampScroll(tl.toX(now) - VW / 2, tl, VW));
  });
});

describe('zoomAnchorScroll', () => {
  const now = new Date(2026, 1, 1);

  it('keeps the date under the anchor when zooming', () => {
    const week = timeline(now, { viewMode: 'Week' });
    const day = timeline(now, { viewMode: 'Day' });
    const scrollLeft = 300,
      anchorX = VW / 2;
    const before = week.toDate(scrollLeft + anchorX);
    const next = zoomAnchorScroll(week, day, scrollLeft, anchorX);
    const after = day.toDate(next + anchorX);
    expect(Math.abs(after.getTime() - before.getTime())).toBeLessThan(86_400_000 / day.pxPerDay);
  });

  it('keeps the left-edge date when the range start moves', () => {
    const tl = timeline(now);
    const earlier = timeline(now, {}, [
      ...tasks,
      { id: 'c', name: 'C', start: new Date(2025, 10, 3), end: new Date(2025, 10, 10) },
    ]);
    expect(earlier.start < tl.start).toBe(true);
    const next = zoomAnchorScroll(tl, earlier, 120, 0);
    expect(earlier.toDate(next).getTime()).toBe(tl.toDate(120).getTime());
  });
});

describe('anchoredScrollLeft', () => {
  const now = new Date(2026, 1, 1);
  const week = timeline(now, { viewMode: 'Week' });
  const day = timeline(now, { viewMode: 'Day' });
  /** Local calendar day (fractional) under viewport x `x` at scroll `left`. */
  const dayAt = (tl: TimelineModel, left: number, x: number) => calendarDays(tl.toDate(left + x), false);

  it('leaves the scroll alone when nothing moved', () => {
    expect(anchoredScrollLeft(week, week, 300, VW)).toBeNull();
    // A rebuilt model with the same density and range start
    const again = timeline(new Date(2026, 1, 2), { viewMode: 'Week' });
    expect(again).not.toBe(week);
    expect(again.start.getTime()).toBe(week.start.getTime());
    expect(anchoredScrollLeft(week, again, 300, VW, 120)).toBeNull();
  });

  it('keeps the date at the viewport centre by default when zooming', () => {
    const x = anchoredScrollLeft(week, day, 300, VW);
    expect(x).not.toBeNull();
    expect(Number.isInteger(x)).toBe(true);
    expect(Math.abs(dayAt(day, x!, VW / 2) - dayAt(week, 300, VW / 2))).toBeLessThanOrEqual(0.5 / day.pxPerDay);
  });

  it('keeps the date under the pointer, both ways', () => {
    for (const anchorX of [0, 100, 650, VW]) {
      const inX = anchoredScrollLeft(week, day, 300, VW, anchorX)!;
      expect(Math.abs(dayAt(day, inX, anchorX) - dayAt(week, 300, anchorX))).toBeLessThanOrEqual(0.5 / day.pxPerDay);
      const outX = anchoredScrollLeft(day, week, 1200, VW, anchorX)!;
      expect(Math.abs(dayAt(week, outX, anchorX) - dayAt(day, 1200, anchorX))).toBeLessThanOrEqual(0.5 / week.pxPerDay);
    }
  });

  it('clamps the anchor to the viewport and ignores a non-finite one', () => {
    expect(anchoredScrollLeft(week, day, 300, VW, -50)).toBe(anchoredScrollLeft(week, day, 300, VW, 0));
    expect(anchoredScrollLeft(week, day, 300, VW, VW + 500)).toBe(anchoredScrollLeft(week, day, 300, VW, VW));
    expect(anchoredScrollLeft(week, day, 300, VW, Number.NaN)).toBe(anchoredScrollLeft(week, day, 300, VW));
    expect(anchoredScrollLeft(week, day, 300, VW, null)).toBe(anchoredScrollLeft(week, day, 300, VW, VW / 2));
  });

  it('keeps the left-edge date when only the range start moves (the anchor does not matter)', () => {
    const tl = timeline(now);
    const earlier = timeline(now, {}, [
      ...tasks,
      { id: 'c', name: 'C', start: new Date(2025, 10, 3), end: new Date(2025, 10, 10) },
    ]);
    expect(earlier.pxPerDay).toBe(tl.pxPerDay);
    const x = anchoredScrollLeft(tl, earlier, 120, VW);
    expect(x).toBe(anchoredScrollLeft(tl, earlier, 120, VW, 700));
    expect(earlier.toDate(x!).getTime()).toBe(tl.toDate(120).getTime());
    expect(x).toBe(clampScroll(zoomAnchorScroll(tl, earlier, 120, 0), earlier, VW));
  });

  it('clamps to the scrollable range of the new timeline', () => {
    // Zooming out near the right end would scroll past it
    const far = anchoredScrollLeft(day, week, day.totalWidth - VW, VW, VW)!;
    expect(far).toBeLessThanOrEqual(week.totalWidth - VW);
    expect(far).toBeGreaterThanOrEqual(0);
    expect(anchoredScrollLeft(day, week, 0, VW, 0)).toBe(0);
    // A viewport wider than the timeline stays at 0
    expect(anchoredScrollLeft(week, day, 300, day.totalWidth + 100)).toBe(0);
  });

  it('sanitises a non-finite scroll and viewport', () => {
    expect(anchoredScrollLeft(week, day, Number.NaN, VW)).toBe(anchoredScrollLeft(week, day, 0, VW));
    const x = anchoredScrollLeft(week, day, 300, Number.NaN);
    expect(Number.isFinite(x)).toBe(true);
  });

  it('agrees with the deprecated zoomAnchorScroll within a pixel', () => {
    for (const anchorX of [0, 133, VW / 2, VW]) {
      const legacy = clampScroll(zoomAnchorScroll(week, day, 300, anchorX), day, VW);
      expect(Math.abs(anchoredScrollLeft(week, day, 300, VW, anchorX)! - legacy)).toBeLessThanOrEqual(1);
    }
  });

  it('holds the anchor date across DST changes (local calendar days)', () => {
    // US DST starts 8 Mar 2026; Lord Howe moves by 30 min on 5 Apr 2026; Kolkata has none
    const span: GanttTask[] = [
      { id: 'x', name: 'X', start: new Date(2026, 2, 6), end: new Date(2026, 2, 11) },
      { id: 'y', name: 'Y', start: new Date(2026, 3, 3), end: new Date(2026, 3, 7) },
    ];
    const hour = timeline(now, { viewMode: 'Hour' }, span);
    const dayTl = timeline(now, { viewMode: 'Day' }, span);
    const narrow = 300; // keeps every anchor clear of the clamped ends
    for (const date of [new Date(2026, 2, 9), new Date(2026, 2, 8, 12), new Date(2026, 3, 6)]) {
      const anchorX = 250;
      // The date sits exactly under the anchor at the Hour level…
      const left = hour.toX(date) - anchorX;
      const x = anchoredScrollLeft(hour, dayTl, left, narrow, anchorX)!;
      // …and at the same viewport x at the Day level
      expect(dayTl.toX(date) - x).toBe(anchorX);
      // and back
      const back = anchoredScrollLeft(dayTl, hour, x, narrow, anchorX)!;
      expect(Math.abs(hour.toX(date) - back - anchorX)).toBeLessThanOrEqual(1);
    }
  });
});

describe('fitScrollLeft', () => {
  const now = new Date(2026, 1, 1);

  it('puts the earliest task FIT_MARGIN px from the left edge', () => {
    const tl = timeline(now);
    expect(FIT_MARGIN).toBe(32);
    expect(fitScrollLeft(tl, VW)).toBe(tl.toX(new Date(2026, 0, 12)) - FIT_MARGIN);
    expect(fitScrollLeft(tl, VW, 10)).toBe(tl.toX(new Date(2026, 0, 12)) - 10);
  });

  it('keeps at most a quarter of a narrow viewport as margin', () => {
    const tl = timeline(now);
    expect(fitScrollLeft(tl, 80)).toBe(tl.toX(new Date(2026, 0, 12)) - 20);
  });

  it('is clamped to the scrollable range', () => {
    const tl = timeline(now);
    expect(fitScrollLeft(tl, VW, 10_000)).toBe(0);
    expect(fitScrollLeft(tl, tl.totalWidth + 50)).toBe(0);
    expect(fitScrollLeft(tl, Number.NaN)).toBe(Math.max(0, tl.toX(new Date(2026, 0, 12)) - FIT_MARGIN));
  });

  it('is null without tasks', () => {
    expect(fitScrollLeft(timeline(now, {}, []), VW)).toBeNull();
  });
});

describe('body height, keyboard pages and the timeline scroll padding', () => {
  it('bodyHeight: the viewport under the header, the fallback height before it is measured', () => {
    expect(bodyHeight(600, 74)).toBe(526);
    expect(bodyHeight(0, 74)).toBe(VIEWPORT_FALLBACK_HEIGHT - 74);
    expect(bodyHeight(Number.NaN, 74)).toBe(VIEWPORT_FALLBACK_HEIGHT - 74);
    expect(bodyHeight(50, 74)).toBe(0);
  });

  it('pageRowCount: the whole rows the body shows, at least one', () => {
    expect(pageRowCount(526, 36)).toBe(14);
    expect(pageRowCount(20, 36)).toBe(1);
    expect(pageRowCount(0, 36)).toBe(1);
    expect(pageRowCount(526, 0)).toBe(1);
  });

  it('timelineScrollPadding: the header plus the focus ring’s reach on top, the ring’s reach on the other sides', () => {
    expect(FOCUS_RING_MARGIN).toBe(FOCUS_RING_OFFSET + 1);
    expect(timelineScrollPadding(74)).toEqual({
      top: 74 + FOCUS_RING_MARGIN,
      right: FOCUS_RING_MARGIN,
      bottom: FOCUS_RING_MARGIN,
      left: FOCUS_RING_MARGIN,
    });
    expect(timelineScrollPadding(Number.NaN).top).toBe(FOCUS_RING_MARGIN);
  });

  it('the padding leaves room for the whole ring (focusRect + half its 2 px stroke)', () => {
    const cfg = resolveConfig({ viewMode: 'Week' });
    const tl = timeline(new Date(2026, 1, 1));
    const [geo] = computeRowGeometries(flattenTree(tasks), tl, cfg);
    const v = computeBarVisual({ geo, cfg, toX: tl.toX });
    const ring = v.focusRect;
    expect(v.y - (ring.y - 1)).toBeCloseTo(FOCUS_RING_MARGIN, 9);
    expect(ring.y + ring.height + 1 - (v.y + v.height)).toBeCloseTo(FOCUS_RING_MARGIN, 9);
    expect(v.x - (ring.x - 1)).toBeCloseTo(FOCUS_RING_MARGIN, 9);
  });
});

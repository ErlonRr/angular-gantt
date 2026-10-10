// ─────────────────────────────────────────────────────────────
//  Tests — initial scroll and zoom anchoring
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../render/timeline';
import { resolveConfig } from '../render/config';
import { LightTheme } from '../render/theme';
import { initialScrollLeft, zoomAnchorScroll, clampScroll, START_SCROLL_MARGIN } from '../render/viewport';
import type { GanttOptions, GanttTask } from '../types';

const tasks: GanttTask[] = [
  { id: 'a', name: 'A', start: new Date(2026, 0, 12), end: new Date(2026, 1, 20) },
  { id: 'b', name: 'B', start: new Date(2026, 1, 2), end: new Date(2026, 2, 27) },
];
const VW = 800;
const timeline = (now: Date, options: GanttOptions = {}, list = tasks) =>
  buildTimeline({ tasks: list, config: resolveConfig({ viewMode: 'Week', ...options }, LightTheme), viewportWidth: VW, now });

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
    return { tl, x: initialScrollLeft({ timeline: tl, initialScroll: initialScroll ?? 'auto', viewportWidth: VW, now }) };
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
    const scrollLeft = 300, anchorX = VW / 2;
    const before = week.toDate(scrollLeft + anchorX);
    const next = zoomAnchorScroll(week, day, scrollLeft, anchorX);
    const after = day.toDate(next + anchorX);
    expect(Math.abs(after.getTime() - before.getTime())).toBeLessThan(86_400_000 / day.pxPerDay);
  });

  it('keeps the left-edge date when the range start moves', () => {
    const tl = timeline(now);
    const earlier = timeline(now, {}, [...tasks, { id: 'c', name: 'C', start: new Date(2025, 10, 3), end: new Date(2025, 10, 10) }]);
    expect(earlier.start < tl.start).toBe(true);
    const next = zoomAnchorScroll(tl, earlier, 120, 0);
    expect(earlier.toDate(next).getTime()).toBe(tl.toDate(120).getTime());
  });
});

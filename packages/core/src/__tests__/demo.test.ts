// ─────────────────────────────────────────────────────────────
//  Tests — demo plans anchored around "today" (runs under test:tz too)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { DEMO_TASKS, DEMO_ANNOTATIONS, createDemoData, anchorToToday } from '../mock-data';
import { calendarDays, taskExtent, toLocalDay, diffDays } from '../gantt-math';

const NOWS = [
  new Date(2026, 9, 10), // a Saturday
  new Date(2026, 2, 29, 12), // a DST change in Europe
  new Date(2026, 11, 31),
  new Date(2028, 1, 29),
  new Date(2027, 5, 1, 23, 30), // late evening
];

const ratio = (now: Date, tasks: typeof DEMO_TASKS) => {
  const ext = taskExtent(tasks)!;
  const s = calendarDays(ext.start);
  return (calendarDays(now) - s) / (calendarDays(ext.end) - s);
};
const weekday = (d: Date) => toLocalDay(d).getDay();

describe('createDemoData', () => {
  for (const now of NOWS) {
    it(`puts ${now.toDateString()} about 40% into the plan`, () => {
      const { tasks, annotations } = createDemoData({ now });
      expect(ratio(now, tasks)).toBeGreaterThanOrEqual(0.35);
      expect(ratio(now, tasks)).toBeLessThanOrEqual(0.45);

      tasks.forEach((t, i) => {
        const src = DEMO_TASKS[i];
        expect(weekday(t.start)).toBe(weekday(src.start));
        expect(diffDays(t.start, t.end)).toBe(diffDays(src.start, src.end));
        expect({ ...t, start: 0, end: 0, baseline: !!t.baseline }).toEqual({
          ...src,
          start: 0,
          end: 0,
          baseline: !!src.baseline,
        });
        if (src.baseline) expect(weekday(t.baseline!.end)).toBe(weekday(src.baseline.end));
      });
      annotations.forEach((a, i) => expect(weekday(a.x1)).toBe(weekday(DEMO_ANNOTATIONS[i].x1)));
    });
  }

  it('is deterministic and leaves the templates untouched', () => {
    const before = structuredClone(DEMO_TASKS);
    const now = new Date(2026, 9, 10);
    expect(createDemoData({ now })).toEqual(createDemoData({ now }));
    expect(DEMO_TASKS).toEqual(before);
  });

  it('moves tasks and annotations by the same whole number of weeks', () => {
    const { tasks, annotations, offsetDays } = anchorToToday(
      DEMO_TASKS,
      { now: new Date(2026, 9, 10) },
      DEMO_ANNOTATIONS,
    );
    expect(offsetDays % 7).toBe(0);
    expect(diffDays(DEMO_TASKS[0].start, tasks[0].start)).toBe(offsetDays);
    expect(diffDays(DEMO_ANNOTATIONS[0].x1, annotations[0].x1)).toBe(offsetDays);
  });

  it('honours `at` (start, middle, end) and clamps it', () => {
    const now = new Date(2026, 9, 10);
    const at = (a: number) => ratio(now, anchorToToday(DEMO_TASKS, { now, at: a }).tasks);
    expect(at(0)).toBeLessThan(0.05);
    expect(Math.abs(at(0.5) - 0.5)).toBeLessThan(0.05);
    expect(at(1)).toBeGreaterThan(0.95);
    expect(at(7)).toBeCloseTo(at(1), 5);
  });

  it('keeps today inside the plan even at the extremes, for any weekday', () => {
    for (let d = 0; d < 7; d++) {
      const now = new Date(2026, 9, 10 + d, 12);
      for (const a of [0, 1]) {
        const r = ratio(now, anchorToToday(DEMO_TASKS, { now, at: a }).tasks);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }
    }
  });

  it('returns an empty plan unchanged', () => {
    expect(anchorToToday([], { now: new Date(2026, 9, 10) })).toEqual({ tasks: [], annotations: [], offsetDays: 0 });
  });
});

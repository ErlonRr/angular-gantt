// ─────────────────────────────────────────────────────────────
//  Tests — quantised clock and today line. `now` is an instant (never
//  read as a date-only value); its local day / hour is the quantum,
//  across daylight-saving changes. Run with `pnpm test:tz`
//  (Los Angeles, Kolkata, Lord Howe's 30-minute shifts).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import type { GanttOptions, GanttTask, TimeUnit, ViewMode } from '../types';
import { quantizeNow, todayX } from '../render/today';
import { buildTimeline } from '../render/timeline';
import { resolveConfig } from '../render/config';
import { bottomScale } from '../render/scales';
import { calendarDays, isUtcDateOnly } from '../gantt-math';

const cfg = (o: GanttOptions = {}) => resolveConfig(o);
const MINUTE = 60_000;

/** Daylight-saving days of the test:tz zones in 2026 (ordinary days elsewhere), plus two ordinary days. */
const DAYS: [string, number, number, number][] = [
  ['Los Angeles spring forward', 2026, 2, 8],
  ['Los Angeles fall back', 2026, 10, 1],
  ['Lord Howe fall back (30 min)', 2026, 3, 5],
  ['Lord Howe spring forward (30 min)', 2026, 9, 4],
  ['an ordinary winter day', 2026, 0, 15],
  ['an ordinary summer day', 2026, 6, 1],
];

/** Instants every `step` real minutes from local midnight to the last millisecond of the day. */
function instants(y: number, m: number, d: number, step: number, offsetMs = 0): Date[] {
  const start = new Date(y, m, d).getTime();
  const end = new Date(y, m, d + 1).getTime();
  const out: Date[] = [];
  for (let t = start + offsetMs; t < end; t += step * MINUTE) out.push(new Date(t));
  out.push(new Date(end - 1));
  return out;
}

const localDay = (d: Date) => [d.getFullYear(), d.getMonth(), d.getDate()];

describe('quantizeNow', () => {
  it.each(DAYS)('is stable within the local day: %s', (_name, y, m, d) => {
    const expected = new Date(y, m, d).getTime() + 1;
    for (const unit of ['day', 'week', 'month', 'quarter', 'year'] as TimeUnit[]) {
      for (const now of instants(y, m, d, 7)) {
        const q = quantizeNow(now, unit);
        expect(q.getTime()).toBe(expected);
        expect(localDay(q)).toEqual([y, m, d]);
      }
      // The next local day is the next quantum
      expect(quantizeNow(new Date(y, m, d + 1), unit).getTime()).toBe(new Date(y, m, d + 1).getTime() + 1);
    }
  });

  it.each(DAYS)('is stable within the local hour on hour scales: %s', (_name, y, m, d) => {
    const all = instants(y, m, d, 5);
    let prev: Date | undefined;
    for (const now of all) {
      const q = quantizeNow(now, 'hour');
      expect(localDay(q)).toEqual(localDay(now));
      expect(q.getHours()).toBe(now.getHours());
      // One millisecond past the first instant of the local hour (02:30 when a 30-minute shift skips 02:00)
      const start = new Date(q.getTime() - 1);
      const before = new Date(q.getTime() - 2);
      expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
      expect([start.getHours(), start.getSeconds(), start.getMilliseconds()]).toEqual([now.getHours(), 0, 0]);
      expect(before.getHours()).not.toBe(now.getHours());
      if (prev) {
        const same = prev.getHours() === now.getHours();
        expect(quantizeNow(prev, 'hour').getTime() === q.getTime()).toBe(same);
      }
      prev = now;
    }
    // One quantum per local hour: 23 on a spring-forward day, 24 when a repeated hour counts once
    const quanta = new Set(all.map(t => quantizeNow(t, 'hour').getTime()));
    expect(quanta.size).toBe(new Set(all.map(t => t.getHours())).size);
  });

  it('never yields a value that date-only normalisation would move', () => {
    for (const [, y, m, d] of DAYS) {
      for (const now of instants(y, m, d, 1)) {
        expect(isUtcDateOnly(quantizeNow(now, 'hour'))).toBe(false);
        expect(isUtcDateOnly(quantizeNow(now, 'day'))).toBe(false);
      }
    }
    // An instant on UTC midnight (17:00 in Los Angeles, 05:30 in Kolkata) keeps its local day and hour
    const utcMidnight = new Date(Date.UTC(2026, 2, 10));
    expect(localDay(quantizeNow(utcMidnight, 'day'))).toEqual(localDay(utcMidnight));
    expect(quantizeNow(utcMidnight, 'hour').getHours()).toBe(utcMidnight.getHours());
  });
});

describe('a timeline built from quantizeNow', () => {
  const MODES: ViewMode[] = ['Hour', 'Day', 'Week', 'Month'];
  // Real minutes after local midnight: the repeated / skipped hours of every DST change, then the day
  const OFFSETS = [0, 61, 95, 125, 150, 185, 330, 725, 1030, 1380];

  it.each(DAYS)('draws what a timeline built from now draws (today line via todayX): %s', (_name, y, m, d) => {
    const midnight = new Date(y, m, d).getTime();
    const nows = [
      ...OFFSETS.map(min => new Date(midnight + min * MINUTE + 13_007)),
      new Date(new Date(y, m, d + 1).getTime() - 1),
    ];
    // Today after every task (it sets the range end) and before every task (it sets the start)
    const taskSets: GanttTask[][] = [
      [{ id: 'a', name: 'A', start: new Date(y, m, d - 5), end: new Date(y, m, d - 2) }],
      [{ id: 'a', name: 'A', start: new Date(y, m, d + 2), end: new Date(y, m, d + 5) }],
    ];
    for (const viewMode of MODES)
      for (const timelinePadding of [0, 7]) {
        const config = cfg({ viewMode, timelinePadding });
        const unit = bottomScale(config.scales).unit;
        for (const tasks of taskSets)
          for (const now of nows) {
            const exact = buildTimeline({ tasks, config, now });
            const quantised = buildTimeline({ tasks, config, now: quantizeNow(now, unit) });
            const { todayX: exactX, toX: _a, toDate: _b, ...exactRest } = exact;
            const { todayX: _q, toX: _c, toDate: _d, ...quantisedRest } = quantised;
            expect(quantisedRest).toEqual(exactRest);
            expect(todayX(quantised, now)).toBe(exactX === -1 ? null : exactX);
            expect(exactX).not.toBe(-1);
          }
      }
  });
});

describe('todayX', () => {
  const config = cfg({ viewMode: 'Day' });
  const tasks: GanttTask[] = [{ id: 'a', name: 'A', start: new Date(2026, 2, 2), end: new Date(2026, 2, 20) }];
  const tl = buildTimeline({ tasks, config, now: new Date(2026, 2, 10, 12) });

  it('places the instant on the timeline and leaves out instants outside it', () => {
    expect(todayX(tl, tl.start)).toBe(0);
    expect(todayX(tl, tl.end)).toBe(tl.totalWidth);
    expect(todayX(tl, new Date(tl.start.getTime() - MINUTE * 60))).toBeNull();
    expect(todayX(tl, new Date(tl.end.getTime() + MINUTE * 60))).toBeNull();
    expect(todayX(tl, new Date(2026, 2, 10, 12))).toBe(tl.todayX);
  });

  it('reads now as an instant: UTC midnight is not a date-only value', () => {
    const now = new Date(Date.UTC(2026, 2, 10));
    expect(todayX(tl, now)).toBe(
      Math.round((calendarDays(now, false) - calendarDays(tl.start, false)) * config.pxPerDay),
    );
    if (now.getTimezoneOffset() !== 0) expect(calendarDays(now, false)).not.toBe(calendarDays(now, true));
  });

  it('keeps local midnights one day apart and moves forward through DST days', () => {
    for (const [, y, m, d] of DAYS) {
      const around = buildTimeline({
        tasks: [{ id: 'a', name: 'A', start: new Date(y, m, d - 3), end: new Date(y, m, d + 3) }],
        config,
        now: new Date(y, m, d),
      });
      expect((todayX(around, new Date(y, m, d + 1)) ?? 0) - (todayX(around, new Date(y, m, d)) ?? 0)).toBe(
        config.pxPerDay,
      );
      let last = -1;
      for (const now of instants(y, m, d, 10)) {
        const x = todayX(around, now) ?? -1;
        expect(x).toBeGreaterThanOrEqual(last);
        last = x;
      }
    }
  });
});

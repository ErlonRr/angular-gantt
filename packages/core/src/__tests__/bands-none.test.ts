// ─────────────────────────────────────────────────────────────
//  Tests — `nonWorkingTime.style: 'none'` (Phase 13): the definition
//  stays, but no weekend, holiday or off-hours band is computed (so
//  nothing is painted in the grid, the header, the SVG export or the
//  print); intensive hours and `highlightTime` still paint, and
//  `highlightTime` never lands on a weekend or holiday day, as with
//  every other style. October 2026: Monday the 12th, a holiday on
//  Wednesday the 21st, weekends on 17–18 and 24–25. Dates are built
//  with `new Date(y, m, d, …)`: every assertion holds in any time zone.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../render/config';
import { buildTimeline, computeTimeBands, type TimeBand } from '../render/timeline';
import { calendarDays } from '../gantt-math';
import type { GanttOptions, GanttTask } from '../types';

const oct = (day: number, h = 0): Date => new Date(2026, 9, day, h);
const START = oct(12);
const END = oct(26);
const START_DAYS = calendarDays(START, false);

const DAY_PX = 40;
const HOUR_PX = 24 * 8;

const NON_WORKING: NonNullable<GanttOptions['nonWorkingTime']> = {
  holidays: [{ start: oct(21), end: oct(21), label: 'Founders’ day' }],
  workingHours: { start: 9, end: 17 },
  intensiveHours: [{ start: 12, end: 13, label: 'Lunch' }],
};

const bandsOf = (options: GanttOptions, pxPerDay = DAY_PX): TimeBand[] => {
  const cfg = resolveConfig(options);
  const toX = (d: Date) => Math.round((calendarDays(d, false) - START_DAYS) * pxPerDay);
  return computeTimeBands(START, END, pxPerDay, cfg, toX);
};
const kinds = (bands: TimeBand[]) => [...new Set(bands.map(b => b.kind))].sort();
/** Whole days a band covers, as day-of-month numbers of October. */
const daysOf = (bands: TimeBand[], pxPerDay = DAY_PX): number[] =>
  bands.flatMap(b => {
    const from = Math.round(b.x / pxPerDay);
    return Array.from({ length: Math.max(1, Math.round(b.width / pxPerDay)) }, (_, i) => 12 + from + i);
  });

describe("nonWorkingTime.style: 'none' — day scale", () => {
  it('shade (the default) paints the weekends and the holiday', () => {
    const bands = bandsOf({ nonWorkingTime: NON_WORKING });
    expect(kinds(bands)).toEqual(['holiday', 'weekend']);
    expect(daysOf(bands.filter(b => b.kind === 'weekend'))).toEqual([17, 18, 24, 25]);
    expect(daysOf(bands.filter(b => b.kind === 'holiday'))).toEqual([21]);
  });

  it('none paints no weekend and no holiday band', () => {
    expect(bandsOf({ nonWorkingTime: { ...NON_WORKING, style: 'none' } })).toEqual([]);
  });

  it('an unknown style reads as shade', () => {
    const odd = bandsOf({ nonWorkingTime: { ...NON_WORKING, style: 'blink' as 'none' } });
    expect(odd).toEqual(bandsOf({ nonWorkingTime: NON_WORKING }));
    expect(odd.length).toBeGreaterThan(0);
  });

  it('shade, hatch and an explicit shade give the same bands as before', () => {
    const plain = bandsOf({ nonWorkingTime: NON_WORKING });
    expect(bandsOf({ nonWorkingTime: { ...NON_WORKING, style: 'shade' } })).toEqual(plain);
    expect(bandsOf({ nonWorkingTime: { ...NON_WORKING, style: 'hatch' } })).toEqual(plain);
  });

  it('the default weekend shading (nonWorkingTime unset) is unchanged', () => {
    const bands = bandsOf({});
    expect(kinds(bands)).toEqual(['weekend']);
    expect(bandsOf({ nonWorkingTime: false })).toEqual([]);
  });

  it('keeps the highlightTime days: none of them is a weekend or a holiday, whatever the style', () => {
    const highlightTime = () => ({ label: 'sprint' });
    const shade = bandsOf({ nonWorkingTime: NON_WORKING, highlightTime });
    const none = bandsOf({ nonWorkingTime: { ...NON_WORKING, style: 'none' }, highlightTime });
    const customShade = shade.filter(b => b.kind === 'custom');
    expect(none).toEqual(customShade);
    expect(daysOf(none)).toEqual([12, 13, 14, 15, 16, 19, 20, 22, 23]);
  });

  it('a weekday-list weekend is not highlighted either', () => {
    const bands = bandsOf({ nonWorkingTime: { weekends: [5, 6], style: 'none' }, highlightTime: () => ({}) });
    const weekdays = daysOf(bands).map(d => new Date(2026, 9, d).getDay());
    expect(weekdays.length).toBeGreaterThan(0);
    expect(weekdays).not.toContain(5);
    expect(weekdays).not.toContain(6);
  });
});

describe("nonWorkingTime.style: 'none' — hour scale", () => {
  it('shade paints off-hours, the intensive hours and the weekends', () => {
    const bands = bandsOf({ nonWorkingTime: NON_WORKING }, HOUR_PX);
    expect(kinds(bands)).toEqual(['holiday', 'intensive', 'off-hours', 'weekend']);
  });

  it('none paints the intensive hours only', () => {
    const bands = bandsOf({ nonWorkingTime: { ...NON_WORKING, style: 'none' } }, HOUR_PX);
    expect(kinds(bands)).toEqual(['intensive']);
    const intensive = bandsOf({ nonWorkingTime: NON_WORKING }, HOUR_PX).filter(b => b.kind === 'intensive');
    expect(bands).toEqual(intensive);
    expect(bands.every(b => b.label === 'Lunch')).toBe(true);
  });

  it('none with an hour calendar still paints no off-hours (the calendar keeps its hours)', () => {
    const options: GanttOptions = { calendar: { unit: 'hour' }, nonWorkingTime: { style: 'none' } };
    const cfg = resolveConfig(options);
    expect(cfg.calendar).not.toBeNull();
    expect(cfg.nonWorking?.workingHours).not.toBeNull();
    expect(bandsOf(options, HOUR_PX)).toEqual([]);
    // the same calendar with the default style shades the nights
    const shaded = bandsOf({ calendar: { unit: 'hour' } }, HOUR_PX);
    expect(kinds(shaded)).toEqual(['off-hours', 'weekend']);
  });

  it('highlightTime by the hour still paints', () => {
    const bands = bandsOf(
      { nonWorkingTime: { ...NON_WORKING, style: 'none' }, highlightTime: (_d, unit) => (unit === 'hour' ? {} : null) },
      HOUR_PX,
    );
    expect(kinds(bands)).toEqual(['custom', 'intensive']);
  });
});

describe("nonWorkingTime.style: 'none' — the timeline model", () => {
  const tasks: GanttTask[] = [{ id: 'a', name: 'A', start: oct(12), end: oct(26) }];
  const model = (options: GanttOptions) =>
    buildTimeline({
      tasks,
      config: resolveConfig({ viewMode: 'Day', ...options }),
      now: oct(14),
    });

  it('has no band for the grid or the header, even with showInHeader', () => {
    const none = model({ nonWorkingTime: { ...NON_WORKING, style: 'none', showInHeader: true } });
    expect(none.bands).toEqual([]);
    const shade = model({ nonWorkingTime: { ...NON_WORKING, showInHeader: true } });
    expect(shade.bands.length).toBeGreaterThan(0);
  });

  it('the resolved config keeps the definition: weekends and holidays', () => {
    const cfg = resolveConfig({ nonWorkingTime: { ...NON_WORKING, style: 'none' } });
    expect(cfg.nonWorking?.style).toBe('none');
    expect([...(cfg.nonWorking?.weekends ?? [])].sort()).toEqual([0, 6]);
    expect(cfg.nonWorking?.holidayByDay.size).toBe(1);
  });
});

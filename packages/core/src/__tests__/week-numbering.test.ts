// ─────────────────────────────────────────────────────────────
//  Tests — week numbering (Phase 10, step 2.1): `weekOfYear` /
//  `weekYear` under any rule (differential against dayjs's
//  weekOfYear / weekYear plugins, test-only), `weekNumber` with a
//  week start or a rule, the ISO / US / Saturday / locale rules
//  around January 1 of 2026–2029, and header week labels and week
//  cells following `week` and `weekStart`. Dates are local
//  (`new Date(y, m, d)`), so the suite holds in every time zone
//  (`pnpm test:tz`).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import dayjs, { type Dayjs } from 'dayjs';
import weekOfYearPlugin from 'dayjs/plugin/weekOfYear.js';
import weekYearPlugin from 'dayjs/plugin/weekYear.js';

import {
  ISO_WEEK,
  US_WEEK,
  isoWeek,
  isoWeekYear,
  isLeapYear,
  localeWeekRule,
  resolveWeek,
  weekOfYear,
  weekYear,
} from '../format/week';
import { WEEK_FORMATS, buildTiers, weekNumber, type BuildTiersInput } from '../render/scales';
import { buildTimeline } from '../render/timeline';
import { calendarDays } from '../gantt-math';
import { resolveConfig } from '../render/config';
import * as core from '../index';
import { DEFAULT_LABELS, type GanttTask, type ScaleFormatContext, type WeekRule, type WeekStart } from '../types';

dayjs.extend(weekOfYearPlugin);
dayjs.extend(weekYearPlugin);

/** Weeks from Saturday with week 1 holding 4 days of the year: what `weekStart: 6` alone numbers by. */
const SAT_WEEK: WeekRule = { firstDay: 6, minimalDays: 4 };
/** Weeks from Saturday with week 1 holding January 1 (Egypt and other Saturday regions in CLDR). */
const SAT_US_WEEK: WeekRule = { firstDay: 6, minimalDays: 1 };

/** The nine days Dec 28 (y) – Jan 5 (y + 1). */
const boundaryDays = (y: number): Date[] => Array.from({ length: 9 }, (_, i) => new Date(y, 11, 28 + i));
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** dayjs with a week rule (dayjs's `yearStart` is the January day week 1 always holds: `minimalDays`). */
const dayjsLocale = (rule: WeekRule) =>
  ({
    name: `rule-${rule.firstDay}-${rule.minimalDays}`,
    weekStart: rule.firstDay,
    yearStart: rule.minimalDays,
    formats: {},
    relativeTime: {},
  }) as unknown as Parameters<Dayjs['locale']>[0];

// ─── weekOfYear / weekYear ────────────────────────────────────

describe('weekOfYear / weekYear around January 1 (Dec 28 – Jan 5)', () => {
  // Expected week numbers and week-years, day by day, Dec 28 → Jan 5.
  const cases: { rule: WeekRule; name: string; years: Record<number, [number[], number[]]> }[] = [
    {
      name: 'ISO (Monday, 4 days)',
      rule: ISO_WEEK,
      years: {
        2025: [
          [52, 1, 1, 1, 1, 1, 1, 1, 2],
          [2025, 2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026],
        ],
        2026: [
          [53, 53, 53, 53, 53, 53, 53, 1, 1],
          [2026, 2026, 2026, 2026, 2026, 2026, 2026, 2027, 2027],
        ],
        2027: [
          [52, 52, 52, 52, 52, 52, 1, 1, 1],
          [2027, 2027, 2027, 2027, 2027, 2027, 2028, 2028, 2028],
        ],
        2028: [
          [52, 52, 52, 52, 1, 1, 1, 1, 1],
          [2028, 2028, 2028, 2028, 2029, 2029, 2029, 2029, 2029],
        ],
      },
    },
    {
      name: 'US (Sunday, 1 day)',
      rule: US_WEEK,
      years: {
        2025: [
          [1, 1, 1, 1, 1, 1, 1, 2, 2],
          [2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026],
        ],
        2026: [
          [1, 1, 1, 1, 1, 1, 2, 2, 2],
          [2027, 2027, 2027, 2027, 2027, 2027, 2027, 2027, 2027],
        ],
        2027: [
          [1, 1, 1, 1, 1, 2, 2, 2, 2],
          [2028, 2028, 2028, 2028, 2028, 2028, 2028, 2028, 2028],
        ],
        2028: [
          [53, 53, 53, 1, 1, 1, 1, 1, 1],
          [2028, 2028, 2028, 2029, 2029, 2029, 2029, 2029, 2029],
        ],
      },
    },
    {
      name: 'Saturday (4 days)',
      rule: SAT_WEEK,
      years: {
        2025: [
          [52, 52, 52, 52, 52, 52, 1, 1, 1],
          [2025, 2025, 2025, 2025, 2025, 2025, 2026, 2026, 2026],
        ],
        2026: [
          [52, 52, 52, 52, 52, 1, 1, 1, 1],
          [2026, 2026, 2026, 2026, 2026, 2027, 2027, 2027, 2027],
        ],
        2027: [
          [52, 52, 52, 52, 1, 1, 1, 1, 1],
          [2027, 2027, 2027, 2027, 2028, 2028, 2028, 2028, 2028],
        ],
        2028: [
          [52, 52, 1, 1, 1, 1, 1, 1, 1],
          [2028, 2028, 2029, 2029, 2029, 2029, 2029, 2029, 2029],
        ],
      },
    },
    {
      name: 'Saturday (1 day)',
      rule: SAT_US_WEEK,
      years: {
        2026: [
          [1, 1, 1, 1, 1, 2, 2, 2, 2],
          [2027, 2027, 2027, 2027, 2027, 2027, 2027, 2027, 2027],
        ],
        2027: [
          [53, 53, 53, 53, 1, 1, 1, 1, 1],
          [2027, 2027, 2027, 2027, 2028, 2028, 2028, 2028, 2028],
        ],
      },
    },
  ];

  for (const { name, rule, years } of cases) {
    it(name, () => {
      for (const [y, [weeks, weekYears]] of Object.entries(years)) {
        const days = boundaryDays(Number(y));
        expect(
          days.map(d => weekOfYear(d, rule)),
          `${name} ${y}`,
        ).toEqual(weeks);
        expect(
          days.map(d => weekYear(d, rule)),
          `${name} ${y}`,
        ).toEqual(weekYears);
      }
    });
  }

  it('the ISO rule is isoWeek / isoWeekYear (every day of 2000–2040)', () => {
    const bad: string[] = [];
    for (let y = 2000; y <= 2040; y++) {
      for (let doy = 0; doy < (isLeapYear(y) ? 366 : 365); doy++) {
        const d = new Date(y, 0, 1 + doy);
        if (weekOfYear(d, ISO_WEEK) !== isoWeek(d) || weekYear(d, ISO_WEEK) !== isoWeekYear(d)) bad.push(ymd(d));
      }
    }
    expect(bad).toEqual([]);
  });

  it('matches dayjs weekOfYear / weekYear for every first day × minimal days around each new year (1999–2041)', () => {
    const bad: string[] = [];
    for (let firstDay = 0; firstDay < 7; firstDay++) {
      for (let minimalDays = 1; minimalDays <= 7; minimalDays++) {
        const rule = { firstDay, minimalDays };
        const loc = dayjsLocale(rule);
        for (let y = 1999; y <= 2041; y++) {
          for (let i = 0; i < 20; i++) {
            const d = new Date(y, 11, 22 + i); // Dec 22 → Jan 10
            const ref = dayjs(d).locale(loc);
            const refWeek = ref.week();
            if (weekOfYear(d, rule) !== refWeek || weekYear(d, rule) !== ref.weekYear()) {
              bad.push(
                `${firstDay}/${minimalDays} ${ymd(d)}: ${weekOfYear(d, rule)}/${weekYear(d, rule)} vs ${refWeek}`,
              );
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('matches dayjs for every day of 2026–2028 under the US and Saturday rules', () => {
    const bad: string[] = [];
    for (const rule of [US_WEEK, SAT_WEEK, SAT_US_WEEK]) {
      const loc = dayjsLocale(rule);
      for (let doy = 0; doy < 365 * 3 + 1; doy++) {
        const d = new Date(2026, 0, 1 + doy);
        if (weekOfYear(d, rule) !== dayjs(d).locale(loc).week())
          bad.push(`${rule.firstDay}/${rule.minimalDays} ${ymd(d)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('week numbers stay in 1–53 and move by one week at a time', () => {
    for (const rule of [ISO_WEEK, US_WEEK, SAT_WEEK, SAT_US_WEEK, { firstDay: 5, minimalDays: 7 }]) {
      let prev = weekOfYear(new Date(1999, 11, 31), rule);
      for (let i = 0; i < 366 * 12; i++) {
        const d = new Date(2000, 0, 1 + i);
        const w = weekOfYear(d, rule);
        expect(w).toBeGreaterThanOrEqual(1);
        expect(w).toBeLessThanOrEqual(53);
        if (d.getDay() === rule.firstDay) expect(w === prev + 1 || w === 1, ymd(d)).toBe(true);
        else expect(w, ymd(d)).toBe(prev);
        prev = w;
      }
    }
  });

  it('ignores the time of day, also on DST transition days', () => {
    // US DST 2026: Mar 8 and Nov 1; EU: Mar 29 and Oct 25; Lord Howe: Apr 5 and Oct 4
    const days = [
      new Date(2026, 2, 8),
      new Date(2026, 10, 1),
      new Date(2026, 2, 29),
      new Date(2026, 9, 25),
      new Date(2026, 3, 5),
      new Date(2026, 9, 4),
    ];
    for (const rule of [US_WEEK, SAT_WEEK, ISO_WEEK]) {
      for (const day of days) {
        const at = (h: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 30);
        for (const h of [0, 1, 2, 3, 12, 23]) {
          expect(weekOfYear(at(h), rule)).toBe(weekOfYear(day, rule));
          expect(weekYear(at(h), rule)).toBe(weekYear(day, rule));
        }
      }
    }
  });

  it('keeps years 0–99 and brings out-of-range rule fields into range', () => {
    const d = new Date(2026, 11, 28);
    d.setFullYear(50); // Dec 28, year 50
    expect(weekYear(d, ISO_WEEK)).toBeGreaterThanOrEqual(50);
    expect(weekYear(d, ISO_WEEK)).toBeLessThanOrEqual(51);
    const day = new Date(2026, 11, 28);
    expect(weekOfYear(day, { firstDay: 7, minimalDays: 1 })).toBe(weekOfYear(day, US_WEEK));
    expect(weekOfYear(day, { firstDay: -6, minimalDays: 4 })).toBe(weekOfYear(day, ISO_WEEK));
    expect(weekOfYear(day, { firstDay: 0, minimalDays: 0 })).toBe(weekOfYear(day, US_WEEK));
    expect(weekOfYear(day, { firstDay: 1, minimalDays: 9 })).toBe(weekOfYear(day, { firstDay: 1, minimalDays: 7 }));
    expect(weekOfYear(day, { firstDay: Number.NaN, minimalDays: Number.NaN })).toBe(weekOfYear(day, ISO_WEEK));
  });

  it('are public', () => {
    expect(core.weekOfYear).toBe(weekOfYear);
    expect(core.weekYear).toBe(weekYear);
    expect(core.weekNumber).toBe(weekNumber);
  });
});

// ─── weekNumber ───────────────────────────────────────────────

describe('weekNumber', () => {
  /** Today's (1.x) Sunday formula: week 1 holds Jan 1, and the year's last days stay in week 53 or 54. */
  const legacyUs = (d: Date) => {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const day = Math.round(calendarDays(d) - calendarDays(jan1));
    return Math.floor((day + jan1.getDay()) / 7) + 1;
  };

  it('1 (the default) is ISO-8601', () => {
    for (let i = 0; i < 366 * 4; i++) {
      const d = new Date(2025, 0, 1 + i);
      expect(weekNumber(d)).toBe(isoWeek(d));
      expect(weekNumber(d, 1)).toBe(isoWeek(d));
    }
  });

  it('0 is the US rule: today’s numbers, except that the December days of the week holding Jan 1 are week 1', () => {
    const changed: string[] = [];
    for (let i = 0; i < 366 * 6; i++) {
      const d = new Date(2024, 0, 1 + i);
      expect(weekNumber(d, 0)).toBe(weekOfYear(d, US_WEEK));
      if (weekNumber(d, 0) !== legacyUs(d)) {
        // Only Dec 26–31 that fall in the week of the next Jan 1 (week 53 or 54 before)
        expect(d.getMonth()).toBe(11);
        expect(weekNumber(d, 0)).toBe(1);
        expect(weekYear(d, US_WEEK)).toBe(d.getFullYear() + 1);
        changed.push(ymd(d));
      }
    }
    expect(changed).toContain('2026-12-28');
    expect(weekNumber(new Date(2026, 0, 1), 0)).toBe(1);
  });

  it('6 numbers weeks from Saturday (week 1 holds 4 days), no longer by the Sunday formula', () => {
    expect(boundaryDays(2026).map(d => weekNumber(d, 6))).toEqual([52, 52, 52, 52, 52, 1, 1, 1, 1]);
    for (let i = 0; i < 366 * 3; i++) {
      const d = new Date(2026, 0, 1 + i);
      expect(weekNumber(d, 6)).toBe(weekOfYear(d, resolveWeek(undefined, 6).rule));
    }
  });

  it('takes a rule', () => {
    for (const d of boundaryDays(2026)) {
      expect(weekNumber(d, US_WEEK)).toBe(weekOfYear(d, US_WEEK));
      expect(weekNumber(d, SAT_US_WEEK)).toBe(weekOfYear(d, SAT_US_WEEK));
      expect(weekNumber(d, ISO_WEEK)).toBe(isoWeek(d));
    }
  });
});

// ─── Locale rules ─────────────────────────────────────────────

describe('locale week numbering', () => {
  const hasWeekInfo = (() => {
    const loc = new Intl.Locale('de') as Intl.Locale & { getWeekInfo?: unknown; weekInfo?: unknown };
    return typeof loc.getWeekInfo === 'function' || loc.weekInfo !== undefined;
  })();

  it.runIf(hasWeekInfo)('de numbers like ISO and en-US like the US rule', () => {
    const de = resolveWeek('locale', undefined, 'de');
    const us = resolveWeek('locale', undefined, 'en-US');
    expect(de).toEqual({ start: 1, rule: ISO_WEEK });
    expect(us).toEqual({ start: 0, rule: US_WEEK });
    for (const y of [2025, 2026, 2027, 2028]) {
      for (const d of boundaryDays(y)) {
        expect(weekOfYear(d, localeWeekRule('de'))).toBe(isoWeek(d));
        expect(weekYear(d, de.rule)).toBe(isoWeekYear(d));
        expect(weekOfYear(d, localeWeekRule('en-US'))).toBe(weekOfYear(d, US_WEEK));
        expect(weekYear(d, us.rule)).toBe(weekYear(d, US_WEEK));
      }
    }
    // Dec 28 2026: ISO week 53 in Germany, week 1 of 2027 in the US
    expect(weekOfYear(new Date(2026, 11, 28), de.rule)).toBe(53);
    expect(weekOfYear(new Date(2026, 11, 28), us.rule)).toBe(1);
  });

  it.runIf(hasWeekInfo)('a Saturday locale starts the cells on Saturday', () => {
    const eg = resolveWeek('locale', undefined, 'ar-EG');
    expect(eg.start).toBe(6);
    expect(eg.rule.firstDay).toBe(6);
    expect(boundaryDays(2026).map(d => weekOfYear(d, eg.rule))).toEqual(
      boundaryDays(2026).map(d => weekOfYear(d, { firstDay: 6, minimalDays: eg.rule.minimalDays })),
    );
  });

  it('the locale rule (ISO without week data) numbers like dayjs with the same rule', () => {
    for (const tag of ['de', 'en-US', 'ar-EG', 'en-GB', 'fr']) {
      const rule = localeWeekRule(tag);
      if (!hasWeekInfo) expect(rule).toEqual(ISO_WEEK);
      const loc = dayjsLocale(rule);
      for (const d of boundaryDays(2026)) expect(weekOfYear(d, rule)).toBe(dayjs(d).locale(loc).week());
    }
  });
});

// ─── Header labels and week cells ─────────────────────────────

describe('header week labels follow the rule', () => {
  const base: BuildTiersInput = {
    scales: [{ unit: 'week', format: WEEK_FORMATS.number }],
    start: new Date(2026, 11, 14),
    end: new Date(2027, 0, 20),
    pxPerDay: 20,
    now: new Date(2026, 0, 1),
  };
  const weeks = (input: Partial<BuildTiersInput>) =>
    buildTiers({ ...base, ...input })
      .at(-1)!
      .cells.filter(c => !c.partial)
      .map(c => `${ymd(c.start)} ${c.label}`);

  it('unset: Monday cells with ISO numbers (today’s output)', () => {
    const out = weeks({});
    expect(out).toEqual(['2026-12-14 W51', '2026-12-21 W52', '2026-12-28 W53', '2027-1-4 W1', '2027-1-11 W2']);
    expect(weeks({ weekStart: 1 })).toEqual(out);
    expect(weeks({ week: ISO_WEEK })).toEqual(out);
    expect(weeks({ weekStart: 1, week: ISO_WEEK })).toEqual(out);
  });

  it('weekStart 0: Sunday cells with US numbers, week 1 holding Jan 1', () => {
    const out = weeks({ weekStart: 0 });
    expect(out).toEqual(['2026-12-20 W52', '2026-12-27 W1', '2027-1-3 W2', '2027-1-10 W3']);
    expect(weeks({ week: US_WEEK })).toEqual(out); // the cells follow the rule's first day
  });

  it('weekStart 6: Saturday cells with week 1 holding 4 days', () => {
    expect(weeks({ weekStart: 6 })).toEqual(['2026-12-19 W51', '2026-12-26 W52', '2027-1-2 W1', '2027-1-9 W2']);
    expect(weeks({ weekStart: 6, week: SAT_US_WEEK })).toEqual([
      '2026-12-19 W52',
      '2026-12-26 W1',
      '2027-1-2 W2',
      '2027-1-9 W3',
    ]);
  });

  it('a rule with a first day other than 0 / 1 / 6 starts the cells on Monday', () => {
    const fri = weeks({ week: { firstDay: 5, minimalDays: 1 } });
    expect(fri.map(s => s.split(' ')[0])).toEqual(weeks({}).map(s => s.split(' ')[0]));
  });

  it('weekStart and the rule are independent (US numbering with Monday cells)', () => {
    expect(weeks({ weekStart: 1, week: { firstDay: 1, minimalDays: 1 } })).toEqual([
      '2026-12-14 W51',
      '2026-12-21 W52',
      '2026-12-28 W1',
      '2027-1-4 W2',
      '2027-1-11 W3',
    ]);
  });

  it('every week format reads the rule; contexts built by hand without it use weekStart', () => {
    const s = new Date(2026, 11, 27),
      e = new Date(2027, 0, 3);
    const ctx = (week: WeekRule | undefined, weekStart: WeekStart): ScaleFormatContext =>
      ({ unit: 'week', step: 1, labels: DEFAULT_LABELS, weekStart, ...(week && { week }) }) as ScaleFormatContext;
    const run = (f: unknown, c: ScaleFormatContext) =>
      (f as (s: Date, e: Date, c: ScaleFormatContext) => string)(s, e, c);
    expect(run(WEEK_FORMATS.number, ctx(US_WEEK, 0))).toBe('W1');
    expect(run(WEEK_FORMATS.label, ctx(US_WEEK, 0))).toBe('Week 1');
    expect(run(WEEK_FORMATS.numberRange, ctx(US_WEEK, 0))).toBe('W1 · 27–2');
    expect(run(WEEK_FORMATS.number, ctx(ISO_WEEK, 0))).toBe('W52'); // Sunday Dec 27 under ISO
    expect(run(WEEK_FORMATS.number, ctx(undefined, 0))).toBe('W1');
    expect(run(WEEK_FORMATS.number, ctx(undefined, 1))).toBe('W52');
  });

  it('2-week cells keep the week start', () => {
    for (const weekStart of [0, 1, 6] as const) {
      const tier = buildTiers({ ...base, weekStart, scales: [{ unit: 'week', step: 2 }] }).at(-1)!;
      for (const cell of tier.cells) expect(cell.start.getDay()).toBe(weekStart);
    }
  });
});

describe('buildTimeline week labels across the new year', () => {
  const tasks: GanttTask[] = [{ id: 'a', name: 'a', start: new Date(2026, 11, 21), end: new Date(2027, 0, 15) }];
  const now = new Date(2026, 11, 1);
  const labels = (weekStart?: WeekStart) =>
    buildTimeline({
      tasks,
      config: resolveConfig({ viewMode: 'Week', weekStart, showToday: false, fitToWidth: false }),
      now,
    })
      .tiers.at(-1)!
      .cells.filter(c => !c.partial)
      .map(c => `${ymd(c.start)} ${c.label}`);

  it('unset and Monday: ISO, unchanged', () => {
    expect(labels()).toEqual(labels(1));
    expect(labels()).toContain('2026-12-28 W53');
    expect(labels()).toContain('2027-1-4 W1');
  });

  it('Sunday: the week of Jan 1 is W1', () => {
    expect(labels(0)).toContain('2026-12-27 W1');
    expect(labels(0)).toContain('2027-1-3 W2');
  });

  it('Saturday: cells from Saturday', () => {
    expect(labels(6)).toContain('2026-12-26 W52');
    expect(labels(6)).toContain('2027-1-2 W1');
  });
});

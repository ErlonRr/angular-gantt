// Date and duration column widths (D21): max(today's default, the width measured from the
// format + locale / the duration labels). English output keeps the defaults exactly.
import { describe, it, expect } from 'vitest';
import {
  BASELINE_DATE_COLUMN_WIDTH,
  COLUMN_CELL_INSET,
  DATE_COLUMN_WIDTH,
  DEFAULT_LABELS,
  DURATION_COLUMN_WIDTH,
  buildBuiltinColumns,
  dateColumnWidth,
  durationColumnWidth,
  estimateTextWidth,
  formatDate,
  mergeColumnDefs,
  type ColumnDef,
  type GanttLabels,
} from '../index';

const DEFAULTS = { start: 112, end: 112, duration: 96, baselineStart: 124, baselineEnd: 124 };

const widths = (cols: ColumnDef[]) =>
  Object.fromEntries(cols.filter(c => c.key in DEFAULTS).map(c => [c.key, c.width])) as typeof DEFAULTS;

describe('date and duration column widths', () => {
  it("keeps today's widths for English and 'MMM D, YYYY' (112 / 96 / 124)", () => {
    expect([DATE_COLUMN_WIDTH, DURATION_COLUMN_WIDTH, BASELINE_DATE_COLUMN_WIDTH]).toEqual([112, 96, 124]);
    expect(widths(buildBuiltinColumns(DEFAULT_LABELS))).toEqual(DEFAULTS);
    expect(widths(buildBuiltinColumns(DEFAULT_LABELS, 'en', 'MMM D, YYYY'))).toEqual(DEFAULTS);
    expect(widths(buildBuiltinColumns(DEFAULT_LABELS, 'en-US', 'MMM D, YYYY', 12))).toEqual(DEFAULTS);
    // Still the defaults at the 13 px cell font
    expect(widths(buildBuiltinColumns(DEFAULT_LABELS, 'en', 'MMM D, YYYY', 13))).toEqual(DEFAULTS);
    // …and for the short formats the demos use
    expect(widths(buildBuiltinColumns(DEFAULT_LABELS, 'it', 'D MMM YYYY'))).toEqual(DEFAULTS);
    expect(widths(buildBuiltinColumns(DEFAULT_LABELS, 'en', 'YYYY-MM-DD'))).toEqual(DEFAULTS);
  });

  it('measures the longest text of the format: "Sep 28, 2026" is 12 glyphs', () => {
    expect(COLUMN_CELL_INSET).toBe(17);
    expect(dateColumnWidth('MMM D, YYYY', 'en')).toBe(Math.ceil(12 * 12 * 0.56 + 17));
    expect(dateColumnWidth('MMM D, YYYY', 'en')).toBeLessThan(DATE_COLUMN_WIDTH);
    expect(dateColumnWidth('MMM D, YYYY')).toBe(dateColumnWidth('MMM D, YYYY', 'en'));
  });

  it("grows for German long dates ('D. MMMM YYYY')", () => {
    const longest = Math.max(
      ...Array.from({ length: 12 }, (_, m) => formatDate(new Date(2026, m, 28), 'D. MMMM YYYY', 'de').length),
    );
    // "28. September 2026"
    expect(longest).toBe(18);
    const expected = Math.ceil(estimateTextWidth('x'.repeat(longest), 12) + COLUMN_CELL_INSET);
    expect(dateColumnWidth('D. MMMM YYYY', 'de')).toBe(expected);
    expect(expected).toBeGreaterThan(DATE_COLUMN_WIDTH);
    expect(expected).toBeGreaterThan(BASELINE_DATE_COLUMN_WIDTH);

    const de = widths(buildBuiltinColumns(DEFAULT_LABELS, 'de', 'D. MMMM YYYY'));
    expect(de).toEqual({ ...DEFAULTS, start: expected, end: expected, baselineStart: expected, baselineEnd: expected });
    // A bigger font needs more room
    expect(dateColumnWidth('D. MMMM YYYY', 'de', 14)).toBeGreaterThan(expected);
  });

  it('counts weekday names and times of a format', () => {
    // "Wednesday, September 23, 2026" — every weekday and month is sampled
    const w = dateColumnWidth('dddd, MMMM D, YYYY', 'en');
    expect(w).toBe(Math.ceil(estimateTextWidth('Wednesday, September 23, 2026', 12) + COLUMN_CELL_INSET));
    expect(widths(buildBuiltinColumns(DEFAULT_LABELS, 'en', 'dddd, MMMM D, YYYY')).start).toBe(w);
    // A two-digit hour and minute
    expect(dateColumnWidth('MMM D, HH:mm', 'en')).toBe(
      Math.ceil(estimateTextWidth('Sep 28, 22:58', 12) + COLUMN_CELL_INSET),
    );
  });

  it('memoises per format, locale and font size', () => {
    const a = dateColumnWidth('D. MMMM YYYY', 'de', 12);
    expect(dateColumnWidth('D. MMMM YYYY', 'de', 12)).toBe(a);
    expect(dateColumnWidth('D. MMMM YYYY', 'de', 13)).not.toBe(a);
    // Many formats don't grow the cache without bound, and keep giving the same answers
    for (let i = 0; i < 100; i++) dateColumnWidth(`[${'x'.repeat(i)}] YYYY`, 'en');
    expect(dateColumnWidth('D. MMMM YYYY', 'de', 12)).toBe(a);
  });

  it('measures the duration labels', () => {
    // "< 1 day" is the longest English text: far below the default 96
    expect(durationColumnWidth(DEFAULT_LABELS)).toBe(Math.ceil(estimateTextWidth('< 1 day', 12) + COLUMN_CELL_INSET));
    expect(durationColumnWidth(DEFAULT_LABELS)).toBeLessThan(DURATION_COLUMN_WIDTH);

    const it: GanttLabels = {
      ...DEFAULT_LABELS,
      durationLessThanDay: '< 1 giorno',
      durationDay: '1 giorno',
      durationDays: n => `${n} giorni`,
      durationWeeks: w => `${w} sett`,
      durationWeeksDays: (w, d) => `${w} sett ${d}g`,
    };
    expect(widths(buildBuiltinColumns(it, 'it', 'D MMM YYYY')).duration).toBe(96);

    const de: GanttLabels = {
      ...DEFAULT_LABELS,
      durationLessThanDay: 'weniger als ein Tag',
      durationWeeksDays: (w, d) => `${w} Wochen und ${d} Tage`,
    };
    // "52 Wochen und 6 Tage" (20 glyphs)
    const expected = Math.ceil(estimateTextWidth('52 Wochen und 6 Tage', 12) + COLUMN_CELL_INSET);
    expect(durationColumnWidth(de)).toBe(expected);
    expect(widths(buildBuiltinColumns(de)).duration).toBe(expected);
    expect(expected).toBeGreaterThan(DURATION_COLUMN_WIDTH);
  });

  it('a consumer column without a width inherits the measured width', () => {
    const builtins = buildBuiltinColumns(DEFAULT_LABELS, 'de', 'D. MMMM YYYY');
    // Like an Angular `<gantt-column key="start">` with no width input
    const [start] = mergeColumnDefs([{ key: 'start', label: 'Beginn' } as ColumnDef], builtins);
    expect(start.width).toBe(dateColumnWidth('D. MMMM YYYY', 'de'));
    // Min widths are unchanged
    expect(builtins.find(c => c.key === 'start')!.minWidth).toBe(72);
  });
});

// ─────────────────────────────────────────────────────────────
//  Tests — i18n / formatting (locale, labels, header/date formats)
//  Run with: npx vitest
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import 'dayjs/locale/it';

import { generateHeaderRows, formatDate, durationLabel } from '../gantt-math';
import { buildDefaultColumns } from '../gantt-data';
import { ViewMode, GanttI18n, GanttLabels, GanttFlatRow, DEFAULT_LABELS, DEFAULT_FORMATS } from '../types';

// Build a full i18n bundle from the defaults + a partial override.
const bundle = (
  over: {
    locale?: string;
    labels?: Partial<GanttLabels>;
    formats?: Partial<typeof DEFAULT_FORMATS>;
  } = {},
): GanttI18n => ({
  locale: over.locale,
  labels: { ...DEFAULT_LABELS, ...over.labels } as GanttLabels,
  formats: { ...DEFAULT_FORMATS, ...over.formats },
});

const JAN1 = new Date('2026-01-01');
const JUN30 = new Date('2026-06-30');

// ─── formatDate ───────────────────────────────────────────────

describe('formatDate', () => {
  it('uses the default English locale', () => {
    expect(formatDate(new Date('2026-01-15'), 'MMMM')).toBe('January');
  });

  it('honours a dayjs locale', () => {
    expect(formatDate(new Date('2026-01-15'), 'MMMM', 'it')).toBe('gennaio');
  });

  it('honours a custom format string', () => {
    expect(formatDate(new Date('2026-03-05'), 'YYYY-MM-DD')).toBe('2026-03-05');
  });
});

// ─── durationLabel ────────────────────────────────────────────

describe('durationLabel', () => {
  const a = new Date('2026-01-01');

  it('defaults to English', () => {
    expect(durationLabel(a, a)).toBe('< 1 day');
  });

  it('applies label overrides', () => {
    expect(durationLabel(a, a, { durationLessThanDay: 'meno di 1g' })).toBe('meno di 1g');
    expect(durationLabel(a, new Date('2026-01-04'), { durationDays: n => `${n}g` })).toMatch(/^\d+g$/);
  });
});

// ─── generateHeaderRows (i18n) ────────────────────────────────

describe('generateHeaderRows · i18n', () => {
  it('localises month names via locale (Month view, bottom row)', () => {
    const [, bottom] = generateHeaderRows(ViewMode.Month, JAN1, JUN30, 8, bundle({ locale: 'it' }));
    // First bottom cell is January → "gen" in Italian
    expect(bottom.cells[0].label.toLowerCase()).toContain('gen');
  });

  it('applies the quarter prefix from labels (Month view, top row)', () => {
    const [top] = generateHeaderRows(ViewMode.Month, JAN1, JUN30, 8, bundle({ labels: { quarterPrefix: 'T' } }));
    expect(top.cells[0].label.startsWith('T1')).toBe(true);
  });

  it('applies the half-year prefix (Year view, bottom row)', () => {
    const [, bottom] = generateHeaderRows(
      ViewMode.Year,
      JAN1,
      new Date('2026-12-31'),
      2,
      bundle({ labels: { halfPrefix: 'S' } }),
    );
    expect(bottom.cells[0].label).toBe('S1');
  });

  it('uses a custom per-view header formatter when provided', () => {
    const b = bundle({ formats: { header: { [ViewMode.Year]: { top: () => 'ANNO' } } } });
    const [top] = generateHeaderRows(ViewMode.Year, JAN1, new Date('2026-12-31'), 2, b);
    expect(top.cells[0].label).toBe('ANNO');
  });

  it('falls back to English defaults when no i18n is passed', () => {
    const [top] = generateHeaderRows(ViewMode.Month, JAN1, JUN30, 8);
    expect(top.cells[0].label.startsWith('Q1')).toBe(true);
  });
});

// ─── buildDefaultColumns (i18n) ───────────────────────────────

describe('buildDefaultColumns', () => {
  const row = { task: { start: new Date('2026-01-05'), end: new Date('2026-02-10'), progress: 40 } } as GanttFlatRow;

  it('localises the column headers', () => {
    const cols = buildDefaultColumns({ ...DEFAULT_LABELS, colName: 'Attività', colStart: 'Inizio' } as GanttLabels);
    expect(cols.find(c => c.key === 'name')!.label).toBe('Attività');
    expect(cols.find(c => c.key === 'start')!.label).toBe('Inizio');
  });

  it('formats date cells with the given locale + format', () => {
    const cols = buildDefaultColumns(DEFAULT_LABELS, 'it', 'D MMMM YYYY');
    const startCol = cols.find(c => c.key === 'start')!;
    expect(startCol.render!(row)).toBe('5 gennaio 2026');
  });
});

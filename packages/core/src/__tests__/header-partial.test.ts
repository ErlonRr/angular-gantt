// Partial header cells (D22): a cell clipped by the timeline range is flagged `partial`, and
// hides its label only when it is also narrower than the estimated label + 12 px.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ZOOM_LEVELS,
  HEADER_LABEL_PADDING,
  ViewMode,
  buildTiers,
  buildTimeline,
  estimateTextWidth,
  findZoomLevel,
  partialLabelHidden,
  resolveConfig,
  type GanttScale,
  type ScaleCell,
} from '../index';

const YEAR_VIEW = findZoomLevel(DEFAULT_ZOOM_LEVELS, ViewMode.Year).scales;
const QUARTER_VIEW = findZoomLevel(DEFAULT_ZOOM_LEVELS, ViewMode.Quarter).scales;

/** Tiers over local dates [start, end) — the way `buildTimeline` calls `buildTiers`. */
const tiers = (scales: GanttScale[], start: Date, end: Date, pxPerDay: number, labelFontPx?: number) =>
  buildTiers({
    scales,
    start,
    end,
    pxPerDay,
    now: new Date(2000, 0, 1),
    normalizeDateOnly: false,
    ...(labelFontPx !== undefined && { labelFontPx }),
  });

const summary = (cells: ScaleCell[]) => cells.map(c => ({ label: c.label, width: c.width, partial: !!c.partial }));

describe('partial header cells', () => {
  it('flags the clipped first and last cells of a tier and only those', () => {
    // Year view (2 px/day) from 1 Jul 2025 to 15 Jan 2026
    const [years, halves] = tiers(YEAR_VIEW, new Date(2025, 6, 1), new Date(2026, 0, 15), 2);
    expect(summary(years.cells)).toEqual([
      { label: '2025', width: 368, partial: true },
      // 14 days × 2 px = 28 px < 4 × 12 × 0.56 + 12 ≈ 38.9 px: the label is hidden
      { label: '', width: 28, partial: true },
    ]);
    // H2 2025 is whole; H1 2026 is clipped at the end, but wide enough for "H1" (25.4 px)
    expect(summary(halves.cells)).toEqual([
      { label: 'H2', width: 368, partial: false },
      { label: 'H1', width: 28, partial: true },
    ]);
    expect(halves.cells[0]).not.toHaveProperty('partial');
  });

  it('keeps the label of a wide clipped cell (sticky upper-tier labels)', () => {
    // Quarter view (4 px/day) starting mid-year: the year cell starts before the range
    const [years] = tiers(QUARTER_VIEW, new Date(2025, 9, 1), new Date(2026, 3, 1), 4);
    const first = years.cells[0];
    expect(first.partial).toBe(true);
    expect(first.label).toBe('2025');
    expect(first.width).toBe(92 * 4);
    // The 2026 cell ends at the range end exactly (1 Apr is inside 2026): clipped, wide, labelled
    expect(years.cells[1]).toMatchObject({ label: '2026', partial: true });
  });

  it('hides a clipped label at the start of the range too', () => {
    // 12 days of 2025 at 2 px/day = 24 px
    const [years] = tiers(YEAR_VIEW, new Date(2025, 11, 20), new Date(2026, 6, 1), 2);
    expect(summary(years.cells)[0]).toEqual({ label: '', width: 24, partial: true });
    expect(years.cells[1].label).toBe('2026');
  });

  it('never hides the label of a whole cell, however narrow', () => {
    const days: GanttScale[] = [{ unit: 'day', format: 'D' }];
    const [bottom] = tiers(days, new Date(2026, 2, 1), new Date(2026, 2, 11), 4);
    expect(bottom.cells).toHaveLength(10);
    expect(bottom.cells.every(c => c.width === 4 && c.label !== '' && c.partial === undefined)).toBe(true);
  });

  it('estimates labels at labelFontPx (default 12)', () => {
    const range = [new Date(2025, 6, 1), new Date(2026, 0, 15)] as const;
    // "2026" in 28 px: hidden at 12 px (38.9 px needed), shown at 3 px (18.7 px needed)
    expect(tiers(YEAR_VIEW, ...range, 2)[0].cells[1].label).toBe('');
    expect(tiers(YEAR_VIEW, ...range, 2, 12)[0].cells[1].label).toBe('');
    expect(tiers(YEAR_VIEW, ...range, 2, 3)[0].cells[1].label).toBe('2026');
  });

  it('partialLabelHidden: narrower than estimateTextWidth + HEADER_LABEL_PADDING', () => {
    expect(HEADER_LABEL_PADDING).toBe(12);
    for (const label of ['2026', 'Q3', 'H1', 'September 2026', 'Wed 14 Oct'])
      for (const fontPx of [10, 12, 13])
        for (const width of [0, 10, 24, 30, 40, 60, 90, 120]) {
          const needed = estimateTextWidth(label, fontPx) + HEADER_LABEL_PADDING;
          expect(partialLabelHidden(label, width, fontPx)).toBe(width < needed);
        }
    // Exactly enough room keeps the label; an empty label is never "hidden"
    expect(partialLabelHidden('ab', 2 * 12 * 0.56 + 12, 12)).toBe(false);
    expect(partialLabelHidden('', 0)).toBe(false);
  });

  it('buildTimeline: an hour-view day cell cut to one hour loses its label, a whole day keeps it', () => {
    const config = resolveConfig({ viewMode: ViewMode.Hour, showToday: false, timelinePadding: 0 });
    const tl = buildTimeline({
      tasks: [{ id: 'a', name: 'A', start: new Date(2026, 2, 10, 23), end: new Date(2026, 2, 12, 1) }],
      config,
      now: new Date(2026, 2, 11, 12),
    });
    const [days, hours] = tl.tiers;
    // The range starts at 23:00 on 10 March: that day is a 40 px sliver ("Tue 10 Mar" needs 79 px)
    expect(days.cells[0]).toMatchObject({ label: '', width: 40, partial: true });
    for (const cell of days.cells) {
      const clipped = cell.start < tl.start || cell.end > tl.end;
      expect(!!cell.partial).toBe(clipped);
      expect(cell.label === '').toBe(clipped && partialLabelHidden(cell.label || 'Tue 10 Mar', cell.width));
    }
    expect(days.cells[1]).toMatchObject({ label: 'Wed 11 Mar', width: 960 });
    expect(days.cells[1]).not.toHaveProperty('partial');
    // The bottom tier is aligned to the range: nothing partial
    expect(hours.cells.some(c => c.partial)).toBe(false);
  });
});

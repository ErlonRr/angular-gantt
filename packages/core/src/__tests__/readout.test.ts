// ─────────────────────────────────────────────────────────────
//  Tests — render/readout.ts (drag readout text and placement) and the
//  new task dates `DragSession` puts on its previews.
//  (runs under test:tz: dates are built with new Date(y, m, d, h), or are
//  date-only UTC values that must read as the same local day everywhere)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { DEFAULT_FORMATS, DEFAULT_LABELS, type GanttI18n, type GanttTask } from '../types';
import { dateToPixel, formatDate } from '../gantt-math';
import { resolveConfig } from '../render/config';
import { taskDurationLabel } from '../render/columns';
import { DragSession, type DragTiming } from '../render/drag';
import { computeDragGhostVisual } from '../render/ghost';
import { buildTimeline, computeRowGeometries, taskSpan } from '../render/timeline';
import { flattenTree, filterVisible, reindexVisible } from '../gantt-data';
import {
  DRAG_READOUT_EDGE,
  DRAG_READOUT_FONT_PX,
  DRAG_READOUT_FORMAT,
  DRAG_READOUT_GAP,
  DRAG_READOUT_HEIGHT,
  DRAG_READOUT_HOUR_FORMAT,
  DRAG_READOUT_PAD_X,
  dragReadoutWidth,
  formatDragReadout,
  placeDragReadout,
  type DragReadoutOptions,
  type DragReadoutView,
} from '../render/readout';

const exclusive = { endDateMode: 'exclusive', normalizeDateOnly: true } as const;
const inclusive = { endDateMode: 'inclusive', normalizeDateOnly: true } as const;
const opts = (over: Partial<DragReadoutOptions> = {}): DragReadoutOptions => ({
  labels: DEFAULT_LABELS,
  dates: exclusive,
  unit: 'day',
  ...over,
});
const d = (m: number, day: number, h = 0) => new Date(2025, m, day, h);

describe('formatDragReadout', () => {
  it('formats the range and the duration through labels.dragReadout', () => {
    expect(DRAG_READOUT_FORMAT).toBe('D MMM');
    expect(formatDragReadout({ start: d(2, 3), end: d(2, 6) }, opts())).toBe('3 Mar – 6 Mar · 3 days');
    expect(formatDragReadout({ start: d(2, 3), end: d(2, 14) }, opts())).toBe('3 Mar – 14 Mar · 1w 4d');
  });

  it('reads the duration like the bar and the Duration column: an inclusive end counts its last day', () => {
    const range = { start: d(2, 3), end: d(2, 14) };
    expect(formatDragReadout(range, opts({ dates: inclusive }))).toBe('3 Mar – 14 Mar · 1w 5d');
    expect(formatDragReadout(range, opts({ dates: inclusive }))).toContain(
      taskDurationLabel(range, inclusive, DEFAULT_LABELS),
    );
  });

  it('shows one date when both ends read the same (a one-day task with an inclusive end)', () => {
    expect(formatDragReadout({ start: d(2, 3), end: d(2, 3) }, opts({ dates: inclusive }))).toBe('3 Mar · 1 day');
  });

  it('a milestone shows its date only', () => {
    expect(formatDragReadout({ start: d(2, 16), end: d(2, 16) }, opts({ milestone: true }))).toBe('16 Mar');
  });

  it('reads date-only UTC values (JSON dates) as the same local day in every time zone', () => {
    const range = { start: new Date('2025-03-03'), end: new Date('2025-03-06') };
    expect(formatDragReadout(range, opts())).toBe('3 Mar – 6 Mar · 3 days');
  });

  it('shows the time on hour scales, and only the time for an end on the same day', () => {
    expect(DRAG_READOUT_HOUR_FORMAT).toBe('D MMM HH:mm');
    const sameDay = { start: d(2, 3, 9), end: d(2, 3, 17) };
    const text = formatDragReadout(sameDay, opts({ unit: 'hour' }));
    expect(text).toBe(`3 Mar 09:00 – 17:00 · ${taskDurationLabel(sameDay, exclusive, DEFAULT_LABELS)}`);
    expect(formatDragReadout({ start: d(2, 3, 22), end: d(2, 4, 2) }, opts({ unit: 'hour' }))).toMatch(
      /^3 Mar 22:00 – 4 Mar 02:00 · /,
    );
  });

  it('a custom format is used for both dates as is', () => {
    const fmt = 'YYYY-MM-DD';
    expect(formatDragReadout({ start: d(2, 3), end: d(2, 6) }, opts({ format: fmt }))).toBe(
      '2025-03-03 – 2025-03-06 · 3 days',
    );
    expect(formatDragReadout({ start: d(2, 3, 9), end: d(2, 3, 17) }, opts({ format: fmt, unit: 'hour' }))).toBe(
      '2025-03-03 · 1 day',
    );
  });

  it('uses the locale for the month names and the labels for the words', () => {
    const range = { start: d(2, 3), end: d(2, 6) };
    const de = formatDragReadout(range, opts({ locale: 'de' }));
    expect(de).toBe(
      `${formatDate(d(2, 3), DRAG_READOUT_FORMAT, 'de')} – ${formatDate(d(2, 6), DRAG_READOUT_FORMAT, 'de')} · 3 days`,
    );
    const it = formatDragReadout(
      range,
      opts({
        locale: 'it',
        labels: { ...DEFAULT_LABELS, durationDays: n => `${n} giorni`, dragReadout: (r, dur) => `${dur} (${r})` },
      }),
    );
    expect(it).toBe(
      `3 giorni (${formatDate(d(2, 3), DRAG_READOUT_FORMAT, 'it')} – ${formatDate(d(2, 6), DRAG_READOUT_FORMAT, 'it')})`,
    );
  });

  it("is '' without dates (a preview built by hand)", () => {
    expect(formatDragReadout({}, opts())).toBe('');
    expect(formatDragReadout({ start: d(2, 3) }, opts())).toBe('');
    expect(formatDragReadout({ start: d(2, 3), end: undefined }, opts())).toBe('');
  });
});

describe('dragReadoutWidth', () => {
  it('estimates the chip from its text, padding included', () => {
    expect(dragReadoutWidth('')).toBe(2 * DRAG_READOUT_PAD_X);
    expect(dragReadoutWidth('3 Mar – 6 Mar · 3 days')).toBeGreaterThan(dragReadoutWidth('3 Mar'));
    expect(dragReadoutWidth('abcd', 10)).toBe(Math.ceil(4 * 10 * 0.56 + 2 * DRAG_READOUT_PAD_X));
    expect(DRAG_READOUT_FONT_PX).toBe(11);
  });
});

describe('placeDragReadout', () => {
  const HEADER = 56;
  const view = (over: Partial<DragReadoutView> = {}): DragReadoutView => ({
    scrollLeft: 0,
    viewportWidth: 800,
    scrollTop: 0,
    headerHeight: HEADER,
    width: 120,
    ...over,
  });
  // A ghost in the third row: row top 80, bar 24 px high in a 36 px row, "+3d" label on the row top
  const ghost = { x: 300, y: 86, width: 100, height: 24, label: { y: 80, fontPx: 11 } };

  it('centres above the ghost and its label, below the sticky header (content px)', () => {
    expect(DRAG_READOUT_HEIGHT).toBe(20);
    expect(placeDragReadout(ghost, view())).toEqual({
      x: 350,
      y: HEADER + 80 - 11 - DRAG_READOUT_GAP - DRAG_READOUT_HEIGHT,
      align: 'center',
      side: 'above',
    });
  });

  it('without a label it sits right above the bar', () => {
    const p = placeDragReadout({ ...ghost, label: null }, view());
    expect(p.y).toBe(HEADER + 86 - DRAG_READOUT_GAP - DRAG_READOUT_HEIGHT);
  });

  it('pushes against the visible start or end instead of clipping', () => {
    expect(placeDragReadout({ ...ghost, x: 10, width: 30 }, view())).toMatchObject({
      x: DRAG_READOUT_EDGE,
      align: 'start',
    });
    expect(placeDragReadout({ ...ghost, x: 760, width: 30 }, view())).toMatchObject({
      x: 800 - DRAG_READOUT_EDGE,
      align: 'end',
    });
  });

  it('follows the scroll position (the chip scrolls with the content)', () => {
    const p = placeDragReadout({ ...ghost, x: 1300 }, view({ scrollLeft: 1000, scrollTop: 0 }));
    expect(p).toMatchObject({ x: 1350, align: 'center' });
    expect(placeDragReadout({ ...ghost, x: 1010, width: 20 }, view({ scrollLeft: 1000 }))).toMatchObject({
      x: 1000 + DRAG_READOUT_EDGE,
      align: 'start',
    });
  });

  it('centres on the visible part of a ghost cut by the viewport', () => {
    const p = placeDragReadout({ ...ghost, x: -400, width: 800 }, view({ width: 0 }));
    expect(p).toMatchObject({ x: (DRAG_READOUT_EDGE + 400) / 2, align: 'center' });
  });

  it('stays in view when the ghost is out of view (auto-scroll catching up)', () => {
    expect(placeDragReadout({ ...ghost, x: 2000 }, view())).toMatchObject({ x: 800 - DRAG_READOUT_EDGE, align: 'end' });
    expect(placeDragReadout({ ...ghost, x: -500 }, view())).toMatchObject({ x: DRAG_READOUT_EDGE, align: 'start' });
  });

  it('a chip wider than the view starts at the visible start', () => {
    expect(placeDragReadout(ghost, view({ width: 900 }))).toMatchObject({ x: DRAG_READOUT_EDGE, align: 'start' });
  });

  it('goes below the bar when the sticky header leaves no room above', () => {
    const p = placeDragReadout(ghost, view({ scrollTop: 60 }));
    expect(p).toMatchObject({ side: 'below', y: HEADER + 86 + 24 + DRAG_READOUT_GAP });
    const top = placeDragReadout({ x: 300, y: 6, width: 100, height: 24, label: { y: 0, fontPx: 11 } }, view());
    expect(top).toMatchObject({ side: 'below', y: HEADER + 6 + 24 + DRAG_READOUT_GAP });
  });

  it('never goes under the sticky header or (with a height) past the bottom', () => {
    const scrolledPast = placeDragReadout(ghost, view({ scrollTop: 400 }));
    expect(scrolledPast.y).toBe(400 + HEADER + DRAG_READOUT_EDGE);
    // Below the bar (170) would cross the bottom of a 120 px viewport
    const short = placeDragReadout(ghost, view({ scrollTop: 60, viewportHeight: 120 }));
    expect(short).toMatchObject({ side: 'below', y: 60 + 120 - DRAG_READOUT_EDGE - DRAG_READOUT_HEIGHT });
    expect(placeDragReadout(ghost, view({ scrollTop: 60, viewportHeight: 400 })).y).toBe(
      HEADER + 86 + 24 + DRAG_READOUT_GAP,
    );
  });

  it('custom size, gap and edge; rounded', () => {
    const p = placeDragReadout(
      { x: 300.4, y: 86.3, width: 99.9, height: 24, label: null },
      view({ height: 30, gap: 10, edge: 12 }),
    );
    expect(p).toEqual({
      x: Math.round(300.4 + 99.9 / 2),
      y: Math.round(HEADER + 86.3 - 10 - 30),
      align: 'center',
      side: 'above',
    });
  });
});

// ─── With the real drag pipeline ──────────────────────────────

const day26 = (m: number, dd: number, h = 0) => new Date(2026, m, dd, h);
const origin = day26(0, 1);
const timing = (snap: 'day' | 'hour' = 'day', endDateMode: 'exclusive' | 'inclusive' = 'exclusive'): DragTiming => {
  const pxPerDay = snap === 'hour' ? 240 : 20;
  return {
    pxPerDay,
    toX: x => dateToPixel(x, origin, pxPerDay),
    span: (start, end) => taskSpan({ start, end }, { endDateMode, normalizeDateOnly: true }),
    snap,
  };
};
const row = { y: 40, height: 32 };

describe('DragSession previews carry the new task dates', () => {
  const start = day26(2, 10);
  const end = day26(2, 14);

  it('move, resize right and resize left: the dates finish() would emit', () => {
    for (const [handle, px] of [
      ['bar', 60],
      ['right', 40],
      ['left', -60],
      ['left', 400], // clamped: keeps one day
    ] as const) {
      const s = new DragSession('a', handle, start, end, 0, row, timing());
      const p = s.preview(px);
      const r = s.finish(px);
      expect(p.start).toEqual(r?.event.newStart);
      expect(p.end).toEqual(r?.event.newEnd);
    }
  });

  it('nothing moved: the original dates', () => {
    const p = new DragSession('a', 'bar', start, end, 0, row, timing()).preview(4);
    expect(p).toMatchObject({ delta: 0, start, end });
  });

  it('hour scales shift by hours', () => {
    const p = new DragSession('a', 'bar', day26(2, 10, 9), day26(2, 10, 17), 0, row, timing('hour')).preview(30);
    expect(p).toMatchObject({ unit: 'hour', delta: 3, start: day26(2, 10, 12), end: day26(2, 10, 20) });
    expect(formatDragReadout(p, opts({ unit: p.unit }))).toMatch(/^10 Mar 12:00 – 20:00 · /);
  });

  it('a preview goes straight into formatDragReadout', () => {
    const p = new DragSession('a', 'bar', start, end, 0, row, timing()).preview(60);
    expect(formatDragReadout(p, opts({ unit: p.unit }))).toBe('13 Mar – 17 Mar · 4 days');
    const inc = new DragSession('a', 'right', start, end, 0, row, timing('day', 'inclusive')).preview(40);
    expect(formatDragReadout(inc, opts({ unit: inc.unit, dates: inclusive }))).toBe('10 Mar – 16 Mar · 1w');
  });

  it('places the chip above the ghost computeDragGhostVisual draws', () => {
    const i18n: GanttI18n = { labels: DEFAULT_LABELS, formats: DEFAULT_FORMATS };
    const tasks: GanttTask[] = [
      { id: 'a', name: 'Design', start: day26(2, 10), end: day26(2, 14) },
      { id: 'b', name: 'Build', start: day26(2, 12), end: day26(2, 18) },
      { id: 'c', name: 'Test', start: day26(2, 16), end: day26(2, 20) },
    ];
    const cfg = resolveConfig({}, i18n);
    const tl = buildTimeline({ tasks, config: cfg, now: day26(2, 11) });
    const geo = computeRowGeometries(reindexVisible(filterVisible(flattenTree(tasks, new Set()))), tl, cfg)[2];
    const session = new DragSession(
      'c',
      'bar',
      tasks[2].start,
      tasks[2].end,
      100,
      { y: geo.y, height: geo.height },
      { pxPerDay: cfg.pxPerDay, toX: tl.toX, span: (s, e) => taskSpan({ start: s, end: e }, cfg), snap: 'day' },
    );
    const preview = session.preview(100 + 2 * cfg.pxPerDay);
    const ghost = computeDragGhostVisual(preview, geo, cfg, tl.toX, i18n, 12);
    expect(ghost.label).not.toBeNull();
    const text = formatDragReadout(preview, opts({ unit: preview.unit }));
    const v = { scrollLeft: 0, viewportWidth: 2000, scrollTop: 0, headerHeight: 48, width: dragReadoutWidth(text) };
    const p = placeDragReadout(ghost, v);
    expect(p.side).toBe('above');
    expect(p.align).toBe('center');
    expect(p.x).toBe(Math.round(ghost.x + ghost.width / 2));
    expect(p.y).toBe(Math.round(48 + ghost.label!.y - ghost.label!.fontPx - DRAG_READOUT_GAP - DRAG_READOUT_HEIGHT));
  });
});

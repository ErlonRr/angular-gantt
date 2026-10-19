// ─────────────────────────────────────────────────────────────
//  Tests — print pagination (Phase 12, step 2.4, D11 / D12):
//  `paperSizePx` (every paper and orientation, `'auto'`, custom sizes),
//  `paginateChart` on hand-built export models (fit width / page /
//  none, the minScale floor, rows never split, repeatHeader and
//  repeatTable, the half-width table rule, cell-boundary snapping, the
//  legend's page, the footer reserve, maxPages, down-then-across
//  order), `printCss`, and `exportChartPages` composed from a headless
//  source (`createExportSource`, `buildExportModel`, `renderExportSvg`:
//  steps 2.1 and 2.3).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  PAPER_SIZES_MM,
  PRINT_FOOTER_HEIGHT,
  PX_PER_MM,
  exportChartPages,
  paginateChart,
  paperSizePx,
  printCss,
  type PrintPlan,
} from '../export/paginate';
import type { ExportModel, ExportRow } from '../export/model';
import type { ExportTimeline, ExportTierCell } from '../export/timeline';
import type { ExportTable } from '../export/table';
import type { ExportLegend } from '../export/legend';
import { buildExportModel } from '../export/model';
import { createExportSource, type GanttHeadlessInput } from '../export/source';
import { resolveExportCall } from '../export/files';
import { resolveExportFormat, type ResolvedPrintExport } from '../render/config';
import { resolveTheme } from '../render/theme';
import type { GanttOptions, GanttPrintOptions, GanttTask } from '../types';

// ─── Fixtures ────────────────────────────────────────────────

const theme = resolveTheme(false);

interface ModelSpec {
  /** Row heights, top to bottom (default 20 rows of 30 px) */
  rows?: readonly number[];
  headerHeight?: number;
  /** Task list width, or `null` without a task list (chart view) */
  table?: number | null;
  /** Timeline px drawn, or `null` without a timeline (table view) */
  x0?: number;
  x1?: number;
  timeline?: boolean;
  /** Width of the bottom tier's cells */
  cell?: number;
  /** Legend strip height, or `null` without a legend */
  legend?: number | null;
  title?: string;
}

/** A hand-built export model: only what pagination reads is meaningful. */
function model(spec: ModelSpec = {}): ExportModel {
  const heights = spec.rows ?? Array.from({ length: 20 }, () => 30);
  const headerHeight = spec.headerHeight ?? 50;
  const tableW = spec.table === undefined ? 300 : spec.table;
  const x0 = spec.x0 ?? 0;
  const x1 = spec.x1 ?? 1000;
  const cell = spec.cell ?? 100;
  let y = 0;
  const rows: ExportRow[] = heights.map((h, i) => {
    const row: ExportRow = { id: `t${i}`, y, height: h, fill: '#fff', separator: null };
    y += h;
    return row;
  });
  const bodyHeight = y;
  const cells: ExportTierCell[] = [];
  for (let x = Math.floor(x0 / cell) * cell; x < x1; x += cell)
    cells.push({ x, width: cell, label: null, current: false, border: null });
  const timeline: ExportTimeline | null =
    spec.timeline === false
      ? null
      : {
          x: tableW ?? 0,
          x0,
          x1,
          width: x1 - x0,
          tiers: [
            {
              y: 0,
              height: 25,
              unit: 'month',
              cells: [{ x: x0, width: x1 - x0, label: null, current: false, border: null }],
              bands: [],
            },
            { y: 25, height: 25, unit: 'day', cells, bands: [] },
          ],
          lane: null,
          todayPointer: null,
          bands: [],
          minor: null,
          major: null,
          todayX: null,
          annotations: [],
          arrows: [],
          bars: [],
        };
  const table: ExportTable | null =
    tableW === null
      ? null
      : {
          width: tableW,
          header: { fill: '#eee', cells: [], border: { stroke: '#ccc', width: 1, dash: null } },
          rows: [],
          border: { stroke: '#ccc', width: 1, dash: null },
        };
  const legendH = spec.legend === undefined ? null : spec.legend;
  const legend: ExportLegend | null =
    legendH === null ? null : { y: headerHeight + bodyHeight, height: legendH, title: null, items: [] };
  const width = (tableW ?? 0) + (timeline ? x1 - x0 : 0);
  return {
    width,
    height: headerHeight + bodyHeight + (legendH ?? 0),
    theme,
    background: '#fff',
    fontFamily: 'sans-serif',
    fontPx: 13,
    title: spec.title ?? 'Plan',
    description: '',
    lang: 'en',
    headerHeight,
    bodyHeight,
    rows,
    table,
    timeline,
    legend,
    empty: rows.length === 0 ? { text: 'No tasks', x: width / 2, y: 20 } : null,
  };
}

const opts = (o: GanttPrintOptions = {}): ResolvedPrintExport => resolveExportFormat('print', o);

/** A4 landscape, 10 mm margins: the page area in page px (footer reserve out). */
const A4L = { w: 277 * PX_PER_MM, h: 190 * PX_PER_MM - PRINT_FOOTER_HEIGHT };

/** Each page's row range, as `[start, end)` pairs of the first column. */
const rowRanges = (plan: PrintPlan) => plan.pages.filter(p => p.column === 0).map(p => [p.rowStart, p.rowEnd]);

// ─── paperSizePx ─────────────────────────────────────────────

describe('paperSizePx', () => {
  const drawing = { width: 100, height: 100 };

  it.each(Object.entries(PAPER_SIZES_MM))('%s in both orientations', (name, mm) => {
    const paper = name as keyof typeof PAPER_SIZES_MM;
    const portrait = paperSizePx(paper, 'portrait', drawing);
    expect(portrait.width).toBeCloseTo(mm.width * PX_PER_MM, 6);
    expect(portrait.height).toBeCloseTo(mm.height * PX_PER_MM, 6);
    const landscape = paperSizePx(paper, 'landscape', drawing);
    expect(landscape.width).toBeCloseTo(mm.height * PX_PER_MM, 6);
    expect(landscape.height).toBeCloseTo(mm.width * PX_PER_MM, 6);
  });

  it('A4 is 793.7 × 1122.5 px at 96 px per inch, letter 816 × 1056', () => {
    const a4 = paperSizePx('a4', 'portrait', drawing);
    expect(a4.width).toBeCloseTo(793.7, 1);
    expect(a4.height).toBeCloseTo(1122.52, 1);
    const letter = paperSizePx('letter', 'portrait', drawing);
    expect(letter.width).toBeCloseTo(816, 6);
    expect(letter.height).toBeCloseTo(1056, 6);
  });

  it("'auto' follows the drawing: landscape when wider than tall, else portrait", () => {
    expect(paperSizePx('a4', 'auto', { width: 2000, height: 600 }).width).toBeCloseTo(297 * PX_PER_MM, 6);
    expect(paperSizePx('a4', 'auto', { width: 600, height: 2000 }).width).toBeCloseTo(210 * PX_PER_MM, 6);
    expect(paperSizePx('a4', 'auto', { width: 500, height: 500 }).width).toBeCloseTo(210 * PX_PER_MM, 6);
  });

  it('custom sizes in mm and in, read as their shorter and longer side', () => {
    expect(paperSizePx({ width: 8.5, height: 11, unit: 'in' }, 'landscape', drawing)).toEqual({
      width: 1056,
      height: 816,
    });
    const mm = paperSizePx({ width: 300, height: 100, unit: 'mm' }, 'portrait', drawing);
    expect(mm.width).toBeCloseTo(100 * PX_PER_MM, 6);
    expect(mm.height).toBeCloseTo(300 * PX_PER_MM, 6);
  });

  it('an unknown name or a size that is not positive is A4', () => {
    const a4 = paperSizePx('a4', 'portrait', drawing);
    expect(paperSizePx('b5' as 'a4', 'portrait', drawing)).toEqual(a4);
    expect(paperSizePx({ width: 0, height: 100, unit: 'mm' }, 'portrait', drawing)).toEqual(a4);
    expect(paperSizePx({ width: Number.NaN, height: 100, unit: 'mm' }, 'portrait', drawing)).toEqual(a4);
  });
});

// ─── paginateChart: scale ────────────────────────────────────

describe('paginateChart · scale and fit', () => {
  it("fit 'width' never enlarges a drawing narrower than the page", () => {
    const plan = paginateChart(model({ table: 200, x1: 600 }), opts());
    expect(plan.scale).toBe(1);
    expect(plan.across).toBe(1);
    expect(plan.paper).toEqual({ width: 297, height: 210 });
    expect(plan.content.width).toBeCloseTo(A4L.w, 6);
    expect(plan.content.height).toBeCloseTo(A4L.h, 6);
  });

  it("fit 'width' scales the whole width onto the page width", () => {
    const plan = paginateChart(model({ table: 300, x1: 1200 }), opts());
    expect(plan.scale).toBeCloseTo(A4L.w / 1500, 9);
    expect(plan.across).toBe(1);
    expect(plan.pages[0].width).toBe(1500);
    expect(plan.content.width).toBeCloseTo(1500, 6);
  });

  it("fit 'width' stops at minScale and goes on across", () => {
    const plan = paginateChart(model({ table: 300, x1: 5000 }), opts());
    expect(plan.scale).toBe(0.5);
    expect(plan.content.width).toBeCloseTo(A4L.w * 2, 6);
    expect(plan.across).toBeGreaterThan(2);
    const lower = paginateChart(model({ table: 300, x1: 5000 }), opts({ minScale: 0.25 }));
    expect(lower.scale).toBe(0.25);
    const fits = paginateChart(model({ table: 300, x1: 3000 }), opts({ minScale: 0.25 }));
    expect(fits.scale).toBeCloseTo(A4L.w / 3300, 9);
    expect(fits.across).toBe(1);
  });

  it("fit 'page' puts everything on one page, never enlarged", () => {
    const big = model({ table: 300, x1: 6000, rows: Array.from({ length: 300 }, () => 30), legend: 40 });
    const plan = paginateChart(big, opts({ fit: 'page' }));
    expect(plan.scale).toBeCloseTo(Math.min(A4L.w / 6300, A4L.h / big.height), 9);
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0]).toMatchObject({
      x0: 0,
      x1: 6000,
      rowStart: 0,
      rowEnd: 300,
      table: true,
      header: true,
      legend: true,
      width: 6300,
      height: big.height,
    });
    expect(paginateChart(model({ x1: 200, rows: [30] }), opts({ fit: 'page' })).scale).toBe(1);
  });

  it("fit 'none' prints at actual size times scale", () => {
    const m = model({ table: 300, x1: 3000 });
    const plan = paginateChart(m, opts({ fit: 'none' }));
    expect(plan.scale).toBe(1);
    // 1046.9 px a page less the 300 px task list on each: 746.9 px of timeline, snapped back to 700
    expect(plan.pages.filter(p => p.row === 0).map(p => [p.x0, p.x1])).toEqual([
      [0, 700],
      [700, 1400],
      [1400, 2100],
      [2100, 2800],
      [2800, 3000],
    ]);
    const half = paginateChart(m, opts({ fit: 'none', scale: 0.75 }));
    expect(half.scale).toBe(0.75);
    expect(half.content.width).toBeCloseTo(A4L.w / 0.75, 6);
  });

  it('the task list is never cut: the scale is lowered until it fits a page width', () => {
    const plan = paginateChart(model({ table: 1500, x1: 2000 }), opts({ fit: 'none' }));
    expect(plan.scale).toBeCloseTo(A4L.w / 1500, 9);
    expect(plan.pages[0].table).toBe(true);
    expect(plan.pages[0].width).toBeLessThanOrEqual(plan.content.width + 1e-6);
  });

  it("orientation 'auto' follows the drawing", () => {
    const tall = paginateChart(
      model({ table: 100, x1: 300, rows: Array.from({ length: 60 }, () => 30) }),
      opts({ orientation: 'auto' }),
    );
    expect(tall.paper).toEqual({ width: 210, height: 297 });
    const wide = paginateChart(model({ table: 300, x1: 3000, rows: [30, 30] }), opts({ orientation: 'auto' }));
    expect(wide.paper).toEqual({ width: 297, height: 210 });
  });

  it('every page fits the content area, and its size is its parts', () => {
    const m = model({
      table: 300,
      x1: 4000,
      rows: Array.from({ length: 120 }, (_, i) => 24 + (i % 3) * 8),
      legend: 30,
    });
    for (const fit of ['width', 'none'] as const) {
      const plan = paginateChart(m, opts({ fit, paper: 'letter', orientation: 'portrait' }));
      for (const p of plan.pages) {
        expect(p.width).toBeLessThanOrEqual(plan.content.width + 0.01);
        expect(p.height).toBeLessThanOrEqual(plan.content.height + 0.01);
        const body =
          p.rowEnd > p.rowStart ? m.rows[p.rowEnd - 1].y + m.rows[p.rowEnd - 1].height - m.rows[p.rowStart].y : 0;
        expect(p.height).toBeCloseTo((p.header ? m.headerHeight : 0) + body + (p.legend ? 30 : 0), 6);
        expect(p.width).toBeCloseTo((p.table ? 300 : 0) + p.x1 - p.x0, 6);
      }
    }
  });
});

// ─── paginateChart: rows ─────────────────────────────────────

describe('paginateChart · rows', () => {
  it('breaks only between rows, every row on exactly one row of pages', () => {
    const heights = Array.from({ length: 97 }, (_, i) => 20 + ((i * 7) % 23));
    const m = model({ rows: heights, x1: 600, table: 200 });
    const plan = paginateChart(m, opts({ orientation: 'portrait' }));
    const ranges = rowRanges(plan);
    expect(ranges[0][0]).toBe(0);
    expect(ranges.at(-1)![1]).toBe(97);
    ranges.forEach(([start, end], i) => {
      expect(end).toBeGreaterThan(start);
      if (i > 0) expect(start).toBe(ranges[i - 1][1]);
    });
    // Each page is filled: the next row would not have fitted
    plan.pages.forEach(p => {
      if (p.rowEnd >= 97) return;
      const next = m.rows[p.rowEnd];
      expect(next.y + next.height - m.rows[p.rowStart].y + m.headerHeight).toBeGreaterThan(plan.content.height);
    });
  });

  it('a row taller than a page gets a page of its own', () => {
    const plan = paginateChart(model({ rows: [30, 2000, 30], x1: 500 }), opts({ fit: 'none' }));
    expect(rowRanges(plan)).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('repeatHeader: on every page, or only on the first row of pages', () => {
    const m = model({ rows: Array.from({ length: 80 }, () => 30), x1: 3000 });
    const on = paginateChart(m, opts({ fit: 'none' }));
    expect(on.down).toBeGreaterThan(1);
    expect(on.across).toBeGreaterThan(1);
    expect(on.pages.every(p => p.header)).toBe(true);
    const off = paginateChart(m, opts({ fit: 'none', repeatHeader: false }));
    expect(off.pages.every(p => p.header === (p.row === 0))).toBe(true);
    // Without the header, later pages hold more rows
    expect(
      off.pages.filter(p => p.column === 0)[1].rowEnd - off.pages.filter(p => p.column === 0)[1].rowStart,
    ).toBeGreaterThan(on.pages[0].rowEnd - on.pages[0].rowStart);
  });

  it('an empty chart prints one page with the empty body', () => {
    const m = model({ rows: [], headerHeight: 50 });
    const plan = paginateChart({ ...m, bodyHeight: 120, height: 170 }, opts());
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0]).toMatchObject({ rowStart: 0, rowEnd: 0, header: true, height: 170 });
  });
});

// ─── paginateChart: columns ──────────────────────────────────

describe('paginateChart · columns', () => {
  it('columns cover the timeline without gaps, from x0 to x1', () => {
    const plan = paginateChart(model({ x0: 140, x1: 4870, table: 250, cell: 70 }), opts({ fit: 'none' }));
    const cols = plan.pages.filter(p => p.row === 0);
    expect(cols).toHaveLength(plan.across);
    expect(cols[0].x0).toBe(140);
    expect(cols.at(-1)!.x1).toBe(4870);
    cols.forEach((c, i) => {
      expect(c.x1).toBeGreaterThan(c.x0);
      if (i > 0) expect(c.x0).toBe(cols[i - 1].x1);
    });
  });

  it('horizontal breaks snap back to a bottom-tier cell boundary', () => {
    const plan = paginateChart(model({ x1: 5000, table: 300, cell: 100 }), opts({ fit: 'none' }));
    const cols = plan.pages.filter(p => p.row === 0);
    for (const c of cols.slice(0, -1)) expect(c.x1 % 100).toBe(0);
    // Snapping keeps the slice within the content width, and fills it to within a cell
    expect(cols[0].width).toBeLessThanOrEqual(plan.content.width);
    expect(cols[0].width).toBeGreaterThan(plan.content.width - 100);
  });

  it('no snapping when the boundary would keep less than half the slice', () => {
    // The first page has 746.9 px of timeline: a boundary at 200 keeps less than half, 400 more
    const withCells = (edges: number[]): ExportModel => {
      const m = model({ x1: 1500, table: 300 });
      const cells = edges
        .slice(0, -1)
        .map((x, i) => ({ x, width: edges[i + 1] - x, label: null, current: false, border: null }));
      const tiers = m.timeline!.tiers.map((t, i) => (i === 1 ? { ...t, cells } : t));
      return { ...m, timeline: { ...m.timeline!, tiers } };
    };
    const cap = Math.floor((A4L.w - 300) * 100) / 100;
    expect(paginateChart(withCells([0, 200, 1000, 1500]), opts({ fit: 'none' })).pages[0].x1).toBe(cap);
    expect(paginateChart(withCells([0, 400, 1000, 1500]), opts({ fit: 'none' })).pages[0].x1).toBe(400);
    // Cells wider than a page: no boundary in reach
    expect(paginateChart(model({ x1: 5400, table: 300, cell: 900 }), opts({ fit: 'none' })).pages[0].x1).toBe(cap);
  });

  it('no snapping without header tiers', () => {
    const m = model({ x1: 5000, table: 0, cell: 100 });
    const bare: ExportModel = { ...m, table: null, timeline: { ...m.timeline!, tiers: [] } };
    const plan = paginateChart(bare, opts({ fit: 'none' }));
    expect(plan.pages[0].x1).toBeCloseTo(Math.floor(plan.content.width * 100) / 100, 6);
  });

  it('repeatTable puts the task list on every column; off, on the first only', () => {
    const m = model({ x1: 4000, table: 300 });
    const on = paginateChart(m, opts({ fit: 'none' }));
    expect(on.across).toBeGreaterThan(1);
    expect(on.pages.every(p => p.table)).toBe(true);
    const off = paginateChart(m, opts({ fit: 'none', repeatTable: false }));
    expect(off.pages.every(p => p.table === (p.column === 0))).toBe(true);
    // Without the task list, later columns hold more timeline
    const second = off.pages.find(p => p.column === 1)!;
    expect(second.x1 - second.x0).toBeGreaterThan(
      on.pages.find(p => p.column === 1)!.x1 - on.pages.find(p => p.column === 1)!.x0,
    );
  });

  it('a task list wider than half the content width stays on the first column', () => {
    const plan = paginateChart(model({ x1: 4000, table: 600, cell: 50 }), opts({ fit: 'none' }));
    expect(plan.content.width / 2).toBeLessThan(600);
    expect(plan.pages.every(p => p.table === (p.column === 0))).toBe(true);
  });

  it('chart view: no task list; table view: one column', () => {
    const chart = paginateChart(model({ table: null, x1: 3000 }), opts({ fit: 'none' }));
    expect(chart.pages.every(p => !p.table)).toBe(true);
    expect(chart.pages[0].width).toBeLessThanOrEqual(chart.content.width);
    const table = paginateChart(
      model({ timeline: false, table: 700, rows: Array.from({ length: 60 }, () => 30) }),
      opts(),
    );
    expect(table.across).toBe(1);
    expect(table.pages.every(p => p.table && p.x0 === 0 && p.x1 === 0 && p.width === 700)).toBe(true);
  });
});

// ─── paginateChart: legend, footer, limits, order ────────────

describe('paginateChart · legend, footer, maxPages and order', () => {
  it('the legend goes on the last page of the first column when it fits', () => {
    const m = model({ x1: 4000, rows: Array.from({ length: 30 }, () => 30), legend: 40 });
    const plan = paginateChart(m, opts({ fit: 'none' }));
    const withLegend = plan.pages.filter(p => p.legend);
    expect(withLegend).toHaveLength(1);
    expect(withLegend[0]).toMatchObject({ column: 0, row: plan.down - 1, rowEnd: 30 });
    expect(plan.pages.filter(p => p.rowEnd === 30)).toHaveLength(plan.across);
  });

  it("the legend gets a new row of pages (first column only) when it doesn't fit", () => {
    // Rows that fill the first page exactly: no room left for the legend
    const ch = A4L.h;
    const rows = Array.from({ length: 10 }, () => (ch - 50) / 10);
    const plan = paginateChart(model({ x1: 3000, rows, legend: 40 }), opts({ fit: 'none' }));
    expect(plan.down).toBe(2);
    const legendPage = plan.pages.filter(p => p.legend);
    expect(legendPage).toHaveLength(1);
    expect(legendPage[0]).toMatchObject({ column: 0, row: 1, rowStart: 10, rowEnd: 10, header: false, height: 40 });
    expect(plan.pages).toHaveLength(plan.across + 1);
    expect(plan.pages.filter(p => p.row === 1)).toHaveLength(1);
  });

  it('pageNumbers reserves the footer height and writes "Title · Page n of N"', () => {
    const m = model({ x1: 3000, rows: Array.from({ length: 50 }, () => 30), title: 'Release plan' });
    const on = paginateChart(m, opts({ fit: 'none' }));
    const n = on.pages.length;
    expect(on.pages.map(p => p.footer)).toEqual(on.pages.map((_, i) => `Release plan · Page ${i + 1} of ${n}`));
    const off = paginateChart(m, opts({ fit: 'none', pageNumbers: false }));
    expect(off.content.height - on.content.height).toBeCloseTo(PRINT_FOOTER_HEIGHT, 6);
    expect(off.pages.every(p => p.footer === null)).toBe(true);
    // The localized label, and no title
    const fr = paginateChart(model({ title: '' }), opts(), (p, t) => `Page ${p} sur ${t}`);
    expect(fr.pages[0].footer).toBe('Page 1 sur 1');
  });

  it('more pages than maxPages is a RangeError', () => {
    const m = model({ x1: 20_000, rows: Array.from({ length: 400 }, () => 30) });
    const count = paginateChart(m, opts({ fit: 'none', maxPages: 10_000 })).pages.length;
    expect(count).toBeGreaterThan(200);
    expect(() => paginateChart(m, opts({ fit: 'none' }))).toThrow(RangeError);
    expect(() => paginateChart(m, opts({ fit: 'none' }))).toThrow(/maxPages \(200\)/);
    expect(paginateChart(m, opts({ fit: 'none', maxPages: count })).pages).toHaveLength(count);
    expect(() => paginateChart(m, opts({ fit: 'none', maxPages: count - 1 }))).toThrow(RangeError);
  });

  it('pages go down, then across', () => {
    const plan = paginateChart(model({ x1: 4000, rows: Array.from({ length: 70 }, () => 30) }), opts({ fit: 'none' }));
    expect(plan.across).toBeGreaterThan(1);
    expect(plan.down).toBeGreaterThan(1);
    expect(plan.pages).toHaveLength(plan.across * plan.down);
    plan.pages.forEach((p, i) => {
      expect(p.index).toBe(i);
      expect(p.column).toBe(Math.floor(i / plan.down));
      expect(p.row).toBe(i % plan.down);
    });
    // Every column breaks its rows the same way
    const firstCol = rowRanges(plan);
    for (let c = 1; c < plan.across; c++)
      expect(plan.pages.filter(p => p.column === c).map(p => [p.rowStart, p.rowEnd])).toEqual(firstCol);
  });

  it('is deterministic', () => {
    const m = model({ x1: 4000, rows: Array.from({ length: 70 }, () => 30), legend: 30 });
    expect(paginateChart(m, opts())).toEqual(paginateChart(m, opts()));
  });
});

// ─── printCss ────────────────────────────────────────────────

describe('printCss', () => {
  it('@page size and margin in mm, page boxes the sheet less the margins', () => {
    const plan = paginateChart(model(), opts());
    const css = printCss(plan, 10);
    expect(css).toContain('@page{size:297mm 210mm;margin:10mm}');
    expect(css).toContain('html,body{margin:0;padding:0;background:#fff}');
    expect(css).toContain(`width:${Math.floor(277 * PX_PER_MM)}px;height:${Math.floor(190 * PX_PER_MM)}px`);
    expect(css).toMatch(/\.gantry-print-page\{[^}]*break-after:page/);
    expect(css).toMatch(/\.gantry-print-page:last-child\{[^}]*break-after:auto/);
    expect(css).toContain('.gantry-print-image{display:block}');
    expect(css).toMatch(new RegExp(`\\.gantry-print-footer\\{position:absolute;[^}]*height:${PRINT_FOOTER_HEIGHT}px`));
    expect(css).not.toContain('var(');
  });

  it('letter portrait, decimals and no margin', () => {
    const plan = paginateChart(model(), opts({ paper: 'letter', orientation: 'portrait', margin: 0 }));
    const css = printCss(plan, 0);
    expect(css).toContain('@page{size:215.9mm 279.4mm;margin:0mm}');
    expect(css).toContain('width:816px;height:1056px');
    expect(printCss(plan, 12.345)).toContain('margin:12.35mm');
  });
});

// ─── exportChartPages ────────────────────────────────────────

describe('exportChartPages', () => {
  const NOW = new Date(2026, 2, 2, 9);
  /** 60 tasks over 10 weeks in 6 groups (deterministic) */
  const tasks = (): GanttTask[] => {
    const out: GanttTask[] = [];
    for (let g = 0; g < 6; g++) {
      out.push({
        id: `g${g}`,
        name: `Phase ${g + 1}`,
        start: new Date(2026, 2, 2 + g * 7),
        end: new Date(2026, 2, 16 + g * 7),
        type: 'group',
      });
      for (let t = 0; t < 9; t++)
        out.push({
          id: `g${g}t${t}`,
          name: `Task ${g + 1}.${t + 1}`,
          parentId: `g${g}`,
          start: new Date(2026, 2, 2 + g * 7 + t),
          end: new Date(2026, 2, 4 + g * 7 + t),
          progress: (t * 10) % 100,
        });
    }
    return out;
  };
  const source = (options: GanttOptions = {}, extra: Partial<GanttHeadlessInput> = {}) =>
    createExportSource({ tasks: tasks(), options: { viewMode: 'Day', ...options }, now: NOW, ...extra });

  it('one SVG page per slice, sized at the plan scale, with title, alt texts and footers', () => {
    const src = source({ labels: { ariaChart: 'Construction schedule' } });
    const doc = exportChartPages(src, { orientation: 'portrait' });
    const r: ResolvedPrintExport = {
      ...resolveExportCall(src.config, 'print', { orientation: 'portrait' }),
      background: 'theme',
    };
    const plan = paginateChart(buildExportModel(src, r), r);
    expect(doc.pages.length).toBe(plan.pages.length);
    expect(doc.pages.length).toBeGreaterThanOrEqual(2);
    expect(doc.title).toBe('Construction schedule');
    expect(doc.lang).toBeTruthy();
    expect(doc.css).toContain('@page{size:210mm 297mm;margin:10mm}');
    const n = doc.pages.length;
    doc.pages.forEach((p, i) => {
      expect(p.svg.startsWith('<svg')).toBe(true);
      expect(p.svg).not.toContain('<?xml');
      expect(p.svg).not.toContain('var(');
      expect(p.svg).toContain(`id="gantry-print-${i + 1}-title"`);
      expect(p.alt).toBe(`Construction schedule, Page ${i + 1} of ${n}`);
      expect(p.footer).toBe(`Construction schedule · Page ${i + 1} of ${n}`);
      expect(p.width).toBeCloseTo(plan.pages[i].width * plan.scale, 1);
      expect(p.height).toBeCloseTo(plan.pages[i].height * plan.scale, 1);
      expect(p.width).toBeLessThanOrEqual(200 * PX_PER_MM + 0.01);
      expect(p.height).toBeLessThanOrEqual(277 * PX_PER_MM - PRINT_FOOTER_HEIGHT + 0.01);
    });
  });

  it("the chart's export.print options, the call's over them, localized labels", () => {
    const src = source({
      export: { print: { paper: 'letter', pageNumbers: false } },
      labels: { printPage: (p, t) => `Seite ${p} von ${t}` },
    });
    const doc = exportChartPages(src);
    expect(doc.css).toContain('@page{size:279.4mm 215.9mm;');
    expect(doc.pages.every(p => p.footer === null)).toBe(true);
    expect(doc.pages[0].alt).toMatch(/, Seite 1 von \d+$/);
    expect(exportChartPages(src, { paper: 'a3' }).css).toContain('@page{size:420mm 297mm;');
  });

  it('fit page gives one page; maxPages over is a RangeError', () => {
    expect(exportChartPages(source(), { fit: 'page' }).pages).toHaveLength(1);
    expect(() =>
      exportChartPages(source(), { fit: 'none', paper: { width: 50, height: 50, unit: 'mm' }, maxPages: 3 }),
    ).toThrow(RangeError);
  });

  it("paper always gets the theme's background, light by default", () => {
    const dark = source({}, { dark: true });
    const svg = exportChartPages(dark, { background: 'transparent' }).pages[0].svg;
    expect(svg).toContain('gantry-export-bg');
    expect(svg).toContain(`fill="${resolveTheme(false).backgroundColor}"`);
  });

  it('is deterministic', () => {
    expect(exportChartPages(source())).toEqual(exportChartPages(source()));
  });
});

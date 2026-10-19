// ─────────────────────────────────────────────────────────────
//  gantry · export/paginate.ts
//  Print pagination (Phase 12, D11 / D12): the export model cut into
//  pages of a paper size — scaled to the page width (`fit: 'width'`),
//  onto one page (`'page'`) or at actual size (`'none'`) — breaking only
//  between rows, horizontal breaks snapped back to a bottom-tier cell
//  boundary, ordered down then across; the header and the task list
//  repeated, the legend on the last page of the first column, a footer
//  reserve for "Title · Page n of N". `exportChartPages` gives the print
//  document (one SVG per page, its alt text, the page CSS) that the
//  bindings print through a hidden iframe. 96 px per inch.
// ─────────────────────────────────────────────────────────────

import { DEFAULT_LABELS, type GanttLabels, type GanttPaperSize, type GanttPrintOptions } from '../types';
import type { ResolvedPrintExport } from '../render/config';
import type { ChartExportSource } from './source';
import { buildExportModel, type ExportModel } from './model';
import { legendAtWidth } from './legend';
import { renderExportSvg, type ExportSlice } from './svg';
import { resolveExportCall } from './files';

/** The named paper sizes in mm, portrait (width ≤ height). */
export const PAPER_SIZES_MM: Readonly<
  Record<Exclude<GanttPaperSize, object>, { readonly width: number; readonly height: number }>
> = Object.freeze({
  a4: Object.freeze({ width: 210, height: 297 }),
  a3: Object.freeze({ width: 297, height: 420 }),
  letter: Object.freeze({ width: 215.9, height: 279.4 }),
  legal: Object.freeze({ width: 215.9, height: 355.6 }),
  tabloid: Object.freeze({ width: 279.4, height: 431.8 }),
});

/** CSS px per mm (96 px per inch). */
export const PX_PER_MM = 96 / 25.4;

/** Default page margin in mm (`print.margin`). */
export const PRINT_DEFAULT_MARGIN_MM = 10;

/** Smallest scale of `fit: 'width'` by default (`print.minScale`). */
export const PRINT_MIN_SCALE = 0.5;

/** Most pages a print may take by default (`print.maxPages`); more is a `RangeError`. */
export const PRINT_MAX_PAGES = 200;

/** Height in px reserved at the bottom of every page for the footer (`pageNumbers`). */
export const PRINT_FOOTER_HEIGHT = 24;

/** The print iframe is removed (and its URLs revoked) this long after printing if `afterprint` never fires (ms). */
export const PRINT_CLEANUP_MS = 60_000;

/** One printed page: a slice of the drawing, its index (0-based, print order) and grid position. */
export interface PrintPage extends ExportSlice {
  index: number;
  /** Column of pages (across), 0-based */
  column: number;
  /** Row of pages (down), 0-based */
  row: number;
}

/** How a drawing goes onto paper. */
export interface PrintPlan {
  /** The sheet in mm, oriented (`@page size`) */
  paper: { width: number; height: number };
  /** The printable area in drawing px at `scale`: the sheet less the margins and the footer reserve */
  content: { width: number; height: number };
  /** Drawing px → page px */
  scale: number;
  /** Columns of pages */
  across: number;
  /** Rows of pages */
  down: number;
  /** In print order: down, then across */
  pages: PrintPage[];
}

/** One page of the print document. */
export interface PrintDocumentPage {
  /** The page's SVG (`renderExportSvg` of its slice, without the XML declaration) */
  svg: string;
  /** Size of the page image in CSS px */
  width: number;
  height: number;
  /** `img[alt]`: `${title}, ${labels.printPage(n, N)}` */
  alt: string;
  /** The footer text ("Title · Page n of N"), or `null` without `pageNumbers` */
  footer: string | null;
}

/** What a binding prints: the document title and language, the page CSS and the pages. */
export interface PrintDocument {
  /** `document.title` of the print document (browsers name a PDF after it) */
  title: string;
  /** `html[lang]` */
  lang: string;
  /** The page CSS (`printCss`): one constructable stylesheet of the print document */
  css: string;
  pages: PrintDocumentPage[];
}

/** Float slack of the fitting comparisons (px). */
const EPS = 1e-6;

/** `n` rounded to 2 decimals, never `-0`. */
function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

/** A number for CSS: at most 2 decimals, no trailing zeros. */
function cssNum(n: number): string {
  return String(round2(n));
}

/**
 * The sheet in mm for `paper` and `orientation` (`'auto'`: landscape when `drawing` is wider than
 * tall). A custom size is read as its shorter and longer side, in `in` at 25.4 mm per inch; an
 * unknown name or a size that isn't positive is A4.
 */
function paperSizeMm(
  paper: GanttPaperSize,
  orientation: 'landscape' | 'portrait' | 'auto',
  drawing: { width: number; height: number },
): { width: number; height: number } {
  let w: number;
  let h: number;
  if (typeof paper === 'object') {
    const k = paper.unit === 'in' ? 25.4 : 1;
    w = paper.width * k;
    h = paper.height * k;
  } else {
    // Untyped callers may pass any string
    const named = (PAPER_SIZES_MM as Readonly<Record<string, { width: number; height: number } | undefined>>)[paper];
    w = named?.width ?? NaN;
    h = named?.height ?? NaN;
  }
  if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) ({ width: w, height: h } = PAPER_SIZES_MM.a4);
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  const landscape = orientation === 'landscape' || (orientation === 'auto' && drawing.width > drawing.height);
  return landscape ? { width: long, height: short } : { width: short, height: long };
}

/**
 * The sheet in CSS px for `paper` and `orientation` (`'auto'`: landscape when `drawing` is wider
 * than tall). Custom sizes in `in` convert at 25.4 mm per inch.
 */
export function paperSizePx(
  paper: GanttPaperSize,
  orientation: 'landscape' | 'portrait' | 'auto',
  drawing: { width: number; height: number },
): { width: number; height: number } {
  const mm = paperSizeMm(paper, orientation, drawing);
  return { width: mm.width * PX_PER_MM, height: mm.height * PX_PER_MM };
}

/** The left and right edges of the bottom tier's cells, sorted, each once. */
function cellBoundaries(model: ExportModel): number[] {
  const tiers = model.timeline?.tiers ?? [];
  const bottom = tiers[tiers.length - 1];
  if (!bottom) return [];
  const xs = new Set<number>();
  for (const c of bottom.cells) {
    xs.add(c.x);
    xs.add(c.x + c.width);
  }
  return [...xs].sort((a, b) => a - b);
}

/**
 * A page break at `b` (the slice `a…b` filled to its width) moved back to the last bottom-tier
 * cell boundary at or before it, when that keeps at least half the slice; else `b`.
 */
function snapBreak(bounds: readonly number[], a: number, b: number): number {
  // The last boundary ≤ b (binary search)
  let lo = 0;
  let hi = bounds.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((bounds[mid] ?? Infinity) <= b + EPS) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const at = found >= 0 ? bounds[found] : undefined;
  return at !== undefined && at > a + EPS && at - a >= (b - a) / 2 - EPS ? Math.min(at, b) : b;
}

/** A column of pages: the timeline px it draws and whether the task list is on its left. */
interface PageColumn {
  x0: number;
  x1: number;
  table: boolean;
}

/** A row of pages: the body rows it draws, the body height, the header, the legend. */
interface PageRow {
  rowStart: number;
  rowEnd: number;
  /** Height of the body part (px) */
  body: number;
  header: boolean;
  legend: boolean;
  /** The legend alone, on a row of its own: only the first column has this page */
  legendOnly: boolean;
}

/** The scale `fit` asks for, lowered so the task list fits a page's width. */
function planScale(
  model: ExportModel,
  opts: ResolvedPrintExport,
  pageW: number,
  pageH: number,
  tableW: number,
): number {
  const w = model.width > 0 ? model.width : 1;
  const h = model.height > 0 ? model.height : 1;
  let scale: number;
  if (opts.fit === 'page') scale = Math.min(1, pageW / w, pageH / h);
  else if (opts.fit === 'none') scale = opts.scale;
  else scale = Math.max(Math.min(1, pageW / w), Math.min(1, opts.minScale));
  // The task list is never cut either: it fits a page's width
  return tableW > 0 ? Math.min(scale, pageW / tableW) : scale;
}

/** The columns of pages (D12): pages across, breaks snapped to cell boundaries. */
function planColumns(model: ExportModel, opts: ResolvedPrintExport, cw: number, tableW: number): PageColumn[] {
  const tl = model.timeline;
  if (!tl) return [{ x0: 0, x1: 0, table: tableW > 0 }];
  if (opts.fit === 'page') return [{ x0: tl.x0, x1: tl.x1, table: tableW > 0 }];
  // The task list on every column, unless it takes more than half the content width
  const repeat = tableW > 0 && opts.repeatTable && tableW <= cw / 2;
  const bounds = cellBoundaries(model);
  const cols: PageColumn[] = [];
  let a = tl.x0;
  do {
    const table = cols.length === 0 ? tableW > 0 : repeat;
    const cap = Math.max(0, cw - (table ? tableW : 0));
    let b = a + cap;
    if (b >= tl.x1 - 0.01) b = tl.x1;
    else {
      const snapped = snapBreak(bounds, a, b);
      if (snapped !== b) b = snapped;
      else {
        // Whole hundredths of a px, when that still moves on
        const floored = Math.floor(b * 100 + EPS) / 100;
        if (floored > a) b = floored;
      }
    }
    cols.push({ x0: a, x1: b, table });
    a = b;
  } while (a < tl.x1 - EPS);
  return cols;
}

/**
 * The rows of pages (D12): breaks between rows only; the legend (`legendH` tall at the first column's
 * width) last, on a new row when it doesn't fit.
 */
function planRows(model: ExportModel, opts: ResolvedPrintExport, ch: number, legendH: number): PageRow[] {
  const rows = model.rows;
  const headerH = model.headerHeight;
  if (opts.fit === 'page' || rows.length === 0) {
    // One row of pages with the whole body (the empty state's when there's no row)
    const out: PageRow[] = [
      { rowStart: 0, rowEnd: rows.length, body: model.bodyHeight, header: true, legend: false, legendOnly: false },
    ];
    if (opts.fit === 'page') {
      out[0]!.legend = legendH > 0;
      return out;
    }
    return placeLegend(out, legendH, headerH, ch, rows.length);
  }
  const out: PageRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const header = out.length === 0 || opts.repeatHeader;
    const avail = ch - (header ? headerH : 0);
    const top = rows[i]!.y;
    // At least one row per page, then every row that still fits whole
    let j = i + 1;
    while (j < rows.length && rows[j]!.y + rows[j]!.height - top <= avail + EPS) j++;
    const last = rows[j - 1]!;
    out.push({ rowStart: i, rowEnd: j, body: last.y + last.height - top, header, legend: false, legendOnly: false });
    i = j;
  }
  return placeLegend(out, legendH, headerH, ch, rows.length);
}

/** The legend under the last row of pages when it fits there, else on a row of its own. */
function placeLegend(out: PageRow[], legendH: number, headerH: number, ch: number, rowCount: number): PageRow[] {
  if (legendH <= 0) return out;
  const last = out[out.length - 1]!;
  if ((last.header ? headerH : 0) + last.body + legendH <= ch + EPS) last.legend = true;
  else out.push({ rowStart: rowCount, rowEnd: rowCount, body: 0, header: false, legend: true, legendOnly: true });
  return out;
}

/** A margin in mm as pagination reads it: not negative; the default when not a number. */
const marginMm = (margin: number): number => (Number.isFinite(margin) ? Math.max(0, margin) : PRINT_DEFAULT_MARGIN_MM);

/** "Title · Page n of N" (the page alone without a title). */
function footerText(title: string, page: string): string {
  return title ? `${title} · ${page}` : page;
}

/**
 * The pages of `model` (D12). Throws a `RangeError` when they would be more than `opts.maxPages`,
 * or when the margin leaves no room on the page (twice `opts.margin` at least the paper's shorter
 * side). Pure.
 *
 * - The scale: `'width'` = the drawing's width to the page width (never above 1, at least
 *   `minScale`), `'page'` = the whole drawing on one page (never above 1), `'none'` = `scale`;
 *   lowered in every mode until the task list fits a page's width (it is never cut).
 * - Rows are never cut (a row taller than a page still gets a page of its own); horizontal breaks
 *   move back to a bottom-tier cell boundary when that keeps at least half the slice.
 * - The header tops the first row of pages, and every page with `repeatHeader`. The task list is
 *   on the first column of pages, and on every column with `repeatTable` while it takes at most
 *   half the content width. The legend is at the bottom of the first column's last page, or on a
 *   page of its own under it (that column only) when it doesn't fit, wrapped at that column's
 *   width (`legendAtWidth`: its items never run past a page narrower than the drawing).
 * - `pageNumbers` reserves `PRINT_FOOTER_HEIGHT` px at the bottom of each page for the footer,
 *   `${model.title} · ${printPage(n, N)}`.
 */
export function paginateChart(
  model: ExportModel,
  opts: ResolvedPrintExport,
  printPage: GanttLabels['printPage'] = DEFAULT_LABELS.printPage,
): PrintPlan {
  const paper = paperSizeMm(opts.paper, opts.orientation, model);
  const margin = marginMm(opts.margin);
  if (2 * margin >= Math.min(paper.width, paper.height))
    throw new RangeError(
      `The print margin leaves no room on the page: ${cssNum(margin)} mm on a ` +
        `${cssNum(paper.width)} × ${cssNum(paper.height)} mm sheet`,
    );
  const marginPx = margin * PX_PER_MM;
  const pageW = Math.max(1, paper.width * PX_PER_MM - 2 * marginPx);
  const pageH = Math.max(1, paper.height * PX_PER_MM - 2 * marginPx - (opts.pageNumbers ? PRINT_FOOTER_HEIGHT : 0));
  const tableW = model.table ? model.table.width : 0;
  const scale = planScale(model, opts, pageW, pageH, tableW);
  const cw = pageW / scale;
  const ch = pageH / scale;

  const cols = planColumns(model, opts, cw, tableW);
  const width = (col: PageColumn): number =>
    round2(model.timeline ? (col.table ? tableW : 0) + col.x1 - col.x0 : model.width);
  // The legend sits on the first column: wrapped at its width
  const pageLegend = model.legend && legendAtWidth(model.legend, width(cols[0]!), model.theme);
  const legendH = pageLegend ? pageLegend.height : 0;
  const rows = planRows(model, opts, ch, legendH);
  const legendPages = rows.filter(r => r.legendOnly).length;
  const total = cols.length * (rows.length - legendPages) + legendPages;
  if (total > opts.maxPages)
    throw new RangeError(
      `The print would take ${total} pages, more than maxPages (${opts.maxPages}): ` +
        "use a larger paper, fit: 'page', a smaller minScale or a shorter range",
    );

  const headerH = model.headerHeight;
  const pages: PrintPage[] = [];
  cols.forEach((col, c) => {
    rows.forEach((r, ri) => {
      if (r.legendOnly && c > 0) return;
      const n = pages.length + 1;
      const legend = r.legend && c === 0;
      pages.push({
        index: pages.length,
        column: c,
        row: ri,
        x0: col.x0,
        x1: col.x1,
        rowStart: r.rowStart,
        rowEnd: r.rowEnd,
        table: col.table,
        header: r.header,
        legend,
        footer: opts.pageNumbers ? footerText(model.title, printPage(n, total)) : null,
        width: width(col),
        height: round2((r.header ? headerH : 0) + r.body + (legend ? legendH : 0)),
      });
    });
  });
  return {
    paper,
    content: { width: cw, height: ch },
    scale,
    across: cols.length,
    down: rows.length,
    pages,
  };
}

/**
 * The print document's CSS: `@page { size; margin }` (`margin` in mm), white `html` / `body`
 * without margins, `.gantry-print-page` (one per sheet, `break-after: page`, the last `auto`),
 * `.gantry-print-image` and `.gantry-print-footer`.
 */
export function printCss(plan: PrintPlan, margin: number): string {
  const m = marginMm(margin);
  // The sheet less the margins, in whole px (rounded down: a page box a hair too tall prints a blank page)
  const boxW = Math.max(0, Math.floor((plan.paper.width - 2 * m) * PX_PER_MM));
  const boxH = Math.max(0, Math.floor((plan.paper.height - 2 * m) * PX_PER_MM));
  const f = PRINT_FOOTER_HEIGHT;
  return [
    `@page{size:${cssNum(plan.paper.width)}mm ${cssNum(plan.paper.height)}mm;margin:${cssNum(m)}mm}`,
    'html,body{margin:0;padding:0;background:#fff}',
    `.gantry-print-page{page-break-after:always;break-after:page;position:relative;overflow:hidden;width:${boxW}px;height:${boxH}px}`,
    '.gantry-print-page:last-child{page-break-after:auto;break-after:auto}',
    '.gantry-print-image{display:block}',
    `.gantry-print-footer{position:absolute;left:0;right:0;bottom:0;height:${f}px;margin:0;font:10px/${f}px system-ui,sans-serif;color:#555;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
  ].join('\n');
}

/**
 * A chart snapshot as a print document (`print()`): `options` over the chart's `export.print`
 * (`resolveExportCall`), `buildExportModel`, `paginateChart`, one `renderExportSvg` per page.
 * Throws a `RangeError` over `maxPages`. Pure and DOM-free.
 */
export function exportChartPages(source: ChartExportSource, options?: GanttPrintOptions): PrintDocument {
  // Paper always gets the theme's background (D4)
  const opts: ResolvedPrintExport = { ...resolveExportCall(source.config, 'print', options), background: 'theme' };
  const model = buildExportModel(source, opts);
  const { printPage } = source.i18n.labels;
  const plan = paginateChart(model, opts, printPage);
  const total = plan.pages.length;
  return {
    title: model.title,
    lang: model.lang,
    css: printCss(plan, opts.margin),
    pages: plan.pages.map(page => ({
      // Each page is its own image document: page-numbered ids stay deterministic
      svg: renderExportSvg(model, page, {
        idPrefix: `gantry-print-${page.index + 1}`,
        scale: plan.scale,
        prolog: false,
      }),
      width: round2(page.width * plan.scale),
      height: round2(page.height * plan.scale),
      alt: model.title ? `${model.title}, ${printPage(page.index + 1, total)}` : printPage(page.index + 1, total),
      footer: page.footer,
    })),
  };
}

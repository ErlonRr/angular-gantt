// ─────────────────────────────────────────────────────────────
//  gantry · export/svg.ts
//  The SVG serializer (Phase 12, D2–D4, D19, D28): an `ExportModel`
//  (or one slice of it: a printed page) as SVG text with presentation
//  attributes only — no `var(`, no `<style>`, no `foreignObject`, no
//  class-based styling (the painters' class names stay, for
//  post-processing). `role="img"` with `<title>` and `<desc>`, every
//  text a `<text>`, `data-task-id` on rows and bars, ids under one
//  prefix, numbers rounded to 2 decimals. Structure: plan §3d.
//
//    svg.gantry-export
//      title · desc · defs (clipPath -timeline, clipPath -body on a
//        slice, pattern -hatch while a band is hatched, pattern
//        -over-hatch while a resource row is over capacity)
//      rect.gantry-export-bg                      unless transparent
//      g.gantry-export-table                      column headers, rows, column lines
//      g.gantry-export-timeline[clip-path]        translated to the timeline's left edge
//        g[translate(−x0)] > g.g-header (tiers, marker lane, today pointer)
//                          + g.gantt-body (rows, bands, grid, annotations,
//                            today line, resource load, arrows, bars,
//                            annotation labels)
//      g.gantt-legend                             the strip at the bottom
//      text.gantry-export-empty                   no row to draw
//
//  Texts centred on a line (`dominant-baseline: central` in the
//  painters) put their baseline `BASELINE_EM` below the centre instead:
//  plain `y` attributes every SVG reader understands.
// ─────────────────────────────────────────────────────────────

import { LOAD_STYLE } from '../resources/visual';
import type { GanttSvgExportOptions, GanttTheme } from '../types';
import { fitText, type BarKind, type BarVisual } from '../render/bars';
import type { ArrowVisual } from '../render/arrows';
import { HATCH_PATTERN, PAINTS } from '../render/paint';
import { cssPx, todayLabelColor } from '../render/theme';
import { LEGEND_SWATCH_SIZE } from '../state/legend';
import type { ChartExportSource } from './source';
import { buildExportModel, type ExportModel, type ExportRow } from './model';
import type {
  ExportBar,
  ExportLabel,
  ExportLoad,
  ExportTimeline,
  ExportTierCell,
  ExportTierLabel,
  Stroke,
} from './timeline';
import { EXPORT_TABLE, type ExportCell, type ExportTable } from './table';
import { EXPORT_LEGEND, legendAtWidth, type ExportLegend } from './legend';
import { resolveExportCall } from './files';
import { escapeXml, inlineThemeVars, num, nums, resolveThemeVars, stripInvalidXml } from './xml';
import { sanitizeSvgMarkup } from './sanitize';
import { EXPORT_REACH_SLACK, barReaches } from './extent';

/**
 * A part of the drawing (a printed page, `paginateChart`): timeline px `x0…x1`, body rows
 * `rowStart…rowEnd` (end exclusive), and which of table, header and legend it draws.
 */
export interface ExportSlice {
  x0: number;
  x1: number;
  rowStart: number;
  rowEnd: number;
  /** Draw the task list on its left */
  table: boolean;
  /** Draw the header at its top */
  header: boolean;
  /** Draw the legend strip at its bottom */
  legend: boolean;
  /** The page's footer text (the print document draws it in HTML, not in the SVG), or `null` */
  footer: string | null;
  /** Size of the slice's drawing in px (before `scale`) */
  width: number;
  height: number;
}

/** How `renderExportSvg` writes the document. */
export interface RenderSvgOptions {
  /**
   * Prefix of every id (`<p>-title`, `<p>-desc`, `<p>-timeline`, `<p>-body`, `<p>-hatch`, `<p>-over-hatch`).
   * Characters an XML id can't hold become `-`; an empty prefix is `gantry-export`.
   */
  idPrefix: string;
  /** `width` / `height` = the drawing's size times this; the `viewBox` stays the drawing's */
  scale: number;
  /** Start with the XML declaration (files); `false` = the `<svg>` element only */
  prolog: boolean;
}

/** The XML declaration of an SVG file. */
const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8"?>';

/** Baseline of a text centred on a y: this many ems below it. */
const BASELINE_EM = 0.35;

/** The "current period" tint and the today chip of the marker lane: the today colour at this opacity (D4). */
const TODAY_TINT_OPACITY = 0.14;

/** The over-capacity part of a resource row: its fill at this opacity, the hatch lines over it in the full colour. */
const OVER_FILL_OPACITY = LOAD_STYLE.overOpacity;
const OVER_HATCH_OPACITY = LOAD_STYLE.hatchOpacity;

/** The capacity line of a resource row (the painters' `LOAD_STYLE`). */
const CAP_STROKE_WIDTH = LOAD_STYLE.capWidth;
const CAP_DASH = LOAD_STYLE.capDash;

/** Header label inset of a tier cell (the painters' 6 px label padding). */
const HEADER_LABEL_INSET = 6;

/** The empty state's look (the painters' `.gantt-state-title`): 14 px, bold, primary text. */
const EMPTY_FONT_PX = 14;

// ─── Writer ──────────────────────────────────────────────────

type AttrValue = string | number | null | undefined;
type Attrs = Readonly<Record<string, AttrValue>>;

/** User or model text, safe in content and attribute values. */
const esc = (text: string): string => escapeXml(stripInvalidXml(text));

/** An attribute list: numbers through `num`, strings escaped, `null` / `undefined` left out. */
function attrs(a: Attrs): string {
  let out = '';
  for (const key in a) {
    const v = a[key];
    if (v === null || v === undefined) continue;
    out += ` ${key}="${typeof v === 'number' ? num(v) : esc(v)}"`;
  }
  return out;
}

const translate = (x: number, y: number): string => `translate(${num(x)},${num(y)})`;

/** One element per line, indented by depth; an element without children closes itself. */
interface Writer {
  leaf(tag: string, a: Attrs): void;
  /** `<tag>` with a text (and a `<title>` child when `title` is set) */
  text(tag: string, a: Attrs, content: string, title?: string | null): void;
  /** Markup as is, on its own line */
  raw(markup: string): void;
  block(tag: string, a: Attrs, body: () => void): void;
  done(): string;
}

function createWriter(): Writer {
  const lines: string[] = [];
  let depth = 0;
  /** The start tag of the innermost open block until its first child (written then, or as an empty-element tag) */
  let pending: string | null = null;
  const indents: string[] = [];
  const indent = (n: number) => (indents[n] ??= ' '.repeat(n));
  const flush = () => {
    if (pending === null) return;
    lines.push(`${indent(depth - 1)}${pending}>`);
    pending = null;
  };
  const put = (line: string) => {
    flush();
    lines.push(indent(depth) + line);
  };
  return {
    leaf: (tag, a) => put(`<${tag}${attrs(a)}/>`),
    text(tag, a, content, title) {
      const tip = title ? `<title>${esc(title)}</title>` : '';
      put(`<${tag}${attrs(a)}>${tip}${esc(content)}</${tag}>`);
    },
    raw: put,
    block(tag, a, body) {
      flush();
      pending = `<${tag}${attrs(a)}`;
      depth++;
      body();
      depth--;
      if (pending !== null) {
        // No child: an empty-element tag
        lines.push(`${indent(depth)}${pending}/>`);
        pending = null;
      } else lines.push(`${indent(depth)}</${tag}>`);
    },
    done: () => lines.join('\n'),
  };
}

/** `Stroke` as attributes. */
const strokeAttrs = (s: Stroke, theme: GanttTheme) => ({
  stroke: colour(s.stroke, theme),
  'stroke-width': s.width,
  'stroke-dasharray': s.dash === null ? null : nums(s.dash),
});

/** A model colour as a value without `var(` (the model's are resolved already: belt and braces). */
const colour = (paint: string, theme: GanttTheme): string =>
  paint.includes('var(') ? resolveThemeVars(paint, theme) : paint;

/** An id prefix an XML id can hold. */
function safePrefix(prefix: string): string {
  const p = prefix.replace(/[^\p{L}\p{N}_.-]/gu, '-');
  if (!p) return 'gantry-export';
  return /^[\p{L}_]/u.test(p) ? p : `g${p}`;
}

// ─── Custom bar markup ───────────────────────────────────────

/**
 * A custom bar's markup as the export draws it: its theme variables inlined (`inlineThemeVars`),
 * then `sanitizeSvgMarkup` — SVG drawing elements only, no script, style, animation, event
 * handler or remote resource (the bindings' `serializeSvg` applies the same rules first; this
 * keeps a headless `customBar` to them).
 */
function customMarkup(markup: string, theme: GanttTheme): string {
  return sanitizeSvgMarkup(inlineThemeVars(markup, theme));
}

// ─── Layout of the drawing or of one slice ───────────────────

interface Frame {
  width: number;
  height: number;
  /** The drawn task list, or `null` */
  table: ExportTable | null;
  /** The drawn timeline, or `null` */
  timeline: ExportTimeline | null;
  /** Left edge of the timeline in the drawing */
  tx: number;
  /** Timeline px drawn */
  x0: number;
  x1: number;
  /** Height of the drawn header (0 without it) */
  headerH: number;
  /** Shown rows drawn: `rows.slice(rowStart, rowEnd)` */
  rowStart: number;
  rowEnd: number;
  /** Body-relative top and bottom of the drawn body */
  top: number;
  bottom: number;
  legend: ExportLegend | null;
  /** Top of the legend strip in the drawing */
  legendY: number;
  /** A slice: the body is clipped to its rows, and bars and links far off the page are left out */
  sliced: boolean;
}

function frameOf(model: ExportModel, slice: ExportSlice | null): Frame {
  const tl = model.timeline;
  if (!slice) {
    return {
      width: model.width,
      height: model.height,
      table: model.table,
      timeline: tl,
      tx: tl ? tl.x : 0,
      x0: tl ? tl.x0 : 0,
      x1: tl ? tl.x1 : 0,
      headerH: model.headerHeight,
      rowStart: 0,
      rowEnd: model.rows.length,
      top: 0,
      bottom: model.bodyHeight,
      legend: model.legend,
      legendY: model.legend ? model.legend.y : model.height,
      sliced: false,
    };
  }
  const n = model.rows.length;
  const rowStart = Math.max(0, Math.min(n, Math.floor(slice.rowStart)));
  const rowEnd = Math.max(rowStart, Math.min(n, Math.floor(slice.rowEnd)));
  const table = slice.table ? model.table : null;
  const timeline = tl && slice.x1 > slice.x0 ? tl : null;
  const headerH = slice.header ? model.headerHeight : 0;
  // A page narrower than the drawing wraps the legend at its own width (as `paginateChart` sizes it)
  const legend = slice.legend && model.legend ? legendAtWidth(model.legend, slice.width, model.theme) : null;
  const legendH = legend ? legend.height : 0;
  let top: number;
  let bottom: number;
  if (rowEnd > rowStart) {
    const first = model.rows[rowStart]!;
    const last = model.rows[rowEnd - 1]!;
    top = first.y;
    bottom = last.y + last.height;
  } else {
    // No row on this page: an empty chart's body (as tall as the page leaves it), or none (a legend page)
    top = rowStart < n ? model.rows[rowStart]!.y : 0;
    const room = n === 0 ? Math.min(model.bodyHeight, slice.height - headerH - legendH) : 0;
    bottom = top + Math.max(0, room);
  }
  return {
    width: slice.width,
    height: slice.height,
    table,
    timeline,
    tx: table ? table.width : 0,
    x0: slice.x0,
    x1: slice.x1,
    headerH,
    rowStart,
    rowEnd,
    top,
    bottom,
    legend,
    legendY: slice.height - legendH,
    sliced: true,
  };
}

// ─── The document ────────────────────────────────────────────

/** What every part writes with. */
interface Ctx {
  w: Writer;
  model: ExportModel;
  theme: GanttTheme;
  f: Frame;
  /** The id prefix */
  p: string;
  /** Font sizes: the chart's (bars, table, lane), the header's first tier */
  fontPx: number;
  basePx: number;
}

/** The model (or `slice` of it; `null` = the whole drawing) as SVG text. Pure. */
export function renderExportSvg(model: ExportModel, slice: ExportSlice | null, opts: RenderSvgOptions): string {
  const p = safePrefix(opts.idPrefix);
  const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
  const f = frameOf(model, slice);
  const theme = model.theme;
  const w = createWriter();
  const ctx: Ctx = { w, model, theme, f, p, fontPx: model.fontPx, basePx: cssPx(theme.fontSize, model.fontPx + 1) };
  const hatched = !!f.timeline && f.timeline.bands.some(b => b.hatch && meets(b.x, b.x + b.width, f));
  const overHatch = f.timeline ? overHatchFill(f.timeline, f) : null;

  w.block(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: f.width * scale,
      height: f.height * scale,
      viewBox: `0 0 ${num(f.width)} ${num(f.height)}`,
      role: 'img',
      'aria-labelledby': `${p}-title ${p}-desc`,
      lang: model.lang,
      'font-family': model.fontFamily,
      'font-size': model.fontPx,
      class: 'gantry-export',
    },
    () => {
      w.text('title', { id: `${p}-title` }, model.title);
      w.text('desc', { id: `${p}-desc` }, model.description);
      if (f.timeline) {
        w.block('defs', {}, () => {
          w.block('clipPath', { id: `${p}-timeline` }, () =>
            w.leaf('rect', { x: 0, y: 0, width: f.x1 - f.x0, height: f.headerH + f.bottom - f.top }),
          );
          if (f.sliced)
            w.block('clipPath', { id: `${p}-body` }, () =>
              w.leaf('rect', { x: f.x0, y: f.top, width: f.x1 - f.x0, height: f.bottom - f.top }),
            );
          if (hatched) writeHatch(ctx);
          if (overHatch !== null) writeOverHatch(ctx, overHatch);
        });
      }
      if (model.background !== null)
        w.leaf('rect', {
          class: 'gantry-export-bg',
          x: 0,
          y: 0,
          width: f.width,
          height: f.height,
          fill: colour(model.background, theme),
        });
      if (f.table) writeTable(ctx, f.table);
      if (f.timeline) writeTimeline(ctx, f.timeline);
      if (f.legend) writeLegend(ctx, f.legend);
      writeEmpty(ctx);
    },
  );
  const svg = w.done();
  return opts.prolog ? `${XML_PROLOG}\n${svg}` : svg;
}

/** Monotonic counter of the default id prefixes (`gantry-export-<n>`). */
let exportCount = 0;

/**
 * A chart snapshot as an SVG image (`exportSvg()`): `options` over the chart's `export.svg`
 * (`resolveExportCall`), `buildExportModel`, then `renderExportSvg` without the XML declaration.
 * Ids are `idPrefix`, else a new `gantry-export-<n>` per image. Pure and DOM-free: works in Node
 * with `createExportSource`.
 */
export function exportChartSvg(source: ChartExportSource, options?: GanttSvgExportOptions): string {
  const r = resolveExportCall(source.config, 'svg', options);
  const model = buildExportModel(source, r);
  return renderExportSvg(model, null, {
    idPrefix: r.idPrefix ?? `gantry-export-${++exportCount}`,
    scale: r.scale,
    prolog: false,
  });
}

// ─── Parts ───────────────────────────────────────────────────

/** `from…to` (timeline px) meets the frame's `x0…x1`. */
const meets = (from: number, to: number, f: Frame): boolean => to > f.x0 && from < f.x1;

/** Baseline y of a text of `px` centred on `cy`. */
const baseline = (cy: number, px: number): number => cy + px * BASELINE_EM;

/** `text-anchor` (left out for `start`, the default). */
const anchorOf = (anchor: ExportLabel['anchor']): string | null => (anchor === 'start' ? null : anchor);

function writeHatch({ w, theme, p }: Ctx): void {
  const h = HATCH_PATTERN;
  w.block(
    'pattern',
    {
      id: `${p}-hatch`,
      width: h.size,
      height: h.size,
      patternUnits: 'userSpaceOnUse',
      patternTransform: `rotate(${num(h.rotate)})`,
    },
    () =>
      w.leaf('line', {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: h.size,
        stroke: colour(PAINTS.hatch, theme),
        'stroke-width': h.strokeWidth,
        'stroke-opacity': h.strokeOpacity,
      }),
  );
}

/**
 * The colour of the over-capacity hatch when a resource row of the frame is over capacity, else
 * `null`: the pattern is written only then.
 */
function overHatchFill(tl: ExportTimeline, f: Frame): string | null {
  for (let i = f.rowStart; i < f.rowEnd; i++) {
    const l = tl.load?.[i];
    if (l && l.hatch) return l.overFill;
  }
  return null;
}

/** The over-capacity hatch: the non-working one's geometry, in the over colour and heavier. */
function writeOverHatch({ w, theme, p }: Ctx, stroke: string): void {
  const h = HATCH_PATTERN;
  w.block(
    'pattern',
    {
      id: `${p}-over-hatch`,
      width: h.size,
      height: h.size,
      patternUnits: 'userSpaceOnUse',
      patternTransform: `rotate(${num(h.rotate)})`,
    },
    () =>
      w.leaf('line', {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: h.size,
        stroke: colour(stroke, theme),
        'stroke-width': h.strokeWidth,
        'stroke-opacity': OVER_HATCH_OPACITY,
      }),
  );
}

// ── Task list ──

function writeTable(ctx: Ctx, t: ExportTable): void {
  const { w, f, theme, model, fontPx } = ctx;
  const T = EXPORT_TABLE;
  const cols = t.header.cells;
  const bodyH = f.bottom - f.top;
  w.block('g', { class: 'gantry-export-table' }, () => {
    if (f.headerH > 0) {
      const h = f.headerH;
      const b = t.header.border;
      w.block('g', { class: 'gantt-tl-col-headers' }, () => {
        w.leaf('rect', { x: 0, y: 0, width: t.width, height: h, fill: colour(t.header.fill, theme) });
        for (const c of cols)
          w.text(
            'text',
            {
              class: 'gantt-tl-col-header',
              x: c.label.x,
              y: baseline(h / 2, fontPx),
              'text-anchor': anchorOf(c.label.anchor),
              'font-weight': T.headerFontWeight,
              fill: theme.textPrimary,
            },
            c.label.text,
          );
        w.block('g', { 'shape-rendering': 'crispEdges', ...strokeAttrs(b, theme) }, () => {
          for (const c of cols) {
            const x = c.x + c.width - b.width / 2;
            w.leaf('line', { x1: x, y1: 0, x2: x, y2: h });
          }
          w.leaf('line', { x1: 0, y1: h - b.width / 2, x2: t.width, y2: h - b.width / 2 });
        });
      });
    }
    w.block('g', { class: 'gantt-tl-rows', transform: translate(0, f.headerH - f.top) }, () => {
      for (let i = f.rowStart; i < f.rowEnd; i++) {
        const row = model.rows[i];
        const tr = t.rows[i];
        if (row && tr) writeTableRow(ctx, t, row, tr.id, tr.cells);
      }
    });
    // Cell borders: one line per column across the body, one under each row
    if (bodyH > 0)
      w.block(
        'g',
        {
          class: 'gantt-tl-grid',
          transform: translate(0, f.headerH - f.top),
          'shape-rendering': 'crispEdges',
          ...strokeAttrs(t.border, theme),
        },
        () => {
          const half = t.border.width / 2;
          for (const c of cols) {
            const x = c.x + c.width - half;
            w.leaf('line', { x1: x, y1: f.top, x2: x, y2: f.bottom });
          }
          for (let i = f.rowStart; i < f.rowEnd; i++) {
            const row = model.rows[i]!;
            const y = row.y + row.height - half;
            w.leaf('line', { x1: 0, y1: y, x2: t.width, y2: y });
          }
        },
      );
  });
}

function writeTableRow(ctx: Ctx, t: ExportTable, row: ExportRow, id: string, cells: readonly ExportCell[]): void {
  const { w, theme, fontPx } = ctx;
  const T = EXPORT_TABLE;
  const cy = row.y + row.height / 2;
  w.block('g', { class: 'gantt-tl-row', 'data-task-id': id }, () => {
    w.leaf('rect', { x: 0, y: row.y, width: t.width, height: row.height, fill: colour(row.fill, theme) });
    cells.forEach((c, i) => {
      const colX = t.header.cells[i]?.x;
      if (colX !== undefined) {
        // The name cell's toggle box, then the icon box (the painters' flex row)
        const toggleX = colX + T.cellPadX + c.indent;
        if (c.chevron)
          w.leaf('path', {
            class: 'gantt-collapse-btn',
            d: chevronPath(c.chevron, toggleX + T.toggle / 2, cy, T.chevronPx),
            fill: theme.textSecondary,
          });
        if (c.icon) writeTaskIcon(w, c.icon.kind, toggleX + T.toggle + T.nameGap, cy, colour(c.icon.fill, theme));
      }
      if (c.dot)
        w.leaf('circle', {
          class: 'gantt-tl-status-dot',
          cx: c.dot.cx,
          cy,
          r: c.dot.r,
          fill: colour(c.dot.fill, theme),
        });
      if (c.text)
        w.text(
          'text',
          {
            class: 'gantt-tl-cell',
            x: c.x,
            y: baseline(cy, fontPx),
            'text-anchor': anchorOf(c.anchor),
            'font-weight': c.chevron ? T.groupFontWeight : null,
            fill: colour(c.fill, theme),
          },
          c.text,
          c.title !== c.text ? c.title : null,
        );
    });
  });
}

/** The collapse chevron (`▶` closed, `▼` open) centred on `cx`, `cy`, `size` px tall. */
function chevronPath(state: 'open' | 'closed', cx: number, cy: number, size: number): string {
  const l = size * 0.4;
  const s = size * 0.35;
  return state === 'closed'
    ? `M${num(cx - s)},${num(cy - l)}L${num(cx + s)},${num(cy)}L${num(cx - s)},${num(cy + l)}Z`
    : `M${num(cx - l)},${num(cy - s)}L${num(cx + l)},${num(cy - s)}L${num(cx)},${num(cy + s)}Z`;
}

/** The task icon in an `iconPx` box from `x`: a bar (`▬`), a diamond (`◆`) or a list (`▤`). */
function writeTaskIcon(w: Writer, kind: BarKind, x: number, cy: number, fill: string): void {
  const s = EXPORT_TABLE.iconPx;
  const cx = x + s / 2;
  if (kind === 'task') {
    w.leaf('rect', { class: 'gantt-tl-icon', x, y: cy - s * 0.2, width: s, height: s * 0.4, rx: 1, fill });
    return;
  }
  if (kind === 'milestone') {
    const r = s * 0.4;
    w.leaf('path', {
      class: 'gantt-tl-icon',
      d: `M${num(cx)},${num(cy - r)}L${num(cx + r)},${num(cy)}L${num(cx)},${num(cy + r)}L${num(cx - r)},${num(cy)}Z`,
      fill,
    });
    return;
  }
  // A group: a square with two lines across, outlined
  const h = s * 0.4;
  const [l, r, t, b] = [cx - h + 0.5, cx + h - 0.5, cy - h + 0.5, cy + h - 0.5];
  const third = (b - t) / 3;
  w.leaf('path', {
    class: 'gantt-tl-icon',
    d:
      `M${num(l)},${num(t)}H${num(r)}V${num(b)}H${num(l)}Z` +
      `M${num(l)},${num(t + third)}H${num(r)}M${num(l)},${num(t + 2 * third)}H${num(r)}`,
    fill: 'none',
    stroke: fill,
    'stroke-width': 1,
  });
}

// ── Timeline ──

function writeTimeline(ctx: Ctx, tl: ExportTimeline): void {
  const { w, f, p } = ctx;
  w.block(
    'g',
    { class: 'gantry-export-timeline', 'clip-path': `url(#${p}-timeline)`, transform: translate(f.tx, 0) },
    () =>
      w.block('g', { transform: translate(-f.x0, 0) }, () => {
        if (f.headerH > 0) writeHeader(ctx, tl);
        writeBody(ctx, tl);
      }),
  );
}

function writeHeader(ctx: Ctx, tl: ExportTimeline): void {
  const { w, f, theme, basePx } = ctx;
  const today = colour(PAINTS.today, theme);
  const border = theme.borderColor;
  const width = f.x1 - f.x0;
  const lastTier = tl.tiers.length - 1;
  w.block('g', { class: 'g-header' }, () => {
    w.leaf('rect', { class: 'g-header-bg', x: f.x0, y: 0, width, height: f.headerH, fill: theme.headerBackground });
    tl.tiers.forEach((tier, i) => {
      w.block('g', { class: `g-tier g-tier--${tier.unit}` }, () => {
        for (const b of tier.bands)
          if (meets(b.x, b.x + b.width, f))
            w.leaf('rect', {
              class: 'g-band',
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
              fill: colour(b.fill, theme),
            });
        const cells = tier.cells.filter(c => meets(c.x, c.x + c.width, f));
        for (const c of cells)
          if (c.current)
            w.leaf('rect', {
              class: 'g-cell--current',
              x: c.x,
              y: tier.y,
              width: c.width,
              height: tier.height,
              fill: today,
              'fill-opacity': TODAY_TINT_OPACITY,
            });
        for (const c of cells)
          if (c.border) {
            const x = c.x + c.border.width / 2;
            w.leaf('line', {
              class: 'g-cell-border',
              x1: x,
              y1: tier.y,
              x2: x,
              y2: tier.y + tier.height,
              'shape-rendering': 'crispEdges',
              ...strokeAttrs(c.border, theme),
            });
          }
        const first = i === 0;
        for (const c of cells) {
          const fallbackPx = first ? basePx : basePx - 1;
          const label = c.label && (f.sliced ? sliceLabel(c, c.label, f, c.label.fontPx ?? fallbackPx) : c.label);
          if (!label) continue;
          const px = label.fontPx ?? fallbackPx;
          const weight = label.fontWeight ?? (first || (c.current && i === lastTier) ? 600 : null);
          const fill =
            label.fill ?? (c.current ? todayLabelColor(theme) : first ? theme.textPrimary : theme.textSecondary);
          w.text(
            'text',
            {
              class: 'g-cell-label',
              x: label.x,
              y: baseline(tier.y + tier.height / 2, px),
              'text-anchor': anchorOf(label.anchor),
              'font-size': px,
              'font-weight': weight === 400 ? null : weight,
              fill: colour(fill, theme),
            },
            label.text,
          );
        }
        const y = tier.y + tier.height - 0.5;
        w.leaf('line', {
          class: 'g-tier-border',
          x1: f.x0,
          y1: y,
          x2: f.x1,
          y2: y,
          stroke: border,
          'stroke-width': 1,
          'shape-rendering': 'crispEdges',
        });
      });
    });
    if (tl.lane) writeLane(ctx, tl.lane, today);
    if (tl.todayPointer !== null && tl.todayPointer >= f.x0 && tl.todayPointer <= f.x1) {
      const x = tl.todayPointer;
      const h = f.headerH;
      w.leaf('path', {
        class: 'g-today-pointer',
        d: `M${num(x - 5)},${num(h - 6)}H${num(x + 5)}L${num(x)},${num(h)}Z`,
        fill: today,
      });
    }
  });
}

/**
 * A slice cuts the cell: its label re-placed in the part of the cell on the page (a month label
 * on every page it spans), fitted to it; `null` when nothing fits.
 */
function sliceLabel(cell: ExportTierCell, label: ExportTierLabel, f: Frame, px: number): ExportTierLabel | null {
  const left = Math.max(cell.x, f.x0);
  const right = Math.min(cell.x + cell.width, f.x1);
  if (left === cell.x && right === cell.x + cell.width) return label;
  const text = fitText(label.text, right - left - 2 * HEADER_LABEL_INSET, px);
  if (!text) return null;
  const x =
    label.anchor === 'start'
      ? left + HEADER_LABEL_INSET
      : label.anchor === 'end'
        ? right - HEADER_LABEL_INSET
        : (left + right) / 2;
  return { ...label, text, x };
}

function writeLane(ctx: Ctx, lane: NonNullable<ExportTimeline['lane']>, today: string): void {
  const { w, f, theme, fontPx } = ctx;
  const px = fontPx - 1;
  const cy = lane.y + lane.height / 2;
  w.block('g', { class: 'g-marker-lane' }, () => {
    for (const m of lane.markers) {
      const right = m.label ? Math.max(m.x, m.label.x + m.label.width) : m.x;
      if (m.x > f.x1 + 1 || right < f.x0 - 1) continue;
      const isToday = m.kind === 'today';
      w.block('g', { class: `g-marker g-marker--${isToday ? 'today' : 'annotation'}` }, () => {
        w.leaf('line', {
          x1: m.x,
          y1: lane.y,
          x2: m.x,
          y2: lane.y + lane.height,
          stroke: colour(m.stroke, theme),
          'stroke-width': 2,
          opacity: isToday ? null : 0.8,
        });
        const l = m.label;
        if (!l) return;
        if (isToday)
          w.leaf('rect', {
            x: l.x,
            y: lane.y + 2,
            width: l.width,
            height: lane.height - 4,
            rx: 3,
            fill: today,
            'fill-opacity': TODAY_TINT_OPACITY,
          });
        w.text(
          'text',
          {
            class: 'g-marker-label',
            x: l.x + 4,
            y: baseline(cy, px),
            'font-size': px,
            'font-weight': 600,
            fill: colour(l.fill, theme),
          },
          l.text,
        );
      });
    }
    const y = lane.y + lane.height - 0.5;
    w.leaf('line', {
      x1: f.x0,
      y1: y,
      x2: f.x1,
      y2: y,
      stroke: theme.borderColor,
      'stroke-width': 1,
      'shape-rendering': 'crispEdges',
    });
  });
}

function writeBody(ctx: Ctx, tl: ExportTimeline): void {
  const { w, f, p, theme, model, fontPx } = ctx;
  const width = f.x1 - f.x0;
  const height = f.bottom - f.top;
  const today = colour(PAINTS.today, theme);
  w.block(
    'g',
    {
      class: 'gantt-body',
      transform: translate(0, f.headerH - f.top),
      'clip-path': f.sliced ? `url(#${p}-body)` : null,
    },
    () => {
      // Row backgrounds
      w.block('g', { class: 'gantt-rows' }, () => {
        for (let i = f.rowStart; i < f.rowEnd; i++) {
          const row = model.rows[i]!;
          w.leaf('rect', {
            x: f.x0,
            y: row.y,
            width,
            height: row.height,
            fill: colour(row.fill, theme),
            'data-task-id': row.id,
          });
        }
      });

      // Non-working time, hatched over its fill when the style says so
      w.block('g', { class: 'gantt-bands' }, () => {
        for (const b of tl.bands) {
          if (!meets(b.x, b.x + b.width, f)) continue;
          const box = { x: b.x, y: f.top, width: b.width, height };
          w.leaf('rect', { class: 'gantt-band', ...box, fill: colour(b.fill, theme) });
          if (b.hatch) w.leaf('rect', { class: 'gantt-band-hatch', ...box, fill: `url(#${p}-hatch)` });
        }
      });

      // Minor lines, row separators, period delimiters
      w.block('g', { class: 'gantt-grid', 'shape-rendering': 'crispEdges' }, () => {
        const vertical = (cls: string, lines: ExportTimeline['minor']) => {
          const xs = lines ? lines.xs.filter(x => x >= f.x0 - 1 && x <= f.x1) : [];
          if (!lines || xs.length === 0) return;
          w.block('g', { class: cls, ...strokeAttrs(lines, theme) }, () => {
            for (const x of xs) w.leaf('line', { x1: x + 0.5, y1: f.top, x2: x + 0.5, y2: f.bottom });
          });
        };
        vertical('gantt-grid-minor', tl.minor);
        writeSeparators(ctx);
        vertical('gantt-grid-major', tl.major);
      });

      // Annotation regions and lines (labels come after the bars)
      w.block('g', { class: 'gantt-annotations' }, () => {
        for (const a of tl.annotations) {
          const paint = colour(a.paint, theme);
          const r = a.region;
          if (r && meets(r.x, r.x + r.width, f))
            w.leaf('rect', { x: r.x, y: r.y, width: r.width, height: r.height, opacity: r.opacity, fill: paint });
          const l = a.line;
          if (l.x >= f.x0 - l.strokeWidth && l.x <= f.x1 + l.strokeWidth)
            w.leaf('line', {
              x1: l.x,
              y1: l.y1,
              x2: l.x,
              y2: l.y2,
              stroke: paint,
              'stroke-width': l.strokeWidth,
              'stroke-dasharray': nums(l.dash),
              opacity: l.opacity,
            });
        }
      });

      if (tl.todayX !== null && tl.todayX >= f.x0 && tl.todayX <= f.x1)
        w.leaf('line', {
          class: 'gantt-today',
          x1: tl.todayX,
          y1: f.top,
          x2: tl.todayX,
          y2: f.bottom,
          stroke: today,
          'stroke-width': 2,
        });

      // The resource view: each row's load histogram, capacity line and over-capacity part
      if (tl.load && tl.load.length > 0) writeLoad(ctx, tl, tl.load);

      w.block('g', { class: 'gantt-arrows' }, () => {
        for (const a of tl.arrows) if (!f.sliced || arrowOnPage(a, f)) writeArrow(ctx, a);
      });

      w.block('g', { class: 'gantt-bars-layer' }, () => {
        for (const b of tl.bars) if (!f.sliced || barOnPage(b, f, fontPx)) writeBar(ctx, b);
      });

      // Annotation labels above the bars (marker lane off): at the top of each page's body
      w.block('g', { class: 'gantt-annotation-labels' }, () => {
        for (const a of tl.annotations) {
          const l = a.label;
          if (!l || l.x > f.x1) continue;
          w.text(
            'text',
            {
              x: l.x,
              y: l.y + f.top,
              'font-size': l.fontSize,
              'font-weight': l.fontWeight,
              fill: colour(l.paint, theme),
            },
            l.text,
          );
        }
      });
    },
  );
}

/** The resource rows' load, one group per row of the frame (a row without load has none). */
function writeLoad({ w, f, p, model, theme }: Ctx, tl: ExportTimeline, loads: readonly (ExportLoad | null)[]): void {
  w.block('g', { class: 'gantt-load' }, () => {
    for (let i = f.rowStart; i < f.rowEnd; i++) {
      const l = loads[i];
      if (!l) continue;
      w.block('g', { class: 'gantt-load-row', 'data-task-id': model.rows[i]!.id }, () => {
        if (l.bars) w.leaf('path', { class: 'gantt-load-bars', d: l.bars, fill: colour(l.barsFill, theme) });
        if (l.over) {
          const over = colour(l.overFill, theme);
          w.leaf('path', { class: 'gantt-load-over', d: l.over, fill: over, 'fill-opacity': OVER_FILL_OPACITY });
          if (l.hatch) w.leaf('path', { class: 'gantt-load-hatch', d: l.over, fill: `url(#${p}-over-hatch)` });
        }
        if (l.cap)
          w.leaf('path', {
            class: 'gantt-load-cap',
            d: l.cap,
            fill: 'none',
            stroke: colour(l.capStroke, theme),
            'stroke-width': CAP_STROKE_WIDTH,
            'stroke-dasharray': CAP_DASH,
          });
      });
    }
  });
}

/**
 * The rows' separators (`gantt-grid-rows`): the stroke of the first one on the group, a line with
 * another stroke carries its own.
 */
function writeSeparators({ w, f, model, theme }: Ctx): void {
  let shared: Stroke | null = null;
  for (let i = f.rowStart; i < f.rowEnd && !shared; i++) shared = model.rows[i]!.separator;
  if (!shared) return;
  const base = shared;
  const same = (s: Stroke) => s.stroke === base.stroke && s.width === base.width && s.dash === base.dash;
  w.block('g', { class: 'gantt-grid-rows', ...strokeAttrs(base, theme) }, () => {
    for (let i = f.rowStart; i < f.rowEnd; i++) {
      const row = model.rows[i]!;
      const s = row.separator;
      if (!s) continue;
      const y = row.y + row.height - 0.5;
      w.leaf('line', { x1: f.x0, y1: y, x2: f.x1, y2: y, ...(same(s) ? {} : strokeAttrs(s, theme)) });
    }
  });
}

/** A link reaches the page (its route's box, with some slack for the lag label). */
function arrowOnPage(a: ArrowVisual, f: Frame): boolean {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [x, y] of a.points) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x0 > x1) return true;
  return (
    x1 + EXPORT_REACH_SLACK > f.x0 &&
    x0 - EXPORT_REACH_SLACK < f.x1 &&
    y1 + EXPORT_REACH_SLACK > f.top &&
    y0 - EXPORT_REACH_SLACK < f.bottom
  );
}

/** A bar reaches the page: its row is on it, and the bar, its baseline or its label meets `x0…x1`. */
function barOnPage(b: ExportBar, f: Frame, fontPx: number): boolean {
  const v = b.visual;
  if (v.y + v.height <= f.top || v.y >= f.bottom) return false;
  return b.markup !== null || barReaches(v, fontPx, f.x0, f.x1);
}

function writeArrow({ w, theme, fontPx }: Ctx, a: ArrowVisual): void {
  const paint = colour(a.paint, theme);
  w.block('g', { class: a.critical ? 'gantt-arrow gantt-arrow--critical' : 'gantt-arrow' }, () => {
    w.leaf('path', {
      d: nums(a.d),
      fill: 'none',
      stroke: paint,
      'stroke-width': a.width,
      'stroke-dasharray': a.dash === null ? null : nums(a.dash),
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    });
    w.leaf('polygon', { points: nums(a.head), fill: paint });
    const l = a.lagLabel;
    if (l)
      w.text(
        'text',
        { x: l.x, y: baseline(l.y, l.fontPx || fontPx), 'font-size': l.fontPx, opacity: 0.85, fill: paint },
        l.text,
      );
  });
}

function writeBar({ w, theme, fontPx }: Ctx, b: ExportBar): void {
  const v: BarVisual = b.visual;
  let cls = `gantt-bar gantt-bar--${v.kind}`;
  if (b.critical) cls += ' gantt-bar--critical';
  if (v.className) cls += ` ${v.className}`;
  w.block('g', { class: cls, 'data-task-id': b.id }, () => {
    if (b.markup !== null) {
      const markup = customMarkup(b.markup, theme);
      if (markup) w.raw(markup);
      return;
    }
    const body = colour(v.paint.body, theme);
    w.leaf('path', { class: 'gantt-bar-body', d: nums(v.path), fill: body });
    for (const s of v.segments ?? [])
      w.leaf('rect', {
        class: 'gantt-bar-segment',
        x: s.x,
        y: v.y,
        width: s.width,
        height: v.height,
        rx: v.rx,
        fill: colour(s.paint, theme),
      });
    if (v.caps) w.leaf('path', { class: 'gantt-bar-caps', d: nums(v.caps), fill: body });
    if (v.progress)
      w.leaf('path', {
        class: 'gantt-bar-progress',
        d: nums(v.progress.path),
        fill: colour(v.paint.progress, theme),
        'fill-opacity': v.progress.opacity,
      });
    if (v.baseline) {
      const bl = v.baseline;
      w.leaf('line', {
        class: 'gantt-bar-baseline',
        x1: bl.x,
        y1: bl.y,
        x2: bl.x + bl.width,
        y2: bl.y,
        stroke: colour(PAINTS.baseline, theme),
        'stroke-width': 2,
        'stroke-dasharray': '5 3',
        'stroke-linecap': 'round',
      });
    }
    const l = v.label;
    if (l)
      w.text(
        'text',
        {
          class: l.inside ? 'gantt-bar-label' : 'gantt-bar-label gantt-bar-label--outside',
          x: l.x,
          y: baseline(l.y, fontPx),
          'font-size': fontPx,
          'font-weight': l.inside ? null : 500,
          'text-anchor': anchorOf(l.anchor),
          fill: colour(v.paint.label, theme),
        },
        l.text,
      );
  });
}

// ── Legend and empty state ──

function writeLegend(ctx: Ctx, lg: ExportLegend): void {
  const { w, f, theme } = ctx;
  const L = EXPORT_LEGEND;
  const box = LEGEND_SWATCH_SIZE;
  const mid = L.lineHeight / 2;
  w.block('g', { class: 'gantt-legend', transform: translate(0, f.legendY) }, () => {
    w.leaf('rect', { x: 0, y: 0, width: f.width, height: lg.height, fill: theme.headerBackground });
    w.leaf('line', {
      x1: 0,
      y1: L.border / 2,
      x2: f.width,
      y2: L.border / 2,
      stroke: theme.borderColor,
      'stroke-width': L.border,
      'shape-rendering': 'crispEdges',
    });
    const t = lg.title;
    if (t)
      w.text(
        'text',
        {
          class: 'gantt-legend-title',
          x: t.x,
          y: baseline(t.y + mid, L.titleFontPx),
          'font-size': L.titleFontPx,
          'font-weight': L.titleFontWeight,
          'letter-spacing': L.titleLetterSpacing,
          fill: theme.textMuted,
        },
        t.text,
      );
    for (const item of lg.items) {
      w.block('g', { class: 'gantt-legend-item' }, () => {
        const sx = item.x;
        const sy = item.y + (L.lineHeight - box.height) / 2;
        const s = item.swatch;
        const fill = colour(s.fill, theme);
        if (s.kind === 'line')
          w.leaf('line', {
            class: 'gantt-legend-swatch',
            x1: sx + s.x,
            y1: sy + s.y1,
            x2: sx + s.x,
            y2: sy + s.y2,
            stroke: fill,
            'stroke-width': s.strokeWidth,
            'stroke-dasharray': s.dash === null ? null : nums(s.dash),
          });
        else
          w.leaf('rect', {
            class: 'gantt-legend-swatch',
            x: sx + s.x,
            y: sy + s.y,
            width: s.width,
            height: s.height,
            rx: s.rx,
            fill,
          });
        w.text(
          'text',
          { x: item.label.x, y: baseline(item.y + mid, L.fontPx), 'font-size': L.fontPx, fill: theme.textPrimary },
          item.label.text,
        );
      });
    }
  });
}

function writeEmpty({ w, f, model, theme }: Ctx): void {
  const e = model.empty;
  if (!e || model.rows.length > 0 || f.bottom <= f.top) return;
  // Whole drawing: where the model puts it; a slice: the same spot of the page's body
  const dx = f.sliced ? f.tx - (model.timeline?.x ?? 0) - (f.timeline ? f.x0 - (model.timeline?.x0 ?? 0) : 0) : 0;
  const dy = f.sliced ? f.headerH - model.headerHeight - f.top : 0;
  w.text(
    'text',
    {
      class: 'gantry-export-empty',
      x: e.x + dx,
      y: baseline(e.y + dy, EMPTY_FONT_PX),
      'text-anchor': 'middle',
      'font-size': EMPTY_FONT_PX,
      'font-weight': 600,
      fill: theme.textPrimary,
    },
    e.text,
  );
}

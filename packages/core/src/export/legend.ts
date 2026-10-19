// ─────────────────────────────────────────────────────────────
//  gantry · export/legend.ts
//  The legend strip of the export model (Phase 12, D3): the chart's
//  legend entries (`buildLegend`) under the body, wrapped onto more
//  lines when they don't fit the drawing's width — the bottom legend's
//  look (`EXPORT_LEGEND`, from the Web Component's legend CSS).
//
//  The strip (both painters' `div.gantt-legend.gantt-legend--bottom`:
//  a wrapping flex row, `gap: 4px 14px`, `padding: 6px 12px`, a 1 px
//  top border):
//
//    ─────────────────────────── border 1 ───────────────────────────
//    12 LEGEND 14 [swatch 18×12] 5 Today 14 [swatch] 5 Release …  12   ← 16 px line
//                                  4 px between lines
//    12 [swatch] 5 Critical path …                                     ← 16 px line
//                                  6 px padding
// ─────────────────────────────────────────────────────────────

import { DEFAULT_LABELS, type GanttTheme } from '../types';
import { estimateTextWidth, fitText } from '../render/bars';
import { resolvePaint } from '../render/paint';
import { LEGEND_SWATCH_SIZE, type LegendItem, type LegendSwatch } from '../state/legend';

/**
 * The bottom legend's metrics (the Web Component's `styles/legend.css.ts`, the same in Angular):
 * 11 px text on 16 px lines, 6 / 12 px padding, 14 px between items and 4 px between lines, 5 px
 * between a swatch (`LEGEND_SWATCH_SIZE`) and its label, and the uppercase title (9.5 px, bold,
 * 0.4 px letter spacing, `textMuted`). Labels in `textPrimary` on `headerBackground`, a 1 px top
 * border in `borderColor`.
 */
export const EXPORT_LEGEND = Object.freeze({
  fontPx: 11,
  lineHeight: 16,
  padY: 6,
  padX: 12,
  itemGap: 14,
  rowGap: 4,
  swatchGap: 5,
  titleFontPx: 9.5,
  titleFontWeight: 700,
  titleLetterSpacing: 0.4,
  /** The strip's top border (px), inside its `height` */
  border: 1,
});

/** A legend swatch with its resolved colour (`fill` of a rect, `stroke` of a line). */
export type ExportLegendSwatch = LegendSwatch & { fill: string; dash: string | null };

/**
 * The legend strip: drawing-relative `y`, items relative to it. Every line is
 * `EXPORT_LEGEND.lineHeight` tall: the title and the labels are centred on it, and a swatch's
 * `LEGEND_SWATCH_SIZE` box (its geometry is box-relative) is centred on it too, its top at
 * `item.y + (lineHeight − LEGEND_SWATCH_SIZE.height) / 2`.
 */
export interface ExportLegend {
  /** Top of the strip in the drawing (under the body): its top border */
  y: number;
  /** Top border, padding and every line */
  height: number;
  /** "LEGEND" (`labels.legend`, uppercased), first on the first line; `null` when not drawn */
  title: { text: string; x: number; y: number } | null;
  items: {
    /** Left of the swatch box */
    x: number;
    /** Top of the item's line, relative to the strip */
    y: number;
    swatch: ExportLegendSwatch;
    /** The label (fitted to a line), starting `swatchGap` after the swatch box */
    label: { text: string; x: number };
  }[];
  /**
   * What `buildLegendPart` laid the strip out from (its entries with their paints resolved, title
   * and locale, at `width`): a
   * print page narrower than the strip lays it out again at its own width (`legendAtWidth`).
   * Without it (a hand-built strip) the strip is drawn as it is.
   */
  layout?: ExportLegendLayout | undefined;
}

/** The input of a legend strip's layout (`ExportLegend.layout`). */
export interface ExportLegendLayout {
  items: readonly LegendItem[];
  /** The title text before uppercasing, `null` for none */
  title: string | null;
  locale: string | undefined;
  /** The chart font size it was built with (`ExportLegendOptions.fontPx`) */
  fontPx: number;
  /** The width the strip wraps at */
  width: number;
}

/** Sizes and colours `buildLegendPart` draws with. */
export interface ExportLegendOptions {
  /** The drawing's width: items wrap past it */
  width: number;
  /** The export theme */
  theme: Required<GanttTheme>;
  /** Chart font size in px (the strip's own size is `EXPORT_LEGEND.fontPx`, as in both painters) */
  fontPx: number;
  /** The title (`labels.legend`), drawn uppercased; `null` draws none. Default `DEFAULT_LABELS.legend` */
  title?: string | null | undefined;
  /** Locale of the uppercase title (`i18n.locale`) */
  locale?: string | undefined;
}

/** The legend part of the export model (`y` 0: `buildExportModel` places it). Pure. */
export function buildLegendPart(items: readonly LegendItem[], opts: ExportLegendOptions): ExportLegend {
  const L = EXPORT_LEGEND;
  const width = Number.isFinite(opts.width) ? opts.width : 0;
  // The content box of a line: inside the inline padding
  const lineWidth = Math.max(0, width - 2 * L.padX);
  const top = L.border + L.padY;
  let x = L.padX;
  let line = 0;
  /** Places a box `w` wide after the previous one, on a new line when it doesn't fit (never the first of a line) */
  const place = (w: number): { x: number; y: number } => {
    if (x > L.padX && x - L.padX + w > lineWidth) {
      line++;
      x = L.padX;
    }
    const at = { x, y: top + line * (L.lineHeight + L.rowGap) };
    x += w + L.itemGap;
    return at;
  };

  let title: ExportLegend['title'] = null;
  const titleText = opts.title === undefined ? DEFAULT_LABELS.legend : opts.title;
  if (titleText) {
    const text = fitText(titleText.toLocaleUpperCase(opts.locale), lineWidth, L.titleFontPx);
    if (text) title = { text, ...place(estimateTextWidth(text, L.titleFontPx) + text.length * L.titleLetterSpacing) };
  }

  const lead = LEGEND_SWATCH_SIZE.width + L.swatchGap;
  const out = items.map(item => {
    const text = fitText(item.label, Math.max(0, lineWidth - lead), L.fontPx);
    const at = place(lead + estimateTextWidth(text, L.fontPx));
    const swatch: ExportLegendSwatch = {
      ...item.swatch,
      fill: resolvePaint(item.paint, opts.theme),
      dash: item.swatch.kind === 'line' ? item.swatch.dash : null,
    };
    return { x: at.x, y: at.y, swatch, label: { text, x: at.x + lead } };
  });

  const lines = line + 1;
  return {
    y: 0,
    height: L.border + 2 * L.padY + lines * L.lineHeight + (lines - 1) * L.rowGap,
    title,
    items: out,
    // The entries with their paints resolved too: the model holds no `var(`
    layout: {
      items: items.map(item => ({ ...item, paint: resolvePaint(item.paint, opts.theme) })),
      title: titleText || null,
      locale: opts.locale,
      fontPx: opts.fontPx,
      width,
    },
  };
}

/**
 * `legend` wrapped at `width` (a print page narrower than the drawing): laid out again from its
 * `layout` with the same `y`, so its items stay on the page and its height grows with its lines.
 * The same strip when `width` is its own or it has no `layout`. Pure.
 */
export function legendAtWidth(legend: ExportLegend, width: number, theme: Required<GanttTheme>): ExportLegend {
  const l = legend.layout;
  if (!l || !Number.isFinite(width) || Math.abs(width - l.width) < 0.005) return legend;
  const strip = buildLegendPart(l.items, { width, theme, fontPx: l.fontPx, title: l.title, locale: l.locale });
  return { ...strip, y: legend.y };
}

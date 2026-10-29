// ─────────────────────────────────────────────────────────────
//  gantry · export/timeline.ts
//  The timeline part of the export model (Phase 12, D3): header tiers
//  with fitted labels, the "current period" tint and header bands, the
//  marker lane and today pointer, non-working bands (hatched or not),
//  grid lines, annotations, the today line, arrows and bars — every
//  paint resolved with the export theme. Custom bars carry their
//  serialized markup (`customBar`), inlined with `inlineThemeVars`.
//
//  What the painters leave out stays out (D3): no selection, hover,
//  focus ring, resize handles, progress grip or link connectors (the
//  bars are computed as not editable), no selected link.
// ─────────────────────────────────────────────────────────────

import { DependencyType, type GanttBarContext, type GanttTheme, type RowGeometry, type TimeUnit } from '../types';
import { computeBarVisual, fitText, type BarKind, type BarVisual, type Rect } from '../render/bars';
import { computeArrowVisual, type ArrowVisual } from '../render/arrows';
import { arrowLinks } from '../render/arrow-index';
import { computeAnnotationVisuals, computeMarkerLane, type AnnotationVisual } from '../render/markers';
import { computeRowGeometries, type TimelineModel } from '../render/timeline';
import { HEADER_LABEL_PADDING, partialLabelHidden } from '../render/scales';
import { headerCellStroke } from '../render/header';
import { resolvePaint, type Paint } from '../render/paint';
import { todayLabelColor } from '../render/theme';
import { todayX as todayXOf } from '../render/today';
import type { ResolvedLine } from '../render/config';
import { calendarDays } from '../gantt-math';
import { computeLoadVisuals } from '../resources/visual';
import { inlineThemeVars } from './xml';
import { barReaches } from './extent';
import type { ChartExportSource } from './source';

/** A resolved line: colour, width and dash array (`null`: solid). */
export interface Stroke {
  stroke: string;
  width: number;
  dash: string | null;
}

/** A single-line text: already fitted (`fitText`), positioned by its anchor. */
export interface ExportLabel {
  text: string;
  x: number;
  anchor: 'start' | 'middle' | 'end';
}

/**
 * A header cell's label with the look of its tier (the painters' header CSS): the first tier at
 * the chart font size + 1, bold, in `textPrimary`; the others at the chart font size in
 * `textSecondary`; the current period (`current`) bold in the today-label colour. Always set by
 * `buildTimelinePart` (optional so hand-built models may leave them out).
 */
export interface ExportTierLabel extends ExportLabel {
  /** Text colour */
  fill?: string | undefined;
  /** Font size in px (the label was fitted at it) */
  fontPx?: number | undefined;
  /** `font-weight`: 600 or 400 */
  fontWeight?: number | undefined;
}

/** One cell of a header tier. */
export interface ExportTierCell {
  x: number;
  width: number;
  /**
   * The fitted label: centred tiers centre it in the cell's drawn part (inside `x0…x1`), `'start'`
   * tiers start it at `max(cell.x, x0) + 6`; `null` when it doesn't fit (`partialLabelHidden` rule
   * for a cell the range cuts, `fitText` to the drawn width − 12)
   */
  label: ExportTierLabel | null;
  /** The period holds "now" (bottom tier only): tinted with the today colour at `fill-opacity` 0.14 */
  current: boolean;
  /** The cell's left border (`headerCellStroke`), `null` for the first cell */
  border: Stroke | null;
}

/** One header tier, top to bottom (`y` from the header's top). */
export interface ExportTier {
  y: number;
  height: number;
  unit: TimeUnit;
  /** Cells that meet `x0…x1`, in x order */
  cells: ExportTierCell[];
  /**
   * Non-working shading of the header (`nonWorkingTime.showInHeader`, bottom tier only), under the
   * cells; `y` / `height` are the tier's
   */
  bands: (Rect & { fill: string })[];
}

/** A marker of the marker lane (today, annotations). */
export interface ExportMarker {
  x: number;
  stroke: string;
  label: { text: string; x: number; width: number; fill: string } | null;
  /**
   * `'today'`: its label sits on the today tint (the today colour at `fill-opacity` 0.14);
   * `'annotation'`: its tick is drawn at opacity 0.8
   */
  kind: 'today' | 'annotation';
}

/** A non-working band of the body. */
export interface ExportBand {
  x: number;
  width: number;
  fill: string;
  /** Drawn with the hatch `<pattern>` over the fill (`nonWorkingTime.style: 'hatch'`) */
  hatch: boolean;
}

/** One bar. */
export interface ExportBar {
  id: string;
  kind: BarKind;
  /** The bar's visual with every paint resolved (`resolvePaint`) */
  visual: BarVisual;
  critical: boolean;
  /**
   * Custom bar markup (`ChartExportSource.customBar`), drawn instead of the built-in shapes, its
   * `var(--gantt-*)` already inlined (`inlineThemeVars`); `null` = built-in
   */
  markup: string | null;
}

/**
 * One resource row's load (Phase 14 D9 / D17): the stepped histogram of the daily load up to the
 * capacity (`bars`), the part above it (`over`, hatched) and the capacity line (`cap`), as SVG path
 * data in timeline px, body-relative; the fills are resolved colours.
 */
export interface ExportLoad {
  /** The load up to the capacity; `''` when the row is idle */
  bars: string;
  /** The load above the capacity; `''` when there is none */
  over: string;
  /** The capacity line across the drawn range; `null` for the Unassigned row */
  cap: string | null;
  /** Fill of `bars` (the resource's colour, else the bar colour) */
  barsFill: string;
  /** Fill of `over` and stroke of its hatch (the over-allocation colour) */
  overFill: string;
  /** Stroke of `cap` */
  capStroke: string;
  /** Draw `over` with the hatch pattern as well (a colour is never the only cue) */
  hatch: boolean;
}

/**
 * The timeline in timeline px; the serializer translates it by `x − x0` and clips it to `x0…x1`.
 * Header parts (`tiers`, `lane`) are header-relative, body parts body-relative. Lines are at
 * their boundary x: painters draw grid lines at `x + 0.5` and row separators at the row's bottom
 * − 0.5 (crisp 1 px lines).
 */
export interface ExportTimeline {
  /** Left edge of the timeline in the drawing (the table's width in the split view, else 0) */
  x: number;
  /** First and last timeline px drawn */
  x0: number;
  x1: number;
  /** `x1 − x0` */
  width: number;
  tiers: ExportTier[];
  /** The marker lane under the tiers, or `null` */
  lane: { y: number; height: number; markers: ExportMarker[] } | null;
  /** x of the today pointer in the header, or `null` */
  todayPointer: number | null;
  /** Bands that meet `x0…x1` */
  bands: ExportBand[];
  /** Minor grid lines (`gridLines.minor`) at `xs` (inside `x0…x1`), or `null` */
  minor: (Stroke & { xs: number[] }) | null;
  /** Period delimiters (`gridLines.major`) at `xs` (inside `x0…x1`), or `null` */
  major: (Stroke & { xs: number[] }) | null;
  /** x of the today line (`today`, inside `x0…x1`), or `null` */
  todayX: number | null;
  /** Annotations, body-relative, paints resolved */
  annotations: AnnotationVisual[];
  /** Dependency arrows (critical ones too), body-relative, paints resolved; none in the resource view */
  arrows: ArrowVisual[];
  /**
   * The resource view's load per shown row (`rows: 'resources'`), aligned with `ChartExportSource.rows`
   * (`null`: a row without load); empty in tasks mode (optional so hand-built models may leave it out).
   * Drawn instead of the bars, which the resource view has none of.
   */
  load?: (ExportLoad | null)[] | undefined;
  /**
   * Bars in row order, body-relative: those that reach `x0…x1` (body, baseline or label, with
   * some slack); a bar the range leaves out is not drawn, and no custom bar is rendered for it
   */
  bars: ExportBar[];
}

/** What `buildTimelinePart` draws from. */
export interface ExportTimelineInput {
  source: ChartExportSource;
  /** `exportTimeline(source, range).timeline` */
  timeline: TimelineModel;
  /** The drawn timeline px (`exportTimeline`) */
  x0: number;
  x1: number;
  /** Left edge of the timeline in the drawing */
  x: number;
  /** The export theme */
  theme: Required<GanttTheme>;
  /** Draw the today line and pointer */
  today: boolean;
  /** Chart font size in px */
  fontPx: number;
}

/** Rows the body of an empty chart is tall (where `labels.emptyState` is drawn). */
export const EXPORT_EMPTY_ROWS = 3;

/** Height of the drawn body: every shown row, or `EXPORT_EMPTY_ROWS` rows when there is none. */
export function exportBodyHeight(rowCount: number, rowHeight: number): number {
  return (rowCount > 0 ? rowCount : EXPORT_EMPTY_ROWS) * rowHeight;
}

/** `ResolvedLine` → `Stroke` with its paint resolved. */
function strokeOf(line: ResolvedLine | null | undefined, theme: GanttTheme): Stroke | null {
  return line ? { stroke: resolvePaint(line.paint, theme), width: line.width, dash: line.dash ?? null } : null;
}

/** A bar visual with every paint resolved (body, progress, label, rollup segments). */
function resolveBarVisual(v: BarVisual, theme: GanttTheme): BarVisual {
  const paint = (p: Paint) => resolvePaint(p, theme);
  return {
    ...v,
    paint: { body: paint(v.paint.body), progress: paint(v.paint.progress), label: paint(v.paint.label) },
    segments: v.segments && v.segments.map(s => ({ ...s, paint: paint(s.paint) })),
  };
}

/** The timeline part of the export model (`buildExportModel`). Pure. */
export function buildTimelinePart(input: ExportTimelineInput): ExportTimeline {
  const { source, timeline, x0, x1, x, theme, today, fontPx } = input;
  const cfg = source.config;
  const paint = (p: Paint) => resolvePaint(p, theme);
  const meets = (from: number, to: number) => to > x0 && from < x1;
  const inside = (at: number) => at >= x0 && at < x1;

  // ── Today: the exact tick on the timeline, only inside the drawn range ──
  const nowX = today ? todayXOf(timeline, source.now) : null;
  const todayAt = nowX !== null && nowX >= x0 && nowX <= x1 ? nowX : null;

  // ── Header tiers ──
  const lastTier = timeline.tiers.length - 1;
  const headerBands = cfg.nonWorking?.showInHeader ? timeline.bands.filter(b => meets(b.x, b.x + b.width)) : [];
  const currentFill = todayLabelColor(theme);
  const tiers = timeline.tiers.map((tier, i): ExportTier => {
    const first = i === 0;
    const tierFontPx = first ? fontPx + 1 : fontPx;
    const cells: ExportTierCell[] = [];
    for (const cell of tier.cells) {
      const left = Math.max(cell.x, x0);
      const right = Math.min(cell.x + cell.width, x1);
      if (right <= left) continue;
      const current = cell.isCurrent && i === lastTier;
      const shown = right - left;
      const cut = left > cell.x || right < cell.x + cell.width;
      let label: ExportTierLabel | null = null;
      if (cell.label && !(cut && partialLabelHidden(cell.label, shown, tierFontPx))) {
        const text = fitText(cell.label, shown - HEADER_LABEL_PADDING, tierFontPx);
        if (text) {
          label = {
            text,
            ...(tier.align === 'start'
              ? { x: left + HEADER_LABEL_PADDING / 2, anchor: 'start' as const }
              : { x: left + shown / 2, anchor: 'middle' as const }),
            fill: current ? currentFill : first ? theme.textPrimary : theme.textSecondary,
            fontPx: tierFontPx,
            fontWeight: first || current ? 600 : 400,
          };
        }
      }
      cells.push({
        x: cell.x,
        width: cell.width,
        label,
        current,
        border: strokeOf(headerCellStroke(cfg, timeline, i, cell), theme),
      });
    }
    return {
      y: tier.y,
      height: tier.height,
      unit: tier.unit,
      cells,
      bands:
        i === lastTier
          ? headerBands.map(b => ({ x: b.x, y: tier.y, width: b.width, height: tier.height, fill: paint(b.paint) }))
          : [],
    };
  });

  // ── Marker lane: labels stop at the drawn range's end ──
  const markerLane = computeMarkerLane({
    config: { markers: cfg.markers, showToday: today },
    timeline: { toX: timeline.toX, totalWidth: x1, headerHeight: timeline.headerHeight },
    annotations: source.annotations,
    todayX: todayAt,
    labels: source.i18n.labels,
    fontPx,
  });
  const lane =
    markerLane.height > 0
      ? {
          y: markerLane.y,
          height: markerLane.height,
          markers: markerLane.markers.map((m): ExportMarker => ({
            x: m.x,
            stroke: paint(m.paint),
            label: m.label && { text: m.label.text, x: m.label.x, width: m.label.width, fill: paint(m.label.paint) },
            kind: m.kind,
          })),
        }
      : null;

  // ── Body: bands, grid lines, annotations ──
  const rows = source.rows;
  const bodyHeight = exportBodyHeight(rows.length, cfg.rowHeight);
  const hatch = cfg.nonWorking?.style === 'hatch';
  const bands = timeline.bands
    .filter(b => meets(b.x, b.x + b.width))
    .map((b): ExportBand => ({ x: b.x, width: b.width, fill: paint(b.paint), hatch: hatch && b.kind !== 'intensive' }));
  const linesOf = (line: ResolvedLine | null, xs: readonly number[]) => {
    const s = strokeOf(line, theme);
    return s && { ...s, xs: xs.filter(inside) };
  };
  const annotations = computeAnnotationVisuals(
    source.annotations,
    timeline,
    { top: 0, bottom: bodyHeight },
    fontPx,
    markerLane,
  ).map((a): AnnotationVisual => ({
    ...a,
    paint: paint(a.paint),
    label: a.label && { ...a.label, paint: paint(a.label.paint) },
  }));

  // ── Bars: as both painters compute them, but not editable (no handles, grip or connectors) ──
  const { toX } = timeline;
  const geos = computeRowGeometries([...rows], timeline, cfg);
  // The resource view draws each row's load; its rows have no bar and no link (Phase 14 D11)
  const utilization = cfg.rows === 'resources' ? (source.utilization ?? null) : null;
  const visuals = new Map<RowGeometry, BarVisual>();
  const bars: ExportBar[] = [];
  for (const geo of utilization ? [] : geos) {
    const row = geo.row;
    const id = row.task.id;
    const critical = source.critical.has(id);
    const style = source.rowStyle(row);
    const raw = computeBarVisual({
      geo,
      cfg,
      toX,
      fontPx,
      barTextColor: theme.barTextColor,
      isCritical: critical,
      resizable: false,
      progressEditable: false,
      linkable: false,
      style,
      segments: source.segments(row, toX),
    });
    // Arrows need every bar's visual; a bar the range doesn't reach is not drawn
    visuals.set(geo, raw);
    if (!barReaches(raw, fontPx, x0, x1)) continue;
    const visual = resolveBarVisual(raw, theme);
    let markup: string | null = null;
    if (source.customBar) {
      const ctx: GanttBarContext = {
        row,
        geometry: geo,
        theme,
        layoutParams: { origin: timeline.start, pxPerDay: timeline.pxPerDay, rowHeight: cfg.rowHeight },
        isCritical: critical,
        isSelected: false,
        enableResize: false,
        showBaseline: cfg.baseline,
        draggable: false,
        visual,
        style,
      };
      const out = source.customBar(ctx);
      markup = typeof out === 'string' ? inlineThemeVars(out, theme) : null;
    }
    bars.push({ id, kind: visual.kind, visual, critical, markup });
  }

  // ── Arrows between shown rows, in the painters' order ──
  const geoById = new Map(geos.map(g => [g.row.task.id, g]));
  const arrows: ArrowVisual[] = [];
  for (const link of utilization ? [] : arrowLinks(source.tasks, geoById)) {
    const from = geoById.get(link.from);
    const to = geoById.get(link.to);
    const fromVisual = from && visuals.get(from);
    const toVisual = to && visuals.get(to);
    if (!from || !fromVisual || !toVisual) continue;
    const a = computeArrowVisual(
      fromVisual,
      toVisual,
      { type: link.dep.type ?? DependencyType.FS, lag: link.dep.lag },
      cfg,
      { fromTop: from.y, fromBottom: from.y + from.height },
      source.critical.has(link.from) && source.critical.has(link.to),
      fontPx,
    );
    arrows.push({ ...a, paint: paint(a.paint) });
  }

  // ── Resource view: the load paths of every row, over the drawn range ──
  const load: (ExportLoad | null)[] = [];
  if (utilization) {
    const visualsByRow = new Map(
      computeLoadVisuals({
        geos,
        utilization,
        timeline,
        window: { x0, x1 },
        cfg,
        dayOfX: px => calendarDays(timeline.toDate(px), false),
      }).map(v => [v.rowKey, v]),
    );
    for (const geo of geos) {
      const v = visualsByRow.get(geo.row.task.id);
      load.push(
        v
          ? {
              bars: v.bars,
              over: v.over,
              cap: v.cap,
              barsFill: paint(v.barsPaint),
              overFill: paint(v.overPaint),
              capStroke: theme.textSecondary,
              hatch: v.hatch,
            }
          : null,
      );
    }
  }

  return {
    x,
    x0,
    x1,
    width: x1 - x0,
    tiers,
    lane,
    todayPointer: todayAt,
    bands,
    minor: linesOf(cfg.gridLines.minor, timeline.minorLines),
    major: linesOf(cfg.gridLines.major, timeline.majorLines),
    todayX: todayAt,
    annotations,
    arrows,
    load,
    bars,
  };
}

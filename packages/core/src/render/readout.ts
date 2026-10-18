// ─────────────────────────────────────────────────────────────
//  gantry · render/readout.ts
//  The drag readout: a small chip next to the bar being dragged,
//  resized or moved with the keyboard, saying where it lands —
//  "3 Mar – 6 Mar · 3 days". Its text and its place are computed
//  here; both painters only write them into `div.gantt-drag-readout`
//  (a child of the timeline viewport, `aria-hidden`: the live
//  region announces the result instead).
// ─────────────────────────────────────────────────────────────

import { durationLabel, formatDate } from '../gantt-math';
import type { GanttLabels } from '../types';
import { estimateTextWidth } from './bars';
import type { ResolvedGanttConfig } from './config';
import type { GhostLabel, GhostVisual } from './ghost';
import { taskSpan } from './timeline';

// ─── Look (the chip's stylesheet in both bindings uses these) ─

/** Dates of the readout on day scales, e.g. "3 Mar" (dayjs-compatible tokens, localized month names) */
export const DRAG_READOUT_FORMAT = 'D MMM';
/** Dates of the readout on hour scales, e.g. "3 Mar 09:00" */
export const DRAG_READOUT_HOUR_FORMAT = 'D MMM HH:mm';
/** The end on hour scales when it falls on the start's day, e.g. "3 Mar 09:00 – 17:00" */
export const DRAG_READOUT_TIME_FORMAT = 'HH:mm';
/** Between the two dates */
export const DRAG_READOUT_RANGE_SEPARATOR = ' – ';
/** Font size of the chip's text (px, weight 600) */
export const DRAG_READOUT_FONT_PX = 11;
/** Horizontal padding inside the chip (px) */
export const DRAG_READOUT_PAD_X = 6;
/** Border-box height of the chip (px) */
export const DRAG_READOUT_HEIGHT = 20;
/** Space between the dragged bar (and its "+3d" label) and the chip (px) */
export const DRAG_READOUT_GAP = 4;
/** Smallest distance kept to the visible edges of the timeline (px) */
export const DRAG_READOUT_EDGE = 4;

// ─── Text ─────────────────────────────────────────────────────

/** The labels the readout reads: its template and the duration words (the Duration column's). */
export type DragReadoutLabels = Pick<
  GanttLabels,
  'dragReadout' | 'durationLessThanDay' | 'durationDay' | 'durationDays' | 'durationWeeks' | 'durationWeeksDays'
>;

export interface DragReadoutOptions {
  labels: DragReadoutLabels;
  locale?: string | undefined;
  /** How task dates are read (the duration counts an inclusive end's last day, like the bar) */
  dates: Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly'>;
  /** Snap unit of the drag (`DragPreview.unit`): hour scales show the time */
  unit: 'day' | 'hour';
  /** Format of each date; default `DRAG_READOUT_FORMAT`, or `DRAG_READOUT_HOUR_FORMAT` on hour scales */
  format?: string | undefined;
  /** The bar is a milestone: only its date */
  milestone?: boolean | undefined;
}

/**
 * The readout's text for the new task dates (`DragPreview.start` / `end`): the formatted range and
 * the duration through `labels.dragReadout`, e.g. "3 Mar – 6 Mar · 3 days". The dates are task
 * dates, shown as the tooltip and the date columns show them; the duration is the Duration
 * column's. One date when both ends read the same; a milestone shows its date only. `''` when a
 * date is missing (a preview built without them).
 */
export function formatDragReadout(
  range: { readonly start?: Date | undefined; readonly end?: Date | undefined },
  options: DragReadoutOptions,
): string {
  const { start, end } = range;
  if (!start || !end) return '';
  const { labels, locale, unit } = options;
  const format = options.format ?? (unit === 'hour' ? DRAG_READOUT_HOUR_FORMAT : DRAG_READOUT_FORMAT);
  const from = formatDate(start, format, locale);
  if (options.milestone) return from;

  let to = formatDate(end, format, locale);
  if (options.format === undefined && unit === 'hour' && sameDay(start, end)) {
    to = formatDate(end, DRAG_READOUT_TIME_FORMAT, locale);
  }
  const text = to === from ? from : `${from}${DRAG_READOUT_RANGE_SEPARATOR}${to}`;
  const span = taskSpan({ start, end }, options.dates);
  return labels.dragReadout(text, durationLabel(span.start, span.end, labels));
}

/** Estimated border-box width of the chip for `text` (no layout read): pass it to `placeDragReadout`. */
export function dragReadoutWidth(text: string, fontPx = DRAG_READOUT_FONT_PX): number {
  return Math.ceil(estimateTextWidth(text, fontPx) + 2 * DRAG_READOUT_PAD_X);
}

// ─── Placement ────────────────────────────────────────────────

/** The ghost of the dragged bar (`computeDragGhostVisual`), or any box in canvas px. */
export interface DragReadoutAnchor extends Pick<GhostVisual, 'x' | 'y' | 'width' | 'height'> {
  /** The ghost's "+3d" label: the chip goes above it */
  label?: Pick<GhostLabel, 'y' | 'fontPx'> | null | undefined;
}

/** The timeline viewport the chip shows in (`div.gantry-canvas-viewport`). */
export interface DragReadoutView {
  scrollLeft: number;
  /** Visible width (`clientWidth`: without the scrollbar) */
  viewportWidth: number;
  scrollTop: number;
  /** Height of the sticky header at the top of the viewport (the canvas starts below it) */
  headerHeight: number;
  /** Visible height (`clientHeight`); omitted: the chip is not kept above the bottom edge */
  viewportHeight?: number | undefined;
  /** The chip's width (`dragReadoutWidth(text)`, or measured); default 0: only the anchor is kept in view */
  width?: number | undefined;
  /** The chip's height (default `DRAG_READOUT_HEIGHT`) */
  height?: number | undefined;
  /** Default `DRAG_READOUT_GAP` */
  gap?: number | undefined;
  /** Default `DRAG_READOUT_EDGE` */
  edge?: number | undefined;
}

export interface DragReadoutPlacement {
  /**
   * In the viewport's scroll content (px): the chip's left edge (`align: 'start'`), centre
   * (`'center'`) or right edge (`'end'`). Painters write it as `--x` and translate the chip by
   * 0 / -50% / -100% (`data-align`), so the real width never needs a layout read.
   */
  x: number;
  /** Top edge of the chip in the viewport's scroll content (px), below the sticky header: `--y` */
  y: number;
  /** Centred on the anchor, or pushed against the visible start / end edge */
  align: 'start' | 'center' | 'end';
  /** Above the anchor (and its label), or below it when the header leaves no room above */
  side: 'above' | 'below';
}

/**
 * Where the readout chip goes, in the coordinates of the timeline viewport's scroll content (the
 * chip is absolutely positioned inside `.gantry-canvas-viewport`, where the canvas starts below
 * the sticky header): centred above the dragged bar's ghost and its "+3d" label, pushed against
 * the visible edge when centring would clip it (or when the ghost is out of view, e.g. during
 * auto-scroll), and below the bar when the sticky header leaves no room above. Rounded.
 */
export function placeDragReadout(anchor: DragReadoutAnchor, view: DragReadoutView): DragReadoutPlacement {
  const width = view.width ?? 0;
  const height = view.height ?? DRAG_READOUT_HEIGHT;
  const gap = view.gap ?? DRAG_READOUT_GAP;
  const edge = view.edge ?? DRAG_READOUT_EDGE;

  // Horizontal: the visible part of the ghost, in content px (the canvas starts at x = 0)
  const left = view.scrollLeft + edge;
  const right = view.scrollLeft + view.viewportWidth - edge;
  const from = Math.max(anchor.x, left);
  const to = Math.min(anchor.x + anchor.width, right);
  const centre = from <= to ? (from + to) / 2 : Math.min(Math.max(anchor.x + anchor.width / 2, left), right);
  let x = centre;
  let align: DragReadoutPlacement['align'] = 'center';
  if (centre - width / 2 < left || width > right - left) {
    x = left;
    align = 'start';
  } else if (centre + width / 2 > right) {
    x = right;
    align = 'end';
  }

  // Vertical: canvas y + header height; above the ghost and its label unless the header covers it
  const top = view.headerHeight + Math.min(anchor.y, anchor.label ? anchor.label.y - anchor.label.fontPx : anchor.y);
  const visibleTop = view.scrollTop + view.headerHeight + edge;
  let y = top - gap - height;
  let side: DragReadoutPlacement['side'] = 'above';
  if (y < visibleTop) {
    y = view.headerHeight + anchor.y + anchor.height + gap;
    side = 'below';
  }
  if (view.viewportHeight !== undefined) y = Math.min(y, view.scrollTop + view.viewportHeight - edge - height);
  y = Math.max(y, visibleTop);

  return { x: Math.round(x), y: Math.round(y), align, side };
}

// ─── Helpers ──────────────────────────────────────────────────

/** Same local calendar day, as the readout formats it (date-only values read as local days). */
function sameDay(a: Date, b: Date): boolean {
  return formatDate(a, 'YYYY-MM-DD') === formatDate(b, 'YYYY-MM-DD');
}

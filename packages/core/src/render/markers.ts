// ─────────────────────────────────────────────────────────────
//  gantry · render/markers.ts
//  Marker lane under the header (today and annotation labels) and
//  the annotation visuals of the canvas: regions, dashed lines and,
//  when the lane is off, the labels drawn above the bars.
//  Pure — no DOM, no framework. Separate from `buildTimeline` on purpose:
//  annotations are not a timeline input, so the timeline memo holds.
// ─────────────────────────────────────────────────────────────

import type { GanttAnnotation, GanttLabels, GanttView } from '../types';
import type { ResolvedGanttConfig } from './config';
import type { TimelineModel } from './timeline';
import { estimateTextWidth, fitText } from './bars';
import { CONTRAST_CSS_VARS } from './theme';
import { PAINTS, annotationPaint, themeVar, type Paint } from './paint';

// ─── Marker lane ──────────────────────────────────────────────

/** Height (px) of the marker lane under the header tiers, when it is shown. */
export const MARKER_LANE_HEIGHT = 18;
/** Gap (px) between a marker and its label, and between a label and the next marker. */
export const MARKER_LABEL_GAP = 4;
/** Horizontal padding (px) inside a marker label, on each side. */
export const MARKER_LABEL_PADDING = 4;
/** A marker label with less room than this (px) is hidden instead of truncated. */
export const MARKER_LABEL_MIN_WIDTH = 24;

export interface MarkerLabel {
  /** Text to show: the label, or the label truncated with an ellipsis to fit before the next marker */
  text: string;
  /** The full label (a `title` for a truncated one) */
  title: string;
  /** Left edge of the label box (timeline x): `MARKER_LABEL_GAP` right of the marker */
  x: number;
  /** Width of the label box (px), `MARKER_LABEL_PADDING` on both sides included */
  width: number;
  /**
   * Text colour: the theme's text colour for annotations (their colour marks the tick: an annotation
   * colour is rarely 4.5:1 on the header), the today-label contrast token for today
   */
  paint: Paint;
}

export interface MarkerVisual {
  /** Stable key: `'today'`, or `'annotation:<index in the input>'` */
  key: string;
  kind: 'today' | 'annotation';
  /** x of the marker (timeline coordinates) */
  x: number;
  /** `null` for an annotation without label text, or a label with no room left (see `computeMarkerLane`) */
  label: MarkerLabel | null;
  /** Colour of the marker: `PAINTS.today` for today, else `annotationPaint(annotation)` */
  paint: Paint;
}

export interface MarkerLane {
  /** `MARKER_LANE_HEIGHT` while the lane is shown, else 0 (no lane, no markers) */
  height: 0 | typeof MARKER_LANE_HEIGHT;
  /** Top of the lane in the header: right under the tiers (`timeline.headerHeight`) */
  y: number;
  /** Font size (px) of the labels: the chart font size − 1, like the canvas annotation labels */
  labelFontPx: number;
  /** In x order; on the same x, annotations (in input order) come before today */
  markers: MarkerVisual[];
}

export interface MarkerLaneInput {
  config: Pick<ResolvedGanttConfig, 'markers' | 'showToday'>;
  timeline: Pick<TimelineModel, 'toX' | 'totalWidth' | 'headerHeight'>;
  annotations: readonly GanttAnnotation[];
  /** x of the today line (`todayX(timeline, now)`); `null` or negative when it isn't shown */
  todayX: number | null;
  labels: Pick<GanttLabels, 'today'>;
  /** Chart font size (`themeMetrics(theme).fontPx`, default 12) */
  fontPx?: number | undefined;
  /** The shown view: the table view has no timeline, so no lane */
  view?: GanttView | undefined;
}

/**
 * The marker lane is shown: `markers.lane: true`, or `'auto'` (the default) with at least one
 * annotation that has label text. `false` never shows it, and neither does the table view (no
 * timeline).
 */
export function markerLaneShown(
  config: Pick<ResolvedGanttConfig, 'markers'>,
  annotations: readonly GanttAnnotation[],
  view?: GanttView,
): boolean {
  if (view === 'table') return false;
  const lane = config.markers.lane;
  return lane === true || (lane === 'auto' && annotations.some(a => !!a.label?.text));
}

/**
 * The marker lane (D12): one marker per annotation whose start is inside the timeline, plus a
 * "Today" marker while the today line is shown — only when the lane is shown
 * (`markerLaneShown`). Labels sit `MARKER_LABEL_GAP` right of their marker and never reach the
 * next marker: a label that doesn't fit is truncated with `fitText`, and hidden (`label: null`)
 * when it has less than `MARKER_LABEL_MIN_WIDTH` px; the last one stops at the timeline end.
 */
export function computeMarkerLane(input: MarkerLaneInput): MarkerLane {
  const { config, timeline, annotations, todayX, labels } = input;
  const labelFontPx = (input.fontPx ?? 12) - 1;
  const y = timeline.headerHeight;
  if (!markerLaneShown(config, annotations, input.view)) return { height: 0, y, labelFontPx, markers: [] };

  type Draft = { key: string; kind: MarkerVisual['kind']; x: number; paint: Paint; text: string; textPaint: Paint };
  const drafts: Draft[] = [];
  annotations.forEach((ann, i) => {
    const x = timeline.toX(ann.x1);
    if (!(x >= 0 && x <= timeline.totalWidth)) return;
    const paint = annotationPaint(ann);
    drafts.push({
      key: `annotation:${i}`,
      kind: 'annotation',
      x,
      paint,
      text: ann.label?.text ?? '',
      textPaint: themeVar('textPrimary'),
    });
  });
  if (config.showToday && todayX !== null && todayX >= 0 && todayX <= timeline.totalWidth) {
    drafts.push({
      key: 'today',
      kind: 'today',
      x: todayX,
      paint: PAINTS.today,
      text: labels.today,
      textPaint: `var(${CONTRAST_CSS_VARS.todayLabel})`,
    });
  }
  // Stable sort: annotations keep their input order and today (pushed last) wins a tie
  drafts.sort((a, b) => a.x - b.x);

  const markers = drafts.map((d, i): MarkerVisual => {
    const next = drafts[i + 1];
    const labelX = d.x + MARKER_LABEL_GAP;
    const room = (next ? next.x - MARKER_LABEL_GAP : timeline.totalWidth) - labelX;
    return { key: d.key, kind: d.kind, x: d.x, paint: d.paint, label: fitMarkerLabel(d, labelX, room, labelFontPx) };
  });
  return { height: MARKER_LANE_HEIGHT, y, labelFontPx, markers };
}

function fitMarkerLabel(
  d: { text: string; textPaint: Paint },
  x: number,
  room: number,
  fontPx: number,
): MarkerLabel | null {
  if (!d.text) return null;
  const boxOf = (text: string) => Math.ceil(estimateTextWidth(text, fontPx) + 2 * MARKER_LABEL_PADDING);
  const full = boxOf(d.text);
  if (full <= room) return { text: d.text, title: d.text, x, width: full, paint: d.textPaint };
  if (room < MARKER_LABEL_MIN_WIDTH) return null;
  const text = fitText(d.text, room - 2 * MARKER_LABEL_PADDING, fontPx);
  if (!text) return null;
  return { text, title: d.text, x, width: Math.min(room, boxOf(text)), paint: d.textPaint };
}

// ─── Annotations in the canvas ────────────────────────────────

/** Default opacity of an annotation region (`annotation.opacity` overrides it). */
export const ANNOTATION_REGION_OPACITY = 0.08;
/** Annotation line: stroke width, dash and opacity. */
export const ANNOTATION_LINE: Readonly<{ strokeWidth: number; dash: string; opacity: number }> = Object.freeze({
  strokeWidth: 1.5,
  dash: '5 3',
  opacity: 0.8,
});
/** Offset of a canvas annotation label from its line (x) and from the top of the window (y). */
export const ANNOTATION_LABEL_OFFSET: Readonly<{ x: number; y: number }> = Object.freeze({ x: 6, y: 14 });

export interface AnnotationVisual {
  /** Index of the annotation in the input */
  key: string;
  /** `annotationPaint(annotation)`: fill of the region, stroke of the line */
  paint: Paint;
  /** Shaded region x1 → x2 (when `annotation.x2` is set), from the top of the window to its bottom */
  region: { x: number; y: number; width: number; height: number; opacity: number } | null;
  /** Dashed vertical line at x1, across the window */
  line: { x: number; y1: number; y2: number; strokeWidth: number; dash: string; opacity: number };
  /**
   * The label drawn in the canvas, above the bars: only while the marker lane is off (the lane
   * shows the labels otherwise). `y` is `ANNOTATION_LABEL_OFFSET.y` below the top of the window
   * plus `label.offsetY` (px, default 0; positive moves it down). `fontSize` is `label.fontSize`
   * or the chart font size − 1, `fontWeight` is `label.fontWeight` or 600.
   */
  label: {
    text: string;
    x: number;
    y: number;
    fontSize: number | string;
    fontWeight: number | string;
    paint: Paint;
  } | null;
}

/** `AnnotationLabel.offsetY` as a finite number of px (0 when unset or not finite). */
const labelOffsetY = (offsetY: number | undefined): number =>
  typeof offsetY === 'number' && Number.isFinite(offsetY) ? offsetY : 0;

/**
 * What the canvas draws for each annotation: the region and the line, between `span.top` and
 * `span.bottom` (the mounted window), and the label when `lane` is off (`false`, or a lane of
 * height 0). `fontPx` is the chart font size (`themeMetrics(theme).fontPx`).
 */
export function computeAnnotationVisuals(
  annotations: readonly GanttAnnotation[],
  timeline: Pick<TimelineModel, 'toX'>,
  span: { top: number; bottom: number },
  fontPx: number,
  lane: boolean | Pick<MarkerLane, 'height'>,
): AnnotationVisual[] {
  const laneOn = typeof lane === 'boolean' ? lane : lane.height > 0;
  const { top, bottom } = span;
  return annotations.map((ann, i): AnnotationVisual => {
    const x = timeline.toX(ann.x1);
    const paint = annotationPaint(ann);
    const label = ann.label;
    return {
      key: String(i),
      paint,
      region: ann.x2
        ? {
            x,
            y: top,
            width: Math.max(0, timeline.toX(ann.x2) - x),
            height: bottom - top,
            opacity: ann.opacity ?? ANNOTATION_REGION_OPACITY,
          }
        : null,
      line: { x, y1: top, y2: bottom, ...ANNOTATION_LINE },
      label:
        label && !laneOn
          ? {
              text: label.text,
              x: x + ANNOTATION_LABEL_OFFSET.x,
              y: top + ANNOTATION_LABEL_OFFSET.y + labelOffsetY(label.offsetY),
              fontSize: label.fontSize ?? fontPx - 1,
              fontWeight: label.fontWeight ?? 600,
              paint: label.color ?? paint,
            }
          : null,
    };
  });
}

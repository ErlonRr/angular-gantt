// ─────────────────────────────────────────────────────────────
//  gantry · state/legend.ts
//  Items of the floating legend (today marker, annotations, and the
//  critical-path bar / baseline strip when enabled). Both painters draw
//  these items as is, so they always list the same entries.
// ─────────────────────────────────────────────────────────────

import { DEFAULT_LABELS, type GanttAnnotation, type GanttLabels, type GanttView } from '../types';
import { PAINTS, annotationPaint, themeVar, type Paint } from '../render/paint';

/** Legend-only strings (part of `GanttLabels`). */
export type LegendExtraLabels = Pick<GanttLabels, 'legendCritical' | 'legendBaseline'>;

export const DEFAULT_LEGEND_LABELS: LegendExtraLabels = {
  legendCritical: DEFAULT_LABELS.legendCritical,
  legendBaseline: DEFAULT_LABELS.legendBaseline,
};

/**
 * How a painter draws the swatch: a solid vertical `line` (today), a `dashed` vertical line
 * (annotation), a small filled `bar` (critical path) or a thin horizontal `strip` (baseline,
 * e.g. `<rect height="3">`).
 */
export type LegendShape = 'line' | 'dashed' | 'bar' | 'strip';

/** Swatch geometry inside a `LEGEND_SWATCH_SIZE` box: a vertical line or a rounded rect. */
export type LegendSwatch =
  | { kind: 'line'; x: number; y1: number; y2: number; strokeWidth: number; dash: string | null }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx: number };

/** Size of every legend swatch (px). */
export const LEGEND_SWATCH_SIZE = { width: 18, height: 12 } as const;

const SWATCHES: Record<LegendShape, LegendSwatch> = {
  line: { kind: 'line', x: 9, y1: 0, y2: 12, strokeWidth: 2, dash: null },
  dashed: { kind: 'line', x: 9, y1: 0, y2: 12, strokeWidth: 2, dash: '3 2' },
  bar: { kind: 'rect', x: 1, y: 3, width: 16, height: 6, rx: 2 },
  strip: { kind: 'rect', x: 1, y: 4.5, width: 16, height: 3, rx: 1 },
};

/** Geometry of a swatch shape, so every painter draws the same legend. */
export function legendSwatch(shape: LegendShape): LegendSwatch {
  return SWATCHES[shape];
}

export interface LegendItem {
  /** Stable, unique key (for `@for track` / keyed lists): `today`, `annotation-<i>`, `critical`, `baseline` */
  key: string;
  /** Swatch paint: a theme token or the annotation's own colour */
  paint: Paint;
  label: string;
  shape: LegendShape;
  /** Geometry of `shape` (see `legendSwatch`) */
  swatch: LegendSwatch;
}

export interface LegendInput {
  /** `showToday` option */
  showToday: boolean;
  /** The today marker falls inside the drawn range (`timeline.todayX >= 0`) */
  todayVisible: boolean;
  annotations: readonly Pick<GanttAnnotation, 'color' | 'label' | 'isToday'>[];
  labels: Pick<GanttLabels, 'today' | 'annotation'> & {
    [K in keyof LegendExtraLabels]?: LegendExtraLabels[K] | undefined;
  };
  /**
   * `criticalPath` option: add a critical-path entry (default false). New in 2.0: a chart with
   * `showLegend` and `criticalPath` now has a legend even without today or annotations.
   */
  criticalPath?: boolean | undefined;
  /** `baseline` option: add a baseline entry (default false; new in 2.0, like `criticalPath`) */
  baseline?: boolean | undefined;
}

/** Legend entries in display order. Pure: same input, same items. */
export function buildLegend(input: LegendInput): LegendItem[] {
  const { labels } = input;
  const items: LegendItem[] = [];
  if (input.showToday && input.todayVisible) {
    items.push({
      key: 'today',
      paint: PAINTS.today,
      label: labels.today,
      shape: 'line',
      swatch: SWATCHES.line,
    });
  }
  input.annotations.forEach((ann, i) => {
    items.push({
      key: `annotation-${i}`,
      paint: annotationPaint(ann),
      label: ann.label?.text ?? labels.annotation,
      shape: 'dashed',
      swatch: SWATCHES.dashed,
    });
  });
  if (input.criticalPath) {
    items.push({
      key: 'critical',
      paint: themeVar('criticalColor'),
      label: labels.legendCritical ?? DEFAULT_LEGEND_LABELS.legendCritical,
      shape: 'bar',
      swatch: SWATCHES.bar,
    });
  }
  if (input.baseline) {
    items.push({
      key: 'baseline',
      paint: PAINTS.baseline,
      label: labels.legendBaseline ?? DEFAULT_LEGEND_LABELS.legendBaseline,
      shape: 'strip',
      swatch: SWATCHES.strip,
    });
  }
  return items;
}

/** The legend shows when enabled, has entries, and the timeline is on screen (not the table view). */
export function isLegendVisible(showLegend: boolean, view: GanttView, items: readonly LegendItem[]): boolean {
  return showLegend && items.length > 0 && view !== 'table';
}

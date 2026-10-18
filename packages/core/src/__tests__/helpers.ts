// Test helpers: header tiers and timeline ranges for a built-in zoom level, the way the
// renderers build them (resolveConfig → scales → buildTiers / snapRange).
import {
  DEFAULT_ZOOM_LEVELS,
  bottomScale,
  buildTiers,
  findZoomLevel,
  withLegacyHeaderFormats,
  type ScaleTier,
} from '../render/scales';
import { snapRange, type TimelineRange } from '../gantt-math';
import type { GanttI18n, GanttTask, ViewMode } from '../types';

/** Top and bottom header tiers of a built-in zoom level. */
export function headerTiers(
  viewMode: ViewMode,
  start: Date,
  end: Date,
  pxPerDay: number,
  i18n?: GanttI18n,
): [ScaleTier, ScaleTier] {
  const level = findZoomLevel(DEFAULT_ZOOM_LEVELS, viewMode);
  const tiers = buildTiers({
    scales: withLegacyHeaderFormats(level, i18n),
    start,
    end,
    pxPerDay,
    ...(i18n?.locale !== undefined && { locale: i18n.locale }),
    ...(i18n?.labels && { labels: i18n.labels }),
  });
  return [tiers[0], tiers.at(-1)!];
}

/** Snapped timeline range of a built-in zoom level. */
export function levelRange(tasks: GanttTask[], viewMode: ViewMode, paddingDays: number): TimelineRange {
  return snapRange(tasks, bottomScale(findZoomLevel(DEFAULT_ZOOM_LEVELS, viewMode).scales), paddingDays);
}

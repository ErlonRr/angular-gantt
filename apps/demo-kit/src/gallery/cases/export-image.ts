/**
 * Case `export-image`: the plan saved as an SVG or PNG image (`download('svg' | 'png', options)`)
 * and previewed on the page (`exportSvg(options)`). Exports are drawn from the chart's model: every
 * shown row, the header, arrows, the critical path and the baselines, in the theme shown or in
 * light or dark (`theme`), for the whole plan or the dates on screen (`range`). The file is named
 * after `export.fileName`.
 */

import {
  addDays,
  type GanttOptions,
  type GanttPngExportOptions,
  type GanttSvgExportOptions,
  type GanttTask,
} from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export const EXPORT_IMAGE_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  criticalPath: true,
  // The baselines of `exportImageTasks` are drawn only with `baseline` on
  baseline: true,
  export: { fileName: 'release-plan' },
  labels: { ariaChart: 'Release plan' },
};

export type ExportImageTheme = 'current' | 'light' | 'dark';
export type ExportImageRange = 'all' | 'visible';

export const EXPORT_THEMES: readonly GalleryChoice<ExportImageTheme>[] = [
  { value: 'current', label: 'Shown' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const EXPORT_RANGES: readonly GalleryChoice<ExportImageRange>[] = [
  { value: 'all', label: 'Whole plan' },
  { value: 'visible', label: 'On screen' },
];

/** The controls' state: the export's theme and range */
export interface ExportImageState {
  readonly theme: ExportImageTheme;
  readonly range: ExportImageRange;
}

/** The controls' first values */
export const EXPORT_IMAGE_INITIAL: ExportImageState = { theme: 'current', range: 'all' };

/** The options of `exportSvg()` and of `download('svg' | 'png')` for the controls' state. */
export function imageExportOptions(state: ExportImageState): GanttSvgExportOptions & GanttPngExportOptions {
  return { theme: state.theme, range: state.range };
}

/** How many days two tasks slipped against their plan: their baselines are that much earlier */
const SLIP: Readonly<Record<string, number>> = { wireframes: 3, web: 5 };

/** The launch plan with a baseline (the planned dates) on Wireframes and Web app, which slipped. */
export function exportImageTasks(now?: Date): GanttTask[] {
  return planTasks(now).map(t => {
    const slip = SLIP[t.id];
    return slip === undefined ? t : { ...t, baseline: { start: addDays(t.start, -slip), end: addDays(t.end, -slip) } };
  });
}

export const exportImageCase: GalleryCaseData = {
  charts: now => [{ tasks: exportImageTasks(now), options: EXPORT_IMAGE_OPTIONS }],
};

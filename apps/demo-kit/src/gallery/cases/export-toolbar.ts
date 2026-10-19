/**
 * Case `export-toolbar`: the toolbar's Export menu (`toolbar.export`) saves SVG, PNG and CSV files
 * and prints, with the chart's `export` options. `before-export` comes first and can veto it (the
 * page's switch blocks PNG); `export` reports each file and print. Three tasks are custom flag bars
 * (`barType: 'flag'`): the built-in bar with a pennant at its start, painted with attributes so
 * that exports draw it as on screen.
 */

import type { BarVisual, GanttOptions, GanttTask } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData } from '../types';

export const EXPORT_TOOLBAR_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  toolbar: { export: true },
  export: { fileName: 'roadmap' },
  labels: { ariaChart: 'Roadmap' },
};

/** The switch's first value: PNG exports are allowed */
export const EXPORT_TOOLBAR_INITIAL: { readonly blockPng: boolean } = { blockPng: false };

export const EXPORT_TOOLBAR_HINT = 'Open Export in the toolbar; the custom flag bars are saved as drawn.';

/** Width of the pennant's pole, in px */
const POLE = 1.5;

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The flag bar: its bar type and the pennant it adds to the built-in bar. `flagPath` is plain
 * geometry from the bar's visual (`ctx.visual`, no core call): one closed path, a pole standing on
 * the start of the bar and a pennant flying from its top, both above the bar. It is a third of the
 * bar's height tall (5 to 10 px): at the default 60 % bar height, the space between the bar and
 * the top of its row.
 */
export const FLAG_BAR = {
  type: 'flag',
  flagPath(visual: Pick<BarVisual, 'x' | 'y' | 'height'>): string {
    const height = Math.max(5, Math.min(10, visual.height / 3));
    const top = visual.y - height;
    const x = visual.x;
    const tip = x + POLE + height * 1.5;
    return (
      `M${round(x)} ${round(visual.y)}V${round(top)}` +
      `L${round(tip)} ${round(top + height * 0.35)}` +
      `L${round(x + POLE)} ${round(top + height * 0.7)}` +
      `V${round(visual.y)}Z`
    );
  },
} as const;

/** The tasks drawn as flag bars: the deliverables of each phase */
const FLAGGED: ReadonlySet<string> = new Set(['wireframes', 'api', 'docs']);

/** The launch plan with three flag bars (`barType: 'flag'`): Wireframes, Public API and Documentation. */
export function exportToolbarTasks(now?: Date): GanttTask[] {
  return planTasks(now).map(t => (FLAGGED.has(t.id) ? { ...t, barType: FLAG_BAR.type } : t));
}

export const exportToolbarCase: GalleryCaseData = {
  charts: now => [{ tasks: exportToolbarTasks(now), options: EXPORT_TOOLBAR_OPTIONS }],
};

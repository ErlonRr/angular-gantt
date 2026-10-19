/**
 * Case `tooltip`: tooltip content of your own (Angular `<ng-template ganttTooltip>`, elsewhere
 * `tooltip.render` returning a DOM node), opened on hover, on keyboard focus or both
 * (`tooltip.trigger`). `tooltipContent` gives every framework the same lines to show.
 */

import { durationLabel, formatDate, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export type TooltipTrigger = 'auto' | 'hover' | 'focus';

export const TOOLTIP_TRIGGERS: readonly GalleryChoice<TooltipTrigger>[] = [
  { value: 'auto', label: 'Hover, focus and tap' },
  { value: 'hover', label: 'Hover only' },
  { value: 'focus', label: 'Keyboard focus only' },
];

export function tooltipOptions(trigger: TooltipTrigger): GanttOptions {
  return {
    viewMode: 'Week',
    tooltip: { trigger, showDelay: 200 },
    labels: { ariaChart: 'Launch plan with budgets' },
  };
}

/** The control's first value */
export const TOOLTIP_INITIAL: TooltipTrigger = 'auto';

export const TOOLTIP_OPTIONS = tooltipOptions(TOOLTIP_INITIAL);

const BUDGETS: Readonly<Record<string, number>> = {
  interviews: 8000,
  survey: 4500,
  wireframes: 12000,
  visual: 18000,
  api: 64000,
  web: 72000,
  docs: 9000,
  tests: 21000,
};

/** The plan with a budget on its tasks (`data.budget`, in euros). */
export function tooltipTasks(now?: Date): GanttTask[] {
  return planTasks(now).map(t => (BUDGETS[t.id] ? { ...t, data: { ...t.data, budget: BUDGETS[t.id] } } : t));
}

/** What the custom tooltip shows: a title, label/value lines and the progress (0–100). */
export function tooltipContent(task: GanttTask): {
  title: string;
  lines: { label: string; value: string }[];
  progress: number;
} {
  const budget = task.data?.['budget'];
  const lines = [
    { label: 'When', value: `${formatDate(task.start, 'D MMM')} – ${formatDate(task.end, 'D MMM YYYY')}` },
    { label: 'Duration', value: durationLabel(task.start, task.end) },
  ];
  if (typeof budget === 'number') {
    lines.push({
      label: 'Budget',
      value: new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
        budget,
      ),
    });
  }
  return { title: task.name, lines, progress: task.progress ?? 0 };
}

export const tooltipCase: GalleryCaseData = {
  charts: now => [{ tasks: tooltipTasks(now), options: TOOLTIP_OPTIONS }],
};

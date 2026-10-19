/**
 * Case `styles`: default styles by kind, parent, level and rule, under the style of each task.
 * Field by field the later layer wins: theme < kind < parent < level < rolled-up colour < rule <
 * `task.style` (`className` adds up instead). The case prints this order as a legend.
 */

import type { GanttOptions, GanttStyleOptions, GanttTask } from '@gantryjs/core';
import { treeTasks } from '../data';
import type { GalleryCaseData } from '../types';

export const STYLES_STYLES: GanttStyleOptions = {
  // By kind
  task: { color: '#64748b' },
  milestone: { color: '#d97706' },
  // Rows with children: labels to the right of their summary bar
  parent: { label: 'right', className: 'is-parent' },
  // By depth: programmes, then teams (the tasks below keep their kind's colour)
  levels: [{ color: '#1d4ed8' }, { color: '#7c3aed' }],
  // Per row: overdue tasks in red
  rule: (_row, ctx) => (ctx.status === 'overdue' ? { color: '#dc2626', className: 'is-overdue' } : null),
};

export const STYLES_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  styles: STYLES_STYLES,
  panel: { width: 300, columns: ['name', 'progress'] },
  labels: { ariaChart: 'Programmes with styles' },
};

/** The tree, with one task styled on its own (`task.style`, the last layer). */
export function stylesTasks(now?: Date): GanttTask[] {
  return treeTasks(now).map(t =>
    t.id === 'auth-mfa' ? { ...t, style: { color: '#059669', radius: 10, height: '80%' as const } } : t,
  );
}

/** The legend: each layer, the option that sets it, and the colour it gives in this case. */
export const STYLES_PRECEDENCE: readonly { layer: string; option: string; color: string | null }[] = [
  { layer: 'Theme', option: 'theme.barColor', color: null },
  { layer: 'Kind', option: 'styles.task · styles.milestone', color: '#64748b' },
  { layer: 'Parent', option: 'styles.parent', color: null },
  { layer: 'Level', option: 'styles.levels[0] · [1]', color: '#1d4ed8' },
  { layer: 'Rolled-up colour', option: 'rollup.color', color: null },
  { layer: 'Rule', option: 'styles.rule(row, ctx)', color: '#dc2626' },
  { layer: 'Task', option: 'task.style', color: '#059669' },
];

export const stylesCase: GalleryCaseData = {
  charts: now => [{ tasks: stylesTasks(now), options: STYLES_OPTIONS }],
};

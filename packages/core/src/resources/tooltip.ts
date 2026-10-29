// ─────────────────────────────────────────────────────────────
//  gantry · resources/tooltip.ts
//  The tooltip of a resource row's load (Phase 14, D12): the day,
//  the load against the capacity and the tasks that make it. The
//  painters turn the model into markup like any other tooltip.
// ─────────────────────────────────────────────────────────────

import { fromCalendarDays, formatDate } from '../gantt-math';
import { themeVar } from '../render/paint';
import type { TooltipModel, TooltipRow } from '../state/tooltip';
import type { GanttLabels } from '../types';
import { OVER_EPSILON } from './model';
import { loadAt, type LoadContributor, type ResourceLoad } from './utilization';
import { round1 } from '../calendar/time';

/** Contributing tasks the tooltip lists before "+n more". */
export const RESOURCE_TOOLTIP_TASKS = 8;

export type ResourceTooltipLabels = Pick<
  GanttLabels,
  'ttResLoad' | 'ttResCapacity' | 'ttResOver' | 'ttResMore' | 'resUnassigned'
>;

export interface ResourceTooltipInput {
  load: ResourceLoad;
  /** The epoch-day index the pointer is on */
  day: number;
  /** The tasks that make the load of `day` (`contributorsAt`) */
  contributors: readonly LoadContributor[];
  labels: ResourceTooltipLabels;
  locale?: string | undefined;
  /** Format of the date (`formats.dateFormat`) */
  dateFormat: string;
}

const percent = (value: number): string => `${round1(value)}%`;

/**
 * The tooltip of a resource row on one day: the date, the load, the capacity and what is over it, then the
 * tasks that make the load (biggest first, at most {@link RESOURCE_TOOLTIP_TASKS} and a "+n more"). A model of
 * `kind: 'resource'`: no progress, status or links.
 */
export function buildResourceTooltip(input: ResourceTooltipInput): TooltipModel {
  const { load, day, contributors, labels, locale, dateFormat } = input;
  const value = loadAt(load, day);
  const rows: TooltipRow[] = [
    // No label names a bare date: the date is the row's label and its value stays empty
    { label: formatDate(fromCalendarDays(day), dateFormat, locale), value: '', kind: 'date' },
    { label: labels.ttResLoad, value: percent(value) },
  ];
  if (load.capacity !== null) {
    rows.push({ label: labels.ttResCapacity, value: percent(load.capacity) });
    if (value > load.capacity + OVER_EPSILON)
      rows.push({ label: labels.ttResOver, value: percent(value - load.capacity) });
  }
  for (const c of contributors.slice(0, RESOURCE_TOOLTIP_TASKS))
    rows.push({ label: c.task.name, value: percent(c.units) });
  if (contributors.length > RESOURCE_TOOLTIP_TASKS)
    rows.push({ label: labels.ttResMore(contributors.length - RESOURCE_TOOLTIP_TASKS), value: '' });
  const title =
    load.kind === 'unassigned'
      ? labels.resUnassigned
      : load.kind === 'team'
        ? load.key.slice('team:'.length)
        : (load.resource?.name ?? load.key);
  return {
    title,
    kind: 'resource',
    rows,
    progress: null,
    status: '',
    critical: false,
    baselineVariance: null,
    predecessors: [],
    successors: [],
    paint: { progress: themeVar('barColor') },
  };
}

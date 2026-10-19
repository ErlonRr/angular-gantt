/**
 * Case `multi-pipeline`: three delivery pipelines in three charts that share one timeline. One
 * `createGanttSyncGroup()` (from the framework's own package, created once per page) passed to
 * every chart's `syncGroup` keeps the range, the zoom level, the horizontal scroll and the
 * task-list width in step; only the first chart shows its toolbar.
 */

import type { GanttOptions, GanttTask } from '@gantryjs/core';
import { pipelineTasks } from '../data';
import type { GalleryCaseData } from '../types';

/** The pipelines, top to bottom: the first chart has the toolbar */
export const MULTI_PIPELINE_NAMES = ['Web', 'Mobile', 'Data'] as const;

export type PipelineName = (typeof MULTI_PIPELINE_NAMES)[number];

export function multiPipelineOptions(name: PipelineName): GanttOptions {
  return {
    viewMode: 'Week',
    panel: { width: 220, columns: ['name', 'start', 'end'] },
    labels: { ariaChart: `${name} pipeline` },
  };
}

export function multiPipelineTasks(name: PipelineName, now?: Date): GanttTask[] {
  return pipelineTasks(name, now);
}

export const multiPipelineCase: GalleryCaseData = {
  charts: now =>
    MULTI_PIPELINE_NAMES.map((name, i) => ({
      caption: `${name} pipeline`,
      tasks: multiPipelineTasks(name, now),
      options: multiPipelineOptions(name),
      showToolbar: i === 0,
    })),
  sync: true,
};

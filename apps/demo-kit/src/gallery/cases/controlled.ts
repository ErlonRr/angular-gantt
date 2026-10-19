/**
 * Case `controlled`: the app owns the tasks (`editing.controlled`). The chart validates each change
 * and proposes it in `before-change`, where the app may veto it with `preventDefault()` (here:
 * any change to a finished task while "Lock finished tasks" is on); `tasks-change` then carries
 * the proposed tasks (`applied: false`) and the app sets them itself. The chart applies nothing and
 * keeps no undo history. `controlledDecision` is the app's rule and the line of its log.
 */

import {
  DependencyType,
  TaskType,
  type GanttBeforeChangeEvent,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { dayAt } from '../data';
import { describeGanttChange } from '../edit-log';
import type { GalleryCaseData } from '../types';

export const CONTROLLED_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  editing: { controlled: true, progress: { step: 10 } },
  panel: { columns: ['name', 'start', 'end', 'progress'] },
  labels: { ariaChart: 'Plan owned by the app' },
};

/** The switch's first value: changes to finished tasks are vetoed */
export const CONTROLLED_INITIAL: { readonly lockDone: boolean } = { lockDone: true };

/**
 * Five tasks in a row, the first two finished (100 %): Research, Design, Build, Test and the
 * Launch milestone. Ids: `research`, `design`, `build`, `test`, `launch`.
 */
export function controlledTasks(now: Date = new Date()): GanttTask[] {
  const d = (offset: number) => dayAt(now, offset);
  return [
    { id: 'research', name: 'Research', start: d(-21), end: d(-12), progress: 100 },
    { id: 'design', name: 'Design', start: d(-11), end: d(-2), progress: 100, dependency: 'research' },
    { id: 'build', name: 'Build', start: d(-1), end: d(13), progress: 10, dependency: 'design' },
    {
      id: 'test',
      name: 'Test',
      start: d(10),
      end: d(20),
      progress: 0,
      dependency: { taskId: 'build', type: DependencyType.FS, lag: -3 },
    },
    {
      id: 'launch',
      name: 'Launch',
      type: TaskType.Milestone,
      start: d(21),
      end: d(21),
      progress: 0,
      dependency: 'test',
    },
  ];
}

/** The first task the change edits that was finished before it (its progress was 100), by name. */
function finishedTask(detail: GanttBeforeChangeEvent): string | null {
  for (const update of detail.change.updates) {
    const task = detail.tasks.find(t => t.id === update.taskId);
    const progress = 'progress' in update.before ? update.before.progress : task?.progress;
    if (progress === 100) return task?.name ?? update.taskId;
  }
  return null;
}

/**
 * The app's answer to a `before-change`: veto any change to a finished task while `lockDone` is
 * on, accept the rest. `line` is the log's line ("Vetoed: Design is finished", "Accepted: moved
 * Build 2 days later"). The caller vetoes with `detail.preventDefault()` when `veto` is true.
 */
export function controlledDecision(detail: GanttBeforeChangeEvent, lockDone: boolean): { veto: boolean; line: string } {
  const finished = lockDone ? finishedTask(detail) : null;
  if (finished !== null) return { veto: true, line: `Vetoed: ${finished} is finished` };
  const text = describeGanttChange(detail.change, detail.tasks);
  return { veto: false, line: `Accepted: ${text.charAt(0).toLowerCase()}${text.slice(1)}` };
}

export const controlledCase: GalleryCaseData = {
  charts: now => [{ tasks: controlledTasks(now), options: CONTROLLED_OPTIONS }],
};

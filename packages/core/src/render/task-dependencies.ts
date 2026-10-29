// ─────────────────────────────────────────────────────────────
//  gantry · render/task-dependencies.ts
//  A task's links as a list. A leaf module (types only): the cell
//  parsers and the resource model sit below `render/columns`, which
//  re-exports it, so none of them has to import the columns.
// ─────────────────────────────────────────────────────────────

import type { GanttDependency, GanttTask } from '../types';

/** A task's dependencies as a list, whatever shape `task.dependency` has. */
export function taskDependencies(task: GanttTask): GanttDependency[] {
  const raw = task.dependency;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return typeof raw === 'string' ? [{ taskId: raw }] : [raw];
}

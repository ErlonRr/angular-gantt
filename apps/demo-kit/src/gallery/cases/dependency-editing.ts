/**
 * Case `dependency-editing`: links drawn and removed in the chart (`editing.dependencies`). Drag
 * from a bar's connector to another bar (the ends you pick give the type: end → start is finish to
 * start), click a connector then a bar, or press L on a focused bar, move to another with ↑ / ↓
 * and press Enter. Click a link and press Delete to remove it, or type in Predecessors. Links
 * between a task and its own parent are refused unless `parentChild` is on (the page's switch).
 */

import { DependencyType, TaskType, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { dayAt } from '../data';
import type { GalleryCaseData } from '../types';

export function dependencyEditingOptions(parentChild: boolean): GanttOptions {
  return {
    viewMode: 'Week',
    // Links only: no progress grip; the Predecessors cells are editable too
    editing: { progress: false, dependencies: { create: true, delete: true, parentChild } },
    panel: { width: 360, columns: ['name', 'predecessors'] },
    labels: { ariaChart: 'Plan with editable links' },
  };
}

/** The switch's first value: links between a task and its own parent or child are refused */
export const DEPENDENCY_EDITING_INITIAL: { readonly parentChild: boolean } = { parentChild: false };

export const DEPENDENCY_EDITING_OPTIONS = dependencyEditingOptions(DEPENDENCY_EDITING_INITIAL.parentChild);

/** The ways to add and remove a link, for the key map under the chart */
export const LINK_KEYS: readonly { keys: readonly string[]; action: string }[] = [
  { keys: ['Drag'], action: 'From a bar’s connector (the dot at either end) to another bar' },
  { keys: ['Click', 'Click'], action: 'A connector, then the bar to link it to (on a touch screen: tap, tap)' },
  { keys: ['L', 'Enter'], action: 'On a focused bar: L, ↑ / ↓ to another bar, Enter links them, Escape cancels' },
  { keys: ['Click', 'Delete'], action: 'Select a link, then remove it' },
  { keys: ['F2'], action: 'In Predecessors: type task ids or names, such as “design FS+2d”' },
];

/**
 * Two phases and a launch, with three links: Research → Design, Design → Build and Test → Launch
 * (finish to start). Build → Test is left for you to draw. Ids: `discovery`, `research`, `design`,
 * `delivery`, `build`, `test`, `launch`.
 */
export function dependencyEditingTasks(now: Date = new Date()): GanttTask[] {
  const d = (offset: number) => dayAt(now, offset);
  return [
    { id: 'discovery', name: 'Discovery', type: TaskType.Group, start: d(-14), end: d(4), progress: 75 },
    { id: 'research', name: 'Research', parentId: 'discovery', start: d(-14), end: d(-5), progress: 100 },
    {
      id: 'design',
      name: 'Design',
      parentId: 'discovery',
      start: d(-4),
      end: d(4),
      progress: 50,
      dependency: { taskId: 'research', type: DependencyType.FS },
    },
    { id: 'delivery', name: 'Delivery', type: TaskType.Group, start: d(5), end: d(24), progress: 0 },
    {
      id: 'build',
      name: 'Build',
      parentId: 'delivery',
      start: d(5),
      end: d(18),
      progress: 0,
      dependency: { taskId: 'design', type: DependencyType.FS },
    },
    { id: 'test', name: 'Test', parentId: 'delivery', start: d(14), end: d(24), progress: 0 },
    {
      id: 'launch',
      name: 'Launch',
      type: TaskType.Milestone,
      start: d(26),
      end: d(26),
      progress: 0,
      dependency: { taskId: 'test', type: DependencyType.FS },
    },
  ];
}

export const dependencyEditingCase: GalleryCaseData = {
  charts: now => [{ tasks: dependencyEditingTasks(now), options: DEPENDENCY_EDITING_OPTIONS }],
};

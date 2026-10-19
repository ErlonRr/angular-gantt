// ─────────────────────────────────────────────────────────────
//  gantry · state/collapse.ts
//  Collapsed-group seeding shared by every binding: `task.collapsed` is a
//  group's initial state (`groupBar.collapsed` collapses every parent),
//  and the user's expand / collapse wins afterwards.
// ─────────────────────────────────────────────────────────────

import type { GanttTask } from '../types';

/** What `seedCollapsed` returns. */
export interface CollapseSeed {
  /** Every task id seen so far: the `seen` passed in when the tasks bring no new id */
  readonly seen: ReadonlySet<string>;
  /** Ids to add to the collapsed set now: the new ids that start collapsed, in task order */
  readonly collapse: readonly string[];
}

const NONE: ReadonlySet<string> = new Set();

/**
 * `task.collapsed` seeds the collapsed state of the ids a chart has never seen. A task list
 * collapses its new ids that have `collapsed: true`; an id seen before keeps the state the user
 * left it in, across a new array, a data-source reset or an empty list in between (an id removed
 * and added again is not new). Pass the previous result's `seen` (nothing for the first list),
 * keep the returned one, and add `collapse` to the collapsed ids.
 *
 * `collapseGroups` (`groupBar.collapsed`) also collapses the new ids that have a child in this
 * list (some task's `parentId`, not their own); an explicit `collapsed: false` keeps such a parent
 * expanded. A parent seen before its first child (a later page of a data source) is not new, so it
 * is not collapsed.
 */
export function seedCollapsed(
  tasks: readonly Pick<GanttTask, 'id' | 'collapsed' | 'parentId'>[],
  seen: ReadonlySet<string> = NONE,
  collapseGroups = false,
): CollapseSeed {
  let parents: Set<string> | null = null;
  if (collapseGroups) {
    parents = new Set();
    for (const t of tasks) if (t.parentId && t.parentId !== t.id) parents.add(t.parentId);
  }
  let next: Set<string> | null = null;
  const collapse: string[] = [];
  for (const t of tasks) {
    if (seen.has(t.id) || next?.has(t.id)) continue;
    next ??= new Set(seen);
    next.add(t.id);
    if (t.collapsed ?? parents?.has(t.id)) collapse.push(t.id);
  }
  return { seen: next ?? seen, collapse };
}

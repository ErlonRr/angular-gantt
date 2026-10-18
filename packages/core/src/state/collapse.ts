// ─────────────────────────────────────────────────────────────
//  gantry · state/collapse.ts
//  Collapsed-group seeding shared by every binding: `task.collapsed` is a
//  group's initial state, and the user's expand / collapse wins afterwards.
// ─────────────────────────────────────────────────────────────

import type { GanttTask } from '../types';

/** What `seedCollapsed` returns. */
export interface CollapseSeed {
  /** Every task id seen so far: the `seen` passed in when the tasks bring no new id */
  readonly seen: ReadonlySet<string>;
  /** Ids to add to the collapsed set now: the new ids with `collapsed: true`, in task order */
  readonly collapse: readonly string[];
}

const NONE: ReadonlySet<string> = new Set();

/**
 * `task.collapsed` seeds the collapsed state of the ids a chart has never seen. A task list
 * collapses its new ids that have `collapsed: true`; an id seen before keeps the state the user
 * left it in, across a new array, a data-source reset or an empty list in between (an id removed
 * and added again is not new). Pass the previous result's `seen` (nothing for the first list),
 * keep the returned one, and add `collapse` to the collapsed ids.
 */
export function seedCollapsed(
  tasks: readonly Pick<GanttTask, 'id' | 'collapsed'>[],
  seen: ReadonlySet<string> = NONE,
): CollapseSeed {
  let next: Set<string> | null = null;
  const collapse: string[] = [];
  for (const t of tasks) {
    if (seen.has(t.id) || next?.has(t.id)) continue;
    next ??= new Set(seen);
    next.add(t.id);
    if (t.collapsed) collapse.push(t.id);
  }
  return { seen: next ?? seen, collapse };
}

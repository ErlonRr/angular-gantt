// ─────────────────────────────────────────────────────────────
//  gantry · editing/permissions.ts
//  What the user may change on a row (D9), the one rule set both
//  bindings read (they never compute `enableDrag && draggable !== false`
//  themselves): `task.editable: false` locks the row (dates, progress,
//  cells, links); `draggable: false` locks the dates; a rolled-up
//  parent's derived fields are locked; milestones have no resize and no
//  progress; progress, links and cells also need their `editing` feature.
//  Moving and resizing follow `enableDrag` / `enableResize` whatever
//  `editing` is (D2). `validateChange` enforces the same locks on every
//  change, whatever its source.
// ─────────────────────────────────────────────────────────────

import { barKind } from '../render/bars';
import type { ResolvedGanttConfig } from '../render/config';
import type { BuiltinColumnKey, ColumnDef, GanttFlatRow } from '../types';

/** What the user may change on one row. */
export interface EditRules {
  /** Move the bar (pointer drag, ←/→ in move mode, start / end dates keeping the duration) */
  move: boolean;
  /** Resize the bar's start or end (task bars) */
  resize: boolean;
  /** Change the progress (`editing.progress`; not milestones, not a rolled-up progress) */
  progress: boolean;
  /** Start a link here (`editing.dependencies.create`) */
  linkFrom: boolean;
  /** End a link here (`editing.dependencies.create`) */
  linkTo: boolean;
  /** Edit this row's cells at all (`editing.cells`; each column decides too: `cellEditable`) */
  cells: boolean;
}

/** What `editRules` reads besides the row. */
export interface EditRulesContext {
  config: ResolvedGanttConfig;
  /** The chart's `enableDrag` (default true) */
  enableDrag: boolean;
  /** The chart's `enableResize` (default true) */
  enableResize: boolean;
}

/**
 * The edit rules of `row` (D9):
 *
 * - `move`: `enableDrag`, the task not `editable: false` nor `draggable: false`, and its dates not
 *   rolled up (a parent row with `rollup.dates`). Any bar kind.
 * - `resize`: `move`, `enableResize`, and a task bar (not a milestone or a group bar).
 * - `progress`: `editing.progress`, the task not `editable: false`, not a milestone, and its
 *   progress not rolled up (a parent row with `rollup.progress`). `draggable: false` keeps it.
 * - `linkFrom` / `linkTo`: `editing.dependencies.create` and the task not `editable: false`.
 * - `cells`: `editing.cells` and the task not `editable: false`.
 *
 * The bar kind is read from `row.barType` like the bars are drawn (`barKind`: a custom bar type is
 * a task bar). With `editing` off, only `move` and `resize` can be `true`.
 */
export function editRules(row: GanttFlatRow, ctx: EditRulesContext): EditRules {
  const { config, enableDrag, enableResize } = ctx;
  const { task } = row;
  const editing = config.editing;
  const editable = task.editable !== false;
  const kind = barKind(row.barType);
  const rollup = row.hasChildren ? config.rollup : false;
  const move = editable && enableDrag && task.draggable !== false && !(rollup && rollup.dates);
  const link = editable && editing.dependencies.create;
  return {
    move,
    resize: move && enableResize && kind === 'task',
    progress: editable && editing.progress !== false && kind !== 'milestone' && !(rollup && rollup.progress !== false),
    linkFrom: link,
    linkTo: link,
    cells: editable && editing.cells,
  };
}

/**
 * The built-in columns that are editable by default, with the row rule their field needs: `name`
 * only the row's `cells`; `start` moves the bar (it keeps the duration); `end` and `duration`
 * resize it; `progress` follows its own rule; `predecessors` needs links to be created here
 * (`linkTo`) or deleted (`editing.dependencies.delete`: the cell is the keyboard path to remove
 * one, D13). What a predecessors edit may add or remove is checked by `validateChange`.
 */
const BUILTIN_EDITABLE: Readonly<
  Partial<Record<BuiltinColumnKey, (rules: EditRules, config: ResolvedGanttConfig) => boolean>>
> = {
  name: () => true,
  start: r => r.move,
  end: r => r.resize,
  duration: r => r.resize,
  progress: r => r.progress,
  predecessors: (r, config) => r.linkTo || config.editing.dependencies.delete,
};

/** The column-level answer of `editable`: its value or its result for `row`, `undefined` when unset. */
function columnEditable(col: ColumnDef, row: GanttFlatRow): boolean | undefined {
  const own = col.editable;
  return typeof own === 'function' ? own(row) === true : own;
}

/**
 * Whether `col`'s cell on `row` can be edited:
 *
 * 1. `editing.cells` and `rules.cells` (a read-only row is never edited);
 * 2. the column's `editable` (`true`, `false`, or its result for the row). Unset: the columns keyed
 *    `name`, `start`, `end`, `duration`, `progress` and `predecessors` are editable (the built-in,
 *    or your column over it: the key says which field the cell edits), any other column is not;
 * 3. the rule of the field those keys edit, even when `editable` is `true`: `start` needs
 *    `rules.move`, `end` and `duration` `rules.resize`, `progress` `rules.progress`,
 *    `predecessors` `rules.linkTo` or `editing.dependencies.delete` (a cell edit then adds links
 *    only with `create` and removes them only with `delete`: `validateChange`).
 *
 * The `id` column is never editable (the changes and the history refer to tasks by id).
 */
export function cellEditable(
  col: ColumnDef,
  row: GanttFlatRow,
  rules: EditRules,
  config: ResolvedGanttConfig,
): boolean {
  if (!config.editing.cells || !rules.cells || col.key === 'id') return false;
  const fieldRule = Object.hasOwn(BUILTIN_EDITABLE, col.key)
    ? BUILTIN_EDITABLE[col.key as BuiltinColumnKey]
    : undefined;
  const own = columnEditable(col, row);
  if (own === false || (own === undefined && !fieldRule)) return false;
  return fieldRule ? fieldRule(rules, config) : true;
}

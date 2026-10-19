// ─────────────────────────────────────────────────────────────
//  gantry · render/styles.ts
//  Task styles: the cascade of `options.styles`, the rolled-up colour,
//  the deprecated flat task fields and `task.style` into one
//  `ResolvedTaskStyle` per row, which painters and custom bars read.
// ─────────────────────────────────────────────────────────────

import type { GanttFlatRow, GanttRollupInfo, GanttStyleRuleContext, ResolvedTaskStyle } from '../types';
import type { ResolvedGanttConfig } from './config';
import { barKind } from './bars';
import { taskStatus } from './columns';
import { mergeTaskStyles, taskAliasStyle, taskOwnStyle } from './task-style';

export { EMPTY_TASK_STYLE, mergeTaskStyles, sameTaskStyle, taskAliasStyle, taskOwnStyle } from './task-style';

/** What `createStyleResolver` needs to resolve a row's style. */
export interface StyleResolverInput {
  /** The resolved options: `styles`, and how task dates are read when `dates` is omitted */
  config: Pick<ResolvedGanttConfig, 'styles' | 'endDateMode' | 'normalizeDateOnly'>;
  /** Ids of the tasks on the critical path (`styles.rule` reads it as `ctx.critical`) */
  critical?: ReadonlySet<string> | null | undefined;
  /** Rolled-up values by parent id (`computeRollups`), or `null` without rollup */
  rollups?: ReadonlyMap<string, GanttRollupInfo> | null | undefined;
  /**
   * The instant statuses are evaluated at (`styles.rule` reads `ctx.status`). Pass the day the
   * timeline uses (`quantizeNow`), so the resolver is rebuilt once a day, not on every clock tick.
   */
  now: Date;
  /** How task dates are read for the derived status (default: `config`) */
  dates?: Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly'> | undefined;
}

/** A row's resolved style, memoised per row object. */
export type StyleResolver = (row: GanttFlatRow) => ResolvedTaskStyle;

/**
 * The style resolver of a chart. Each row's style is the merge, field by field (later wins), of:
 * `styles[kind]` (by bar kind: `task`, `group` or `milestone`) < `styles.parent` (rows with
 * children) < `styles.levels[row.level]` < the rolled-up colour (`rollups`) < `styles.rule(row,
 * ctx)` < the task's deprecated flat fields < `task.style`; unset fields fall through to the
 * theme. `className` accumulates across the layers, each class once. The critical path is not a
 * layer: `computeBarVisual` paints a critical bar with the critical colour whatever its style.
 *
 * Computed once per row object (rows are rebuilt when the tasks, collapse state or rollups
 * change). Build a new resolver when an input changes: the config, the critical set, the
 * rollups or the day of `now`. Without any `styles` layer or rolled-up colour a row's style is
 * its task's own (`taskOwnStyle`), and `EMPTY_TASK_STYLE` for an unstyled task.
 */
export function createStyleResolver(input: StyleResolverInput): StyleResolver {
  const { config, critical, rollups, now } = input;
  const dates = input.dates ?? config;
  const { styles } = config;
  const { rule, levels } = styles;
  const layered =
    rule !== null ||
    levels.some(Boolean) ||
    hasFields(styles.task) ||
    hasFields(styles.group) ||
    hasFields(styles.milestone) ||
    hasFields(styles.parent) ||
    hasRolledUpColour(rollups);
  const memo = new WeakMap<GanttFlatRow, ResolvedTaskStyle>();
  return row => {
    let style = memo.get(row);
    if (style) return style;
    const task = row.task;
    if (!layered) {
      style = taskOwnStyle(task);
    } else {
      const rollup = rollups?.get(task.id) ?? null;
      let ruled: ResolvedTaskStyle | null | undefined = null;
      if (rule) {
        const ctx: GanttStyleRuleContext = {
          rollup,
          critical: critical?.has(task.id) ?? false,
          status: taskStatus(task, now, dates),
        };
        ruled = rule(row, ctx);
      }
      style = mergeTaskStyles(
        styles[barKind(row.barType)],
        row.hasChildren ? styles.parent : null,
        levels[row.level],
        rollup?.color ? { color: rollup.color } : null,
        ruled,
        taskAliasStyle(task),
        task.style,
      );
    }
    memo.set(row, style);
    return style;
  };
}

/** The style sets at least one field. */
function hasFields(style: ResolvedTaskStyle): boolean {
  for (const key in style) if ((style as Record<string, unknown>)[key] != null) return true;
  return false;
}

function hasRolledUpColour(rollups: ReadonlyMap<string, GanttRollupInfo> | null | undefined): boolean {
  if (rollups) for (const info of rollups.values()) if (info.color) return true;
  return false;
}

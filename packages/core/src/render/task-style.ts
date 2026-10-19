// ─────────────────────────────────────────────────────────────
//  gantry · render/task-style.ts
//  Style layers: merging `GanttTaskStyle` layers field by field and
//  a task's own layers (the deprecated flat fields under `task.style`).
//  A leaf module (types only), so bars, paints and the tooltip can
//  fall back to a task's own style without the resolver's imports.
//  Public through `render/styles.ts`.
// ─────────────────────────────────────────────────────────────

import type { GanttTask, GanttTaskStyle, ResolvedTaskStyle } from '../types';

type MutableStyle = { -readonly [K in keyof GanttTaskStyle]: GanttTaskStyle[K] };

/** The fields that override (every field but `className`, which accumulates). */
const STYLE_KEYS = ['color', 'progressColor', 'textColor', 'rowColor', 'height', 'radius', 'label'] as const;

/** The style of a row nothing styles (shared and frozen: never mutate a resolved style). */
export const EMPTY_TASK_STYLE: ResolvedTaskStyle = Object.freeze({});

/**
 * Layers merged field by field, later layers winning; an unset field (`undefined` or `null`)
 * doesn't override. `className` accumulates: the classes of every layer, in order, each once.
 * Nothing set at all gives `EMPTY_TASK_STYLE`.
 */
export function mergeTaskStyles(...layers: readonly (GanttTaskStyle | null | undefined)[]): ResolvedTaskStyle {
  let out: MutableStyle | null = null;
  let classes: string[] | null = null;
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of STYLE_KEYS) {
      const value = layer[key];
      if (value != null) (out ??= {})[key] = value as never;
    }
    const className: unknown = layer.className;
    if (typeof className === 'string' && className) {
      classes ??= [];
      for (const c of className.split(/\s+/)) if (c && !classes.includes(c)) classes.push(c);
    }
  }
  if (classes?.length) (out ??= {}).className = classes.join(' ');
  return out ?? EMPTY_TASK_STYLE;
}

/** The deprecated flat fields of a task (`barColor`, `progressColor`, `textColor`, `rowColor`, `className`) as a style. */
export function taskAliasStyle(task: GanttTask): ResolvedTaskStyle {
  let out: MutableStyle | null = null;
  if (task.barColor != null) (out ??= {}).color = task.barColor;
  if (task.progressColor != null) (out ??= {}).progressColor = task.progressColor;
  if (task.textColor != null) (out ??= {}).textColor = task.textColor;
  if (task.rowColor != null) (out ??= {}).rowColor = task.rowColor;
  if (task.className != null) (out ??= {}).className = task.className;
  return out ?? EMPTY_TASK_STYLE;
}

/**
 * A task's own style: its flat fields under `task.style` (the two top layers of the cascade).
 * What bars, rows and the tooltip use when no resolved style is passed (`createStyleResolver`
 * adds `options.styles` and the rolled-up colour below them).
 */
export function taskOwnStyle(task: GanttTask): ResolvedTaskStyle {
  return task.style ? mergeTaskStyles(taskAliasStyle(task), task.style) : taskAliasStyle(task);
}

/**
 * Two resolved styles set the same fields to the same values (`className` included); `undefined`
 * (no resolved style: the task's own) equals only `undefined`. A cut-off for what follows a row's
 * style, such as an open tooltip's progress colour: the resolver gives a new object for a new row
 * object, with the same fields.
 */
export function sameTaskStyle(
  a: ResolvedTaskStyle | null | undefined,
  b: ResolvedTaskStyle | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  for (const key of STYLE_KEYS) if (a[key] !== b[key]) return false;
  return a.className === b.className;
}

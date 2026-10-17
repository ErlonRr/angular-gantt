// ─────────────────────────────────────────────────────────────
//  gantry · render/paint.ts
//  `Paint`: every colour of the render model is a CSS colour value —
//  either a theme token (`var(--gantt-*)`) or an explicit task / option
//  colour passed through as is. Painters apply paints as CSS properties,
//  so the theme reaches pixels only through custom properties.
// ─────────────────────────────────────────────────────────────

import type { GanttAnnotation, GanttTheme, RowGeometry } from '../types';
import { CONTRAST_CSS_VARS, THEME_CSS_VARS } from './theme';
import { readableOn } from './contrast';

/** A CSS `<color>` value, or `var(--gantt-*)` for a theme default. */
export type Paint = string;

/** Theme keys that hold a colour (the rest are metrics / fonts). */
export type ThemeColorKey = Exclude<keyof GanttTheme, 'barRadius' | 'fontSize' | 'fontFamily'>;

const CSS_VAR_BY_KEY = new Map<keyof GanttTheme, string>(THEME_CSS_VARS);
const KEY_BY_CSS_VAR = new Map<string, keyof GanttTheme>(THEME_CSS_VARS.map(([key, cssVar]) => [cssVar, key]));

/** `var(--gantt-<token>)` of a theme colour, e.g. `themeVar('barColor')` → `'var(--gantt-bar)'`. */
export function themeVar(key: ThemeColorKey): Paint {
  return `var(${CSS_VAR_BY_KEY.get(key) ?? ''})`;
}

const THEME_VAR_RE = /^var\(\s*--gantt-[\w-]+\s*(?:,.*)?\)$/s;

/** The paint is a theme token (`var(--gantt-*)`, optionally with a fallback), not an explicit colour. */
export function isThemeVar(p: Paint): boolean {
  return THEME_VAR_RE.test(p.trim());
}

/** Contrast token → the theme fill it is readable on. */
const CONTRAST_FILL: Readonly<Record<string, 'barColor' | 'milestoneColor' | 'criticalColor'>> = {
  [CONTRAST_CSS_VARS.bar]: 'barColor',
  [CONTRAST_CSS_VARS.milestone]: 'milestoneColor',
  [CONTRAST_CSS_VARS.critical]: 'criticalColor',
};

/**
 * The concrete colour a paint stands for under `theme` (for custom renderers that need a hex
 * value): theme tokens resolve to the theme value, contrast tokens to `readableOn(fill,
 * barTextColor)`, a `var()` fallback is used when the token is unknown, and an explicit
 * colour is returned unchanged.
 */
export function resolvePaint(p: Paint, theme: GanttTheme): string {
  const m = /^var\(\s*(--[\w-]+)\s*(?:,(.*))?\)$/s.exec(p.trim());
  if (!m) return p;
  const name = m[1] ?? '';
  const fallback = m[2]?.trim();
  const contrastFill = CONTRAST_FILL[name];
  if (contrastFill) return readableOn(theme[contrastFill], theme.barTextColor);
  const key = KEY_BY_CSS_VAR.get(name);
  const value = key ? theme[key] : undefined;
  if (value != null && value !== '') return value;
  return fallback ? resolvePaint(fallback, theme) : p;
}

/** Fixed theme paints of the chart body. */
export const PAINTS: Readonly<{
  today: Paint;
  hatch: Paint;
  selectionStroke: Paint;
  baseline: Paint;
  ghost: Paint;
  rowBg: Paint;
  rowBgAlt: Paint;
  rowSelected: Paint;
}> = Object.freeze({
  /** Today line / header pointer */
  today: themeVar('todayColor'),
  /** Strokes of the non-working-time hatch pattern */
  hatch: themeVar('textMuted'),
  /** Outline of a selected bar */
  selectionStroke: themeVar('selectionBorder'),
  /** Baseline rail under a bar */
  baseline: themeVar('baselineColor'),
  /** Drag / resize ghost */
  ghost: themeVar('barColor'),
  /** Zebra rows */
  rowBg: themeVar('rowBg'),
  rowBgAlt: themeVar('rowBgAlt'),
  /** Background of a selected row */
  rowSelected: themeVar('selectionBg'),
});

/** Background of a row (timeline and task list): selection > `task.rowColor` > zebra. */
export function rowPaint(geo: Pick<RowGeometry, 'row'>, selected: boolean): Paint {
  if (selected) return PAINTS.rowSelected;
  return geo.row.task.rowColor ?? (geo.row.visibleIndex % 2 === 0 ? PAINTS.rowBg : PAINTS.rowBgAlt);
}

/**
 * Line / region colour of an annotation: the today colour for an `isToday` annotation, else its
 * own colour, else the arrow token (the line, its region and its legend swatch agree).
 */
export function annotationPaint(ann: Pick<GanttAnnotation, 'color' | 'isToday'>): Paint {
  if (ann.isToday) return PAINTS.today;
  return ann.color ?? themeVar('arrowColor');
}

const STATUS_KEYS: Readonly<Record<string, ThemeColorKey>> = {
  notStarted: 'statusNotStarted',
  inProgress: 'statusInProgress',
  overdue: 'statusOverdue',
  done: 'statusDone',
};

/**
 * Status dot of the built-in `status` column: `var(--gantt-status-<x>, var(--gantt-text-muted))`;
 * custom statuses use the muted text token.
 */
export function statusPaint(status: string | undefined): Paint {
  const key = status === undefined ? undefined : STATUS_KEYS[status];
  const muted = themeVar('textMuted');
  return key ? `var(${CSS_VAR_BY_KEY.get(key) ?? ''}, ${muted})` : muted;
}

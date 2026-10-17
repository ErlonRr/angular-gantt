// ─────────────────────────────────────────────────────────────
//  gantry · render/theme.ts
//  Built-in palettes + the theme → CSS custom property map.
//  Single source for the Angular and Web Component bindings.
//  Default palettes meet WCAG AA: bar labels ≥ 4.5:1, bars / markers ≥ 3:1.
// ─────────────────────────────────────────────────────────────

import type { GanttTheme, GanttThemeOverrides } from '../types';
import { readableOn } from './contrast';

export const LightTheme: Readonly<Required<GanttTheme>> = {
  backgroundColor: '#FFFFFF',
  headerBackground: '#F8FAFC',
  rowBg: '#FFFFFF',
  rowBgAlt: '#F8FAFC',
  barColor: '#2563EB',
  barTextColor: '#FFFFFF',
  barRadius: '4px',
  milestoneColor: '#8B5CF6',
  baselineColor: '#64748B',
  criticalColor: '#DC2626',
  panelBg: '#FFFFFF',
  panelBorder: '#E2E8F0',
  borderColor: '#E2E8F0',
  gridLine: '#EEF2F6',
  gridLineMajor: '#CBD5E1',
  todayColor: '#B45309',
  textPrimary: '#1E293B',
  textSecondary: '#475569',
  textMuted: '#64748B',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '13px',
  arrowColor: '#2563EB',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#E2E8F0',
  tooltipText: '#1E293B',
  selectionBg: '#EFF6FF',
  selectionBorder: '#2563EB',
  scrollbarTrack: '#F1F5F9',
  scrollbarThumb: '#CBD5E1',
  weekendBg: 'rgba(100, 116, 139, 0.08)',
  holidayBg: 'rgba(239, 68, 68, 0.08)',
  offHoursBg: 'rgba(100, 116, 139, 0.07)',
  intensiveBg: 'rgba(245, 158, 11, 0.16)',
  statusNotStarted: '#64748B',
  statusInProgress: '#2563EB',
  statusOverdue: '#DC2626',
  statusDone: '#15803D',
};

export const DarkTheme: Readonly<Required<GanttTheme>> = {
  backgroundColor: '#0F172A',
  headerBackground: '#1E293B',
  rowBg: '#0F172A',
  rowBgAlt: '#111827',
  barColor: '#2563EB',
  barTextColor: '#FFFFFF',
  barRadius: '4px',
  milestoneColor: '#A78BFA',
  baselineColor: '#64748B',
  criticalColor: '#DC2626',
  panelBg: '#0F172A',
  panelBorder: '#1E293B',
  borderColor: '#1E293B',
  gridLine: '#172036',
  gridLineMajor: '#334155',
  todayColor: '#FBBF24',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#8494A9',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '13px',
  arrowColor: '#60A5FA',
  tooltipBg: '#1E293B',
  tooltipBorder: '#334155',
  tooltipText: '#F1F5F9',
  selectionBg: '#1D3461',
  selectionBorder: '#60A5FA',
  scrollbarTrack: '#1E293B',
  scrollbarThumb: '#334155',
  weekendBg: 'rgba(148, 163, 184, 0.07)',
  holidayBg: 'rgba(248, 113, 113, 0.10)',
  offHoursBg: 'rgba(148, 163, 184, 0.06)',
  intensiveBg: 'rgba(251, 191, 36, 0.14)',
  statusNotStarted: '#8494A9',
  statusInProgress: '#60A5FA',
  statusOverdue: '#F87171',
  statusDone: '#4ADE80',
};

/**
 * The 1.x palettes, before the WCAG AA contrast fixes (white labels on `#3B82F6` bars are 3.7:1).
 * Opt back in with `theme: dark ? LegacyDarkTheme : LegacyLightTheme`.
 */
export const LegacyLightTheme: Readonly<Required<GanttTheme>> = {
  ...LightTheme,
  barColor: '#3B82F6',
  baselineColor: '#94A3B8',
  criticalColor: '#EF4444',
  todayColor: '#F59E0B',
  textMuted: '#94A3B8',
  arrowColor: '#3B82F6',
  selectionBorder: '#3B82F6',
};

export const LegacyDarkTheme: Readonly<Required<GanttTheme>> = {
  ...DarkTheme,
  barColor: '#3B82F6',
  criticalColor: '#F87171',
  textMuted: '#64748B',
};

/** Light/dark base + overrides, with every optional field filled in. */
export function resolveTheme(dark: boolean, override?: GanttThemeOverrides): Required<GanttTheme> {
  const base = dark ? DarkTheme : LightTheme;
  const out = { ...base, ...override } as Required<GanttTheme>;
  // An override may set undefined explicitly — fall back to the base value
  for (const k of Object.keys(base) as (keyof GanttTheme)[]) {
    if (out[k] == null) (out as Record<string, string>)[k] = base[k];
  }
  return out;
}

/** Theme key → CSS custom property set on the chart host. */
export const THEME_CSS_VARS: ReadonlyArray<readonly [keyof GanttTheme, string]> = [
  ['backgroundColor', '--gantt-bg'],
  ['headerBackground', '--gantt-header-bg'],
  ['rowBg', '--gantt-row-bg'],
  ['rowBgAlt', '--gantt-row-bg-alt'],
  ['barColor', '--gantt-bar'],
  ['barTextColor', '--gantt-bar-text'],
  ['barRadius', '--gantt-bar-radius'],
  ['milestoneColor', '--gantt-milestone'],
  ['baselineColor', '--gantt-baseline'],
  ['criticalColor', '--gantt-critical'],
  ['panelBg', '--gantt-panel-bg'],
  ['panelBorder', '--gantt-panel-border'],
  ['borderColor', '--gantt-border'],
  ['gridLine', '--gantt-grid-line'],
  ['gridLineMajor', '--gantt-grid-line-major'],
  ['todayColor', '--gantt-today'],
  ['textPrimary', '--gantt-text'],
  ['textSecondary', '--gantt-text-sec'],
  ['textMuted', '--gantt-text-muted'],
  ['fontFamily', '--gantt-font'],
  ['fontSize', '--gantt-font-size'],
  ['arrowColor', '--gantt-arrow'],
  ['tooltipBg', '--gantt-tooltip-bg'],
  ['tooltipBorder', '--gantt-tooltip-bdr'],
  ['tooltipText', '--gantt-tooltip-txt'],
  ['selectionBg', '--gantt-sel-bg'],
  ['selectionBorder', '--gantt-sel-border'],
  ['scrollbarTrack', '--gantt-scrollbar-track'],
  ['scrollbarThumb', '--gantt-scrollbar-thumb'],
  ['weekendBg', '--gantt-weekend-bg'],
  ['holidayBg', '--gantt-holiday-bg'],
  ['offHoursBg', '--gantt-off-hours-bg'],
  ['intensiveBg', '--gantt-intensive-bg'],
  ['statusNotStarted', '--gantt-status-not-started'],
  ['statusInProgress', '--gantt-status-in-progress'],
  ['statusOverdue', '--gantt-status-overdue'],
  ['statusDone', '--gantt-status-done'],
];

/** Parse a CSS length like `'4px'` / `'6'` to px (fallback when not numeric). */
export function cssPx(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number') return value;
  const n = parseFloat(value ?? '');
  return Number.isFinite(n) ? n : fallback;
}

// ─── CSS custom properties, contrast tokens and metrics ──────

/**
 * Derived tokens: the bar-label colour readable on each bar fill (`readableOn(fill, barTextColor)`).
 * Painters reference them through `var()`, so a bar visual never depends on theme colours.
 */
export const CONTRAST_CSS_VARS = {
  bar: '--gantt-bar-text-on-bar',
  milestone: '--gantt-bar-text-on-milestone',
  critical: '--gantt-bar-text-on-critical',
} as const;

/**
 * Every CSS custom property of a resolved theme: the `THEME_CSS_VARS` tokens in order, then the
 * three contrast tokens (`CONTRAST_CSS_VARS`). Both bindings write exactly these.
 */
export function themeToCss(theme: Required<GanttTheme>): ReadonlyArray<readonly [cssVar: string, value: string]> {
  const out: (readonly [string, string])[] = THEME_CSS_VARS.map(([key, cssVar]) => [cssVar, theme[key]] as const);
  out.push(
    [CONTRAST_CSS_VARS.bar, readableOn(theme.barColor, theme.barTextColor)],
    [CONTRAST_CSS_VARS.milestone, readableOn(theme.milestoneColor, theme.barTextColor)],
    [CONTRAST_CSS_VARS.critical, readableOn(theme.criticalColor, theme.barTextColor)],
  );
  return out;
}

/** The few theme values that geometry or label fitting depend on (colours stay in CSS). */
export interface ThemeMetrics {
  /** Default bar corner radius (px), from `barRadius` */
  readonly barRadius: number;
  /** Font size (px) used to fit bar labels: `fontSize` − 1 */
  readonly fontPx: number;
  /** Preferred bar-label colour; only labels on explicit `task.barColor` fills resolve it */
  readonly barTextColor: string;
}

/**
 * The metrics of a theme, for `resolveConfig(options, i18n, metrics)` and the bar labels
 * (`fontPx`, `barTextColor` of `computeBarVisual`). Takes any theme (e.g. a custom bar's `ctx.theme`).
 */
export function themeMetrics(theme: Pick<GanttTheme, 'barRadius' | 'fontSize' | 'barTextColor'>): ThemeMetrics {
  return {
    barRadius: cssPx(theme.barRadius, 4),
    fontPx: cssPx(theme.fontSize, 13) - 1,
    barTextColor: theme.barTextColor,
  };
}

/** Shallow equality: a colour-only theme change keeps the same metrics. */
export function sameThemeMetrics(a: ThemeMetrics, b: ThemeMetrics): boolean {
  return a.barRadius === b.barRadius && a.fontPx === b.fontPx && a.barTextColor === b.barTextColor;
}

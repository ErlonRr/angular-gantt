/**
 * Case `theming`: theme presets (`theme`, one set of overrides per mode), the chart's own dark
 * mode or the site's, and the CSS custom properties and styling hooks each binding offers (the
 * Web Component's `::part` and `:state()`, Angular's classes).
 */

import type { GanttOptions, GanttTask, GanttThemeOverrides } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export interface ThemingPreset {
  value: string;
  label: string;
  light: GanttThemeOverrides;
  dark: GanttThemeOverrides;
}

/** Presets over the built-in themes; each keeps WCAG AA contrast (the same as the Theming page). */
export const THEMING_PRESETS: readonly ThemingPreset[] = [
  { value: 'default', label: 'Default', light: {}, dark: {} },
  {
    value: 'ocean',
    label: 'Ocean',
    light: {
      barColor: '#0E7490',
      arrowColor: '#0E7490',
      selectionBorder: '#0E7490',
      focusRing: '#0E7490',
      selectionBg: '#ECFEFF',
      milestoneColor: '#6D28D9',
      todayColor: '#C2410C',
      rowBgAlt: '#F5FAFC',
      gridLine: '#E3EEF3',
    },
    dark: {
      barColor: '#0E7490',
      arrowColor: '#22D3EE',
      selectionBorder: '#22D3EE',
      focusRing: '#22D3EE',
      selectionBg: '#083344',
      milestoneColor: '#A78BFA',
      todayColor: '#FB923C',
    },
  },
  {
    value: 'forest',
    label: 'Forest',
    light: {
      barColor: '#15803D',
      arrowColor: '#166534',
      selectionBorder: '#15803D',
      focusRing: '#15803D',
      selectionBg: '#F0FDF4',
      milestoneColor: '#A16207',
      todayColor: '#0369A1',
      criticalColor: '#B91C1C',
      rowBgAlt: '#F6FAF7',
      gridLine: '#E4EFE7',
    },
    dark: {
      barColor: '#15803D',
      arrowColor: '#4ADE80',
      selectionBorder: '#4ADE80',
      focusRing: '#4ADE80',
      selectionBg: '#052E16',
      milestoneColor: '#FACC15',
      todayColor: '#38BDF8',
    },
  },
  {
    value: 'grape',
    label: 'Grape',
    light: {
      barColor: '#7C3AED',
      arrowColor: '#7C3AED',
      selectionBorder: '#7C3AED',
      focusRing: '#7C3AED',
      selectionBg: '#F5F3FF',
      milestoneColor: '#DB2777',
      rowBgAlt: '#FAF8FF',
      gridLine: '#EEEAF8',
    },
    dark: {
      barColor: '#7C3AED',
      arrowColor: '#A78BFA',
      selectionBorder: '#A78BFA',
      focusRing: '#A78BFA',
      selectionBg: '#2E1065',
      milestoneColor: '#F472B6',
    },
  },
];

/** The chart's dark mode: follow the site, or pin it */
export type ThemingMode = 'site' | 'light' | 'dark';

export const THEMING_MODES: readonly GalleryChoice<ThemingMode>[] = [
  { value: 'site', label: 'Follow the site' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** `darkMode` of the chart for a mode, given the site's theme. */
export function themingDark(mode: ThemingMode, siteDark: boolean): boolean {
  return mode === 'site' ? siteDark : mode === 'dark';
}

/** The options of a preset, with the overrides of the mode the chart shows. */
export function themingOptions(preset: string, dark: boolean): GanttOptions {
  const p = THEMING_PRESETS.find(x => x.value === preset) ?? THEMING_PRESETS[0];
  return {
    viewMode: 'Week',
    criticalPath: true,
    theme: dark ? p.dark : p.light,
    labels: { ariaChart: 'Launch plan, themed' },
  };
}

/** The controls' first values: the preset and the dark-mode choice */
export const THEMING_INITIAL: { readonly preset: string; readonly mode: ThemingMode } = {
  preset: 'ocean',
  mode: 'site',
};

export const THEMING_OPTIONS = themingOptions(THEMING_INITIAL.preset, false);

/**
 * Page CSS the case shows next to the chart: custom properties set on the chart element (they win
 * over the theme's). Colours the chart derives from others (`--gantt-today-label`, the
 * `--gantt-bar-text-on-*` labels) don't follow a CSS override: change those with the `theme` option.
 */
export const THEMING_CSS_VARIABLES: Readonly<Record<string, string>> = {
  '--gantt-font': "'Georgia', serif",
  // One value for both modes: 3.7:1 on the light background, 4.9:1 on the dark one
  '--gantt-focus-ring': '#f43f5e',
  '--gantt-row-hover-bg': 'rgb(244 63 94 / 0.08)',
};

export function themingTasks(now?: Date): GanttTask[] {
  return planTasks(now);
}

export const themingCase: GalleryCaseData = {
  charts: now => [{ tasks: themingTasks(now), options: THEMING_OPTIONS }],
};

/**
 * The Theming page's model: presets, the token fields and the code printed for a theme.
 * Every CSS variable name comes from `@gantryjs/core` (`THEME_CSS_VARS`, `CONTRAST_CSS_VARS`).
 */

import type { GanttTheme, GanttThemeOverrides } from '@gantryjs/core';

export type ThemeKey = keyof GanttTheme;
export type BoardMode = 'light' | 'dark';
/** Overrides per board: the chart takes the one of its mode. */
export type ModeOverrides = Readonly<Record<BoardMode, GanttThemeOverrides>>;

export interface ThemePreset {
  id: string;
  label: string;
  light: GanttThemeOverrides;
  dark: GanttThemeOverrides;
}

/**
 * Presets over the built-in themes, one set per mode. Each keeps WCAG AA: bar labels ≥ 4.5:1
 * (the chart picks white or near-black when `barTextColor` is unreadable), bars, markers and
 * arrows ≥ 3:1 on the background, text ≥ 4.5:1.
 */
export const PRESETS: readonly ThemePreset[] = [
  { id: 'default', label: 'Default', light: {}, dark: {} },
  {
    id: 'ocean',
    label: 'Ocean',
    light: {
      barColor: '#0E7490',
      arrowColor: '#0E7490',
      selectionBorder: '#0E7490',
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
      selectionBg: '#083344',
      milestoneColor: '#A78BFA',
      todayColor: '#FB923C',
    },
  },
  {
    id: 'forest',
    label: 'Forest',
    light: {
      barColor: '#15803D',
      arrowColor: '#166534',
      selectionBorder: '#15803D',
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
      selectionBg: '#052E16',
      milestoneColor: '#FACC15',
      todayColor: '#38BDF8',
    },
  },
  {
    id: 'grape',
    label: 'Grape',
    light: {
      barColor: '#7C3AED',
      arrowColor: '#7C3AED',
      selectionBorder: '#7C3AED',
      selectionBg: '#F5F3FF',
      milestoneColor: '#DB2777',
      rowBgAlt: '#FAF8FF',
      gridLine: '#EEEAF8',
    },
    dark: {
      barColor: '#7C3AED',
      arrowColor: '#A78BFA',
      selectionBorder: '#A78BFA',
      selectionBg: '#2E1065',
      milestoneColor: '#F472B6',
    },
  },
  {
    id: 'graphite',
    label: 'Graphite',
    light: {
      barColor: '#475569',
      arrowColor: '#64748B',
      selectionBorder: '#0F172A',
      selectionBg: '#F1F5F9',
      milestoneColor: '#0F172A',
      criticalColor: '#B91C1C',
    },
    dark: {
      barColor: '#64748B',
      arrowColor: '#94A3B8',
      selectionBorder: '#E2E8F0',
      selectionBg: '#1E293B',
      milestoneColor: '#E2E8F0',
    },
  },
  {
    id: 'sunrise',
    label: 'Sunrise',
    light: {
      backgroundColor: '#FFFBF5',
      rowBg: '#FFFBF5',
      panelBg: '#FFFBF5',
      rowBgAlt: '#FEF5EA',
      headerBackground: '#FDF0E1',
      gridLine: '#F3E5D3',
      borderColor: '#EBD9C3',
      panelBorder: '#EBD9C3',
      barColor: '#C2410C',
      arrowColor: '#C2410C',
      selectionBorder: '#C2410C',
      selectionBg: '#FFEDD5',
      todayColor: '#BE123C',
      milestoneColor: '#7E22CE',
      textPrimary: '#3B1D0E',
      textSecondary: '#5C4433',
      textMuted: '#6E5646',
    },
    dark: {
      backgroundColor: '#17110E',
      rowBg: '#17110E',
      panelBg: '#17110E',
      rowBgAlt: '#1D1612',
      headerBackground: '#241B16',
      gridLine: '#2A201A',
      borderColor: '#3A2C24',
      panelBorder: '#3A2C24',
      barColor: '#C2410C',
      arrowColor: '#FB923C',
      selectionBorder: '#FB923C',
      selectionBg: '#431407',
      todayColor: '#FB7185',
      milestoneColor: '#C084FC',
      textPrimary: '#FBEFE4',
    },
  },
];

export interface ColorField {
  key: ThemeKey;
  label: string;
  hint: string;
  /** Keys that take the same value (one surface: `backgroundColor` also paints the rows and panel). */
  also?: readonly ThemeKey[];
}

export const COLOR_FIELDS: readonly ColorField[] = [
  { key: 'barColor', label: 'Bar', hint: 'Task bars; the label colour follows' },
  { key: 'todayColor', label: 'Today', hint: 'The today line and the current period' },
  { key: 'criticalColor', label: 'Critical', hint: 'Bars on the critical path' },
  { key: 'milestoneColor', label: 'Milestone', hint: 'Milestone markers' },
  { key: 'baselineColor', label: 'Baseline', hint: 'Planned dates under the bars' },
  { key: 'arrowColor', label: 'Arrows', hint: 'Dependency arrows' },
  { key: 'selectionBorder', label: 'Selection', hint: 'Outline of the selected bars and rows' },
  {
    key: 'backgroundColor',
    label: 'Background',
    hint: 'Also sets rowBg and panelBg',
    also: ['rowBg', 'panelBg'],
  },
  { key: 'rowBgAlt', label: 'Alternate rows', hint: 'Every other row' },
  { key: 'gridLine', label: 'Grid lines', hint: 'Lines between rows and periods' },
  { key: 'textPrimary', label: 'Text', hint: 'Task names and header labels' },
];

export interface RangeField {
  key: 'barRadius' | 'fontSize';
  label: string;
  hint: string;
  min: number;
  max: number;
}

/** Metrics: they shape the layout, so they go through the theme API, not page CSS. */
export const RANGE_FIELDS: readonly RangeField[] = [
  { key: 'barRadius', label: 'Bar radius', hint: 'Default corners of the bars (bar.radius wins)', min: 0, max: 12 },
  { key: 'fontSize', label: 'Font size', hint: 'Labels in bars use one pixel less', min: 11, max: 16 },
];

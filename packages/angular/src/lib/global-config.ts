// ─────────────────────────────────────────────────────────────
//  gantry · global-config.ts
//
//  The defaults `provideGantt(config)` sets for every <gantry> below it
//  (application, route or component level). Each level merges its config
//  over the one of the level above (`mergeGanttConfig`), so a component
//  can override one label and keep the application's locale and theme.
//
//  A leaf module on purpose: the theme and i18n services read the token,
//  and `provide.ts` (which also pulls in the bar registry and the built-in
//  bars) must not be on their import path.
// ─────────────────────────────────────────────────────────────

import { InjectionToken } from '@angular/core';
import { type GanttFormats, type GanttLabels, type GanttThemeOverrides } from './types';

/** Chart defaults set with `provideGantt(config)`; a chart's own `options` win over them. */
export interface GanttGlobalConfig {
  /** Theme overrides, merged per key with the levels above */
  theme?: GanttThemeOverrides;
  /** `true`, `false` or `'auto'` (follows `prefers-color-scheme`); the `darkMode` input and `options.darkMode` win */
  darkMode?: boolean | 'auto';
  /** Default BCP 47 locale (e.g. 'it'), formatted through Intl */
  locale?: string;
  /** Default UI string overrides (i18n), merged per key (`viewModes` too) with the levels above */
  labels?: Partial<GanttLabels>;
  /** Default date / header format overrides, merged per key (`header` too) with the levels above */
  formats?: Partial<GanttFormats>;
}

/** The effective config of an injector level: every `provideGantt` above it, merged (nearest wins). */
export const GANTT_GLOBAL_CONFIG = new InjectionToken<GanttGlobalConfig>('GANTT_GLOBAL_CONFIG', {
  factory: () => ({}),
});

/**
 * `own` over `parent`: scalars (`darkMode`, `locale`) are replaced when `own` sets them; `theme`,
 * `labels` (and `labels.viewModes`) and `formats` (and `formats.header`) merge per key.
 */
export function mergeGanttConfig(parent: GanttGlobalConfig, own: GanttGlobalConfig): GanttGlobalConfig {
  const out: GanttGlobalConfig = { ...parent };
  if (own.darkMode !== undefined) out.darkMode = own.darkMode;
  if (own.locale !== undefined) out.locale = own.locale;
  if (own.theme) out.theme = { ...parent.theme, ...own.theme };
  if (own.labels) {
    const labels: Partial<GanttLabels> = { ...parent.labels, ...own.labels };
    if (parent.labels?.viewModes && own.labels.viewModes) {
      labels.viewModes = { ...parent.labels.viewModes, ...own.labels.viewModes };
    }
    out.labels = labels;
  }
  if (own.formats) {
    const formats: Partial<GanttFormats> = { ...parent.formats, ...own.formats };
    if (parent.formats?.header && own.formats.header) {
      formats.header = { ...parent.formats.header, ...own.formats.header };
    }
    out.formats = formats;
  }
  return out;
}

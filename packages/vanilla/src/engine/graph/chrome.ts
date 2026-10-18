/**
 * @file chrome.ts
 * Locale and theme nodes. The theme reaches pixels only through CSS variables: a non-render
 * effect writes `themeCss` into the element's theme sheet. Only the theme *metrics* (bar radius,
 * label font size, the label colour on explicit bar colours) enter the render model, and they
 * compare by value — a colour-only theme change recomputes no config, timeline or geometry.
 */

import {
  DEFAULT_FORMATS,
  DEFAULT_LABELS,
  resolveTheme,
  sameThemeMetrics,
  themeMetrics,
  themeToCss,
  type GanttI18n,
  type GanttOptions,
  type GanttTheme,
  type ThemeMetrics,
} from '@gantryjs/core';
import { effect, onCleanup, type ReadonlySignal } from '../../reactive';
import type { ThemeCssEntries, ThemeSheet } from '../../styles/theme-sheet';
import { structuralEqual, type Inputs } from '../inputs';
import type { NodeFactory } from './node';

export interface ChromeGraph {
  /** Locale, labels and formats (`options.locale` / `labels` / `formats` over the defaults) */
  readonly i18n: ReadonlySignal<GanttI18n>;
  readonly isDark: ReadonlySignal<boolean>;
  /** Resolved theme: light/dark base, `options.theme`, then `setTheme` / `patchTheme` */
  readonly theme: ReadonlySignal<Required<GanttTheme>>;
  /** The theme as CSS variables (contrast tokens included) */
  readonly themeCss: ReadonlySignal<ThemeCssEntries>;
  readonly metrics: ReadonlySignal<ThemeMetrics>;
}

function i18nOf(o: GanttOptions): GanttI18n {
  const labels = o.labels ?? {};
  const formats = o.formats ?? {};
  return {
    locale: o.locale,
    labels: { ...DEFAULT_LABELS, ...labels, viewModes: { ...DEFAULT_LABELS.viewModes, ...labels.viewModes } },
    formats: { ...DEFAULT_FORMATS, ...formats, header: { ...DEFAULT_FORMATS.header, ...formats.header } },
  };
}

export function chromeGraph(I: Inputs, node: NodeFactory): ChromeGraph {
  const i18n = node('i18n', () => i18nOf(I.optionsIn()), { equals: structuralEqual });
  const isDark = node('isDark', () => {
    const mode = I.darkModeIn();
    return mode === 'auto' ? I.prefersDark() : mode === true;
  });
  const theme = node('theme', () => resolveTheme(isDark(), { ...I.optionsIn().theme, ...I.apiTheme() }), {
    equals: structuralEqual,
  });
  const themeCss = node('themeCss', () => themeToCss(theme()));
  const metrics = node('metrics', () => themeMetrics(theme()), { equals: sameThemeMetrics });
  return { i18n, isDark, theme, themeCss, metrics };
}

/**
 * The theme's effects while connected (create them inside the connection's owner): follow
 * `prefers-color-scheme` in `'auto'` mode, and write the variables into `sheet` whenever they
 * change. Neither is a render effect: the variables repaint the chart by themselves. (The host
 * shows the dark theme as its `:state(dark)` custom state, set by the element.)
 */
export function themeEffects(I: Inputs, chrome: ChromeGraph, sheet: ThemeSheet): void {
  effect(() => {
    if (I.darkModeIn() !== 'auto' || typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: { matches: boolean }) => I.prefersDark.set(e.matches);
    onChange(mql);
    mql.addEventListener('change', onChange);
    onCleanup(() => mql.removeEventListener('change', onChange));
  });
  effect(() => sheet.write(chrome.themeCss()));
}

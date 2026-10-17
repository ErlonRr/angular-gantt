/**
 * The code a theme from the Theming page needs: an `options.theme` object per mode, or page CSS
 * for `<gantry-element>`. Variable names and the derived contrast tokens come from `@gantry/core`.
 */

import { CONTRAST_CSS_VARS, DarkTheme, LightTheme, THEME_CSS_VARS, themeToCss, type GanttTheme } from '@gantry/core';
import type { ThemeKey } from './theme-tokens';

type Theme = Required<GanttTheme>;

const VAR_OF = new Map<ThemeKey, string>(THEME_CSS_VARS);

/** The CSS custom property of a theme key (`barColor` → `--gantt-bar`). */
export function cssVarOf(key: ThemeKey): string {
  return VAR_OF.get(key) ?? '';
}

/** Theme values that shape the layout: page CSS can't change them (see README "Theming"). */
const METRICS: readonly ThemeKey[] = ['barRadius', 'fontSize', 'barTextColor'];

/** The derived contrast tokens and the keys each one is computed from (`themeToCss`). */
const CONTRAST_DEPS: readonly (readonly [string, readonly ThemeKey[]])[] = [
  [CONTRAST_CSS_VARS.bar, ['barColor', 'barTextColor']],
  [CONTRAST_CSS_VARS.milestone, ['milestoneColor', 'barTextColor']],
  [CONTRAST_CSS_VARS.critical, ['criticalColor', 'barTextColor']],
  [CONTRAST_CSS_VARS.todayLabel, ['todayColor', 'headerBackground', 'textPrimary']],
];

/** The keys whose value differs from the built-in theme of the same mode. */
export function changedThemeKeys(theme: Theme, dark: boolean): ThemeKey[] {
  const base = dark ? DarkTheme : LightTheme;
  return (Object.keys(base) as ThemeKey[]).filter(
    k => String(theme[k]).toLowerCase() !== String(base[k]).toLowerCase(),
  );
}

function objectSource(theme: Theme, keys: readonly ThemeKey[]): string {
  if (!keys.length) return '{}';
  return `{\n${keys.map(k => `  ${k}: '${theme[k]}',`).join('\n')}\n}`;
}

/** `options.theme` for both modes (each merged over the built-in light or dark theme). */
export function themeSource(light: Theme, dark: Theme): string {
  const lightKeys = changedThemeKeys(light, false);
  const darkKeys = changedThemeKeys(dark, true);
  if (!lightKeys.length && !darkKeys.length) return '// Pick a preset or change a token to print the theme.';
  return [
    `import type { GanttOptions, GanttThemeOverrides } from '@gantry/core';`,
    ``,
    `// Merged over the built-in light and dark themes`,
    `const light: GanttThemeOverrides = ${objectSource(light, lightKeys)};`,
    `const dark: GanttThemeOverrides = ${objectSource(dark, darkKeys)};`,
    ``,
    `// Every binding takes options.theme (or chart.setTheme(…)); isDark is your app's dark mode`,
    `const options: GanttOptions = { darkMode: isDark, theme: isDark ? dark : light };`,
  ].join('\n');
}

/** The custom properties `keys` write: their own, plus the contrast tokens computed from them. */
function varsFor(keys: readonly ThemeKey[]): Set<string> {
  const vars = new Set(keys.filter(k => !METRICS.includes(k)).map(cssVarOf));
  for (const [cssVar, deps] of CONTRAST_DEPS) if (deps.some(d => keys.includes(d))) vars.add(cssVar);
  return vars;
}

function rule(selector: string, theme: Theme, vars: ReadonlySet<string>): string[] {
  if (!vars.size) return [];
  const lines = themeToCss(theme)
    .filter(([cssVar]) => vars.has(cssVar))
    .map(([cssVar, value]) => `  ${cssVar}: ${value};`);
  return [`${selector} {`, ...lines, `}`];
}

/**
 * Page CSS for `<gantry-element>`: the light values on the element, the dark ones under
 * `:state(dark)`. The dark rule repeats every light variable, or a light value would stay on in
 * dark mode. Contrast tokens are included: page CSS does not recompute them.
 */
export function themeCss(light: Theme, dark: Theme): string {
  const lightKeys = changedThemeKeys(light, false);
  const darkKeys = changedThemeKeys(dark, true);
  if (!lightKeys.length && !darkKeys.length) return '/* Pick a preset or change a token to print the CSS. */';
  const lightVars = varsFor(lightKeys);
  const darkVars = new Set([...lightVars, ...varsFor(darkKeys)]);
  const metrics = [...lightKeys, ...darkKeys].some(k => METRICS.includes(k));
  const blocks = [rule('gantry-element', light, lightVars), rule('gantry-element:state(dark)', dark, darkVars)].filter(
    b => b.length,
  );
  return [
    `/* Page CSS on <gantry-element> overrides its theme. In Angular, use options.theme`,
    `   or setTheme(): <gantry> binds the tokens inline (page CSS needs !important). */`,
    ...(metrics ? [`/* barRadius and fontSize shape the layout: set them in options.theme. */`] : []),
    ...blocks.flatMap((b, i) => (i ? ['', ...b] : b)),
  ].join('\n');
}

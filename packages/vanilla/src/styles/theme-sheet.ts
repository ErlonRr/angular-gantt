/**
 * @file theme-sheet.ts
 * Per-instance theme variables: one `:host{}` rule in a constructable stylesheet adopted by the
 * element's shadow root, after the shared base sheet (`styles/base.ts`). Values are written
 * through the CSSOM (`rule.style.setProperty`), never interpolated into stylesheet text, so a
 * theme value can't inject CSS, and no inline style is needed (strict `style-src` CSP).
 *
 * Because the variables live in a stylesheet rather than the host's inline `style`:
 * - page CSS such as `gantry-element { --gantt-bar: … }` overrides them;
 * - `setAttribute('style', …)` (or a framework's string `style` binding) no longer wipes them;
 * - the host carries no `style` attribute of ours.
 *
 * Without constructable stylesheets the variables fall back to `host.style.setProperty` (CSSOM
 * as well, so still CSP-safe, but on the host's inline style).
 */

import { adoptSheets, constructSheet, dropSheets } from '../dom/sheet';

/** `[cssVar, value]` pairs, e.g. `themeToCss(theme)`. */
export type ThemeCssEntries = ReadonlyArray<readonly [cssVar: string, value: string]>;

export interface ThemeSheet {
  /** Writes the variables (the sheet skips values equal to its last write). */
  write(entries: ThemeCssEntries): void;
  /** Removes every written variable and stops using the sheet. */
  destroy(): void;
}

/** A declaration separator or a block can't be part of a theme value (CSS injection). */
const UNSAFE_CSS_VALUE = /[;{}]/;

/** A constructable sheet for `doc` holding one empty `:host{}` rule, or `null` when unsupported. */
function hostRuleSheet(doc: Document): { sheet: CSSStyleSheet; style: CSSStyleDeclaration } | null {
  const sheet = constructSheet(doc, ':host{}');
  const style = (sheet?.cssRules[0] as CSSStyleRule | undefined)?.style;
  return sheet && style ? { sheet, style } : null;
}

/**
 * Writes variables into `style`, remembering what it wrote. `skipUnchanged`: only for a style the
 * element alone owns (the sheet rule) — the host's inline style can be rewritten from outside.
 */
function declarationWriter(style: CSSStyleDeclaration, skipUnchanged: boolean, onDestroy?: () => void): ThemeSheet {
  const written = new Map<string, string>();
  return {
    write(entries) {
      for (const [name, value] of entries) {
        if (skipUnchanged && written.get(name) === value) continue;
        written.set(name, value);
        if (UNSAFE_CSS_VALUE.test(value)) style.removeProperty(name);
        else style.setProperty(name, value);
      }
    },
    destroy() {
      for (const name of written.keys()) style.removeProperty(name);
      written.clear();
      onDestroy?.();
    },
  };
}

/** Theme variables as inline styles of `host` (the fallback; a string `style` attribute wipes them). */
export function inlineThemeSheet(host: HTMLElement): ThemeSheet {
  return declarationWriter(host.style, false);
}

/**
 * The theme sheet of one element: adopted by `shadow` (appended after any sheet it already
 * adopts), or the host's inline style when constructable stylesheets are unavailable.
 * Call once the host is connected: the fallback writes host styles.
 */
export function createThemeSheet(shadow: ShadowRoot): ThemeSheet {
  const host = shadow.host as HTMLElement;
  const created = 'adoptedStyleSheets' in shadow ? hostRuleSheet(shadow.ownerDocument) : null;
  // Not adoptable: a sheet can only be adopted in the document it was constructed for
  if (!created || !adoptSheets(shadow, created.sheet)) return inlineThemeSheet(host);
  const { sheet, style } = created;
  return declarationWriter(style, true, () => dropSheets(shadow, sheet));
}

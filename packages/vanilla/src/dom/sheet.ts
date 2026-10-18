/**
 * @file sheet.ts
 * Stylesheets for a shadow root without markup, so the element works under a strict
 * Content-Security-Policy (`style-src 'self'`, no `'unsafe-inline'`) and Trusted Types:
 *
 * - constructable stylesheets (`new CSSStyleSheet()` + `replaceSync`) adopted through
 *   `adoptedStyleSheets`: CSSOM, so CSP's inline-style rules don't apply to them;
 * - without them (Safari < 16.4, Firefox < 101), a style element filled through `textContent`.
 *   That fallback is an inline style: it needs `style-src 'unsafe-inline'` (or a nonce/hash the
 *   page manages), so a strict `style-src` requires constructable stylesheets.
 *
 * Module top level stays SSR-safe: nothing here runs until a function is called.
 */

/**
 * The `CSSStyleSheet` constructor of `doc`'s realm: a constructed sheet can only be adopted in the
 * document it was constructed for. `null` when the platform has no constructable stylesheets or
 * the document has no window (e.g. `document.implementation.createHTMLDocument()`).
 */
function sheetConstructor(doc: Document): typeof CSSStyleSheet | null {
  if (typeof CSSStyleSheet !== 'function') return null;
  const Ctor = doc === globalThis.document ? CSSStyleSheet : doc.defaultView?.CSSStyleSheet;
  return typeof Ctor === 'function' && typeof Ctor.prototype.replaceSync === 'function' ? Ctor : null;
}

/** A constructable stylesheet for `doc` holding `css`, or `null` when `doc` can't have one. */
export function constructSheet(doc: Document, css: string): CSSStyleSheet | null {
  const Ctor = sheetConstructor(doc);
  if (!Ctor) return null;
  try {
    const sheet = new Ctor();
    sheet.replaceSync(css);
    return sheet;
  } catch {
    // `CSSStyleSheet` exists but isn't constructable (older engines)
    return null;
  }
}

/**
 * Adopts `sheets` in `shadow`, after the sheets it already adopts (a sheet already there keeps its
 * place). `false` when the shadow root can't adopt them (no `adoptedStyleSheets`, or a sheet
 * constructed for another document).
 */
export function adoptSheets(shadow: ShadowRoot, ...sheets: readonly CSSStyleSheet[]): boolean {
  if (!('adoptedStyleSheets' in shadow)) return false;
  const current = shadow.adoptedStyleSheets;
  const added = sheets.filter(sheet => !current.includes(sheet));
  if (!added.length) return true;
  try {
    shadow.adoptedStyleSheets = [...current, ...added];
    return true;
  } catch {
    // NotAllowedError: constructed for another document
    return false;
  }
}

/** Stops adopting `sheets` in `shadow` (the other adopted sheets keep their order). */
export function dropSheets(shadow: ShadowRoot, ...sheets: readonly CSSStyleSheet[]): void {
  if (!('adoptedStyleSheets' in shadow)) return;
  shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter(sheet => !sheets.includes(sheet));
}

/**
 * After `shadow` moved to another document: keeps, in order, only the adopted sheets that document
 * accepts (a constructed sheet can only be adopted in the document it was constructed for), minus
 * `drop`.
 */
export function pruneSheets(shadow: ShadowRoot, ...drop: readonly CSSStyleSheet[]): void {
  if (!('adoptedStyleSheets' in shadow)) return;
  const kept: CSSStyleSheet[] = [];
  for (const sheet of shadow.adoptedStyleSheets) {
    if (drop.includes(sheet)) continue;
    try {
      shadow.adoptedStyleSheets = [...kept, sheet];
      kept.push(sheet);
    } catch {
      // constructed for another document
    }
  }
  shadow.adoptedStyleSheets = kept;
}

/**
 * Applies `css` to `shadow`: adopts `sheet` (shared, built by the caller), or — when there is no
 * sheet or it can't be adopted — inserts a style element as the shadow root's first child.
 * Returns the fallback element, or `null` when the sheet was adopted. Applying it again (the
 * element moved to another document) reuses or removes a fallback element inserted before.
 */
export function applySheet(shadow: ShadowRoot, sheet: CSSStyleSheet | null, css: string): HTMLStyleElement | null {
  const first = shadow.firstChild;
  const previous = first?.nodeName === 'STYLE' && first.textContent === css ? (first as HTMLStyleElement) : null;
  if (sheet && adoptSheets(shadow, sheet)) {
    previous?.remove();
    return null;
  }
  if (previous) return previous;
  const style = shadow.ownerDocument.createElement('style'); // <style> fallback: not strict-`style-src` compatible
  style.textContent = css;
  shadow.prepend(style);
  return style;
}

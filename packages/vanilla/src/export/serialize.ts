/**
 * @file serialize.ts
 * A custom bar's node as SVG markup (Phase 12, D5): `XMLSerializer` (the live node is never
 * touched), then core's `sanitizeSvgMarkup` — the one rule set of every export, so a headless
 * `customBar` and a browser's custom bar keep the same things; core inlines the `var(--gantt-*)`
 * paints with the export theme afterwards and applies the rules again. Part of the lazy `export/`
 * chunk.
 *
 * Kept: SVG drawing elements in the SVG namespace (shapes, text, paint servers, filters, `a`,
 * `use`, `image`…) with their attributes, inline `style` included, and their classes (they travel,
 * but no stylesheet comes with them).
 * Removed:
 *   elements      every other one with its content: `script`, `style`, `foreignObject` (HTML
 *                 islands taint a PNG canvas in Safari and break "text as text"), SMIL animations
 *                 (`set`, `animate`…), `metadata`, HTML and other namespaces
 *   attributes    `on*` event handlers, `tabindex` and `autofocus` (nothing in an exported picture
 *                 takes focus); a `javascript:`, `vbscript:` or `data:` URL in any value (browsers
 *                 ignore spaces and control characters there, so the test does too; `data:image/`
 *                 PNG, JPEG, GIF and WebP stay); an `href` other than a `#fragment` or such an
 *                 image; a `url(…)` other than `url(#…)` (a style keeps its other declarations):
 *                 an export never loads anything from elsewhere
 *   nodes         comments and processing instructions
 */

import { sanitizeSvgMarkup } from '@gantryjs/core';

/**
 * The sanitized outer markup of `node` (`win` gives `XMLSerializer`); `''` when `node` itself is
 * dropped (a `script`, `foreignObject` or `style` root, or an element outside the SVG namespace).
 * `node` is left as it is.
 */
export function serializeSvg(node: Element, win: Window): string {
  // `Window` doesn't declare the constructors; a window has them (as `doc.defaultView` is typed)
  const realm = win as Window & typeof globalThis;
  return sanitizeSvgMarkup(new realm.XMLSerializer().serializeToString(node));
}

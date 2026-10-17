/**
 * @file base.ts
 * The element's base stylesheet: every region's CSS (one `styles/*.css.ts` string module per
 * region, concatenated below in cascade order) in one constructable `CSSStyleSheet` per
 * `Document`, shared by every `<gantry-element>` of that document. It is parsed once, adopted by
 * reference, and needs no inline style, so it works under a strict `style-src` CSP.
 *
 * Per-instance values (the theme variables) live in a separate sheet (`theme-sheet.ts`).
 */

import { constructSheet } from '../dom/sheet';
import { HOST_CSS } from './host.css';
import { SPLITTER_CSS } from './splitter.css';
import { HEADER_CSS } from './header.css';
import { TOOLBAR_CSS } from './toolbar.css';
import { TASKLIST_CSS } from './tasklist.css';
import { CANVAS_CSS } from './canvas.css';
import { LEGEND_CSS } from './legend.css';
import { TOOLTIP_CSS } from './tooltip.css';

/** The element's CSS text, in cascade order (also the text of the fallback style element). */
export const BASE_CSS = [
  HOST_CSS,
  SPLITTER_CSS,
  HEADER_CSS,
  TOOLBAR_CSS,
  TASKLIST_CSS,
  CANVAS_CSS,
  LEGEND_CSS,
  TOOLTIP_CSS,
].join('');

const sheets = new WeakMap<Document, CSSStyleSheet>();

/**
 * The shared base sheet of `doc`, built on first use; `null` without constructable stylesheets
 * (the caller then falls back to a style element, see `dom/sheet.ts`).
 */
export function getBaseSheet(doc: Document): CSSStyleSheet | null {
  if (typeof CSSStyleSheet !== 'function') return null;
  let sheet = sheets.get(doc) ?? null;
  if (!sheet) {
    sheet = constructSheet(doc, BASE_CSS);
    if (sheet) sheets.set(doc, sheet);
  }
  return sheet;
}

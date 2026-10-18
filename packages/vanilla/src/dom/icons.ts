/**
 * @file icons.ts
 * The toolbar's inline SVG icons, built node by node with `s()` from core's line art
 * (`TOOLBAR_ICONS`): no markup parsing and no `style=` (CSP-safe), the same paths as Angular's.
 *
 *   svg.gantt-tb-icon[viewBox][width=16][height=16][aria-hidden=true][focusable=false]
 *     path ×n          one per `TOOLBAR_ICONS[icon]` entry, in paint order
 *
 * The stroke geometry (`TOOLBAR_ICON_STROKE`) is set as attributes; the colours are the
 * stylesheet's (`.gantt-tb-icon { fill: none; stroke: currentColor }`, `styles/toolbar.css.ts`),
 * so an icon takes its button's text colour and the forced-colors system colours.
 */

import {
  TOOLBAR_ICON_SIZE,
  TOOLBAR_ICON_STROKE,
  TOOLBAR_ICON_VIEWBOX,
  TOOLBAR_ICONS,
  type ToolbarIcon,
} from '@gantryjs/core';
import { s } from './h';

/** Builds the `svg.gantt-tb-icon` of `icon` (decorative: the control carries the name). */
export function toolbarIcon(icon: ToolbarIcon): SVGSVGElement {
  return s(
    'svg',
    {
      class: 'gantt-tb-icon',
      viewBox: TOOLBAR_ICON_VIEWBOX,
      width: TOOLBAR_ICON_SIZE,
      height: TOOLBAR_ICON_SIZE,
      'aria-hidden': 'true',
      focusable: 'false',
      'stroke-width': TOOLBAR_ICON_STROKE.width,
      'stroke-linecap': TOOLBAR_ICON_STROKE.linecap,
      'stroke-linejoin': TOOLBAR_ICON_STROKE.linejoin,
    },
    TOOLBAR_ICONS[icon].map(d => s('path', { d })),
  );
}

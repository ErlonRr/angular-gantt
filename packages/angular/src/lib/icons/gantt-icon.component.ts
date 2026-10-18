// ─────────────────────────────────────────────────────────────
//  gantry · icons/gantt-icon.component.ts
//
//  A toolbar icon: core's line art (`TOOLBAR_ICONS`) painted on the
//  `svg` element it is placed on (an attribute selector, no wrapper),
//  the Web Component's markup (`dom/icons.ts`):
//
//    svg.gantt-tb-icon[viewBox][width=16][height=16][aria-hidden=true][focusable=false]
//      path ×n          one per `TOOLBAR_ICONS[icon]` entry, in paint order
//
//  Decorative: the control around it carries the name. The stroke
//  geometry (`TOOLBAR_ICON_STROKE`) is set as attributes; the colours are
//  the stylesheet's (`fill: none; stroke: currentColor`), so an icon takes
//  its button's text colour and the forced-colors system colours.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  TOOLBAR_ICON_SIZE,
  TOOLBAR_ICON_STROKE,
  TOOLBAR_ICON_VIEWBOX,
  TOOLBAR_ICONS,
  type ToolbarIcon,
} from '@gantryjs/core';

@Component({
  selector: 'svg[ganttIcon]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'gantt-tb-icon',
    '[attr.viewBox]': 'viewBox',
    '[attr.width]': 'size',
    '[attr.height]': 'size',
    'aria-hidden': 'true',
    focusable: 'false',
    '[attr.stroke-width]': 'stroke.width',
    '[attr.stroke-linecap]': 'stroke.linecap',
    '[attr.stroke-linejoin]': 'stroke.linejoin',
  },
  template: `
    @for (d of paths(); track $index) {
      <svg:path [attr.d]="d" />
    }
  `,
  styles: [
    `
      /* The icon takes the control's text colour: fill and stroke come from here, never from attributes */
      :host {
        flex: none;
        display: block;
        fill: none;
        stroke: currentColor;
      }
    `,
  ],
})
export class GanttIconComponent {
  /** Which icon (`TOOLBAR_ICONS` key) */
  readonly ganttIcon = input.required<ToolbarIcon>();

  protected readonly paths = computed(() => TOOLBAR_ICONS[this.ganttIcon()]);
  protected readonly viewBox = TOOLBAR_ICON_VIEWBOX;
  protected readonly size = TOOLBAR_ICON_SIZE;
  protected readonly stroke = TOOLBAR_ICON_STROKE;
}

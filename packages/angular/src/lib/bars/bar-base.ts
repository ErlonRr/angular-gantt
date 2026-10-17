// ─────────────────────────────────────────────────────────────
//  gantry · bars/bar-base.ts
//  The contract of every bar component, built-in or custom.
// ─────────────────────────────────────────────────────────────

import { Directive, input } from '@angular/core';
import { type GanttBarContext } from '../types';

/**
 * Base class of every bar component (built-in or registered with `provideGanttBar`).
 * It declares the `ctx` input the chart binds: extend it and read `this.ctx()`; don't redeclare it.
 *
 * @example
 * @Component({ selector: 'g[epicBar]', template: `<svg:rect [attr.x]="geo().barX" … />` })
 * export class EpicBar extends GanttBarBase {
 *   protected readonly geo = computed(() => this.ctx().geometry);
 * }
 */
@Directive()
export abstract class GanttBarBase {
  /**
   * The row's render context: row, geometry, core visual, theme and state flags. The chart keeps the
   * same object while none of them change, so only the bars whose data changed re-render.
   */
  readonly ctx = input.required<GanttBarContext>();
}

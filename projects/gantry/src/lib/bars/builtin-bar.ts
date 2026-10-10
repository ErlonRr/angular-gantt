// ─────────────────────────────────────────────────────────────
//  gantry · bars/builtin-bar.ts
//  Shared rendering for the built-in bars. Geometry (size, radius,
//  label placement, progress, baseline) comes from the @gantry/core
//  render model in `ctx.visual` — identical to the Web Component.
// ─────────────────────────────────────────────────────────────

import { Directive, computed, inject, input } from '@angular/core';
import { cssPx, taskAccessibleName } from '@gantry/core';
import { type GanttBarContext } from '../types';
import { GanttBarBase } from '../bar-registry';
import { GanttI18nService } from '../services/gantt-i18n.service';

/** Template shared by the built-in task / group / milestone bars. */
export const BUILTIN_BAR_TEMPLATE = `
  @if (ctx().visual; as v) {
    <svg:path class="gantt-bar-body" [attr.d]="v.path" [attr.fill]="v.fill"
      [attr.stroke]="ctx().isSelected ? ctx().theme.selectionBorder : null"
      [attr.stroke-width]="ctx().isSelected ? 1.5 : null"/>
    @if (v.caps) {
      <svg:path class="gantt-bar-caps" [attr.d]="v.caps" [attr.fill]="v.fill"/>
    }
    @if (v.progress; as p) {
      <svg:path class="gantt-bar-progress" [attr.d]="p.path" [attr.fill]="p.color"
        [attr.fill-opacity]="p.opacity" pointer-events="none"/>
    }
    @if (v.baseline; as b) {
      <svg:line class="gantt-bar-baseline" [attr.x1]="b.x" [attr.y1]="b.y" [attr.x2]="b.x + b.width" [attr.y2]="b.y"
        [attr.stroke]="ctx().theme.baselineColor" stroke-width="2" stroke-dasharray="5 3"
        stroke-linecap="round" pointer-events="none"/>
    }
    @if (v.label; as l) {
      <svg:text [attr.class]="l.inside ? 'gantt-bar-label' : 'gantt-bar-label gantt-bar-label--outside'"
        [attr.x]="l.x" [attr.y]="l.y" [attr.fill]="l.color" [attr.font-size]="fontPx()"
        [attr.font-family]="ctx().theme.fontFamily" [attr.text-anchor]="l.anchor"
        dominant-baseline="central" pointer-events="none">{{ l.text }}</svg:text>
    }
  }
`;

export const BUILTIN_BAR_STYLES = `
  :host(.gantt-bar-draggable) .gantt-bar-body,
  :host(.gantt-bar-draggable) .gantt-bar-caps { cursor: grab; }
  :host(.gantt-bar-draggable:active) .gantt-bar-body { cursor: grabbing; }
  .gantt-bar-label { user-select: none; }
  .gantt-bar-label--outside { font-weight: 500; }
`;

/** Base for the built-in bars: the `ctx` input plus template helpers. */
@Directive()
export abstract class GanttBuiltinBar extends GanttBarBase {
  readonly ctx = input.required<GanttBarContext>();

  /** `GanttBarBase` contract */
  get context(): GanttBarContext {
    return this.ctx();
  }

  protected readonly fontPx = computed(() => cssPx(this.ctx().theme.fontSize, 13) - 1);

  /** Optional: a bar rendered outside `<gantry>` falls back to the English labels */
  private readonly i18n = inject(GanttI18nService, { optional: true });

  /** Name, type, dates, progress, critical and baseline state (shared with the Web Component) */
  protected readonly ariaLabel = computed(() => {
    const { row, isCritical, showBaseline } = this.ctx();
    return taskAccessibleName(row, {
      labels: this.i18n?.labels(),
      locale: this.i18n?.locale(),
      critical: isCritical,
      baseline: showBaseline && !!row.task.baseline,
    });
  });
}

/** Host bindings shared by the built-in bars. */
export const BUILTIN_BAR_HOST = {
  '[attr.data-task-id]': 'ctx().row.task.id',
  '[attr.data-bar-type]': 'ctx().row.barType',
  role: 'listitem',
  '[attr.aria-label]': 'ariaLabel()',
  '[class.gantt-bar-draggable]': 'ctx().draggable !== false',
  '[class]': "ctx().row.task.className ?? ''",
};

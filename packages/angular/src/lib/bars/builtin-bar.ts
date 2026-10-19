// ─────────────────────────────────────────────────────────────
//  gantry · bars/builtin-bar.ts
//  Shared rendering for the built-in bars. Geometry (size, radius,
//  label placement, progress, baseline) comes from the @gantryjs/core
//  render model in `ctx.visual` — identical to the Web Component.
//  Colours are `Paint`s (`var(--gantt-*)` or an explicit task colour)
//  bound as CSS properties, never as presentation attributes.
//
//  The host's classes are the Web Component's (`paint/bars.ts`):
//  `gantt-bar` first (the paint-snapshot key), then `gantt-bar--<kind>`,
//  `gantt-bar--critical` on the critical path (forced-colors mode dashes
//  it), the row style's classes (`visual.className`: `options.styles`,
//  `task.style.className`, the deprecated `task.className`) and
//  `gantt-bar-draggable`.
//
//  A collapsed rolled-up parent (`rollup.segments`) shows its children as
//  segments right after the body: one `rect.gantt-bar-segment` per
//  `visual.segments` entry (x / width from the segment, the bar's y,
//  height and rx, the segment's paint as `fill`), attached only while the
//  visual has segments (D26 of Gantry 2 phase 10).
// ─────────────────────────────────────────────────────────────

import { Directive, computed } from '@angular/core';
import { themeMetrics, PAINTS } from '@gantryjs/core';
import { GanttBarBase } from './bar-base';

/** Template shared by the built-in task / group / milestone bars. */
export const BUILTIN_BAR_TEMPLATE = `
  @if (ctx().visual; as v) {
    <svg:path class="gantt-bar-body" [attr.d]="v.path" [style.fill]="v.paint.body"
      [style.stroke]="ctx().isSelected ? paints.selectionStroke : null"
      [attr.stroke-width]="ctx().isSelected ? 1.5 : null"/>
    @if (v.segments; as segments) {
      @for (seg of segments; track $index) {
        <svg:rect class="gantt-bar-segment" [attr.x]="seg.x" [attr.y]="v.y" [attr.width]="seg.width"
          [attr.height]="v.height" [attr.rx]="v.rx" [style.fill]="seg.paint" pointer-events="none"/>
      }
    }
    @if (v.caps) {
      <svg:path class="gantt-bar-caps" [attr.d]="v.caps" [style.fill]="v.paint.body"/>
    }
    @if (v.progress; as p) {
      <svg:path class="gantt-bar-progress" [attr.d]="p.path" [style.fill]="v.paint.progress"
        [attr.fill-opacity]="p.opacity" pointer-events="none"/>
    }
    @if (v.baseline; as b) {
      <svg:line class="gantt-bar-baseline" [attr.x1]="b.x" [attr.y1]="b.y" [attr.x2]="b.x + b.width" [attr.y2]="b.y"
        [style.stroke]="paints.baseline" stroke-width="2" stroke-dasharray="5 3"
        stroke-linecap="round" pointer-events="none"/>
    }
    @if (v.label; as l) {
      <svg:text [attr.class]="l.inside ? 'gantt-bar-label' : 'gantt-bar-label gantt-bar-label--outside'"
        [attr.x]="l.x" [attr.y]="l.y" [style.fill]="v.paint.label" [attr.font-size]="fontPx()"
        [attr.text-anchor]="l.anchor"
        dominant-baseline="central" pointer-events="none">{{ l.text }}</svg:text>
    }
  }
`;

export const BUILTIN_BAR_STYLES = `
  :host(.gantt-bar-draggable) { cursor: grab; }
  .gantt-bar-label { user-select: none; font-family: var(--gantt-font); }
  .gantt-bar-label--outside { font-weight: 500; }
  /* Forced colours (D25), over the inline paints: ButtonFace bars outlined in ButtonText, rolled-up
     child segments ButtonFace with a 1 px ButtonText outline (each child outlined), caps and inside
     labels ButtonText, progress ButtonText at 0.45 (the inside label stays readable), outside labels
     CanvasText, the critical path dashed, the selected bar's outline Highlight */
  @media (forced-colors: active) {
    .gantt-bar-body { fill: ButtonFace !important; stroke: ButtonText !important; stroke-width: 1.5px; }
    .gantt-bar-segment { fill: ButtonFace !important; stroke: ButtonText !important; stroke-width: 1px; }
    .gantt-bar-caps, .gantt-bar-label { fill: ButtonText !important; }
    .gantt-bar-progress { fill: ButtonText !important; fill-opacity: 0.45; }
    .gantt-bar-label--outside { fill: CanvasText !important; }
    .gantt-bar-baseline { stroke: GrayText !important; }
    :host(.gantt-bar--critical) .gantt-bar-body { stroke-dasharray: 4 2; stroke-width: 2px; }
    :host([aria-selected='true']) .gantt-bar-body { stroke: Highlight !important; stroke-width: 2.5px; }
  }
`;

/** Base for the built-in bars: template helpers on top of `GanttBarBase`'s `ctx` input. */
@Directive()
export abstract class GanttBuiltinBar extends GanttBarBase {
  /** Label font size: the theme metric the label fitting used (`themeMetrics`) */
  protected readonly fontPx = computed(() => themeMetrics(this.ctx().theme).fontPx);

  /**
   * Selection outline and baseline rail: theme paints (`var(--gantt-*)`). Typed explicitly so the
   * published d.ts names `PAINTS` instead of inlining `import("@gantryjs/angular").Paint` self-references.
   */
  protected readonly paints: typeof PAINTS = PAINTS;

  /**
   * The host's classes: `gantt-bar gantt-bar--<kind>[ gantt-bar--critical][ visual.className][ gantt-bar-draggable]`
   * (the row style's classes come from the visual, never from the task)
   */
  protected readonly barClass = computed(() => {
    const { visual, isCritical, draggable } = this.ctx();
    let cls = `gantt-bar gantt-bar--${visual.kind}`;
    if (isCritical) cls += ' gantt-bar--critical';
    if (visual.className) cls += ` ${visual.className}`;
    if (draggable) cls += ' gantt-bar-draggable';
    return cls;
  });
}

/**
 * Host bindings shared by the built-in bars. The role, accessible name, role description,
 * selection and position in the set are stamped by the bar outlet on every bar, custom ones too.
 */
export const BUILTIN_BAR_HOST = {
  '[attr.data-task-id]': 'ctx().row.task.id',
  '[attr.data-bar-type]': 'ctx().row.barType',
  // The whole class attribute, in the Web Component's order (`gantt-bar` first)
  '[attr.class]': 'barClass()',
};

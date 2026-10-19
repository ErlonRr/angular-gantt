import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { GanttBarBase, PAINTS, resolvePaint, themeMetrics } from '@gantryjs/angular';
import { FLAG_BAR } from 'demo-kit/gallery';

/**
 * The bar of `barType: 'flag'`: a task bar (body, progress, label) with a pennant at its start
 * (`FLAG_BAR.flagPath`). Its colours are `fill` attributes resolved from the chart's theme
 * (`resolvePaint`), not `var(--gantt-*)` styles: an export renders this component off-screen and
 * keeps its attributes and inline styles (the `styles` below stay behind), so the file shows the
 * bar as drawn. The chart gives the `<g>` host its role, name, focus ring, drag and tooltip.
 */
@Component({
  selector: 'g[appFlagBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let v = ctx().visual;
    @let c = colors();
    <svg:path
      class="flag-body"
      [attr.d]="v.path"
      [attr.fill]="c.body"
      [style.stroke]="ctx().isSelected ? selectionStroke : null"
      [attr.stroke-width]="ctx().isSelected ? 1.5 : null"
    />
    @if (v.progress; as p) {
      <svg:path class="flag-progress" [attr.d]="p.path" [attr.fill]="c.progress" [attr.fill-opacity]="p.opacity" />
    }
    @if (v.label; as l) {
      <svg:text
        [attr.class]="l.inside ? 'flag-label' : 'flag-label flag-label-outside'"
        [attr.x]="l.x"
        [attr.y]="l.y"
        [attr.text-anchor]="l.anchor"
        [attr.font-size]="fontPx()"
        [attr.font-weight]="l.inside ? null : 500"
        [attr.fill]="c.label"
        dominant-baseline="central"
      >
        {{ l.text }}
      </svg:text>
    }
    <svg:path class="flag-pennant" [attr.d]="pennant()" [attr.fill]="c.body" />
  `,
  styles: `
    text {
      font-family: var(--gantt-font);
      pointer-events: none;
      user-select: none;
    }
    /* Custom bars don't get the built-in bars' forced-colours rules: bring your own (CSS wins over
       presentation attributes; !important over the inline selection stroke) */
    @media (forced-colors: active) {
      .flag-body {
        fill: ButtonFace;
        stroke: ButtonText;
        stroke-width: 1.5px;
      }
      :host([aria-selected='true']) .flag-body {
        stroke: Highlight !important;
        stroke-width: 2.5px;
      }
      .flag-progress {
        fill: ButtonText;
        fill-opacity: 0.45;
      }
      .flag-label {
        fill: ButtonText;
      }
      .flag-label-outside,
      .flag-pennant {
        fill: CanvasText;
      }
    }
  `,
})
export class FlagBarComponent extends GanttBarBase {
  protected readonly selectionStroke = PAINTS.selectionStroke;
  protected readonly fontPx = computed(() => themeMetrics(this.ctx().theme).fontPx);
  protected readonly pennant = computed(() => FLAG_BAR.flagPath(this.ctx().visual));
  /** The bar's paints as colours of the chart's theme (dark mode included) */
  protected readonly colors = computed(() => {
    const { visual, theme } = this.ctx();
    return {
      body: resolvePaint(visual.paint.body, theme),
      progress: resolvePaint(visual.paint.progress, theme),
      label: resolvePaint(visual.paint.label, theme),
    };
  });
}

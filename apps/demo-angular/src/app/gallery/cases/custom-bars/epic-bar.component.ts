import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { GanttBarBase, PAINTS, themeMetrics } from '@gantryjs/angular';
import { epicBarLayout } from 'demo-kit/gallery';

/**
 * The bar of `barType: 'epic'`: its body, its progress as a thick underline, its label and a badge
 * with the initial of its risk, placed by `epicBarLayout`. `GanttBarBase` declares the `ctx` input
 * (`ctx().visual` is the core bar model); the chart gives the `<g>` host its role, name, focus ring,
 * drag and tooltip, so the component only draws.
 */
@Component({
  selector: 'g[appEpicBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The risk is read after the bar's name
  host: { '[attr.aria-description]': 'epic().description' },
  template: `
    @let v = ctx().visual;
    @let e = epic();
    @let u = e.underline;
    <svg:path
      class="epic-body"
      [class.epic-selected]="ctx().isSelected"
      [attr.d]="v.path"
      [style.fill]="v.paint.body"
      [style.stroke]="ctx().isSelected ? selectionStroke : null"
    />
    <svg:rect
      class="epic-track"
      [attr.x]="u.x"
      [attr.y]="u.y"
      [attr.width]="u.width"
      [attr.height]="u.height"
      [attr.rx]="u.rx"
      [style.fill]="v.paint.body"
    />
    <svg:rect
      class="epic-progress"
      [attr.x]="u.x"
      [attr.y]="u.y"
      [attr.width]="u.done"
      [attr.height]="u.height"
      [attr.rx]="u.rx"
      [style.fill]="v.paint.body"
    />
    @if (v.label; as l) {
      <svg:text
        [attr.class]="l.inside ? 'epic-label' : 'epic-label epic-label-outside'"
        [attr.x]="l.x"
        [attr.y]="l.y"
        [attr.dx]="e.labelDx"
        [attr.text-anchor]="l.anchor"
        [attr.font-size]="fontPx()"
        [style.fill]="v.paint.label"
      >
        {{ l.text }}
      </svg:text>
    }
    @if (e.badge; as b) {
      <svg:circle class="epic-risk" [attr.cx]="b.cx" [attr.cy]="b.cy" [attr.r]="b.r" [style.fill]="e.color" />
      <svg:text class="epic-risk-text" [attr.x]="b.cx" [attr.y]="b.cy">{{ e.initial }}</svg:text>
    }
  `,
  styles: `
    text {
      dominant-baseline: central;
      pointer-events: none;
    }
    .epic-body {
      stroke-width: 1.5px;
    }
    .epic-track {
      opacity: 0.3;
    }
    .epic-risk {
      stroke: #ffffff;
      stroke-width: 1.5px;
    }
    .epic-risk-text {
      fill: #ffffff;
      font-size: 9px;
      font-weight: 700;
      text-anchor: middle;
    }
    /* Custom bars don't get the built-in bars' forced-colours rules: bring your own (!important
       wins over the inline paints) */
    @media (forced-colors: active) {
      .epic-body {
        fill: ButtonFace !important;
        stroke: ButtonText !important;
      }
      .epic-selected {
        stroke: Highlight !important;
        stroke-width: 2.5px;
      }
      .epic-track {
        fill: GrayText !important;
        opacity: 1;
      }
      .epic-progress {
        fill: ButtonText !important;
      }
      .epic-risk {
        fill: ButtonText !important;
        stroke: ButtonFace;
      }
      .epic-risk-text {
        fill: ButtonFace;
      }
      .epic-label {
        fill: ButtonText !important;
      }
      .epic-label-outside {
        fill: CanvasText !important;
      }
    }
  `,
})
export class EpicBarComponent extends GanttBarBase {
  protected readonly selectionStroke = PAINTS.selectionStroke;
  protected readonly epic = computed(() => epicBarLayout(this.ctx()));
  protected readonly fontPx = computed(() => themeMetrics(this.ctx().theme).fontPx);
}

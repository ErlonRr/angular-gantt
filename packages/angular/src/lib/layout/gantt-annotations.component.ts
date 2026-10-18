// ─────────────────────────────────────────────────────────────
//  gantry · layout/gantt-annotations.component.ts
//
//  The annotations of the timeline body, from core
//  `computeAnnotationVisuals` over the chart's layout (annotations,
//  timeline, the mounted window's height, the font size, the marker
//  lane): two layers of the canvas' <svg>, each component being the
//  layer group itself (attribute selectors, no wrapper), so the paint
//  keys are the Web Component's (`layers/overlay.ts`):
//
//    g.gantt-annotations[aria-hidden][pointer-events=none]         under the bars
//      (rect: the region x1 → x2) · line: the dashed line at x1, per annotation
//    g.gantt-annotation-labels[aria-hidden][pointer-events=none]   over the bars
//      text per labelled annotation, only while the marker lane is off
//
//  While the marker lane shows (`layout.markerLane().height > 0`, D12)
//  the labels are in the header's lane, never over the bars: core gives
//  the visuals no label then.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, inject, type Signal } from '@angular/core';
import { computeAnnotationVisuals, type AnnotationVisual } from '@gantryjs/core';

import { GanttLayoutService } from './gantt-layout.service';

/** The annotation visuals of the mounted window (`computeAnnotationVisuals`), labels only while the lane is off. */
function annotationVisuals(layout: GanttLayoutService): Signal<AnnotationVisual[]> {
  return computed(() =>
    computeAnnotationVisuals(
      layout.annotations(),
      layout.timeline(),
      layout.windowSpan(),
      layout.fontPx(),
      layout.markerLane().height > 0,
    ),
  );
}

/** Annotation regions and lines, under the bars. */
@Component({
  selector: 'g[ganttAnnotations]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'gantt-annotations',
    'aria-hidden': 'true',
    'pointer-events': 'none',
  },
  template: `
    @for (a of visuals(); track a.key) {
      @if (a.region; as r) {
        <svg:rect
          [attr.x]="r.x"
          [attr.y]="r.y"
          [attr.width]="r.width"
          [attr.height]="r.height"
          [style.fill]="a.paint"
          [attr.opacity]="r.opacity"
        />
      }
      <svg:line
        [attr.x1]="a.line.x"
        [attr.y1]="a.line.y1"
        [attr.x2]="a.line.x"
        [attr.y2]="a.line.y2"
        [style.stroke]="a.paint"
        [attr.stroke-width]="a.line.strokeWidth"
        [attr.stroke-dasharray]="a.line.dash"
        [attr.opacity]="a.line.opacity"
      />
    }
  `,
  styles: [
    `
      /* Forced colours (D25): regions and lines GrayText (inline SVG paints: !important) */
      @media (forced-colors: active) {
        rect {
          fill: GrayText !important;
        }
        line {
          stroke: GrayText !important;
        }
      }
    `,
  ],
})
export class GanttAnnotationsComponent {
  protected readonly visuals = annotationVisuals(inject(GanttLayoutService));
}

/** Annotation labels, over the bars (only while the marker lane doesn't show them). */
@Component({
  selector: 'g[ganttAnnotationLabels]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'gantt-annotation-labels',
    'aria-hidden': 'true',
    'pointer-events': 'none',
  },
  template: `
    @for (a of visuals(); track a.key) {
      @if (a.label; as l) {
        <svg:text
          [attr.x]="l.x"
          [attr.y]="l.y"
          [style.fill]="l.paint"
          [attr.font-size]="l.fontSize"
          [attr.font-weight]="l.fontWeight"
          [textContent]="l.text"
        ></svg:text>
      }
    }
  `,
  styles: [
    `
      text {
        user-select: none;
      }
      /* Forced colours (D25): labels CanvasText */
      @media (forced-colors: active) {
        text {
          fill: CanvasText !important;
        }
      }
    `,
  ],
})
export class GanttAnnotationLabelsComponent {
  protected readonly visuals = annotationVisuals(inject(GanttLayoutService));
}

// ─────────────────────────────────────────────────────────────
//  gantry · annotations/gantt-annotation.component.ts
//
//  Renders annotations on top of the timeline canvas:
//
//  ① Vertical line at x1 (with optional label)
//  ② Shaded region from x1 → x2  (when x2 is set)
//  ③ Today marker (special annotation with isToday=true)
//
//  Layer order in SVG: annotations sit above grid lines
//  but below task bars — controlled by source order in parent.
//
//  animate.enter is used (Angular 20.2 native API) for
//  the today marker pulse on first render.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { GanttAnnotation, GanttTheme, GanttLayoutParams } from '../types';
import { dateToPixel } from '../gantt-math';

// ─── Resolved annotation (dates converted to px) ─────────────

interface ResolvedAnnotation {
  raw: GanttAnnotation;
  x1: number;
  x2: number | null;
  color: string;
  dashArray: string | null;
  isToday: boolean;
}

// ─── Component ───────────────────────────────────────────────

@Component({
  selector: 'g[ganttAnnotations]', // attribute selector — renders inside SVG
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-hidden]': '"true"',
    style: 'pointer-events: none;',
  },
  template: `
    @for (ann of resolved(); track ann.x1) {
      <!-- ── Shaded region (x1 → x2) ──────────────────────── -->
      @if (ann.x2 !== null) {
        <rect
          [attr.x]="ann.x1"
          y="0"
          [attr.width]="ann.x2 - ann.x1"
          [attr.height]="totalHeight()"
          [attr.fill]="ann.color"
          [attr.opacity]="ann.raw.opacity ?? 0.08"
        />
      }

      <!-- ── Vertical line ─────────────────────────────────── -->
      <line
        [attr.x1]="ann.x1"
        [attr.y1]="0"
        [attr.x2]="ann.x1"
        [attr.y2]="totalHeight()"
        [attr.stroke]="ann.color"
        [attr.stroke-width]="ann.isToday ? 2 : 1.5"
        [attr.stroke-dasharray]="ann.dashArray"
        [attr.opacity]="ann.isToday ? 1 : 0.8"
      />

      <!-- ── Today triangle marker ─────────────────────────── -->
      @if (ann.isToday) {
        <polygon animate.enter="gantt-today-enter" [attr.points]="todayTriangle(ann.x1)" [attr.fill]="ann.color" />
        <!-- Today label -->
        <text
          animate.enter="gantt-today-enter"
          [attr.x]="ann.x1 + 5"
          [attr.y]="16"
          [attr.fill]="ann.color"
          font-size="10"
          font-weight="600"
          [attr.font-family]="theme().fontFamily"
          style="user-select:none;"
          >TODAY</text
        >
      }

      <!-- ── Annotation label ───────────────────────────────── -->
      @if (ann.raw.label && !ann.isToday) {
        <g>
          <!-- Label background pill -->
          <rect
            [attr.x]="ann.x1 + 4"
            [attr.y]="2"
            [attr.width]="labelWidth(ann.raw.label.text)"
            [attr.height]="18"
            rx="3"
            [attr.fill]="ann.color"
            [attr.opacity]="0.15"
          />
          <text
            [attr.x]="ann.x1 + 8"
            [attr.y]="13"
            [attr.fill]="ann.raw.label.color ?? ann.color"
            [attr.font-size]="ann.raw.label.fontSize ?? '11px'"
            [attr.font-weight]="ann.raw.label.fontWeight ?? '500'"
            [attr.font-family]="theme().fontFamily"
            dominant-baseline="central"
            style="user-select:none;"
            >{{ ann.raw.label.text }}</text
          >
        </g>
      }
    }
  `,
  styles: [
    `
      @keyframes gantt-today-enter {
        from {
          opacity: 0;
          transform: scaleY(0.4);
          transform-origin: top center;
        }
        to {
          opacity: 1;
          transform: scaleY(1);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        @keyframes gantt-today-enter {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      }
    `,
  ],
})
export class GanttAnnotationComponent {
  // ── Inputs ────────────────────────────────────────────────
  readonly annotations = input<GanttAnnotation[]>([]);
  readonly layoutParams = input.required<GanttLayoutParams>();
  readonly theme = input.required<GanttTheme>();
  readonly totalHeight = input<number>(0);
  readonly showToday = input<boolean>(true);

  // ── Resolved annotations ──────────────────────────────────
  protected readonly resolved = computed<ResolvedAnnotation[]>(() => {
    const { origin, pxPerDay } = this.layoutParams();
    const theme = this.theme();
    const result: ResolvedAnnotation[] = [];

    // Today annotation (auto-generated if showToday is true)
    if (this.showToday()) {
      const todayX = dateToPixel(new Date(), origin, pxPerDay);
      result.push({
        raw: {
          x1: new Date(),
          isToday: true,
          color: theme.todayColor,
          label: undefined,
        },
        x1: todayX,
        x2: null,
        color: theme.todayColor,
        dashArray: null,
        isToday: true,
      });
    }

    // Consumer-provided annotations
    for (const ann of this.annotations()) {
      const x1 = dateToPixel(ann.x1, origin, pxPerDay);
      const x2 = ann.x2 ? dateToPixel(ann.x2, origin, pxPerDay) : null;

      result.push({
        raw: ann,
        x1,
        x2,
        color: ann.color ?? theme.arrowColor,
        dashArray: ann.isToday ? null : '5 3',
        isToday: ann.isToday ?? false,
      });
    }

    return result;
  });

  // ── Helpers ───────────────────────────────────────────────

  protected todayTriangle(x: number): string {
    return `${x - 5},0 ${x + 5},0 ${x},9`;
  }

  protected labelWidth(text: string): number {
    // Rough estimate: 6.5px per char + 8px padding
    return Math.ceil(text.length * 6.5) + 8;
  }
}

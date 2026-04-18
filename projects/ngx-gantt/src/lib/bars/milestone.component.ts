// ─────────────────────────────────────────────────────────────
//  ngx-gantt · bars/milestone.component.ts
//
//  Milestone bar — rendered as a ◆ diamond at task.start.
//
//       ◆  Milestone Name
//       ↑
//    barX + barHeight/2 (centred on the row)
//
//  The diamond size is derived from rowHeight so it scales
//  consistently when the consumer changes rowHeight.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { GanttBarContext } from '../types';
import { GanttBarBase } from '../bar-registry';

@Component({
  selector: 'g[ganttMilestone]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-task-id]': 'ctx().row.task.id',
    '[attr.data-bar-type]': '"milestone"',
    'role': 'listitem',
    '[attr.aria-label]': 'ariaLabel()',
  },
  template: `
    <!-- Diamond shape via polygon -->
    <svg:polygon
      class="gantt-milestone-diamond"
      [attr.points]="diamondPoints()"
      [attr.fill]="fill()"
      [attr.stroke]="stroke()"
      [attr.stroke-width]="isCritical() ? 2 : 1"
    />

    <!-- Completion ring when progress = 100 -->
    @if (isComplete()) {
      <svg:circle
        [attr.cx]="cx()"
        [attr.cy]="cy()"
        [attr.r]="size() + 2"
        fill="none"
        [attr.stroke]="fill()"
        stroke-width="1.5"
        stroke-dasharray="3 2"
        opacity="0.6"
      />
    }

    <!-- Label to the right of the diamond -->
    <svg:text
      class="gantt-milestone-label"
      [attr.x]="labelX()"
      [attr.y]="cy()"
      [attr.fill]="theme().textPrimary"
      [attr.font-size]="theme().fontSize"
      [attr.font-family]="theme().fontFamily"
      dominant-baseline="central"
      style="pointer-events: none; user-select: none;"
    >{{ task().name }}</svg:text>

    <!-- Selected ring -->
    @if (isSelected()) {
      <svg:polygon
        [attr.points]="diamondPoints()"
        fill="none"
        [attr.stroke]="theme().selectionBorder"
        stroke-width="2.5"
        stroke-dasharray="4 2"
      />
    }
  `,
  styles: [`
    /*
     * SVG + transform-origin: default "center" uses the wrong reference box (viewport-relative),
     * so scale(1.15) on hover appears to drift in X/Y depending on where the milestone sits.
     * fill-box anchors the origin to this polygon's bounding box.
     */
    .gantt-milestone-diamond {
      cursor: pointer;
      transform-box: fill-box;
      transform-origin: center center;
      transition: transform 0.15s ease-out;
    }
    .gantt-milestone-diamond:hover {
      transform: scale(1.15);
    }

    @keyframes milestone-enter {
      from { opacity: 0; transform: scale(0.4) rotate(-45deg); }
      to   { opacity: 1; transform: scale(1)   rotate(0deg); }
    }
    @media (prefers-reduced-motion: no-preference) {
      .gantt-milestone-enter { animation: milestone-enter 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
    }
  `],
})
export class GanttMilestoneComponent extends GanttBarBase {
  readonly ctx = input.required<GanttBarContext>();

  protected readonly geo   = computed(() => this.ctx().geometry);
  protected readonly theme = computed(() => this.ctx().theme);
  protected readonly task  = computed(() => this.ctx().row.task);

  /** Centre X = barX (milestone has no width — it's a point) */
  protected readonly cx = computed(() => this.geo().barX);
  /** Centre Y = middle of row */
  protected readonly cy = computed(() => this.geo().y + this.geo().height / 2);

  /** Diamond half-size — scales with row height */
  protected readonly size = computed(() =>
    Math.round((this.geo().height - 10) / 2)
  );

  /**
   * Diamond points: top, right, bottom, left
   *   top    = (cx,     cy - size)
   *   right  = (cx + size, cy)
   *   bottom = (cx,     cy + size)
   *   left   = (cx - size, cy)
   */
  protected readonly diamondPoints = computed(() => {
    const { cx: x, cy: y } = { cx: this.cx(), cy: this.cy() };
    const s = this.size();
    return `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`;
  });

  protected readonly fill      = computed(() =>
    this.isCritical()
      ? this.theme().criticalColor
      : (this.task().barColor ?? this.theme().milestoneColor)
  );
  protected readonly stroke    = computed(() =>
    this.isCritical() ? this.theme().criticalColor : 'none'
  );
  protected readonly isCritical = computed(() => this.ctx().isCritical ?? false);
  protected readonly isSelected = computed(() => this.ctx().isSelected ?? false);
  protected readonly isComplete = computed(() => (this.task().progress ?? 0) >= 100);

  protected readonly labelX = computed(() => this.cx() + this.size() + 6);

  protected readonly ariaLabel = computed(() =>
    `Milestone: ${this.task().name}`
  );

  override get context(): GanttBarContext { return this.ctx(); }
}

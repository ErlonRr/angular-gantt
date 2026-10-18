import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { GanttBarBase } from '@gantryjs/angular';

/** Default fill of an epic without `barColor` (white text on it passes AA). */
export const EPIC_COLOR = '#4f46e5';

/**
 * The "epic" bar type: a thick rounded bar with a bolt mark, the task name and its progress,
 * drawn with plain SVG. GanttBarBase declares the `ctx` input (row, geometry, core visual,
 * theme, state). Registered with `provideGanttBar({ type: 'epic', component: EpicBarComponent })`.
 */
@Component({
  selector: 'g[epicBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'cursor: pointer' },
  template: `
    <svg:rect
      [attr.x]="geo().barX"
      [attr.y]="top()"
      [attr.width]="geo().barWidth"
      [attr.height]="height()"
      rx="6"
      [attr.fill]="task().barColor ?? epicColor"
    />
    <!-- Progress: a darker overlay, so the white text keeps its contrast -->
    @if (progress() > 0) {
      <svg:rect
        [attr.x]="geo().barX"
        [attr.y]="top()"
        [attr.width]="(geo().barWidth * progress()) / 100"
        [attr.height]="height()"
        rx="6"
        fill="rgb(0 0 0 / 0.22)"
      />
    }
    <svg:path
      d="M6 0 0 7h4l-1 5 6-7H5z"
      fill="#ffffff"
      [attr.transform]="'translate(' + (geo().barX + 8) + ' ' + (mid() - 6) + ')'"
    />
    <svg:text
      [attr.x]="geo().barX + 22"
      [attr.y]="mid()"
      fill="#ffffff"
      font-size="12"
      font-weight="600"
      dominant-baseline="central"
    >
      {{ task().name }}
    </svg:text>
    @if (geo().barWidth > 80) {
      <svg:text
        [attr.x]="geo().barX + geo().barWidth - 8"
        [attr.y]="mid()"
        fill="#ffffff"
        font-size="11"
        text-anchor="end"
        dominant-baseline="central"
      >
        {{ progress() }}%
      </svg:text>
    }
  `,
  styles: `
    text,
    path {
      pointer-events: none;
      user-select: none;
    }
  `,
})
export class EpicBarComponent extends GanttBarBase {
  protected readonly epicColor = EPIC_COLOR;
  protected readonly geo = computed(() => this.ctx().geometry);
  protected readonly task = computed(() => this.ctx().row.task);
  protected readonly progress = computed(() => this.task().progress ?? 0);
  protected readonly top = computed(() => this.geo().y + 5);
  protected readonly height = computed(() => Math.max(this.geo().height - 10, 4));
  protected readonly mid = computed(() => this.geo().y + this.geo().height / 2);
}

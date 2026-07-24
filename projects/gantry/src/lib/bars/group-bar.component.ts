// ─────────────────────────────────────────────────────────────
//  gantry · bars/group-bar.component.ts
//
//  Group/parent bar — rendered as a thick header bar with
//  a "bracket" shape that extends slightly beyond the children.
//
//  ├──────────────────────────────────────────────────────┤
//  ◄                  Group Name                         ►
//
//  Shows aggregated progress as a fill.
//  A collapse toggle ▶/▼ is rendered in the task list panel
//  (not here) — this component only renders the timeline bar.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { GanttBarContext } from '../types';
import { GanttBarBase } from '../bar-registry';

@Component({
  selector: 'g[ganttGroupBar]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-task-id]': 'ctx().row.task.id',
    '[attr.data-bar-type]': '"group"',
    'role': 'listitem',
    '[attr.aria-label]': 'ariaLabel()',
    '[class.gantt-bar-draggable]': 'interactive()',
  },
  template: `
    <!-- Main bar body (slightly thicker than task bars) -->
    <svg:rect
      class="gantt-group-bar"
      [attr.x]="geo().barX"
      [attr.y]="barY()"
      [attr.width]="barWidth()"
      [attr.height]="barHeight()"
      [attr.rx]="3"
      [attr.fill]="fill()"
      [attr.opacity]="0.9"
    />

    <!-- Progress fill -->
    @if (progress() > 0) {
      <svg:rect
        class="gantt-group-progress"
        [attr.x]="geo().barX"
        [attr.y]="barY()"
        [attr.width]="progressWidth()"
        [attr.height]="barHeight()"
        [attr.rx]="3"
        fill="rgba(0,0,0,0.2)"
        [attr.clip-path]="'url(#group-clip-' + taskId() + ')'"
      />
      <svg:defs>
        <svg:clipPath [attr.id]="'group-clip-' + taskId()">
          <svg:rect
            [attr.x]="geo().barX"
            [attr.y]="barY()"
            [attr.width]="barWidth()"
            [attr.height]="barHeight()"
            [attr.rx]="3"
          />
        </svg:clipPath>
      </svg:defs>
    }

    <!-- Left bracket cap -->
    <svg:polygon
      [attr.points]="leftCapPoints()"
      [attr.fill]="fill()"
    />

    <!-- Right bracket cap -->
    <svg:polygon
      [attr.points]="rightCapPoints()"
      [attr.fill]="fill()"
    />

    <!-- Label (above bar for groups, to avoid clipping with children) -->
    <svg:text
      class="gantt-group-label"
      [attr.x]="labelX()"
      [attr.y]="labelY()"
      [attr.fill]="theme().textPrimary"
      [attr.font-size]="theme().fontSize"
      [attr.font-family]="theme().fontFamily"
      [attr.font-weight]="'600'"
      dominant-baseline="central"
      style="pointer-events: none; user-select: none;"
    >{{ labelText() }}</svg:text>

    <!-- Selection outline -->
    @if (isSelected()) {
      <svg:rect
        fill="none"
        [attr.x]="geo().barX - 2"
        [attr.y]="barY() - 2"
        [attr.width]="barWidth() + 4"
        [attr.height]="barHeight() + 4"
        [attr.rx]="4"
        [attr.stroke]="theme().selectionBorder"
        stroke-width="1.5"
        stroke-dasharray="4 2"
      />
    }
  `,
  styles: [`
    .gantt-group-bar,
    polygon {
      cursor: default;
    }
    :host(.gantt-bar-draggable) .gantt-group-bar,
    :host(.gantt-bar-draggable) polygon {
      cursor: grab;
    }
    :host(.gantt-bar-draggable:active) .gantt-group-bar,
    :host(.gantt-bar-draggable:active) polygon {
      cursor: grabbing;
    }
    .gantt-group-bar:hover {
      opacity: 0.78 !important;
    }
  `],
})
export class GanttGroupBarComponent extends GanttBarBase {
  readonly ctx = input.required<GanttBarContext>();

  protected readonly geo    = computed(() => this.ctx().geometry);
  protected readonly theme  = computed(() => this.ctx().theme);
  protected readonly task   = computed(() => this.ctx().row.task);
  protected readonly taskId = computed(() => this.task().id);

  protected readonly interactive = computed(() => this.ctx().draggable !== false);

  protected readonly barHeight = computed(() =>
    Math.max(Math.round(this.geo().height * 0.45), 8)
  );
  protected readonly barY = computed(() =>
    this.geo().y + Math.round((this.geo().height - this.barHeight()) / 2)
  );
  protected readonly barWidth = computed(() =>
    Math.max(this.geo().barWidth, 4)
  );

  protected readonly progress = computed(() =>
    Math.min(Math.max(this.task().progress ?? 0, 0), 100)
  );
  protected readonly progressWidth = computed(() =>
    (this.barWidth() * this.progress()) / 100
  );

  protected readonly fill = computed(() =>
    this.task().barColor ?? this.theme().barColor
  );

  /** ◄ left downward triangle cap */
  protected readonly leftCapPoints = computed(() => {
    const x = this.geo().barX;
    const y = this.barY();
    const h = this.barHeight();
    const drop = 5;
    return `${x},${y} ${x + drop},${y} ${x},${y + h + drop}`;
  });

  /** ► right downward triangle cap */
  protected readonly rightCapPoints = computed(() => {
    const x = this.geo().barX + this.barWidth();
    const y = this.barY();
    const h = this.barHeight();
    const drop = 5;
    return `${x},${y} ${x - drop},${y} ${x},${y + h + drop}`;
  });

  protected readonly isSelected = computed(() => this.ctx().isSelected ?? false);

  /** Label: centred on the bar */
  protected readonly labelX = computed(() =>
    this.geo().barX + this.barWidth() / 2
  );
  protected readonly labelY = computed(() =>
    this.barY() + this.barHeight() / 2
  );
  protected readonly labelText = computed(() => {
    const name = this.task().name;
    const maxChars = Math.floor(this.barWidth() / 7) - 2;
    return name.length > maxChars ? name.slice(0, maxChars) + '…' : name;
  });

  protected readonly ariaLabel = computed(() =>
    `Group: ${this.task().name}, ${this.progress()}% complete`
  );

  override get context(): GanttBarContext { return this.ctx(); }
}

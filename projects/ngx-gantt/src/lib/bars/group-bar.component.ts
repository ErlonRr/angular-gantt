// ─────────────────────────────────────────────────────────────
//  ngx-gantt · bars/group-bar.component.ts
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
  NO_ERRORS_SCHEMA,
} from '@angular/core';
import { GanttBarContext } from '../types';
import { GanttBarBase } from '../bar-registry';

@Component({
  selector: 'g[ganttGroupBar]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA],
  host: {
    '[attr.data-task-id]': 'ctx().row.task.id',
    '[attr.data-bar-type]': '"group"',
    'role': 'listitem',
    '[attr.aria-label]': 'ariaLabel()',
  },
  template: `
    <!-- Main bar body (slightly thicker than task bars) -->
    <rect
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
      <rect
        class="gantt-group-progress"
        [attr.x]="geo().barX"
        [attr.y]="barY()"
        [attr.width]="progressWidth()"
        [attr.height]="barHeight()"
        [attr.rx]="3"
        fill="rgba(0,0,0,0.2)"
        [attr.clip-path]="'url(#group-clip-' + taskId() + ')'"
      />
      <defs>
        <clipPath [attr.id]="'group-clip-' + taskId()">
          <rect
            [attr.x]="geo().barX"
            [attr.y]="barY()"
            [attr.width]="barWidth()"
            [attr.height]="barHeight()"
            [attr.rx]="3"
          />
        </clipPath>
      </defs>
    }

    <!-- Left bracket cap -->
    <polygon
      [attr.points]="leftCapPoints()"
      [attr.fill]="fill()"
    />

    <!-- Right bracket cap -->
    <polygon
      [attr.points]="rightCapPoints()"
      [attr.fill]="fill()"
    />

    <!-- Label (above bar for groups, to avoid clipping with children) -->
    <text
      class="gantt-group-label"
      [attr.x]="labelX()"
      [attr.y]="labelY()"
      [attr.fill]="theme().textPrimary"
      [attr.font-size]="theme().fontSize"
      [attr.font-family]="theme().fontFamily"
      [attr.font-weight]="'600'"
      dominant-baseline="central"
      style="pointer-events: none; user-select: none;"
    >{{ labelText() }}</text>

    <!-- Selection outline -->
    @if (isSelected()) {
      <rect
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
    .gantt-group-bar {
      cursor: pointer;
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

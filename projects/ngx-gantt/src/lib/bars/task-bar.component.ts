// ─────────────────────────────────────────────────────────────
//  ngx-gantt · bars/task-bar.component.ts
//
//  Standard task bar:
//    ┌──────────────────────────────┐
//    │███████████░░░░░░  Task name  │   (progress fill + label)
//    └──────────────────────────────┘
//    └──────────────────────────────┘   baseline bar (below, opt.)
//
//  All coordinates come from GanttBarContext.geometry.
//  The component only renders — no layout logic here.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  NO_ERRORS_SCHEMA,
} from '@angular/core';
import { GanttBarContext } from '../types';
import { GanttBarBase } from '../bar-registry';

@Component({
  selector: 'g[ganttTaskBar]',   // attribute selector → renders as <g> in SVG
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA],
  host: {
    '[attr.data-task-id]': 'ctx().row.task.id',
    '[attr.data-bar-type]': '"task"',
    'role': 'listitem',
    '[attr.aria-label]': 'ariaLabel()',
  },
  template: `
    <!-- Row background highlight (selected state) -->
    @if (isSelected()) {
      <rect
        [attr.x]="0"
        [attr.y]="geo().y"
        [attr.width]="'100%'"
        [attr.height]="geo().height"
        [attr.fill]="theme().selectionBg"
        [attr.opacity]="0.18"
      />
    }

    <!-- Bar body -->
    <rect
      class="gantt-bar-bg"
      [attr.x]="geo().barX"
      [attr.y]="barY()"
      [attr.width]="barWidth()"
      [attr.height]="barHeight()"
      [attr.rx]="barRadius()"
      [attr.fill]="barFill()"
      [attr.stroke]="isCritical() ? theme().criticalColor : 'none'"
      [attr.stroke-width]="isCritical() ? 1.5 : 0"
    />

    <!-- Progress fill -->
    @if (progress() > 0) {
      <rect
        class="gantt-bar-progress"
        [attr.x]="geo().barX"
        [attr.y]="barY()"
        [attr.width]="progressWidth()"
        [attr.height]="barHeight()"
        [attr.rx]="barRadius()"
        [attr.fill]="progressFill()"
        [attr.clip-path]="'url(#bar-clip-' + taskId() + ')'"
      />
    }

    <!-- Clip path so progress doesn't overflow rounded corners -->
    <defs>
      <clipPath [attr.id]="'bar-clip-' + taskId()">
        <rect
          [attr.x]="geo().barX"
          [attr.y]="barY()"
          [attr.width]="barWidth()"
          [attr.height]="barHeight()"
          [attr.rx]="barRadius()"
        />
      </clipPath>
    </defs>

    <!-- Resize handle — left -->
    @if (enableResize()) {
      <rect
        class="gantt-resize-handle gantt-resize-left"
        [attr.x]="geo().barX"
        [attr.y]="barY()"
        [attr.width]="6"
        [attr.height]="barHeight()"
        [attr.rx]="barRadius()"
        fill="transparent"
        style="cursor: ew-resize"
      />
    }

    <!-- Resize handle — right -->
    @if (enableResize()) {
      <rect
        class="gantt-resize-handle gantt-resize-right"
        [attr.x]="geo().barX + barWidth() - 6"
        [attr.y]="barY()"
        [attr.width]="6"
        [attr.height]="barHeight()"
        [attr.rx]="barRadius()"
        fill="transparent"
        style="cursor: ew-resize"
      />
    }

    <!-- Label inside bar (only if bar is wide enough) -->
    @if (showLabel()) {
      <text
        class="gantt-bar-label"
        [attr.x]="labelX()"
        [attr.y]="labelY()"
        [attr.fill]="theme().barTextColor"
        [attr.font-size]="theme().fontSize"
        [attr.font-family]="theme().fontFamily"
        text-anchor="middle"
        dominant-baseline="central"
        style="pointer-events: none; user-select: none;"
      >{{ labelText() }}</text>
    }

    <!-- Baseline bar (planned vs actual) -->
    @if (showBaseline()) {
      <rect
        class="gantt-baseline"
        [attr.x]="baselineX()"
        [attr.y]="baselineY()"
        [attr.width]="baselineWidth()"
        [attr.height]="4"
        [attr.rx]="2"
        [attr.fill]="theme().baselineColor"
        [attr.opacity]="0.7"
      />
    }
  `,
  styles: [`
    :host { cursor: grab; }
    :host:active { cursor: grabbing; }

    .gantt-bar-bg {
      transition: opacity 0.15s;
    }
    .gantt-bar-bg:hover {
      opacity: 0.88;
    }

    /* animate.enter applied by parent canvas via Angular 20.2 API */
    @keyframes bar-enter {
      from { opacity: 0; transform: scaleX(0.88); transform-origin: left center; }
      to   { opacity: 1; transform: scaleX(1); }
    }
    @keyframes bar-enter-reduced {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @media (prefers-reduced-motion: no-preference) {
      .gantt-bar-enter { animation: bar-enter 0.22s ease-out; }
    }
    @media (prefers-reduced-motion: reduce) {
      .gantt-bar-enter { animation: bar-enter-reduced 0.12s ease-out; }
    }
  `],
})
export class GanttTaskBarComponent extends GanttBarBase {
  // ── Input (Angular 20 signal input) ──────────────────────────
  readonly ctx = input.required<GanttBarContext>();

  // ── Convenience computed aliases ─────────────────────────────
  protected readonly geo      = computed(() => this.ctx().geometry);
  protected readonly theme    = computed(() => this.ctx().theme);
  protected readonly task     = computed(() => this.ctx().row.task);
  protected readonly taskId   = computed(() => this.task().id);

  // ── Geometry ─────────────────────────────────────────────────
  protected readonly barHeight = computed(() =>
    this.geo().height - 8   // 4px margin top + bottom
  );
  protected readonly barY = computed(() =>
    this.geo().y + 4
  );
  protected readonly barWidth = computed(() =>
    Math.max(this.geo().barWidth, 2)  // minimum 2px — always visible
  );
  protected readonly barRadius = computed(() => {
    const r = parseInt(this.theme().barRadius ?? '4', 10);
    return Math.min(r, this.barHeight() / 2);
  });

  // ── Progress ─────────────────────────────────────────────────
  protected readonly progress = computed(() =>
    Math.min(Math.max(this.task().progress ?? 0, 0), 100)
  );
  protected readonly progressWidth = computed(() =>
    Math.max((this.barWidth() * this.progress()) / 100, 0)
  );

  // ── Colors ───────────────────────────────────────────────────
  protected readonly barFill = computed(() =>
    this.isCritical()
      ? this.theme().criticalColor
      : (this.task().barColor ?? this.theme().barColor)
  );
  protected readonly progressFill = computed(() => {
    // Darken the bar color slightly for the progress fill
    return this.isCritical() ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.22)';
  });

  // ── State ─────────────────────────────────────────────────────
  protected readonly isCritical  = computed(() => this.ctx().isCritical  ?? false);
  protected readonly isSelected  = computed(() => this.ctx().isSelected  ?? false);
  protected readonly enableResize = computed(() => this.ctx().enableResize ?? true);

  // ── Label ─────────────────────────────────────────────────────
  private readonly MIN_LABEL_WIDTH = 40; // px — don't show label if bar is too narrow

  protected readonly showLabel = computed(() =>
    this.barWidth() >= this.MIN_LABEL_WIDTH
  );
  protected readonly labelText = computed(() => {
    const name = this.task().name;
    // Truncate if bar is narrow (rough char estimate: 7px/char)
    const maxChars = Math.floor(this.barWidth() / 7) - 2;
    return name.length > maxChars ? name.slice(0, maxChars) + '…' : name;
  });
  protected readonly labelX = computed(() =>
    this.geo().barX + this.barWidth() / 2
  );
  protected readonly labelY = computed(() =>
    this.barY() + this.barHeight() / 2
  );

  // ── Baseline ─────────────────────────────────────────────────
  protected readonly showBaseline = computed(() =>
    !!(this.ctx().showBaseline && this.task().baseline)
  );
  protected readonly baselineX = computed(() => {
    const baseline = this.task().baseline;
    if (!baseline) return 0;
    const { origin, pxPerDay } = this.ctx().layoutParams;
    return Math.round((baseline.start.getTime() - origin.getTime()) / 86_400_000 * pxPerDay);
  });
  protected readonly baselineWidth = computed(() => {
    const baseline = this.task().baseline;
    if (!baseline) return 0;
    const { pxPerDay } = this.ctx().layoutParams;
    const days = (baseline.end.getTime() - baseline.start.getTime()) / 86_400_000;
    return Math.max(Math.round(days * pxPerDay), 2);
  });
  protected readonly baselineY = computed(() =>
    this.geo().y + this.geo().height - 6  // bottom of row
  );

  // ── Accessibility ─────────────────────────────────────────────
  protected readonly ariaLabel = computed(() => {
    const t = this.task();
    const p = this.progress();
    return `${t.name}, ${p}% complete`;
  });

  // ── Abstract implementation ───────────────────────────────────
  override get context(): GanttBarContext { return this.ctx(); }
}

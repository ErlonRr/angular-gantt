// ─────────────────────────────────────────────────────────────
//  gantry · bars/task-bar.component.ts
//
//  Standard task bar:
//    ┌──────────────────────────────┐
//    │███████████░░░░░░  Task name  │   (progress fill + label)
//    └──────────────────────────────┘
//    ······························   planned baseline (dashed, below bar)
//
//  All coordinates come from GanttBarContext.geometry.
//  The component only renders — no layout logic here.
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
  selector: 'g[ganttTaskBar]',   // attribute selector → renders as <g> in SVG
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-task-id]': 'ctx().row.task.id',
    '[attr.data-bar-type]': '"task"',
    'role': 'listitem',
    '[attr.aria-label]': 'ariaLabel()',
    '[class.gantt-bar-draggable]': 'interactive()',
  },
  template: `
    <!-- Row background highlight (selected state) -->
    @if (isSelected()) {
      <svg:rect
        [attr.x]="0"
        [attr.y]="geo().y"
        [attr.width]="'100%'"
        [attr.height]="geo().height"
        [attr.fill]="theme().selectionBg"
        [attr.opacity]="0.18"
      />
    }

    <!-- Bar body -->
    <svg:rect
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
      <svg:rect
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
    <svg:defs>
      <svg:clipPath [attr.id]="'bar-clip-' + taskId()">
        <svg:rect
          [attr.x]="geo().barX"
          [attr.y]="barY()"
          [attr.width]="barWidth()"
          [attr.height]="barHeight()"
          [attr.rx]="barRadius()"
        />
      </svg:clipPath>
    </svg:defs>

    <!-- Resize handle — left -->
    @if (enableResize()) {
      <svg:rect
        class="gantt-resize-handle gantt-resize-left"
        [attr.x]="geo().barX"
        [attr.y]="barY()"
        [attr.width]="6"
        [attr.height]="barHeight()"
        [attr.rx]="barRadius()"
        fill="transparent"
        [style.cursor]="resizeCursor()"
      />
    }

    <!-- Resize handle — right -->
    @if (enableResize()) {
      <svg:rect
        class="gantt-resize-handle gantt-resize-right"
        [attr.x]="geo().barX + barWidth() - 6"
        [attr.y]="barY()"
        [attr.width]="6"
        [attr.height]="barHeight()"
        [attr.rx]="barRadius()"
        fill="transparent"
        [style.cursor]="resizeCursor()"
      />
    }

    <!-- Label inside bar (only if bar is wide enough) -->
    @if (showLabel()) {
      <svg:text
        class="gantt-bar-label"
        [attr.x]="labelX()"
        [attr.y]="labelY()"
        [attr.fill]="theme().barTextColor"
        [attr.font-size]="theme().fontSize"
        [attr.font-family]="theme().fontFamily"
        text-anchor="middle"
        dominant-baseline="central"
        style="pointer-events: none; user-select: none;"
      >{{ labelText() }}</svg:text>
    }

    <!-- Planned baseline (dashed rail — below the bar, no overlap with the task body) -->
    @if (showBaseline()) {
      <svg:line
        class="gantt-baseline"
        [attr.x1]="baselineX()"
        [attr.y1]="baselineLineY()"
        [attr.x2]="baselineX() + baselineWidth()"
        [attr.y2]="baselineLineY()"
        [attr.stroke]="theme().baselineColor"
        stroke-width="2"
        stroke-dasharray="5 4"
        stroke-linecap="round"
        fill="none"
        opacity="0.88"
      />
    }
  `,
  styles: [`
    :host { cursor: default; }

    :host(.gantt-bar-draggable) .gantt-bar-bg,
    :host(.gantt-bar-draggable) .gantt-bar-progress {
      cursor: grab;
    }
    :host(.gantt-bar-draggable:active) .gantt-bar-bg,
    :host(.gantt-bar-draggable:active) .gantt-bar-progress {
      cursor: grabbing;
    }

    .gantt-bar-bg {
      transition: opacity 0.15s;
    }
    .gantt-bar-bg:hover {
      opacity: 0.88;
    }

    .gantt-baseline {
      pointer-events: none;
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

  /** Grab/grabbing only when this row may be dragged (global + per-task `draggable`). */
  protected readonly interactive = computed(() => this.ctx().draggable !== false);

  protected readonly resizeCursor = computed(() =>
    this.interactive() ? 'ew-resize' : 'default'
  );

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
  /** Y of the baseline stroke: in the bottom margin, fully below the main bar (bar bottom = geo.y + height - 4). */
  protected readonly baselineLineY = computed(() =>
    this.geo().y + this.geo().height - 2
  );

  // ── Accessibility ─────────────────────────────────────────────
  protected readonly ariaLabel = computed(() => {
    const t = this.task();
    const p = this.progress();
    const baselineHint =
      this.showBaseline() ? ', planned baseline shown' : '';
    return `${t.name}, ${p}% complete${baselineHint}`;
  });

  // ── Abstract implementation ───────────────────────────────────
  override get context(): GanttBarContext { return this.ctx(); }
}

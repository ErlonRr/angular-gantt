// Tooltip content of your own: an `<ng-template ganttTooltip>` inside `<gantry>` (it wins over
// `options.tooltip.render`), opened on hover, on keyboard focus or both (`tooltip.trigger`).
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent, GanttTooltipTemplateDirective } from '@gantryjs/angular';
import {
  TOOLTIP_INITIAL,
  TOOLTIP_TRIGGERS,
  tooltipContent,
  tooltipOptions,
  tooltipTasks,
  type TooltipTrigger,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-tooltip-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent, GanttTooltipTemplateDirective],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="tooltip-trigger-label">Trigger</span>
          <div class="gs-seg" role="group" aria-labelledby="tooltip-trigger-label">
            @for (t of triggers; track t.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="trigger() === t.value"
                (click)="trigger.set(t.value)"
              >
                {{ t.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <gantry class="gs-chart gs-case-chart" [series]="tasks" [options]="options()" [darkMode]="dark()">
        <!-- The chart keeps the box, its placement and timing; the template fills it -->
        <ng-template ganttTooltip let-task="task">
          @let c = content(task);
          <div class="tip">
            <strong>{{ c.title }}</strong>
            <dl>
              @for (line of c.lines; track line.label) {
                <dt>{{ line.label }}</dt>
                <dd>{{ line.value }}</dd>
              }
            </dl>
            <!-- The text below says the same -->
            <span class="tip-meter" aria-hidden="true"><span [style.width.%]="c.progress"></span></span>
            <span>{{ c.progress }} % done</span>
          </div>
        </ng-template>
      </gantry>
      <p class="gs-case-hint">
        Rest the pointer on a bar, or Tab to the bars and move with ↑ and ↓; Escape closes the tooltip.
      </p>
    </div>
  `,
  styles: `
    .tip {
      display: grid;
      gap: 6px;
      min-width: 180px;
    }
    .tip strong {
      font-size: 13px;
    }
    .tip dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px 12px;
      margin: 0;
    }
    .tip dt {
      opacity: 0.75;
    }
    .tip dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
    }
    .tip-meter {
      height: 6px;
      border-radius: 3px;
      background: var(--gantt-grid-line);
      overflow: hidden;
    }
    .tip-meter > span {
      display: block;
      height: 100%;
      background: var(--gantt-bar);
    }
  `,
})
export class TooltipExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly triggers = TOOLTIP_TRIGGERS;
  protected readonly tasks = tooltipTasks(new Date());
  /** What the template shows for a task (a pure function: the chart decides when to render it) */
  protected readonly content = tooltipContent;

  protected readonly trigger = signal<TooltipTrigger>(TOOLTIP_INITIAL);
  protected readonly options = computed(() => tooltipOptions(this.trigger()));
}

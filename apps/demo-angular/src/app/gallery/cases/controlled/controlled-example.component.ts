// The app owns the tasks (`editing.controlled`): the chart proposes each change in `(beforeChange)`,
// where `preventDefault()` vetoes it, and `(tasksChange)` carries the proposed tasks, which the app
// sets itself (`tasks.set($event.tasks)` → `[series]`). The chart applies nothing and keeps no history.
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GantryComponent, type GanttBeforeChangeEvent } from '@gantryjs/angular';
import { CONTROLLED_INITIAL, CONTROLLED_OPTIONS, controlledDecision, controlledTasks, pushLog } from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-controlled-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <label class="gs-switch gs-case-control">
          <span>Lock finished tasks</span>
          <input type="checkbox" role="switch" [checked]="lockDone()" (change)="lockDone.set(lock.checked)" #lock />
        </label>
        <button type="button" class="gs-btn gs-btn--sm" (click)="tasks.set(initial)">Reset</button>
      </div>

      <gantry
        class="gs-chart gs-case-chart"
        [series]="tasks()"
        [options]="options"
        [darkMode]="dark()"
        (beforeChange)="decide($event)"
        (tasksChange)="tasks.set($event.tasks)"
      />
      <ol class="gs-case-log" aria-label="Decisions">
        @for (line of log(); track $index) {
          <li>{{ line }}</li>
        }
      </ol>
    </div>
  `,
})
export class ControlledExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly options = CONTROLLED_OPTIONS;

  /** The plan as it was, built once: Reset sets it again */
  protected readonly initial = controlledTasks(new Date());
  /** The app's tasks: the chart shows them and proposes each change to them */
  protected readonly tasks = signal(this.initial);
  protected readonly lockDone = signal(CONTROLLED_INITIAL.lockDone);
  protected readonly log = signal<string[]>([]);

  /** The app's rule, synchronously: veto any change to a finished task while the lock is on */
  protected decide(detail: GanttBeforeChangeEvent): void {
    const { veto, line } = controlledDecision(detail, this.lockDone());
    if (veto) detail.preventDefault();
    this.log.update(log => pushLog(log, line));
  }
}

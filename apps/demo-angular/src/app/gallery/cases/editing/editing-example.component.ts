// Bars you drag, resize, set the progress of (the grip, or ↑ / ↓ in move mode) and undo: `[(series)]`
// gets the edited tasks back, the buttons call `undo()` / `redo()` on the component (`viewChild`) and
// follow its `canUndo()` / `canRedo()` signals (`aria-disabled`, not `disabled`: an unavailable button
// keeps focus), and `(tasksChange)` feeds the log of the last changes.
import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { GantryComponent, type GanttTasksChangeEvent } from '@gantryjs/angular';
import { EDITING_OPTIONS, describeTasksChange, editingTasks, pushLog } from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-editing-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <button
          id="editing-undo"
          type="button"
          class="gs-btn gs-btn--sm"
          [attr.aria-disabled]="chart().canUndo() ? null : 'true'"
          (click)="chart().canUndo() && chart().undo()"
        >
          Undo
        </button>
        <button
          id="editing-redo"
          type="button"
          class="gs-btn gs-btn--sm"
          [attr.aria-disabled]="chart().canRedo() ? null : 'true'"
          (click)="chart().canRedo() && chart().redo()"
        >
          Redo
        </button>
      </div>

      <gantry
        class="gs-chart gs-case-chart"
        [(series)]="tasks"
        [options]="options"
        [darkMode]="dark()"
        (tasksChange)="logChange($event)"
      />
      <!-- Not a live region: the chart announces each change itself -->
      <ol class="gs-case-log" aria-label="Last changes">
        @for (line of log(); track $index) {
          <li>{{ line }}</li>
        }
      </ol>
    </div>
  `,
})
export class EditingExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly chart = viewChild.required(GantryComponent);

  protected readonly options = EDITING_OPTIONS;
  // Each accepted edit writes the new array here (`[(series)]`), and undo / redo write it again
  protected readonly tasks = signal(editingTasks(new Date()));
  protected readonly log = signal<string[]>([]);

  protected logChange(event: GanttTasksChangeEvent): void {
    this.log.update(log => pushLog(log, describeTasksChange(event, event.tasks)));
  }
}

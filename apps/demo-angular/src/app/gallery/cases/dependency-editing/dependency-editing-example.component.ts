// Links drawn and removed in the chart (`editing.dependencies`): from a connector, with two clicks or
// with L and Enter; Delete removes the selected link. `parentChild` allows links between a task and
// its own parent. Each accepted change arrives in `(tasksChange)` and goes to the log.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent, type GanttTasksChangeEvent } from '@gantryjs/angular';
import {
  DEPENDENCY_EDITING_INITIAL,
  LINK_KEYS,
  dependencyEditingOptions,
  dependencyEditingTasks,
  describeTasksChange,
  pushLog,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-dependency-editing-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <label class="gs-switch gs-case-control">
          <span>Parent–child links</span>
          <input
            id="dependency-editing-parent-child"
            type="checkbox"
            role="switch"
            [checked]="parentChild()"
            (change)="parentChild.set(box.checked)"
            #box
          />
        </label>
      </div>

      <gantry
        class="gs-chart gs-case-chart"
        [series]="tasks"
        [options]="options()"
        [darkMode]="dark()"
        (tasksChange)="logChange($event)"
      />
      <dl class="gs-case-keys">
        @for (k of keys; track $index) {
          <dt>
            @for (key of k.keys; track $index) {
              <kbd class="gs-kbd">{{ key }}</kbd>
            }
          </dt>
          <dd>{{ k.action }}</dd>
        }
      </dl>
      <!-- Not a live region: the chart announces each change itself -->
      <ol class="gs-case-log" aria-label="Last changes">
        @for (line of log(); track $index) {
          <li>{{ line }}</li>
        }
      </ol>
    </div>
  `,
})
export class DependencyEditingExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly keys = LINK_KEYS;
  // Uncontrolled: the chart keeps the links you draw (`[(series)]` would also write them back here)
  protected readonly tasks = dependencyEditingTasks(new Date());

  protected readonly parentChild = signal(DEPENDENCY_EDITING_INITIAL.parentChild);
  protected readonly options = computed(() => dependencyEditingOptions(this.parentChild()));
  protected readonly log = signal<string[]>([]);

  protected logChange(event: GanttTasksChangeEvent): void {
    this.log.update(log => pushLog(log, describeTasksChange(event, event.tasks)));
  }
}

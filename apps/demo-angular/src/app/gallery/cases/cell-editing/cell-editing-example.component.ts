// The built-in cell editors (`editing`, whose `cells` is on unless set to false) in the task list
// beside the chart, or as a table (`view`). The chart keeps the edits by itself: `[series]` is one-way.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  CELL_EDITING_HINT,
  CELL_EDITING_INITIAL,
  CELL_EDITING_KEYS,
  CELL_EDITING_VIEWS,
  cellEditingOptions,
  cellEditingTasks,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-cell-editing-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="cell-editing-view-label">View</span>
          <div class="gs-seg" role="group" aria-labelledby="cell-editing-view-label">
            @for (v of views; track v.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="view() === v.value"
                (click)="view.set(v.value)"
              >
                {{ v.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <gantry class="gs-chart gs-case-chart" [series]="tasks" [options]="options()" [darkMode]="dark()" />
      <p class="gs-case-hint">{{ hint }}</p>
      <dl class="gs-case-keys">
        @for (k of keys; track k.action) {
          <dt>
            @for (key of k.keys; track key) {
              <kbd class="gs-kbd">{{ key }}</kbd>
            }
          </dt>
          <dd>{{ k.action }}</dd>
        }
      </dl>
    </div>
  `,
})
export class CellEditingExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly views = CELL_EDITING_VIEWS;
  protected readonly keys = CELL_EDITING_KEYS;
  protected readonly hint = CELL_EDITING_HINT;
  protected readonly tasks = cellEditingTasks(new Date());

  protected readonly view = signal(CELL_EDITING_INITIAL.view);
  // New options keep the tasks, edits included
  protected readonly options = computed(() => cellEditingOptions(this.view()));
}

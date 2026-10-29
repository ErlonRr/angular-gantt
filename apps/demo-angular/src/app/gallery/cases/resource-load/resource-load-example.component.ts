// A resource view (`rows`): one row per person and team, drawing the daily load against the capacity line,
// the part above it hatched. `resources` holds the people, each task's `resources` the assignments.
// `(stateChange)` brings the toolbar's Rows toggle and zoom back to the controls.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent, type GanttState } from '@gantryjs/angular';
import {
  LOAD_SCALES,
  RESOURCE_LOAD_HINT,
  RESOURCE_LOAD_INITIAL,
  RESOURCE_ROWS,
  loadOptions,
  loadResources,
  loadTasks,
  overloadSummary,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-resource-load-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="resource-load-rows-label">Rows</span>
          <div id="resource-load-rows" class="gs-seg" role="group" aria-labelledby="resource-load-rows-label">
            @for (r of rowChoices; track r.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="rows() === r.value"
                (click)="rows.set(r.value)"
              >
                {{ r.label }}
              </button>
            }
          </div>
        </div>
        <div class="gs-case-control">
          <span id="resource-load-scale-label">Scale</span>
          <div id="resource-load-scale" class="gs-seg" role="group" aria-labelledby="resource-load-scale-label">
            @for (s of scaleChoices; track s.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="viewMode() === s.value"
                (click)="viewMode.set(s.value)"
              >
                {{ s.label }}
              </button>
            }
          </div>
        </div>
        <label class="gs-switch gs-case-control">
          <span>Show unassigned</span>
          <input
            id="resource-load-unassigned"
            type="checkbox"
            role="switch"
            [checked]="unassigned()"
            (change)="unassigned.set(unassignedBox.checked)"
            #unassignedBox
          />
        </label>
        <label class="gs-switch gs-case-control">
          <span>Highlight over-allocation</span>
          <input
            id="resource-load-over"
            type="checkbox"
            role="switch"
            [checked]="overallocation()"
            (change)="overallocation.set(overBox.checked)"
            #overBox
          />
        </label>
      </div>

      <gantry
        class="gs-chart gs-case-chart"
        [series]="tasks"
        [resources]="resources"
        [options]="options()"
        [darkMode]="dark()"
        (stateChange)="follow($event)"
      />
      <p class="gs-case-status">{{ summary() }}</p>
      <p class="gs-case-hint">{{ hint }}</p>
    </div>
  `,
})
export class ResourceLoadExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly rowChoices = RESOURCE_ROWS;
  protected readonly scaleChoices = LOAD_SCALES;
  protected readonly hint = RESOURCE_LOAD_HINT;

  private readonly now = new Date();
  protected readonly tasks = loadTasks(this.now);
  protected readonly resources = loadResources();

  protected readonly rows = signal(RESOURCE_LOAD_INITIAL.rows);
  protected readonly viewMode = signal(RESOURCE_LOAD_INITIAL.viewMode);
  protected readonly unassigned = signal(RESOURCE_LOAD_INITIAL.unassigned);
  protected readonly overallocation = signal(RESOURCE_LOAD_INITIAL.overallocation);
  protected readonly options = computed(() =>
    loadOptions(
      {
        rows: this.rows(),
        viewMode: this.viewMode(),
        unassigned: this.unassigned(),
        overallocation: this.overallocation(),
      },
      this.now,
    ),
  );
  protected readonly summary = computed(() => overloadSummary(this.tasks, this.resources, this.options()));

  /** The chart's own toolbar switches the rows and the zoom too */
  protected follow(state: GanttState): void {
    if (state.rows) this.rows.set(state.rows);
    if (state.viewMode) this.viewMode.set(state.viewMode);
  }
}

// The plan with an editable Resources column and, synchronised below it, the workload of the same
// tasks (`rows: 'resources'`): one `createGanttSyncGroup()` in both charts' `[syncGroup]`, one `tasks`
// signal that `[(series)]` fills after each edit and the second chart reads.
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent, createGanttSyncGroup } from '@gantryjs/angular';
import {
  PANEL_HINT,
  PANEL_INITIAL,
  overloadSummary,
  panelBottomOptions,
  panelResources,
  panelTasks,
  panelTopOptions,
  type PanelState,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-resource-panel-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <label class="gs-switch gs-case-control">
          <span>Show unassigned</span>
          <input
            id="resource-panel-unassigned"
            type="checkbox"
            role="switch"
            [checked]="state().unassigned"
            (change)="state.set({ unassigned: unassigned.checked })"
            #unassigned
          />
        </label>
      </div>

      <div class="gs-case-stack">
        <div>
          <p class="gs-case-caption">Plan</p>
          <gantry
            class="gs-chart gs-case-chart"
            [(series)]="tasks"
            [resources]="resources"
            [options]="topOptions"
            [syncGroup]="group"
            [darkMode]="dark()"
          />
        </div>
        <div>
          <p class="gs-case-caption">Workload</p>
          <!-- Only the plan shows its toolbar: its zoom reaches the workload through the group -->
          <gantry
            class="gs-chart gs-case-chart"
            [series]="tasks()"
            [resources]="resources"
            [options]="bottomOptions()"
            [syncGroup]="group"
            [showToolbar]="false"
            [darkMode]="dark()"
          />
        </div>
      </div>
      <p class="gs-case-status">{{ summary() }}</p>
      <p class="gs-case-hint">{{ hint }}</p>
    </div>
  `,
})
export class ResourcePanelExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly hint = PANEL_HINT;

  /** One group per component (each chart joins it on render and leaves it when destroyed) */
  protected readonly group = createGanttSyncGroup();

  protected readonly resources = panelResources();
  protected readonly topOptions = panelTopOptions();
  // Each accepted edit of the plan writes the new array here (`[(series)]`)
  protected readonly tasks = signal(panelTasks(new Date()));
  protected readonly state = signal<PanelState>(PANEL_INITIAL);
  protected readonly bottomOptions = computed(() => panelBottomOptions(this.state()));
  protected readonly summary = computed(() => overloadSummary(this.tasks(), this.resources, this.bottomOptions()));
}

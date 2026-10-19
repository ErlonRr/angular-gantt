// A three-level task tree (`parentId`). The buttons call `expandAll()` / `collapseAll()` on the
// component (`viewChild`), and `[(viewMode)]` keeps the zoom level in a signal: in Angular,
// `(viewModeChange)` emits the level name.
import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import { TREE_ACTIONS, TREE_OPTIONS, TREE_VIEW_MODE, treeTasks } from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-tree-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        @for (action of actions; track action.method) {
          <button type="button" class="gs-btn gs-btn--sm" (click)="chart()[action.method]()">
            {{ action.label }}
          </button>
        }
      </div>

      <gantry
        class="gs-chart gs-case-chart"
        [series]="tasks"
        [options]="options"
        [(viewMode)]="zoom"
        [darkMode]="dark()"
      />
      <p class="gs-case-hint">Zoom level: {{ zoom() }}</p>
    </div>
  `,
})
export class TreeExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly chart = viewChild.required(GantryComponent);

  protected readonly actions = TREE_ACTIONS;
  protected readonly options = TREE_OPTIONS;
  protected readonly tasks = treeTasks(new Date());
  protected readonly zoom = signal<string | undefined>(TREE_VIEW_MODE);
}

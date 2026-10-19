// Parents that start collapsed (`groupBar.collapsed`) and roll up the dates and the progress of their
// children (`rollup`). The buttons call `expandAll()` / `collapseAll()` on the component (`viewChild`).
import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import { ONLY_PARENTS_INITIAL_ROLLUP, TREE_ACTIONS, onlyParentsOptions, onlyParentsTasks } from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-only-parents-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <label class="gs-switch gs-case-control">
          <span>Roll up children</span>
          <input type="checkbox" role="switch" [checked]="rollup()" (change)="rollup.set(box.checked)" #box />
        </label>
        @for (action of actions; track action.method) {
          <button type="button" class="gs-btn gs-btn--sm" (click)="chart()[action.method]()">
            {{ action.label }}
          </button>
        }
      </div>

      <gantry class="gs-chart gs-case-chart" [series]="tasks" [options]="options()" [darkMode]="dark()" />
    </div>
  `,
})
export class OnlyParentsExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly chart = viewChild.required(GantryComponent);

  protected readonly actions = TREE_ACTIONS;
  protected readonly tasks = onlyParentsTasks(new Date());

  // Without the rollup the parents keep their own dates and progress
  protected readonly rollup = signal(ONLY_PARENTS_INITIAL_ROLLUP);
  protected readonly options = computed(() => onlyParentsOptions(this.rollup()));
}

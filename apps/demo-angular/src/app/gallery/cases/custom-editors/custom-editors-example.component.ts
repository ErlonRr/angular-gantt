// Cell editors of your own: Owner is a built-in `select`, Estimate a `number` editor with your own
// `validate`, and Colour an `<ng-template ganttCellEditor let-edit>` inside its `<ng-container
// ganttColumn>` (import `GanttCellEditorDirective`). The buttons call `editCell()` and `focusTask()`.
import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { GantryComponent, GanttCellEditorDirective, GanttColumnDefDirective } from '@gantryjs/angular';
import {
  CUSTOM_EDITORS_FIRST_TASK,
  CUSTOM_EDITORS_HINT,
  CUSTOM_EDITORS_MILESTONE,
  CUSTOM_EDITORS_OPTIONS,
  CUSTOM_EDITOR_COLUMNS,
  customEditorsTasks,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-custom-editors-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent, GanttColumnDefDirective, GanttCellEditorDirective],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <button type="button" class="gs-btn gs-btn--sm" (click)="chart().editCell(firstTask, 'estimate')">
          Edit first estimate
        </button>
        <button type="button" class="gs-btn gs-btn--sm" (click)="chart().focusTask(milestone)">Focus the launch</button>
      </div>

      <gantry
        class="gs-chart gs-case-chart"
        [series]="tasks"
        [columns]="columns"
        [options]="options"
        [darkMode]="dark()"
      >
        <!-- The shared Colour column keeps its label, cell and parse; the template adds its editor -->
        <ng-container ganttColumn="colour">
          <ng-template ganttCellEditor let-edit>
            <input
              #picker
              type="color"
              [value]="edit.value"
              [attr.aria-label]="edit.labels.ariaCellEditor('Colour', edit.row.task.name)"
              (input)="edit.setValue(picker.value)"
            />
          </ng-template>
        </ng-container>
      </gantry>
      <p class="gs-case-hint">{{ hint }}</p>
    </div>
  `,
})
export class CustomEditorsExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly chart = viewChild.required(GantryComponent);

  protected readonly columns = CUSTOM_EDITOR_COLUMNS;
  protected readonly options = CUSTOM_EDITORS_OPTIONS;
  protected readonly tasks = customEditorsTasks(new Date());
  protected readonly hint = CUSTOM_EDITORS_HINT;
  protected readonly firstTask = CUSTOM_EDITORS_FIRST_TASK;
  protected readonly milestone = CUSTOM_EDITORS_MILESTONE;
}

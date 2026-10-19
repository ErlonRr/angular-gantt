// Task-list cells from templates: an `<ng-template let-row>` inside an `<ng-container ganttColumn>`
// draws the cell of a `[columns]` entry with that key, which keeps its label, width and sort rule.
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GantryComponent, GanttColumnDefDirective } from '@gantryjs/angular';
import {
  CUSTOM_COLUMNS,
  CUSTOM_COLUMNS_OPTIONS,
  PRIORITY_LABELS,
  customColumnsTasks,
  initials,
  ownerOf,
  priorityOf,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-custom-columns-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent, GanttColumnDefDirective],
  template: `
    <div class="gs-case">
      <gantry
        class="gs-chart gs-case-chart"
        [series]="tasks"
        [columns]="columns"
        [options]="options"
        [darkMode]="dark()"
      >
        <ng-container ganttColumn="owner">
          <ng-template let-row>
            @let name = ownerOf(row);
            <span class="cell">
              <span class="avatar" aria-hidden="true">{{ initials(name) }}</span>
              <span class="ellipsis">{{ name }}</span>
            </span>
          </ng-template>
        </ng-container>
        <ng-container ganttColumn="priority">
          <ng-template let-row>
            @let level = priorityOf(row);
            <span class="badge" [attr.data-priority]="level">{{ priorityLabels[level] }}</span>
          </ng-template>
        </ng-container>
        <ng-container ganttColumn="meter">
          <ng-template let-row>
            @let value = row.task.progress ?? 0;
            <span class="cell">
              <span class="meter" aria-hidden="true"><span class="meter-fill" [style.width.%]="value"></span></span>
              <span class="value">{{ value }} %</span>
            </span>
          </ng-template>
        </ng-container>
      </gantry>
      <p class="gs-case-hint">Owner, Priority and Progress are cell templates; the Owner and Priority headers sort.</p>
    </div>
  `,
  styles: `
    .cell {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .avatar {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--gantt-bar);
      color: var(--gantt-bar-text-on-bar);
      font-size: 10px;
      font-weight: 700;
    }
    .ellipsis {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .badge {
      padding: 1px 8px;
      border: 1px solid var(--gantt-border);
      border-radius: 999px;
      color: var(--gantt-text-sec);
      font-size: 11.5px;
      font-weight: 600;
    }
    .badge[data-priority='high'] {
      border-color: var(--gantt-critical);
      background: var(--gantt-critical);
      color: var(--gantt-bar-text-on-critical);
    }
    .badge[data-priority='normal'] {
      border-color: var(--gantt-bar);
      background: var(--gantt-bar);
      color: var(--gantt-bar-text-on-bar);
    }
    .meter {
      flex: none;
      width: 56px;
      height: 6px;
      border-radius: 3px;
      background: var(--gantt-grid-line);
      overflow: hidden;
    }
    .meter-fill {
      display: block;
      height: 100%;
      background: var(--gantt-bar);
    }
    .value {
      font-variant-numeric: tabular-nums;
    }
    /* Forced colours drop the backgrounds: outline the avatar, paint the fill in a system colour */
    @media (forced-colors: active) {
      .avatar {
        border: 1px solid CanvasText;
      }
      .meter-fill {
        background: CanvasText;
      }
    }
  `,
})
export class CustomColumnsExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly columns = CUSTOM_COLUMNS;
  protected readonly options = CUSTOM_COLUMNS_OPTIONS;
  protected readonly tasks = customColumnsTasks(new Date());

  protected readonly initials = initials;
  protected readonly ownerOf = ownerOf;
  protected readonly priorityOf = priorityOf;
  protected readonly priorityLabels = PRIORITY_LABELS;
}

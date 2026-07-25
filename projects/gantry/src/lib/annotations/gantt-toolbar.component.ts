// ─────────────────────────────────────────────────────────────
//  gantry · annotations/gantt-toolbar.component.ts
//
//  Compact toolbar rendered above the header.
//  Provides:
//    - Zoom in / out buttons
//    - View mode pills (Day | Week | Month | Quarter | Year)
//    - "Today" scroll button
//    - Custom slot via ng-content for consumer controls
//
//  No animations module — transitions are pure CSS.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  inject,
} from '@angular/core';

import { ViewMode, GanttTheme } from '../types';
import { GanttI18nService } from '../services/gantt-i18n.service';

const VIEW_MODES: ViewMode[] = [
  ViewMode.Day,
  ViewMode.Week,
  ViewMode.Month,
  ViewMode.Quarter,
  ViewMode.Year,
];

@Component({
  selector:   'gantt-toolbar',
  standalone:  true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]':          '"flex"',
    '[style.align-items]':      '"center"',
    '[style.gap]':              '"8px"',
    '[style.padding]':          '"6px 12px"',
    '[style.background-color]': 'theme().headerBackground',
    '[style.border-bottom]':    '"1px solid " + theme().borderColor',
    '[style.flex-shrink]':      '"0"',
    '[style.flex-wrap]':        '"wrap"',
  },
  template: `
    <!-- Zoom controls -->
    <div [style.display]="'flex'" [style.gap]="'4px'">
      <button class="gantt-tb-btn" [style.color]="theme().textSecondary"
        [style.border-color]="theme().borderColor"
        [style.background]="theme().panelBg"
        [attr.title]="labels().zoomOut" (click)="zoomOut.emit()">−
      </button>
      <button class="gantt-tb-btn" [style.color]="theme().textSecondary"
        [style.border-color]="theme().borderColor"
        [style.background]="theme().panelBg"
        [attr.title]="labels().zoomIn" (click)="zoomIn.emit()">+
      </button>
    </div>

    <!-- Separator -->
    <div class="gantt-tb-sep" [style.background]="theme().borderColor"></div>

    <!-- View mode pills -->
    <div [style.display]="'flex'" [style.gap]="'2px'">
      @for (vm of viewModes; track vm) {
        <button
          class="gantt-tb-pill"
          [class.gantt-tb-pill--active]="currentView() === vm"
          [style.background]="currentView() === vm ? theme().barColor : 'transparent'"
          [style.color]="currentView() === vm ? '#fff' : theme().textSecondary"
          [style.border-color]="currentView() === vm ? theme().barColor : theme().borderColor"
          [style.font-family]="theme().fontFamily"
          (click)="viewModeChange.emit(vm)"
        >{{ labels().viewModes[vm] }}</button>
      }
    </div>

    <!-- Separator -->
    <div class="gantt-tb-sep" [style.background]="theme().borderColor"></div>

    <!-- Today button -->
    <button class="gantt-tb-btn"
      [style.color]="theme().todayColor"
      [style.border-color]="theme().todayColor + '66'"
      [style.background]="theme().panelBg"
      (click)="scrollToToday.emit()">
      ◎ {{ labels().todayButton }}
    </button>

    <!-- Consumer custom controls slot -->
    <ng-content />
  `,
  styles: [`
    .gantt-tb-btn {
      padding: 3px 10px;
      font-size: 12px;
      border: 1px solid;
      border-radius: 4px;
      cursor: pointer;
      line-height: 1.4;
      transition: opacity 0.12s;
    }
    .gantt-tb-btn:hover { opacity: 0.75; }

    .gantt-tb-pill {
      padding: 2px 8px;
      font-size: 11px;
      border: 1px solid;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
      line-height: 1.5;
    }
    .gantt-tb-pill:hover:not(.gantt-tb-pill--active) { opacity: 0.75; }

    .gantt-tb-sep {
      width: 1px;
      height: 18px;
      flex-shrink: 0;
      opacity: 0.6;
    }
  `],
})
export class GanttToolbarComponent {

  readonly theme       = input.required<GanttTheme>();
  readonly currentView = input<ViewMode>(ViewMode.Month);

  readonly zoomIn         = output<void>();
  readonly zoomOut        = output<void>();
  readonly viewModeChange = output<ViewMode>();
  readonly scrollToToday  = output<void>();

  protected readonly viewModes = VIEW_MODES;
  protected readonly labels = inject(GanttI18nService).labels;
}

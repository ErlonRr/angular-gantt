// ─────────────────────────────────────────────────────────────
//  gantry · annotations/gantt-toolbar.component.ts
//
//  Toolbar above the chart:
//    - Zoom in / out
//    - Zoom-level pills (built-in or custom `zoomLevels`)
//    - "Today" button
//    - Split / table / chart view switch
//    - Custom slot via ng-content for consumer controls
//  Every part can be hidden through `options.toolbar`.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { GanttZoomLevel, GanttView, ResolvedToolbar } from '@gantry/core';
import { GanttI18nService } from '../services/gantt-i18n.service';

@Component({
  selector: 'gantt-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'toolbar', '[attr.aria-label]': 'labels().ariaToolbar' },
  template: `
    <div class="gantt-toolbar">
      @if (toolbar().zoom) {
        <div class="gantt-tb-group">
          <button
            type="button"
            class="gantt-tb-btn"
            [title]="labels().zoomOut"
            [attr.aria-label]="labels().zoomOut"
            (click)="zoomOut.emit()"
          >
            −
          </button>
          <button
            type="button"
            class="gantt-tb-btn"
            [title]="labels().zoomIn"
            [attr.aria-label]="labels().zoomIn"
            (click)="zoomIn.emit()"
          >
            +
          </button>
        </div>
      }
      @if (pills().length) {
        <div class="gantt-tb-group">
          @for (pill of pills(); track pill.name) {
            <button
              type="button"
              class="gantt-tb-pill"
              [attr.aria-pressed]="pill.name === currentView()"
              (click)="viewModeChange.emit(pill.name)"
            >
              {{ pill.label }}
            </button>
          }
        </div>
      }
      @if (toolbar().today) {
        <div class="gantt-tb-group">
          <button type="button" class="gantt-tb-btn gantt-tb-today" (click)="scrollToToday.emit()">
            ◎ {{ labels().todayButton }}
          </button>
        </div>
      }
      <!-- gantt-tb-slot first (paint key): the other groups keep the Web Component's keys -->
      <div class="gantt-tb-slot gantt-tb-group"><ng-content /></div>
      @if (toolbar().viewToggle) {
        <div class="gantt-tb-group gantt-tb-views">
          @for (v of views(); track v.view) {
            <button
              type="button"
              class="gantt-tb-pill"
              [attr.aria-pressed]="v.view === view()"
              (click)="viewChange.emit(v.view)"
            >
              {{ v.label }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .gantt-toolbar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        padding: 6px 10px;
        background: var(--gantt-header-bg);
        border-bottom: 1px solid var(--gantt-border);
      }
      .gantt-tb-group {
        display: flex;
        align-items: center;
        gap: 3px;
      }
      .gantt-tb-group + .gantt-tb-group {
        padding-left: 10px;
        border-left: 1px solid var(--gantt-border);
      }
      .gantt-tb-slot:empty {
        display: none;
      }
      .gantt-tb-views {
        margin-left: auto;
        border-left: none !important;
      }
      .gantt-tb-btn,
      .gantt-tb-pill {
        font: inherit;
        font-size: 12px;
        cursor: pointer;
        border-radius: 5px;
        border: 1px solid var(--gantt-border);
        background: var(--gantt-panel-bg);
        color: var(--gantt-text-sec);
        padding: 3px 10px;
      }
      .gantt-tb-pill {
        border-color: transparent;
        background: transparent;
        padding: 3px 8px;
      }
      .gantt-tb-btn:hover,
      .gantt-tb-pill:hover {
        color: var(--gantt-text);
        border-color: var(--gantt-border);
      }
      .gantt-tb-pill[aria-pressed='true'] {
        background: var(--gantt-bar);
        border-color: var(--gantt-bar);
        color: #fff;
      }
      .gantt-tb-today {
        color: var(--gantt-today);
        border-color: color-mix(in srgb, var(--gantt-today) 45%, transparent);
      }
    `,
  ],
})
export class GanttToolbarComponent {
  readonly toolbar = input<ResolvedToolbar>({ zoom: true, viewModes: false, today: true, viewToggle: false });
  readonly zoomLevels = input<GanttZoomLevel[]>([]);
  readonly currentView = input<string>('Month');
  readonly view = input<GanttView>('split');

  readonly zoomIn = output<void>();
  readonly zoomOut = output<void>();
  readonly viewModeChange = output<string>();
  readonly scrollToToday = output<void>();
  readonly viewChange = output<GanttView>();

  protected readonly labels = inject(GanttI18nService).labels;

  protected readonly pills = computed(() => {
    const names = this.toolbar().viewModes;
    if (names === false) return [];
    const levels = this.zoomLevels();
    const viewLabels = this.labels().viewModes as Record<string, string>;
    return names
      .map(name => levels.find(l => l.name === name))
      .filter((l): l is GanttZoomLevel => !!l)
      .map(l => ({ name: l.name, label: l.label ?? viewLabels[l.name] ?? l.name }));
  });

  protected readonly views = computed<{ view: GanttView; label: string }[]>(() => {
    const l = this.labels();
    return [
      { view: 'split', label: l.viewSplit },
      { view: 'table', label: l.viewTable },
      { view: 'chart', label: l.viewChart },
    ];
  });
}

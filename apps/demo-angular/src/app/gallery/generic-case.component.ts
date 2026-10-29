import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GantryComponent, GanttDataSource, createGanttSyncGroup } from '@gantryjs/angular';
import { CASE_DATA } from 'demo-kit/gallery';
import { AppThemeService } from '../shell/app-theme.service';
import { GALLERY_CASE } from './case-context';

/**
 * The generic renderer: a case's shared data and options (`CASE_DATA[id]` of demo-kit/gallery)
 * drawn with `<gantry>`, without the case's own controls. A case uses it until its Angular
 * component replaces the entry in `cases.ts`; once every case has its own, this file goes.
 */
@Component({
  selector: 'app-generic-case',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      @if (charts.length === 1) {
        @let c = charts[0];
        <gantry
          class="gs-chart gs-case-chart"
          [series]="c.tasks"
          [dataSource]="c.source"
          [options]="c.options"
          [annotations]="c.annotations ?? []"
          [resources]="c.resources ?? []"
          [darkMode]="theme.isDark()"
          [showToolbar]="c.showToolbar ?? true"
          [showLegend]="c.showLegend ?? false"
          [loading]="c.loading ?? false"
          [errorMessage]="c.errorMessage ?? null"
          [syncGroup]="group"
        />
      } @else {
        <div class="gs-case-stack">
          @for (c of charts; track $index) {
            <div>
              @if (c.caption) {
                <p class="gs-case-caption">{{ c.caption }}</p>
              }
              <gantry
                class="gs-chart gs-case-chart"
                [series]="c.tasks"
                [dataSource]="c.source"
                [options]="c.options"
                [annotations]="c.annotations ?? []"
                [resources]="c.resources ?? []"
                [darkMode]="theme.isDark()"
                [showToolbar]="c.showToolbar ?? true"
                [showLegend]="c.showLegend ?? false"
                [loading]="c.loading ?? false"
                [errorMessage]="c.errorMessage ?? null"
                [syncGroup]="group"
              />
            </div>
          }
        </div>
      }
      <p class="gs-case-hint">The shared data and options of this case; the Shared data tab below shows them.</p>
    </div>
  `,
})
export class GenericCaseComponent {
  protected readonly theme = inject(AppThemeService);

  private readonly data = CASE_DATA[inject(GALLERY_CASE)];
  /** The charts, built once for this page's `now` (a paged source becomes a data source) */
  protected readonly charts = this.data
    .charts(new Date())
    .map(c => ({ ...c, source: c.dataSource ? new GanttDataSource(c.dataSource) : null }));
  protected readonly group = this.data.sync
    ? createGanttSyncGroup(this.data.sync === true ? {} : this.data.sync)
    : null;
}

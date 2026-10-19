// The toolbar's Export menu (`toolbar.export`) saves SVG, PNG and CSV files and prints. Each one
// emits `(beforeExport)` first, synchronously (`preventDefault()` on it vetoes: PNG while "Block PNG"
// is on), then `(export)` with the file's name and size. `provideGanttBar` maps `barType: 'flag'` to
// `FlagBarComponent` (flag-bar.component.ts); the exports render it off-screen and draw it too.
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  GantryComponent,
  provideGanttBar,
  type GanttBeforeExportEvent,
  type GanttExportEvent,
} from '@gantryjs/angular';
import {
  EXPORT_TOOLBAR_HINT,
  EXPORT_TOOLBAR_INITIAL,
  EXPORT_TOOLBAR_OPTIONS,
  FLAG_BAR,
  describeBlockedExport,
  describeExport,
  exportToolbarTasks,
  pushLog,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';
import { FlagBarComponent } from './flag-bar.component';

@Component({
  selector: 'app-export-toolbar-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  providers: [provideGanttBar({ type: FLAG_BAR.type, component: FlagBarComponent })],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <label class="gs-switch gs-case-control">
          <span>Block PNG</span>
          <input type="checkbox" role="switch" [checked]="blockPng()" (change)="blockPng.set(block.checked)" #block />
        </label>
      </div>

      <gantry
        class="gs-chart gs-case-chart"
        [series]="tasks"
        [options]="options"
        [darkMode]="dark()"
        (beforeExport)="beforeExport($event)"
        (export)="exported($event)"
      />
      <ol class="gs-case-log" aria-label="Exports">
        @for (line of log(); track $index) {
          <li>{{ line }}</li>
        }
      </ol>
      <p class="gs-case-hint">{{ hint }}</p>
    </div>
  `,
})
export class ExportToolbarExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly options = EXPORT_TOOLBAR_OPTIONS;
  protected readonly tasks = exportToolbarTasks(new Date());
  protected readonly hint = EXPORT_TOOLBAR_HINT;
  protected readonly blockPng = signal(EXPORT_TOOLBAR_INITIAL.blockPng);
  protected readonly log = signal<string[]>([]);

  /** Synchronously, before the file is made: veto PNG while the switch is on */
  protected beforeExport(detail: GanttBeforeExportEvent): void {
    if (!this.blockPng() || detail.format !== 'png') return;
    detail.preventDefault();
    this.log.update(log => pushLog(log, describeBlockedExport(detail.format)));
  }

  protected exported(detail: GanttExportEvent): void {
    this.log.update(log => pushLog(log, describeExport(detail)));
  }
}

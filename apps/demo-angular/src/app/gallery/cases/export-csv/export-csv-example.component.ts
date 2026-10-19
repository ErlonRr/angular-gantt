// The tasks as a CSV table: `exportCsv(options)` on the component (`viewChild`) fills the preview
// after every render with new control values or edited tasks (`[(series)]`), and
// `download('csv', options)` saves budget-plan.csv (`aria-disabled` while it runs: an unavailable
// button keeps focus).
import { ChangeDetectionStrategy, Component, afterRenderEffect, inject, signal, viewChild } from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import {
  CSV_COLUMNS,
  CSV_VALUES,
  EXPORT_CSV_HINT,
  EXPORT_CSV_INITIAL,
  EXPORT_CSV_OPTIONS,
  csvExportOptions,
  csvPreviewLines,
  describeFailedExport,
  exportCsvTasks,
  type ExportCsvState,
} from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-export-csv-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <div class="gs-case-controls">
        <div class="gs-case-control">
          <span id="export-csv-columns-label">Columns</span>
          <div class="gs-seg" role="group" aria-labelledby="export-csv-columns-label">
            @for (choice of columns; track choice.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="settings().columns === choice.value"
                (click)="update({ columns: choice.value })"
              >
                {{ choice.label }}
              </button>
            }
          </div>
        </div>
        <div class="gs-case-control">
          <span id="export-csv-values-label">Values</span>
          <div class="gs-seg" role="group" aria-labelledby="export-csv-values-label">
            @for (choice of values; track choice.value) {
              <button
                type="button"
                class="gs-seg-btn"
                [attr.aria-pressed]="settings().values === choice.value"
                (click)="update({ values: choice.value })"
              >
                {{ choice.label }}
              </button>
            }
          </div>
        </div>
        <label class="gs-switch gs-case-control">
          <span>Byte order mark</span>
          <input
            #bom
            id="export-csv-bom"
            type="checkbox"
            role="switch"
            [checked]="settings().bom"
            (change)="update({ bom: bom.checked })"
          />
        </label>
        <button
          id="export-csv-download"
          type="button"
          class="gs-btn gs-btn--sm"
          [attr.aria-disabled]="busy() ? 'true' : null"
          (click)="download()"
        >
          Download CSV
        </button>
      </div>

      <gantry class="gs-chart gs-case-chart" [(series)]="tasks" [options]="options" [darkMode]="dark()" />
      @if (failure(); as failure) {
        <p class="gs-case-hint" role="alert">{{ failure }}</p>
      }
      <!-- The first records of the CSV; it scrolls sideways, so it takes focus -->
      <pre class="gs-case-csv" tabindex="0" aria-label="CSV preview">{{ preview() }}</pre>
      <p class="gs-case-hint">{{ hint }}</p>
    </div>
  `,
})
export class ExportCsvExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly chart = viewChild.required(GantryComponent);

  protected readonly options = EXPORT_CSV_OPTIONS;
  protected readonly columns = CSV_COLUMNS;
  protected readonly values = CSV_VALUES;
  protected readonly hint = EXPORT_CSV_HINT;
  // Each accepted edit writes the new array here (`[(series)]`)
  protected readonly tasks = signal(exportCsvTasks(new Date()));
  protected readonly settings = signal<ExportCsvState>(EXPORT_CSV_INITIAL);
  protected readonly preview = signal('');
  // A failed export, under the chart while there is one; the preview keeps its last good text
  protected readonly failure = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    // After each render with new control values or tasks; a newer run makes an older answer stale.
    // A preview that succeeds clears the failure
    afterRenderEffect(onCleanup => {
      const options = csvExportOptions(this.settings());
      this.tasks(); // an edit writes new tasks (`[(series)]`): read the CSV again
      let current = true;
      onCleanup(() => (current = false));
      void this.chart()
        .exportCsv(options)
        .then(
          csv => {
            if (!current) return;
            this.preview.set(csvPreviewLines(csv).join('\n'));
            this.failure.set(null);
          },
          (error: unknown) => {
            if (current) this.failure.set(describeFailedExport(error));
          },
        );
    });
  }

  protected update(change: Partial<ExportCsvState>): void {
    this.settings.update(settings => ({ ...settings, ...change }));
  }

  /** A download clears the failure when it starts */
  protected download(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.failure.set(null);
    void this.chart()
      .download('csv', csvExportOptions(this.settings()))
      .catch((error: unknown) => this.failure.set(describeFailedExport(error)))
      .finally(() => this.busy.set(false));
  }
}

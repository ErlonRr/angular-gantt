// The tasks as a CSV table: the element's `exportCsv(options)` fills the preview after every control
// change and every edit (`tasks-change`), and `download('csv', options)` saves budget-plan.csv
// (`aria-disabled` while it runs: an unavailable button keeps focus). Formula-like names get a `'`.
import '@gantryjs/vanilla';
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
  type GalleryChoice,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  let settings: ExportCsvState = EXPORT_CSV_INITIAL;

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = exportCsvTasks(new Date());
  chart.options = EXPORT_CSV_OPTIONS;

  // The first records of the CSV; it scrolls sideways, so it takes focus
  const preview = document.createElement('pre');
  preview.className = 'gs-case-csv';
  preview.tabIndex = 0;
  preview.setAttribute('aria-label', 'CSV preview');

  // A failed export, under the chart while there is one; the preview keeps its last good text
  const failure = document.createElement('p');
  failure.className = 'gs-case-hint';
  failure.setAttribute('role', 'alert');
  function fail(error: unknown): void {
    failure.textContent = describeFailedExport(error);
    chart.after(failure);
  }

  // A preview that succeeds clears the failure
  function refresh(): void {
    void chart.exportCsv(csvExportOptions(settings)).then(csv => {
      preview.textContent = csvPreviewLines(csv).join('\n');
      failure.remove();
    }, fail);
  }
  function update(change: Partial<ExportCsvState>): void {
    settings = { ...settings, ...change };
    refresh();
  }
  chart.addEventListener('tasks-change', refresh);

  // A segmented control over shared choices: `export-csv-<name>-label` names its group
  function segmented<T extends string>(
    name: string,
    label: string,
    choices: readonly GalleryChoice<T>[],
    pick: (value: T) => void,
    value: T,
  ): HTMLElement {
    const text = document.createElement('span');
    text.id = `export-csv-${name}-label`;
    text.textContent = label;
    const group = document.createElement('div');
    group.className = 'gs-seg';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', text.id);
    const buttons = choices.map(choice => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gs-seg-btn';
      button.textContent = choice.label;
      button.setAttribute('aria-pressed', String(choice.value === value));
      button.addEventListener('click', () => {
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(choices[i].value === choice.value)));
        pick(choice.value);
      });
      return button;
    });
    group.append(...buttons);
    const control = document.createElement('div');
    control.className = 'gs-case-control';
    control.append(text, group);
    return control;
  }

  // "Byte order mark": a switch (files only: `exportCsv()` never adds one)
  const bom = document.createElement('input');
  bom.type = 'checkbox';
  bom.id = 'export-csv-bom';
  bom.setAttribute('role', 'switch');
  bom.checked = settings.bom;
  bom.addEventListener('change', () => update({ bom: bom.checked }));
  const bomText = document.createElement('span');
  bomText.textContent = 'Byte order mark';
  const bomSwitch = document.createElement('label');
  bomSwitch.className = 'gs-switch gs-case-control';
  bomSwitch.append(bomText, bom);

  const download = document.createElement('button');
  download.type = 'button';
  download.id = 'export-csv-download';
  download.className = 'gs-btn gs-btn--sm';
  download.textContent = 'Download CSV';
  download.addEventListener('click', () => void save());
  // A download clears the failure when it starts
  async function save(): Promise<void> {
    if (download.ariaDisabled === 'true') return;
    download.ariaDisabled = 'true';
    failure.remove();
    try {
      await chart.download('csv', csvExportOptions(settings));
    } catch (error) {
      fail(error);
    } finally {
      download.ariaDisabled = null;
    }
  }

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    segmented('columns', 'Columns', CSV_COLUMNS, columns => update({ columns }), settings.columns),
    segmented('values', 'Values', CSV_VALUES, values => update({ values }), settings.values),
    bomSwitch,
    download,
  );

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = EXPORT_CSV_HINT;

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, preview, hint);
  host.append(root);
  refresh();
  return () => {
    stopTheme();
    root.remove();
  };
}

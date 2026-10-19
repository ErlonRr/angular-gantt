// The plan saved as an image: the element's `download('svg' | 'png', options)` saves a file named
// after `export.fileName`, and `exportSvg(options)` returns the SVG text, previewed here through an
// object URL. `theme` picks the palette, `range` the whole plan or the dates on screen.
import '@gantryjs/vanilla';
import {
  EXPORT_IMAGE_INITIAL,
  EXPORT_IMAGE_OPTIONS,
  EXPORT_RANGES,
  EXPORT_THEMES,
  describeFailedExport,
  exportImageTasks,
  formatBytes,
  imageExportOptions,
  type ExportImageState,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';
import { segmented } from './segmented';

export function mount(host: HTMLElement): () => void {
  let state: ExportImageState = EXPORT_IMAGE_INITIAL;
  let busy = false;
  let previewUrl: string | null = null;

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = exportImageTasks(new Date());
  chart.options = EXPORT_IMAGE_OPTIONS;

  const theme = segmented('export-image-theme', 'Theme', EXPORT_THEMES, state.theme, value => {
    state = { ...state, theme: value };
  });
  const range = segmented('export-image-range', 'Range', EXPORT_RANGES, state.range, value => {
    state = { ...state, range: value };
  });

  // The preview, attached after the first Preview: the image and its size
  const image = document.createElement('img');
  image.alt = 'Preview of the exported SVG';
  const caption = document.createElement('figcaption');
  const figure = document.createElement('figure');
  figure.className = 'gs-case-preview';
  figure.append(image, caption);
  const failure = document.createElement('p');
  failure.className = 'gs-case-hint';
  failure.setAttribute('role', 'alert');

  // aria-disabled while an export runs, not disabled: the button keeps focus
  const buttons = (
    [
      ['export-image-svg', 'Download SVG', () => chart.download('svg', imageExportOptions(state))],
      ['export-image-png', 'Download PNG', () => chart.download('png', imageExportOptions(state))],
      ['export-image-preview', 'Preview', showPreview],
    ] as const
  ).map(([id, label, task]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = 'gs-btn gs-btn--sm';
    button.textContent = label;
    button.addEventListener('click', () => run(task));
    return button;
  });

  async function showPreview(): Promise<void> {
    const blob = new Blob([await chart.exportSvg(imageExportOptions(state))], { type: 'image/svg+xml' });
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    image.src = previewUrl;
    caption.textContent = `SVG · ${formatBytes(blob.size)}`;
    root.append(figure);
  }

  /** One export at a time; a failure (a rejected promise) shows under the chart */
  function run(task: () => Promise<unknown>): void {
    if (busy) return;
    const setBusy = (value: boolean) => {
      busy = value;
      for (const button of buttons) button.ariaDisabled = value ? 'true' : null;
    };
    setBusy(true);
    failure.remove();
    task()
      .catch((error: unknown) => {
        failure.textContent = describeFailedExport(error);
        chart.after(failure);
      })
      .finally(() => setBusy(false));
  }

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(theme, range, ...buttons);

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart);
  host.append(root);
  return () => {
    stopTheme();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    root.remove();
  };
}

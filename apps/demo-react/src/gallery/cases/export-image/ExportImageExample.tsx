// The plan saved as an image: `download('svg' | 'png', options)` on the ref (the `<gantry-element>`)
// saves a file named after `export.fileName`, and `exportSvg(options)` returns the SVG text, previewed
// here through an object URL. `theme` picks the palette, `range` the whole plan or the dates on screen.
import { useEffect, useRef, useState } from 'react';
import { Gantry, type GantryElement } from '@gantryjs/react';
import {
  EXPORT_IMAGE_INITIAL,
  EXPORT_IMAGE_OPTIONS,
  EXPORT_RANGES,
  EXPORT_THEMES,
  describeFailedExport,
  exportImageTasks,
  formatBytes,
  imageExportOptions,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function ExportImageExample() {
  const darkMode = useDarkMode();
  const gantt = useRef<GantryElement>(null);
  const [tasks] = useState(() => exportImageTasks(new Date()));
  const [state, setState] = useState(EXPORT_IMAGE_INITIAL);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; size: number } | null>(null);

  // The object URL lives as long as its preview: replaced or unmounted, it is revoked
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  // One export at a time; a failure (a rejected promise) shows under the chart
  const run = (task: (chart: GantryElement) => Promise<unknown>) => {
    const chart = gantt.current;
    if (busy || !chart) return;
    setBusy(true);
    setFailure(null);
    void task(chart)
      .catch((error: unknown) => setFailure(describeFailedExport(error)))
      .finally(() => setBusy(false));
  };
  const showPreview = async (chart: GantryElement) => {
    const blob = new Blob([await chart.exportSvg(imageExportOptions(state))], { type: 'image/svg+xml' });
    setPreview({ url: URL.createObjectURL(blob), size: blob.size });
  };

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="export-image-theme-label">Theme</span>
          <div className="gs-seg" role="group" aria-labelledby="export-image-theme-label">
            {EXPORT_THEMES.map(t => (
              <button
                key={t.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={state.theme === t.value}
                onClick={() => setState(s => ({ ...s, theme: t.value }))}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="gs-case-control">
          <span id="export-image-range-label">Range</span>
          <div className="gs-seg" role="group" aria-labelledby="export-image-range-label">
            {EXPORT_RANGES.map(r => (
              <button
                key={r.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={state.range === r.value}
                onClick={() => setState(s => ({ ...s, range: r.value }))}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {/* aria-disabled while an export runs, not disabled: the button keeps focus */}
        <button
          id="export-image-svg"
          type="button"
          className="gs-btn gs-btn--sm"
          aria-disabled={busy || undefined}
          onClick={() => run(chart => chart.download('svg', imageExportOptions(state)))}
        >
          Download SVG
        </button>
        <button
          id="export-image-png"
          type="button"
          className="gs-btn gs-btn--sm"
          aria-disabled={busy || undefined}
          onClick={() => run(chart => chart.download('png', imageExportOptions(state)))}
        >
          Download PNG
        </button>
        <button
          id="export-image-preview"
          type="button"
          className="gs-btn gs-btn--sm"
          aria-disabled={busy || undefined}
          onClick={() => run(showPreview)}
        >
          Preview
        </button>
      </div>

      <Gantry
        ref={gantt}
        className="gs-chart gs-case-chart"
        tasks={tasks}
        options={EXPORT_IMAGE_OPTIONS}
        darkMode={darkMode}
      />
      {failure && (
        <p className="gs-case-hint" role="alert">
          {failure}
        </p>
      )}
      {preview && (
        <figure className="gs-case-preview">
          <img src={preview.url} alt="Preview of the exported SVG" />
          <figcaption>SVG · {formatBytes(preview.size)}</figcaption>
        </figure>
      )}
    </div>
  );
}

// The tasks as a CSV table: `exportCsv(options)` on the ref (the `<gantry-element>`) fills the preview
// after every control change and every edit (`onTasksChange`), and `download('csv', options)` saves
// budget-plan.csv (`aria-disabled` while it runs: an unavailable button keeps focus).
import { useEffect, useRef, useState } from 'react';
import { Gantry, type GantryElement } from '@gantryjs/react';
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
import { useDarkMode } from '../../site-theme';

export default function ExportCsvExample() {
  const darkMode = useDarkMode();
  const gantt = useRef<GantryElement>(null);
  // Uncontrolled: the chart keeps each edit, so these tasks are only the starting plan
  const [tasks] = useState(() => exportCsvTasks(new Date()));
  const [settings, setSettings] = useState<ExportCsvState>(EXPORT_CSV_INITIAL);
  const [edits, setEdits] = useState(0);
  const [preview, setPreview] = useState('');
  // A failed export, under the chart while there is one; the preview keeps its last good text
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (change: Partial<ExportCsvState>) => setSettings(current => ({ ...current, ...change }));

  // The preview follows the controls and each edit; a newer run makes an older answer stale. A
  // preview that succeeds clears the failure
  useEffect(() => {
    let current = true;
    gantt.current?.exportCsv(csvExportOptions(settings)).then(
      csv => {
        if (!current) return;
        setPreview(csvPreviewLines(csv).join('\n'));
        setFailure(null);
      },
      (error: unknown) => {
        if (current) setFailure(describeFailedExport(error));
      },
    );
    return () => {
      current = false;
    };
  }, [settings, edits]);

  // A download clears the failure when it starts
  async function download() {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await gantt.current?.download('csv', csvExportOptions(settings));
    } catch (error) {
      setFailure(describeFailedExport(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="export-csv-columns-label">Columns</span>
          <div className="gs-seg" role="group" aria-labelledby="export-csv-columns-label">
            {CSV_COLUMNS.map(choice => (
              <button
                key={choice.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={settings.columns === choice.value}
                onClick={() => update({ columns: choice.value })}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        <div className="gs-case-control">
          <span id="export-csv-values-label">Values</span>
          <div className="gs-seg" role="group" aria-labelledby="export-csv-values-label">
            {CSV_VALUES.map(choice => (
              <button
                key={choice.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={settings.values === choice.value}
                onClick={() => update({ values: choice.value })}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        <label className="gs-switch gs-case-control">
          <span>Byte order mark</span>
          <input
            id="export-csv-bom"
            type="checkbox"
            role="switch"
            checked={settings.bom}
            onChange={e => update({ bom: e.target.checked })}
          />
        </label>
        <button
          id="export-csv-download"
          type="button"
          className="gs-btn gs-btn--sm"
          aria-disabled={busy ? true : undefined}
          onClick={() => void download()}
        >
          Download CSV
        </button>
      </div>

      <Gantry
        ref={gantt}
        className="gs-chart gs-case-chart"
        tasks={tasks}
        options={EXPORT_CSV_OPTIONS}
        darkMode={darkMode}
        onTasksChange={() => setEdits(n => n + 1)}
      />
      {failure && (
        <p className="gs-case-hint" role="alert">
          {failure}
        </p>
      )}
      {/* The first records of the CSV; it scrolls sideways, so it takes focus */}
      <pre className="gs-case-csv" tabIndex={0} aria-label="CSV preview">
        {preview}
      </pre>
      <p className="gs-case-hint">{EXPORT_CSV_HINT}</p>
    </div>
  );
}

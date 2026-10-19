// The toolbar's Export menu (`toolbar.export`) saves SVG, PNG and CSV files and prints. Each one
// calls `onBeforeExport` first, synchronously (`detail.preventDefault()` vetoes it: PNG while
// "Block PNG" is on), then `onExport` with the file's name and size. The flag bars come from
// `renderBar` (flagBar.ts, a module-level function so it stays the same on every render), and the
// exports draw them too.
import { useState } from 'react';
import { Gantry, type GanttBeforeExportEvent } from '@gantryjs/react';
import {
  EXPORT_TOOLBAR_HINT,
  EXPORT_TOOLBAR_INITIAL,
  EXPORT_TOOLBAR_OPTIONS,
  describeBlockedExport,
  describeExport,
  exportToolbarTasks,
  pushLog,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';
import { flagBar } from './flagBar';
import './export-toolbar.css';

export default function ExportToolbarExample() {
  const darkMode = useDarkMode();
  const [tasks] = useState(() => exportToolbarTasks(new Date()));
  const [blockPng, setBlockPng] = useState(EXPORT_TOOLBAR_INITIAL.blockPng);
  const [log, setLog] = useState<string[]>([]);

  // Synchronously, before the file is made: veto PNG while the switch is on
  const beforeExport = (detail: GanttBeforeExportEvent) => {
    if (!blockPng || detail.format !== 'png') return;
    detail.preventDefault();
    setLog(lines => pushLog(lines, describeBlockedExport(detail.format)));
  };

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <label className="gs-switch gs-case-control">
          <span>Block PNG</span>
          <input type="checkbox" role="switch" checked={blockPng} onChange={e => setBlockPng(e.target.checked)} />
        </label>
      </div>

      <Gantry
        className="gs-chart gs-case-chart"
        tasks={tasks}
        options={EXPORT_TOOLBAR_OPTIONS}
        renderBar={flagBar}
        darkMode={darkMode}
        onBeforeExport={beforeExport}
        onExport={detail => setLog(lines => pushLog(lines, describeExport(detail)))}
      />
      <ol className="gs-case-log" aria-label="Exports">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <p className="gs-case-hint">{EXPORT_TOOLBAR_HINT}</p>
    </div>
  );
}

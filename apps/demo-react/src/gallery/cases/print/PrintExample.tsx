// Prints every row of the schedule, not only the rows on screen: the async `print(options)` on the
// ref (the `<gantry-element>`) with the `paper`, `orientation`, `fit` and `repeatTable` the controls
// pick; `onExport` reports the pages printed.
import { useRef, useState } from 'react';
import { Gantry, type GantryElement } from '@gantryjs/react';
import {
  PRINT_FITS,
  PRINT_HINT,
  PRINT_INITIAL,
  PRINT_OPTIONS,
  PRINT_ORIENTATIONS,
  PRINT_PAPERS,
  describeExport,
  describeFailedExport,
  printOptionsOf,
  printTasks,
  pushLog,
  type PrintState,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function PrintExample() {
  const darkMode = useDarkMode();
  const gantt = useRef<GantryElement>(null);
  const [tasks] = useState(() => printTasks(new Date()));
  const [state, setState] = useState<PrintState>(PRINT_INITIAL);
  const [printing, setPrinting] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const update = (patch: Partial<PrintState>) => setState(s => ({ ...s, ...patch }));

  // One print at a time; a failure (a `RangeError` over `maxPages`, say) shows under the chart
  const print = () => {
    if (printing || !gantt.current) return;
    setPrinting(true);
    setFailure(null);
    void gantt.current
      .print(printOptionsOf(state))
      .catch((error: unknown) => setFailure(describeFailedExport(error)))
      .finally(() => setPrinting(false));
  };

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <label htmlFor="print-paper">Paper</label>
          <select
            id="print-paper"
            className="gs-select"
            value={state.paper}
            onChange={e => update({ paper: PRINT_PAPERS[e.target.selectedIndex].value })}
          >
            {PRINT_PAPERS.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="gs-case-control">
          <span id="print-orientation-label">Orientation</span>
          <div className="gs-seg" role="group" aria-labelledby="print-orientation-label">
            {PRINT_ORIENTATIONS.map(c => (
              <button
                key={c.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={state.orientation === c.value}
                onClick={() => update({ orientation: c.value })}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="gs-case-control">
          <span id="print-fit-label">Fit</span>
          <div className="gs-seg" role="group" aria-labelledby="print-fit-label">
            {PRINT_FITS.map(c => (
              <button
                key={c.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={state.fit === c.value}
                onClick={() => update({ fit: c.value })}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <label className="gs-switch gs-case-control">
          <span>Repeat task list</span>
          <input
            type="checkbox"
            role="switch"
            checked={state.repeatTable}
            onChange={e => update({ repeatTable: e.target.checked })}
          />
        </label>
        <button type="button" className="gs-btn gs-btn--sm" aria-disabled={printing ? true : undefined} onClick={print}>
          Print…
        </button>
      </div>

      <Gantry
        ref={gantt}
        className="gs-chart gs-case-chart"
        tasks={tasks}
        options={PRINT_OPTIONS}
        darkMode={darkMode}
        onExport={detail => setLog(lines => pushLog(lines, describeExport(detail)))}
      />
      {failure && (
        <p className="gs-case-hint" role="alert">
          {failure}
        </p>
      )}
      {/* Not a live region: the chart announces each print itself */}
      <ol className="gs-case-log" aria-label="Prints">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <p className="gs-case-hint">{PRINT_HINT}</p>
    </div>
  );
}

// A resource view (`rows`): one row per person and team, drawing the daily load against the capacity line,
// the part above it hatched. `resources` holds the people, each task's `resources` the assignments.
// `onStateChange` brings the toolbar's Rows toggle and zoom back to the controls.
import { useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  LOAD_SCALES,
  RESOURCE_LOAD_HINT,
  RESOURCE_LOAD_INITIAL,
  RESOURCE_ROWS,
  loadOptions,
  loadResources,
  loadTasks,
  overloadSummary,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function ResourceLoadExample() {
  const darkMode = useDarkMode();
  const [now] = useState(() => new Date());
  const [tasks] = useState(() => loadTasks(now));
  const [resources] = useState(loadResources);
  const [rows, setRows] = useState(RESOURCE_LOAD_INITIAL.rows);
  const [viewMode, setViewMode] = useState(RESOURCE_LOAD_INITIAL.viewMode);
  const [unassigned, setUnassigned] = useState(RESOURCE_LOAD_INITIAL.unassigned);
  const [overallocation, setOverallocation] = useState(RESOURCE_LOAD_INITIAL.overallocation);
  const options = useMemo(
    () => loadOptions({ rows, viewMode, unassigned, overallocation }, now),
    [rows, viewMode, unassigned, overallocation, now],
  );

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="resource-load-rows-label">Rows</span>
          <div id="resource-load-rows" className="gs-seg" role="group" aria-labelledby="resource-load-rows-label">
            {RESOURCE_ROWS.map(r => (
              <button
                key={r.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={rows === r.value}
                onClick={() => setRows(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="gs-case-control">
          <span id="resource-load-scale-label">Scale</span>
          <div id="resource-load-scale" className="gs-seg" role="group" aria-labelledby="resource-load-scale-label">
            {LOAD_SCALES.map(s => (
              <button
                key={s.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={viewMode === s.value}
                onClick={() => setViewMode(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <label className="gs-switch gs-case-control">
          <span>Show unassigned</span>
          <input
            id="resource-load-unassigned"
            type="checkbox"
            role="switch"
            checked={unassigned}
            onChange={e => setUnassigned(e.target.checked)}
          />
        </label>
        <label className="gs-switch gs-case-control">
          <span>Highlight over-allocation</span>
          <input
            id="resource-load-over"
            type="checkbox"
            role="switch"
            checked={overallocation}
            onChange={e => setOverallocation(e.target.checked)}
          />
        </label>
      </div>

      <Gantry
        className="gs-chart gs-case-chart"
        tasks={tasks}
        resources={resources}
        options={options}
        darkMode={darkMode}
        onStateChange={state => {
          // The chart's own toolbar switches the rows and the zoom too
          if (state.rows) setRows(state.rows);
          if (state.viewMode) setViewMode(state.viewMode);
        }}
      />
      <p className="gs-case-status">{overloadSummary(tasks, resources, options)}</p>
      <p className="gs-case-hint">{RESOURCE_LOAD_HINT}</p>
    </div>
  );
}

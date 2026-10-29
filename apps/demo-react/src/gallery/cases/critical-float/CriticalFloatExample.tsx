// The critical path, lags and float counted in working time: `calendar.durations` picks working or
// calendar days and `nonWorkingTime.weekends` the days off. The Float column is a `ColumnDef` with a
// `render` function; the line under the chart follows each edit reported by `onTasksChange`.
import { useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  CRITICAL_DURATIONS,
  CRITICAL_FLOAT_HINT,
  CRITICAL_FLOAT_INITIAL,
  criticalFloatOptions,
  criticalFloatTasks,
  criticalSummary,
  type CriticalFloatState,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function CriticalFloatExample() {
  const darkMode = useDarkMode();
  // Uncontrolled: the chart keeps each edit, so `initial` is only the starting plan
  const [initial] = useState(() => criticalFloatTasks(new Date()));
  const [tasks, setTasks] = useState(initial);
  const [state, setState] = useState<CriticalFloatState>(CRITICAL_FLOAT_INITIAL);
  const options = useMemo(() => criticalFloatOptions(state), [state]);
  const summary = useMemo(() => criticalSummary(tasks, options), [tasks, options]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="critical-float-durations-label">Durations</span>
          <div className="gs-seg" role="group" aria-labelledby="critical-float-durations-label">
            {CRITICAL_DURATIONS.map(choice => (
              <button
                key={choice.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={state.durations === choice.value}
                onClick={() => setState({ ...state, durations: choice.value })}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        <label className="gs-switch gs-case-control">
          <span>Work on Saturdays</span>
          <input
            id="critical-float-saturdays"
            type="checkbox"
            role="switch"
            checked={state.saturdays}
            onChange={e => setState({ ...state, saturdays: e.target.checked })}
          />
        </label>
      </div>

      <Gantry
        className="gs-chart gs-case-chart"
        tasks={initial}
        options={options}
        darkMode={darkMode}
        onTasksChange={detail => setTasks(detail.tasks)}
      />
      <p className="gs-case-status">{summary}</p>
      <p className="gs-case-hint">{CRITICAL_FLOAT_HINT}</p>
    </div>
  );
}

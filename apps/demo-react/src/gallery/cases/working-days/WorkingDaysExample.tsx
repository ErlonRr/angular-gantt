// A working calendar (`calendar`): durations count working days, so a bar dragged across a weekend or
// a holiday keeps its working days and stretches over the days off, and edits skip non-working time
// (`skipNonWorking`). `onTasksChange` hands the edited tasks back for the status line.
import { useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  WORKING_DAYS_HINT,
  WORKING_DAYS_INITIAL,
  WORKING_DURATIONS,
  WORKING_SHADINGS,
  workingDaysOptions,
  workingDaysTasks,
  workingSummary,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function WorkingDaysExample() {
  const darkMode = useDarkMode();
  // The holidays are placed around the same `now` as the tasks
  const [now] = useState(() => new Date());
  const [tasks] = useState(() => workingDaysTasks(now));
  // The edited tasks: the chart keeps them itself, `onTasksChange` reports them for the status line
  const [edited, setEdited] = useState(tasks);
  const [durations, setDurations] = useState(WORKING_DAYS_INITIAL.durations);
  const [skipNonWorking, setSkipNonWorking] = useState(WORKING_DAYS_INITIAL.skipNonWorking);
  const [shading, setShading] = useState(WORKING_DAYS_INITIAL.shading);
  const options = useMemo(
    () => workingDaysOptions({ durations, skipNonWorking, shading }, now),
    [durations, skipNonWorking, shading, now],
  );

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="working-days-durations-label">Durations</span>
          <div className="gs-seg" role="group" aria-labelledby="working-days-durations-label">
            {WORKING_DURATIONS.map(d => (
              <button
                key={d.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={durations === d.value}
                onClick={() => setDurations(d.value)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <label className="gs-switch gs-case-control">
          <span>Skip non-working time</span>
          <input
            id="working-days-skip"
            type="checkbox"
            role="switch"
            checked={skipNonWorking}
            onChange={e => setSkipNonWorking(e.target.checked)}
          />
        </label>
        <div className="gs-case-control">
          <span id="working-days-shading-label">Shading</span>
          <div className="gs-seg" role="group" aria-labelledby="working-days-shading-label">
            {WORKING_SHADINGS.map(s => (
              <button
                key={s.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={shading === s.value}
                onClick={() => setShading(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Gantry
        className="gs-chart gs-case-chart"
        tasks={tasks}
        options={options}
        darkMode={darkMode}
        onTasksChange={detail => setEdited(detail.tasks)}
      />
      <p className="gs-case-status">{workingSummary(edited, options)}</p>
      <p className="gs-case-hint">{WORKING_DAYS_HINT}</p>
    </div>
  );
}

// Ten thousand rows, virtualised in both panes: only the rows in view are in the DOM. The plan is
// built once per row count (`useMemo`) and passed as it is: the chart compares by reference, so
// a re-render with the same array costs nothing, and a new array is a new plan.
import { useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import { LARGE_COUNT, LARGE_COUNTS, LARGE_OPTIONS, largeCaseTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function LargeExample() {
  const darkMode = useDarkMode();
  const [now] = useState(() => new Date());
  const [count, setCount] = useState(LARGE_COUNT);
  const tasks = useMemo(() => largeCaseTasks(count, now), [count, now]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="large-rows-label">Rows</span>
          <div className="gs-seg" role="group" aria-labelledby="large-rows-label">
            {LARGE_COUNTS.map(choice => (
              <button
                key={choice.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={choice.value === count}
                onClick={() => setCount(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        <span className="gs-pill">{tasks.length.toLocaleString('en-US')} tasks</span>
      </div>
      <Gantry className="gs-chart gs-case-chart" tasks={tasks} options={LARGE_OPTIONS} darkMode={darkMode} />
      <p className="gs-case-hint">Scroll either pane: only the rows in view are in the DOM.</p>
    </div>
  );
}

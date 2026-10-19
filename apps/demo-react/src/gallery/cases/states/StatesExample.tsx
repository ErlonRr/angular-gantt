// The chart's loading, empty and error states: the `loading` and `errorMessage` props (Retry calls
// `onRetry`) and your own empty-state content as a `<div slot="empty">` child.
import { useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  STATES_EMPTY_ACTION,
  STATES_EMPTY_TEXT,
  STATES_INITIAL_MODE,
  STATES_MODES,
  STATES_OPTIONS,
  statesProps,
  statesTasks,
  type StatesMode,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function StatesExample() {
  const darkMode = useDarkMode();
  const [tasks] = useState(() => statesTasks(new Date()));
  const [mode, setMode] = useState<StatesMode>(STATES_INITIAL_MODE);
  // `tasks` (only in 'tasks'), `loading` and `errorMessage` for the chosen state
  const chart = statesProps(mode, tasks);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="states-mode-label">State</span>
          <div className="gs-seg" role="group" aria-labelledby="states-mode-label">
            {STATES_MODES.map(choice => (
              <button
                key={choice.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={mode === choice.value}
                onClick={() => setMode(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Gantry
        className="gs-chart gs-case-chart"
        tasks={chart.tasks}
        loading={chart.loading}
        errorMessage={chart.errorMessage}
        options={STATES_OPTIONS}
        darkMode={darkMode}
        // Retry on the error state: load again (here the tasks simply come back)
        onRetry={() => setMode('tasks')}
      >
        {/* Shown instead of the built-in text while there are no tasks */}
        <div slot="empty" className="gs-case-empty">
          <p>{STATES_EMPTY_TEXT}</p>
          <button type="button" className="gs-btn gs-btn--sm" onClick={() => setMode('tasks')}>
            {STATES_EMPTY_ACTION}
          </button>
        </div>
      </Gantry>
    </div>
  );
}

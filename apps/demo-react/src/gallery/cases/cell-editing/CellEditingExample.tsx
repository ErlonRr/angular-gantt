// The built-in cell editors (`editing`, whose `cells` is on unless set to false) in the task list
// beside the chart, or as a table (`view`). The chart keeps the edits by itself: `tasks` is set once.
import { Fragment, useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  CELL_EDITING_HINT,
  CELL_EDITING_INITIAL,
  CELL_EDITING_KEYS,
  CELL_EDITING_VIEWS,
  cellEditingOptions,
  cellEditingTasks,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function CellEditingExample() {
  const darkMode = useDarkMode();
  const [tasks] = useState(() => cellEditingTasks(new Date()));
  const [view, setView] = useState(CELL_EDITING_INITIAL.view);
  // New options keep the tasks, edits included
  const options = useMemo(() => cellEditingOptions(view), [view]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="cell-editing-view-label">View</span>
          <div className="gs-seg" role="group" aria-labelledby="cell-editing-view-label">
            {CELL_EDITING_VIEWS.map(choice => (
              <button
                key={choice.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={choice.value === view}
                onClick={() => setView(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Gantry className="gs-chart gs-case-chart" tasks={tasks} options={options} darkMode={darkMode} />
      <p className="gs-case-hint">{CELL_EDITING_HINT}</p>
      <dl className="gs-case-keys">
        {CELL_EDITING_KEYS.map(({ keys, action }) => (
          <Fragment key={action}>
            <dt>
              {keys.map(key => (
                <kbd key={key} className="gs-kbd">
                  {key}
                </kbd>
              ))}
            </dt>
            <dd>{action}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

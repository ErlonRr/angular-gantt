// Non-working time (`nonWorkingTime`): weekends and holidays shaded, hatched or greyed out (`style`);
// on the hour scale, the hours outside `workingHours` and an `intensiveHours` window too. The Scale
// buttons follow the chart's own zoom (`viewModeChange`).
import { useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  NON_WORKING_INITIAL,
  NON_WORKING_STYLES,
  NON_WORKING_VIEW_MODES,
  nonWorkingOptions,
  nonWorkingTasks,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function NonWorkingExample() {
  const darkMode = useDarkMode();
  // The holidays are placed around the same `now` as the tasks
  const [now] = useState(() => new Date());
  const [tasks] = useState(() => nonWorkingTasks(now));
  const [style, setStyle] = useState(NON_WORKING_INITIAL.style);
  // Days or Hours, or a level picked in the chart's toolbar (then no Scale button is pressed)
  const [viewMode, setViewMode] = useState<string>(NON_WORKING_INITIAL.viewMode);
  const options = useMemo(() => nonWorkingOptions(style, viewMode, now), [style, viewMode, now]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="non-working-style-label">Non-working time</span>
          <div className="gs-seg" role="group" aria-labelledby="non-working-style-label">
            {NON_WORKING_STYLES.map(s => (
              <button
                key={s.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={style === s.value}
                onClick={() => setStyle(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="gs-case-control">
          <span id="non-working-scale-label">Scale</span>
          <div className="gs-seg" role="group" aria-labelledby="non-working-scale-label">
            {NON_WORKING_VIEW_MODES.map(m => (
              <button
                key={m.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={viewMode === m.value}
                onClick={() => setViewMode(m.value)}
              >
                {m.label}
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
        onViewModeChange={e => setViewMode(e.viewMode)}
      />
    </div>
  );
}

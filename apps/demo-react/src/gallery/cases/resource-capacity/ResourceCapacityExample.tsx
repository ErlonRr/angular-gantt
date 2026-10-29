// Capacity and working time (`resources`, `calendar`): Ana's capacity moves the line her load is
// measured against, the Engineering team is two people, and with the working calendar on the weekend
// and the holiday carry no load. The chart and the status line follow the controls.
import { useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  CAPACITIES,
  CAPACITY_HINT,
  CAPACITY_INITIAL,
  capacityOptions,
  capacityResources,
  capacitySummary,
  capacityTasks,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function ResourceCapacityExample() {
  const darkMode = useDarkMode();
  // The holiday is placed around the same `now` as the tasks
  const [now] = useState(() => new Date());
  const [tasks] = useState(() => capacityTasks(now));
  const [anaCapacity, setAnaCapacity] = useState(CAPACITY_INITIAL.anaCapacity);
  const [calendar, setCalendar] = useState(CAPACITY_INITIAL.calendar);
  const resources = useMemo(() => capacityResources({ anaCapacity, calendar }), [anaCapacity, calendar]);
  const options = useMemo(() => capacityOptions({ anaCapacity, calendar }, now), [anaCapacity, calendar, now]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="resource-capacity-capacity-label">Ana&apos;s capacity</span>
          <div className="gs-seg" role="group" aria-labelledby="resource-capacity-capacity-label">
            {CAPACITIES.map(c => (
              <button
                key={c.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={anaCapacity === c.value}
                onClick={() => setAnaCapacity(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <label className="gs-switch gs-case-control">
          <span>Working calendar</span>
          <input
            id="resource-capacity-calendar"
            type="checkbox"
            role="switch"
            checked={calendar}
            onChange={e => setCalendar(e.target.checked)}
          />
        </label>
      </div>

      <Gantry
        className="gs-chart gs-case-chart"
        tasks={tasks}
        resources={resources}
        options={options}
        darkMode={darkMode}
      />
      <p className="gs-case-status">{capacitySummary(tasks, resources, options)}</p>
      <p className="gs-case-hint">{CAPACITY_HINT}</p>
    </div>
  );
}

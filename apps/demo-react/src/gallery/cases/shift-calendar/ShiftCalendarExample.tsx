// A shift calendar (`calendar.unit: 'hour'`): working hours with a lunch break and a short Friday
// (`nonWorkingTime.workingHours`); bars skip the hours off, and Duration cells read and parse hours,
// a day being `calendar.hoursPerDay`. The Scale buttons follow the chart's own zoom (`viewModeChange`).
import { useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  SHIFT_FRIDAYS,
  SHIFT_HINT,
  SHIFT_HOURS_PER_DAY,
  SHIFT_INITIAL,
  SHIFT_VIEW_MODES,
  shiftOptions,
  shiftTasks,
  type ShiftState,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function ShiftCalendarExample() {
  const darkMode = useDarkMode();
  const [tasks] = useState(() => shiftTasks(new Date()));
  // `viewMode` is Hours or Days, or a level picked in the chart's toolbar (then no Scale button is pressed)
  const [state, setState] = useState<ShiftState>(SHIFT_INITIAL);
  const options = useMemo(() => shiftOptions(state), [state]);
  const update = (patch: Partial<ShiftState>) => setState(s => ({ ...s, ...patch }));

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="shift-calendar-scale-label">Scale</span>
          <div className="gs-seg" role="group" aria-labelledby="shift-calendar-scale-label">
            {SHIFT_VIEW_MODES.map(m => (
              <button
                key={m.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={state.viewMode === m.value}
                onClick={() => update({ viewMode: m.value })}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="gs-case-control">
          <label htmlFor="shift-calendar-hours">Hours per day</label>
          {/* Picked by index: an option's value is a string, the hours are numbers */}
          <select
            id="shift-calendar-hours"
            className="gs-select"
            value={String(state.hoursPerDay)}
            onChange={e => update({ hoursPerDay: SHIFT_HOURS_PER_DAY[e.target.selectedIndex].value })}
          >
            {SHIFT_HOURS_PER_DAY.map(h => (
              <option key={h.value} value={String(h.value)}>
                {h.label}
              </option>
            ))}
          </select>
        </div>
        <div className="gs-case-control">
          <span id="shift-calendar-friday-label">Friday</span>
          <div className="gs-seg" role="group" aria-labelledby="shift-calendar-friday-label">
            {SHIFT_FRIDAYS.map(f => (
              <button
                key={f.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={state.friday === f.value}
                onClick={() => update({ friday: f.value })}
              >
                {f.label}
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
        onViewModeChange={e => update({ viewMode: e.viewMode })}
      />
      <p className="gs-case-hint">{SHIFT_HINT}</p>
    </div>
  );
}

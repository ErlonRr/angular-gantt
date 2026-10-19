// The app owns the tasks (`editing.controlled`): the chart proposes each change in `onBeforeChange`,
// where `detail.preventDefault()` vetoes it, and `onTasksChange` carries the proposed tasks, which
// the app sets itself (`setTasks(detail.tasks)`). The chart applies nothing and keeps no history.
import { useState } from 'react';
import { Gantry, type GanttBeforeChangeEvent } from '@gantryjs/react';
import { CONTROLLED_INITIAL, CONTROLLED_OPTIONS, controlledDecision, controlledTasks, pushLog } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function ControlledExample() {
  const darkMode = useDarkMode();
  // The plan as it was, built once: Reset sets it again
  const [initial] = useState(() => controlledTasks(new Date()));
  const [tasks, setTasks] = useState(initial);
  const [lockDone, setLockDone] = useState(CONTROLLED_INITIAL.lockDone);
  const [log, setLog] = useState<string[]>([]);

  // The app's rule, synchronously: veto any change to a finished task while the lock is on
  const decide = (detail: GanttBeforeChangeEvent) => {
    const { veto, line } = controlledDecision(detail, lockDone);
    if (veto) detail.preventDefault();
    setLog(lines => pushLog(lines, line));
  };

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <label className="gs-switch gs-case-control">
          <span>Lock finished tasks</span>
          <input type="checkbox" role="switch" checked={lockDone} onChange={e => setLockDone(e.target.checked)} />
        </label>
        <button type="button" className="gs-btn gs-btn--sm" onClick={() => setTasks(initial)}>
          Reset
        </button>
      </div>

      <Gantry
        className="gs-chart gs-case-chart"
        tasks={tasks}
        options={CONTROLLED_OPTIONS}
        darkMode={darkMode}
        onBeforeChange={decide}
        onTasksChange={detail => setTasks(detail.tasks)}
      />
      <ol className="gs-case-log" aria-label="Decisions">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </div>
  );
}

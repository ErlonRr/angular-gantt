// The plan with an editable Resources column and, synchronised below it, the workload of the same
// tasks (`rows: 'resources'`): one `createGanttSyncGroup()` in both charts' `syncGroup`, and the
// plan's `onTasksChange` hands each edit to the second chart.
import { useMemo, useState } from 'react';
import { Gantry, createGanttSyncGroup } from '@gantryjs/react';
import {
  PANEL_HINT,
  PANEL_INITIAL,
  overloadSummary,
  panelBottomOptions,
  panelResources,
  panelTasks,
  panelTopOptions,
  type PanelState,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function ResourcePanelExample() {
  const darkMode = useDarkMode();
  // Created once (a new group on every render would make the charts leave and join again)
  const [group] = useState(createGanttSyncGroup);
  const [resources] = useState(panelResources);
  const [topOptions] = useState(() => panelTopOptions());
  // Uncontrolled: the plan keeps each edit, so `initial` is only the starting plan
  const [initial] = useState(() => panelTasks(new Date()));
  const [tasks, setTasks] = useState(initial);
  const [state, setState] = useState<PanelState>(PANEL_INITIAL);
  const bottomOptions = useMemo(() => panelBottomOptions(state), [state]);
  const summary = useMemo(() => overloadSummary(tasks, resources, bottomOptions), [tasks, resources, bottomOptions]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <label className="gs-switch gs-case-control">
          <span>Show unassigned</span>
          <input
            id="resource-panel-unassigned"
            type="checkbox"
            role="switch"
            checked={state.unassigned}
            onChange={e => setState({ unassigned: e.target.checked })}
          />
        </label>
      </div>

      <div className="gs-case-stack">
        <div>
          <p className="gs-case-caption">Plan</p>
          <Gantry
            className="gs-chart gs-case-chart"
            tasks={initial}
            resources={resources}
            options={topOptions}
            syncGroup={group}
            darkMode={darkMode}
            onTasksChange={detail => setTasks(detail.tasks)}
          />
        </div>
        <div>
          <p className="gs-case-caption">Workload</p>
          {/* Only the plan shows its toolbar: its zoom reaches the workload through the group */}
          <Gantry
            className="gs-chart gs-case-chart"
            tasks={tasks}
            resources={resources}
            options={bottomOptions}
            syncGroup={group}
            showToolbar={false}
            darkMode={darkMode}
          />
        </div>
      </div>
      <p className="gs-case-status">{summary}</p>
      <p className="gs-case-hint">{PANEL_HINT}</p>
    </div>
  );
}

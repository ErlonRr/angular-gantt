// Links drawn and removed in the chart (`editing.dependencies`): from a connector, with two clicks or
// with L and Enter; Delete removes the selected link. `parentChild` allows links between a task and
// its own parent. Each accepted change calls `onTasksChange` and goes to the log.
import { Fragment, useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  DEPENDENCY_EDITING_INITIAL,
  LINK_KEYS,
  dependencyEditingOptions,
  dependencyEditingTasks,
  describeTasksChange,
  pushLog,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function DependencyEditingExample() {
  const darkMode = useDarkMode();
  // Uncontrolled: the chart keeps the links you draw (store `detail.tasks` to own them)
  const [tasks] = useState(() => dependencyEditingTasks(new Date()));
  const [parentChild, setParentChild] = useState(DEPENDENCY_EDITING_INITIAL.parentChild);
  const options = useMemo(() => dependencyEditingOptions(parentChild), [parentChild]);
  const [log, setLog] = useState<string[]>([]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <label className="gs-switch gs-case-control">
          <span>Parent–child links</span>
          <input
            id="dependency-editing-parent-child"
            type="checkbox"
            role="switch"
            checked={parentChild}
            onChange={e => setParentChild(e.target.checked)}
          />
        </label>
      </div>

      <Gantry
        className="gs-chart gs-case-chart"
        tasks={tasks}
        options={options}
        darkMode={darkMode}
        onTasksChange={detail => setLog(l => pushLog(l, describeTasksChange(detail, detail.tasks)))}
      />
      <dl className="gs-case-keys">
        {LINK_KEYS.map(({ keys, action }) => (
          <Fragment key={action}>
            <dt>
              {keys.map((key, i) => (
                <kbd key={i} className="gs-kbd">
                  {key}
                </kbd>
              ))}
            </dt>
            <dd>{action}</dd>
          </Fragment>
        ))}
      </dl>
      {/* Not a live region: the chart announces each change itself */}
      <ol className="gs-case-log" aria-label="Last changes">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </div>
  );
}

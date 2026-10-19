// The four dependency types with lag and lead (`task.dependency`), the critical path
// (`criticalPath`) and orthogonal or straight arrows (`arrows.routing`).
import { Fragment, useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  DEPENDENCIES_INITIAL,
  DEPENDENCIES_ROUTINGS,
  DEPENDENCY_LEGEND,
  dependenciesOptions,
  dependenciesTasks,
  type ArrowRouting,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function DependenciesExample() {
  const darkMode = useDarkMode();
  const [tasks] = useState(() => dependenciesTasks(new Date()));
  const [routing, setRouting] = useState<ArrowRouting>(DEPENDENCIES_INITIAL.routing);
  const [criticalPath, setCriticalPath] = useState(DEPENDENCIES_INITIAL.criticalPath);
  const options = useMemo(() => dependenciesOptions(routing, criticalPath), [routing, criticalPath]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="dependencies-arrows-label">Arrows</span>
          <div className="gs-seg" role="group" aria-labelledby="dependencies-arrows-label">
            {DEPENDENCIES_ROUTINGS.map(choice => (
              <button
                key={choice.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={routing === choice.value}
                onClick={() => setRouting(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        <label className="gs-switch gs-case-control">
          <span>Critical path</span>
          <input
            type="checkbox"
            role="switch"
            checked={criticalPath}
            onChange={e => setCriticalPath(e.target.checked)}
          />
        </label>
      </div>

      <Gantry className="gs-chart gs-case-chart" tasks={tasks} options={options} darkMode={darkMode} />
      {/* The link types of this plan */}
      <dl className="gs-case-keys">
        {DEPENDENCY_LEGEND.map(link => (
          <Fragment key={link.type}>
            <dt>
              <code className="gs-code-inline">{link.type}</code> {link.label}
            </dt>
            <dd>{link.example}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

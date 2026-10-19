// Parents that start collapsed (`groupBar.collapsed`) and roll up the dates and the progress of their
// children (`rollup`). The buttons call `expandAll()` / `collapseAll()` on the ref (the element itself).
import { useMemo, useRef, useState } from 'react';
import { Gantry, type GantryElement } from '@gantryjs/react';
import { ONLY_PARENTS_INITIAL_ROLLUP, TREE_ACTIONS, onlyParentsOptions, onlyParentsTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function OnlyParentsExample() {
  const darkMode = useDarkMode();
  const gantt = useRef<GantryElement>(null);
  const [tasks] = useState(() => onlyParentsTasks(new Date()));
  // Without the rollup the parents keep their own dates and progress
  const [rollup, setRollup] = useState(ONLY_PARENTS_INITIAL_ROLLUP);
  const options = useMemo(() => onlyParentsOptions(rollup), [rollup]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <label className="gs-switch gs-case-control">
          <span>Roll up children</span>
          <input type="checkbox" role="switch" checked={rollup} onChange={e => setRollup(e.target.checked)} />
        </label>
        {TREE_ACTIONS.map(action => (
          <button
            key={action.method}
            type="button"
            className="gs-btn gs-btn--sm"
            onClick={() => gantt.current?.[action.method]()}
          >
            {action.label}
          </button>
        ))}
      </div>

      <Gantry ref={gantt} className="gs-chart gs-case-chart" tasks={tasks} options={options} darkMode={darkMode} />
    </div>
  );
}

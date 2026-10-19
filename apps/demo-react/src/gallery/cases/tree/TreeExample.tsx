// A three-level task tree (`parentId`). The buttons call `expandAll()` / `collapseAll()` on the ref
// (the `<gantry-element>` itself); `onViewModeChange` receives `{ viewMode }` when the zoom changes.
import { useRef, useState } from 'react';
import { Gantry, type GantryElement } from '@gantryjs/react';
import { TREE_ACTIONS, TREE_OPTIONS, TREE_VIEW_MODE, treeTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function TreeExample() {
  const darkMode = useDarkMode();
  const gantt = useRef<GantryElement>(null);
  const [tasks] = useState(() => treeTasks(new Date()));
  const [viewMode, setViewMode] = useState<string>(TREE_VIEW_MODE);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
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

      <Gantry
        ref={gantt}
        className="gs-chart gs-case-chart"
        tasks={tasks}
        options={TREE_OPTIONS}
        darkMode={darkMode}
        onViewModeChange={e => setViewMode(e.viewMode)}
      />

      <p className="gs-case-hint">Zoom level: {viewMode}</p>
    </div>
  );
}

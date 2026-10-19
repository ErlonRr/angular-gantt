// Bars you drag, resize, set the progress of (the grip, or ↑ / ↓ in move mode) and undo. The buttons
// call `undo()` / `redo()` on the ref (the `<gantry-element>`), `onHistoryChange` gives `canUndo` /
// `canRedo` (`aria-disabled`, not `disabled`: an unavailable button keeps focus), and `onTasksChange`
// feeds the log of the last changes.
import { useRef, useState } from 'react';
import { Gantry, type GantryElement } from '@gantryjs/react';
import { EDITING_OPTIONS, describeTasksChange, editingTasks, pushLog } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function EditingExample() {
  const darkMode = useDarkMode();
  const gantt = useRef<GantryElement>(null);
  // Uncontrolled: the chart keeps each edit, so these tasks are only the starting plan
  const [tasks] = useState(() => editingTasks(new Date()));
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [log, setLog] = useState<string[]>([]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <button
          id="editing-undo"
          type="button"
          className="gs-btn gs-btn--sm"
          aria-disabled={history.canUndo ? undefined : true}
          onClick={() => history.canUndo && gantt.current?.undo()}
        >
          Undo
        </button>
        <button
          id="editing-redo"
          type="button"
          className="gs-btn gs-btn--sm"
          aria-disabled={history.canRedo ? undefined : true}
          onClick={() => history.canRedo && gantt.current?.redo()}
        >
          Redo
        </button>
      </div>

      <Gantry
        ref={gantt}
        className="gs-chart gs-case-chart"
        tasks={tasks}
        options={EDITING_OPTIONS}
        darkMode={darkMode}
        onHistoryChange={setHistory}
        onTasksChange={change => setLog(log => pushLog(log, describeTasksChange(change, change.tasks)))}
      />

      {/* Not a live region: the chart announces each change itself */}
      <ol className="gs-case-log" aria-label="Last changes">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </div>
  );
}

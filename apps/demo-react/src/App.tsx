import { useMemo, useRef, useState } from 'react';
import { Gantry, ViewMode, type GantryElement, type GanttTask } from '@gantry/react';
import { createDemoData } from '@gantry/core/demo';
import '../../demo.css';

export default function App() {
  const gantt = useRef<GantryElement>(null);
  // The demo plan is moved so today sits inside it (lazy initialiser: computed once)
  const [demo] = useState(() => createDemoData());
  const [tasks, setTasks] = useState<GanttTask[]>(demo.tasks);
  const [viewMode, setViewMode] = useState<string>(ViewMode.Month);
  const [baseline, setBaseline] = useState(false);
  const [criticalPath, setCriticalPath] = useState(false);
  const [dark, setDark] = useState(true);
  const [log, setLog] = useState('');

  const options = useMemo(() => ({ viewMode, baseline, criticalPath }), [viewMode, baseline, criticalPath]);

  const applyDates = (taskId: string, start: Date, end: Date) =>
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, start, end } : t)));

  return (
    <div className="demo">
      <header className="demo-header">
        <h1>Gantry · React</h1>
        <div className="demo-group">
          <span className="demo-label">Features</span>
          <button aria-pressed={baseline} onClick={() => setBaseline(b => !b)}>
            Baseline
          </button>
          <button aria-pressed={criticalPath} onClick={() => setCriticalPath(c => !c)}>
            Critical path
          </button>
          <button aria-pressed={dark} onClick={() => setDark(d => !d)}>
            Dark
          </button>
          <button onClick={() => gantt.current?.scrollToToday()}>Today</button>
        </div>
        <div className="demo-group">
          <span className="demo-label">View</span>
          <select value={viewMode} onChange={e => setViewMode(e.target.value)}>
            {Object.values(ViewMode).map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <span className="demo-log">{log}</span>
      </header>
      <Gantry
        ref={gantt}
        className="demo-chart"
        tasks={tasks}
        annotations={demo.annotations}
        options={options}
        darkMode={dark}
        showLegend
        onTaskDragged={e => {
          applyDates(e.taskId, e.newStart, e.newEnd);
          setLog(`moved ${e.taskId} by ${e.daysMoved} day(s)`);
        }}
        onTaskResized={e => {
          applyDates(e.taskId, e.newStart, e.newEnd);
          setLog(`resized ${e.taskId} (${e.handle}) by ${e.daysDelta} day(s)`);
        }}
        onSelectionChange={e => setLog(`selected: ${e.selectedIds.join(', ') || 'none'}`)}
        onViewModeChange={e => setViewMode(e.viewMode)}
      />
    </div>
  );
}

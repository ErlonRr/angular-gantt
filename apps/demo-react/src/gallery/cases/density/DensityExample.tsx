// Density: compact, normal or comfortable rows, header and toolbar (`density`). The chart sets
// its row and bar heights as read-only CSS variables on its element; the side list copies them
// from the element (through the ref) and its CSS sizes its rows with them.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Gantry, type GantryElement } from '@gantryjs/react';
import {
  DENSITIES,
  DENSITY_CSS_VARIABLES,
  DENSITY_INITIAL,
  densityOptions,
  densityTasks,
  type DensityCssVariable,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';
import './density.css';

export default function DensityExample() {
  const darkMode = useDarkMode();
  const chart = useRef<GantryElement>(null);
  const [tasks] = useState(() => densityTasks(new Date()));
  const [density, setDensity] = useState(DENSITY_INITIAL);
  const [layout, setLayout] = useState<Partial<Record<DensityCssVariable, string>>>({});
  const options = useMemo(() => densityOptions(density), [density]);

  // The chart has its new options by now (<Gantry> sets them before this effect runs): copy its variables
  useEffect(() => {
    const el = chart.current;
    if (!el) return;
    const style = getComputedStyle(el);
    setLayout(Object.fromEntries(DENSITY_CSS_VARIABLES.map(name => [name, style.getPropertyValue(name)])));
  }, [options]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="density-density-label">Density</span>
          <div className="gs-seg" role="group" aria-labelledby="density-density-label">
            {DENSITIES.map(choice => (
              <button
                key={choice.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={choice.value === density}
                onClick={() => setDensity(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="gs-case-split">
        <div>
          <p id="density-list-caption" className="gs-case-caption">
            Page content at the chart’s row pitch
          </p>
          <ul className="density-list" aria-labelledby="density-list-caption" style={layout as CSSProperties}>
            {tasks.map(task => (
              <li key={task.id}>
                <span>{task.name}</span>
              </li>
            ))}
          </ul>
        </div>
        <Gantry ref={chart} className="gs-chart gs-case-chart" tasks={tasks} options={options} darkMode={darkMode} />
      </div>
      <p className="gs-case-hint">
        The chart sets <code className="gs-code-inline">--gantt-row-height: {layout['--gantt-row-height']}</code> and{' '}
        <code className="gs-code-inline">--gantt-bar-height: {layout['--gantt-bar-height']}</code> on its element.
      </p>
    </div>
  );
}

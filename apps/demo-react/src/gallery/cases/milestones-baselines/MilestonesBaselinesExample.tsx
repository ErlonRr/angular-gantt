// Milestones (`type: TaskType.Milestone`) in three shapes (`milestone.shape`), and baseline bars
// (`task.baseline`, shown with `baseline: true`) under the actual dates; the Variance column reads the difference.
import { useMemo, useState } from 'react';
import { Gantry } from '@gantryjs/react';
import {
  MILESTONE_SHAPES,
  MILESTONES_BASELINES_INITIAL,
  milestonesBaselinesOptions,
  milestonesBaselinesTasks,
  type MilestoneShape,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function MilestonesBaselinesExample() {
  const darkMode = useDarkMode();
  // The plan, with `baseline: { start, end }` on the tasks that slipped or ran early
  const [tasks] = useState(() => milestonesBaselinesTasks(new Date()));
  const [shape, setShape] = useState<MilestoneShape>(MILESTONES_BASELINES_INITIAL.shape);
  const [baseline, setBaseline] = useState(MILESTONES_BASELINES_INITIAL.baseline);
  const options = useMemo(() => milestonesBaselinesOptions(shape, baseline), [shape, baseline]);

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <div className="gs-case-control">
          <span id="milestones-baselines-shape-label">Milestone shape</span>
          <div className="gs-seg" role="group" aria-labelledby="milestones-baselines-shape-label">
            {MILESTONE_SHAPES.map(choice => (
              <button
                key={choice.value}
                type="button"
                className="gs-seg-btn"
                aria-pressed={shape === choice.value}
                onClick={() => setShape(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
        <label className="gs-switch gs-case-control">
          <span>Baselines</span>
          <input type="checkbox" role="switch" checked={baseline} onChange={e => setBaseline(e.target.checked)} />
        </label>
      </div>

      <Gantry className="gs-chart gs-case-chart" tasks={tasks} options={options} darkMode={darkMode} />
    </div>
  );
}

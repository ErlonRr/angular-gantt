// Three pipelines on one timeline: the same `createGanttSyncGroup()` in every chart's `syncGroup`
// keeps the range, the zoom level, the horizontal scroll and the task-list width in step.
import { useState } from 'react';
import { Gantry, createGanttSyncGroup } from '@gantryjs/react';
import { MULTI_PIPELINE_NAMES, multiPipelineOptions, multiPipelineTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function MultiPipelineExample() {
  const darkMode = useDarkMode();
  // Created once (a new group on every render would make the charts leave and join again)
  const [group] = useState(createGanttSyncGroup);
  const [pipelines] = useState(() => {
    const now = new Date();
    return MULTI_PIPELINE_NAMES.map(name => ({
      name,
      tasks: multiPipelineTasks(name, now),
      options: multiPipelineOptions(name),
    }));
  });

  return (
    <div className="gs-case">
      <div className="gs-case-stack">
        {pipelines.map(({ name, tasks, options }, i) => (
          <div key={name}>
            <p className="gs-case-caption">{name} pipeline</p>
            <Gantry
              className="gs-chart gs-case-chart"
              tasks={tasks}
              options={options}
              syncGroup={group}
              // Only the first chart shows its toolbar: its zoom reaches the others through the group
              showToolbar={i === 0}
              darkMode={darkMode}
            />
          </div>
        ))}
      </div>
      <p className="gs-case-hint">Zoom, scroll or drag the splitter in any chart: the other two follow.</p>
    </div>
  );
}

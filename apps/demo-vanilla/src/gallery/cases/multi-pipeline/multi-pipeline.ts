// Three pipelines on one timeline: the same `createGanttSyncGroup()` in every chart's `syncGroup`
// keeps the range, the zoom level, the horizontal scroll and the task-list width in step.
import { createGanttSyncGroup } from '@gantryjs/vanilla';
import { MULTI_PIPELINE_NAMES, multiPipelineOptions, multiPipelineTasks } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  const now = new Date();
  // One group per mount (each chart joins it when connected and leaves it when removed)
  const group = createGanttSyncGroup();

  const stack = document.createElement('div');
  stack.className = 'gs-case-stack';
  const charts = MULTI_PIPELINE_NAMES.map((name, i) => {
    const chart = document.createElement('gantry-element');
    chart.className = 'gs-chart gs-case-chart';
    chart.tasks = multiPipelineTasks(name, now);
    chart.options = multiPipelineOptions(name);
    chart.syncGroup = group;
    // Only the first chart shows its toolbar: its zoom reaches the others through the group
    chart.showToolbar = i === 0;

    const caption = document.createElement('p');
    caption.className = 'gs-case-caption';
    caption.textContent = `${name} pipeline`;
    const item = document.createElement('div');
    item.append(caption, chart);
    stack.append(item);
    return chart;
  });

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = 'Zoom, scroll or drag the splitter in any chart: the other two follow.';

  const stopTheme = followSiteTheme(...charts);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(stack, hint);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

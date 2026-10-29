// A resource view (`rows`): one row per person and team, drawing the daily load against the capacity line,
// the part above it hatched. `resources` holds the people, each task's `resources` the assignments.
// `state-change` brings the toolbar's Rows toggle and zoom back to the controls.
import '@gantryjs/vanilla';
import {
  LOAD_SCALES,
  RESOURCE_LOAD_HINT,
  RESOURCE_LOAD_INITIAL,
  RESOURCE_ROWS,
  loadOptions,
  loadResources,
  loadTasks,
  overloadSummary,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';
import { segmented, toggle } from './controls';

export function mount(host: HTMLElement): () => void {
  const now = new Date();
  const state = { ...RESOURCE_LOAD_INITIAL };
  const tasks = loadTasks(now);
  const resources = loadResources();
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = tasks;
  chart.resources = resources;
  const status = document.createElement('p');
  status.className = 'gs-case-status';

  // The options and the status line follow the controls
  const apply = () => {
    const options = loadOptions(state, now);
    chart.options = options;
    status.textContent = overloadSummary(tasks, resources, options);
  };
  apply();

  const rows = segmented('resource-load-rows', 'Rows', RESOURCE_ROWS, state.rows, value => {
    state.rows = value;
    apply();
  });
  const scale = segmented('resource-load-scale', 'Scale', LOAD_SCALES, state.viewMode, value => {
    state.viewMode = value;
    apply();
  });
  // The chart's own toolbar switches the rows and the zoom too
  chart.addEventListener('state-change', event => {
    const { rows: shown = state.rows, viewMode = state.viewMode } = event.detail;
    if (shown === state.rows && viewMode === state.viewMode) return;
    state.rows = shown;
    state.viewMode = viewMode;
    rows.press(shown);
    scale.press(viewMode);
    apply();
  });

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    rows.control,
    scale.control,
    toggle('resource-load-unassigned', 'Show unassigned', state.unassigned, checked => {
      state.unassigned = checked;
      apply();
    }),
    toggle('resource-load-over', 'Highlight over-allocation', state.overallocation, checked => {
      state.overallocation = checked;
      apply();
    }),
  );

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = RESOURCE_LOAD_HINT;

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, status, hint);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

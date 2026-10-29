// A working calendar (`calendar`): durations count working days, so a bar dragged across a weekend or
// a holiday keeps its working days and stretches over the days off, and edits skip non-working time
// (`skipNonWorking`). `tasks-change` hands the edited tasks back for the status line.
import '@gantryjs/vanilla';
import {
  WORKING_DAYS_HINT,
  WORKING_DAYS_INITIAL,
  WORKING_DURATIONS,
  WORKING_SHADINGS,
  workingDaysOptions,
  workingDaysTasks,
  workingSummary,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';
import { segmented } from './segmented';

export function mount(host: HTMLElement): () => void {
  // The holidays are placed around the same `now` as the tasks
  const now = new Date();
  const state = { ...WORKING_DAYS_INITIAL };
  // The edited tasks: the chart keeps them itself, `tasks-change` reports them for the status line
  let tasks = workingDaysTasks(now);
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = tasks;
  const status = document.createElement('p');
  status.className = 'gs-case-status';

  let options = workingDaysOptions(state, now);
  const refresh = () => (status.textContent = workingSummary(tasks, options));
  // The options and the status line follow the controls
  const apply = () => {
    options = workingDaysOptions(state, now);
    chart.options = options;
    refresh();
  };
  apply();
  chart.addEventListener('tasks-change', event => {
    tasks = event.detail.tasks;
    refresh();
  });

  const skip = document.createElement('input');
  skip.id = 'working-days-skip';
  skip.type = 'checkbox';
  skip.setAttribute('role', 'switch');
  skip.checked = state.skipNonWorking;
  skip.addEventListener('change', () => {
    state.skipNonWorking = skip.checked;
    apply();
  });
  const skipText = document.createElement('span');
  skipText.textContent = 'Skip non-working time';
  const skipSwitch = document.createElement('label');
  skipSwitch.className = 'gs-switch gs-case-control';
  skipSwitch.append(skipText, skip);

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    segmented('working-days-durations', 'Durations', WORKING_DURATIONS, state.durations, value => {
      state.durations = value;
      apply();
    }),
    skipSwitch,
    segmented('working-days-shading', 'Shading', WORKING_SHADINGS, state.shading, value => {
      state.shading = value;
      apply();
    }),
  );

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = WORKING_DAYS_HINT;

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

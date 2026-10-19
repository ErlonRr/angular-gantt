// The chart's loading, empty and error states: the `loading` and `errorMessage` properties (Retry
// fires the `retry` event) and your own empty-state content as a `<div slot="empty">` child.
import '@gantryjs/vanilla';
import {
  STATES_EMPTY_ACTION,
  STATES_EMPTY_TEXT,
  STATES_INITIAL_MODE,
  STATES_MODES,
  STATES_OPTIONS,
  statesProps,
  statesTasks,
  type StatesMode,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  const plan = statesTasks(new Date());
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.options = STATES_OPTIONS;

  // Shown instead of the built-in text while there are no tasks
  const empty = document.createElement('div');
  empty.slot = 'empty';
  empty.className = 'gs-case-empty';
  const emptyText = document.createElement('p');
  emptyText.textContent = STATES_EMPTY_TEXT;
  const addTasks = document.createElement('button');
  addTasks.type = 'button';
  addTasks.className = 'gs-btn gs-btn--sm';
  addTasks.textContent = STATES_EMPTY_ACTION;
  addTasks.addEventListener('click', () => show('tasks'));
  empty.append(emptyText, addTasks);
  chart.append(empty);

  // Retry on the error state: load again (here the tasks simply come back)
  chart.addEventListener('retry', () => show('tasks'));

  // "State": a segmented control
  const label = document.createElement('span');
  label.id = 'states-mode-label';
  label.textContent = 'State';
  const group = document.createElement('div');
  group.className = 'gs-seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', label.id);
  const buttons = new Map<StatesMode, HTMLButtonElement>();
  for (const { value, label: text } of STATES_MODES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gs-seg-btn';
    button.textContent = text;
    button.addEventListener('click', () => show(value));
    buttons.set(value, button);
    group.append(button);
  }
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(label, group);
  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(control);

  /** `tasks` (only in 'tasks'), `loading` and `errorMessage` for the chosen state */
  function show(mode: StatesMode): void {
    const { tasks, loading, errorMessage } = statesProps(mode, plan);
    chart.tasks = tasks;
    chart.loading = loading;
    chart.errorMessage = errorMessage;
    for (const [value, button] of buttons) button.setAttribute('aria-pressed', String(value === mode));
  }
  show(STATES_INITIAL_MODE);

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

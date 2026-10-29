// The plan with an editable Resources column and, synchronised below it, the workload of the same
// tasks (`rows: 'resources'`): one `createGanttSyncGroup()` in both charts' `syncGroup`, and the
// plan's `tasks-change` hands each edit to the second chart.
import { createGanttSyncGroup } from '@gantryjs/vanilla';
import {
  PANEL_HINT,
  PANEL_INITIAL,
  overloadSummary,
  panelBottomOptions,
  panelResources,
  panelTasks,
  panelTopOptions,
  type PanelState,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  let state: PanelState = { ...PANEL_INITIAL };
  const resources = panelResources();
  let bottomOptions = panelBottomOptions(state);
  // Uncontrolled: the plan keeps each edit and reports the current tasks in `tasks-change`
  let tasks = panelTasks(new Date());
  // One group per mount (each chart joins it when connected and leaves it when removed)
  const group = createGanttSyncGroup();

  const plan = document.createElement('gantry-element');
  plan.className = 'gs-chart gs-case-chart';
  plan.tasks = tasks;
  plan.resources = resources;
  plan.options = panelTopOptions();
  plan.syncGroup = group;

  const workload = document.createElement('gantry-element');
  workload.className = 'gs-chart gs-case-chart';
  workload.tasks = tasks;
  workload.resources = resources;
  workload.options = bottomOptions;
  workload.syncGroup = group;
  // Only the plan shows its toolbar: its zoom reaches the workload through the group
  workload.showToolbar = false;

  const status = document.createElement('p');
  status.className = 'gs-case-status';
  const showSummary = () => {
    status.textContent = overloadSummary(tasks, resources, bottomOptions);
  };
  showSummary();
  plan.addEventListener('tasks-change', event => {
    tasks = event.detail.tasks;
    workload.tasks = tasks;
    showSummary();
  });

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    toggle('resource-panel-unassigned', 'Show unassigned', state.unassigned, unassigned => {
      state = { ...state, unassigned };
      bottomOptions = panelBottomOptions(state);
      workload.options = bottomOptions;
      showSummary();
    }),
  );

  const stack = document.createElement('div');
  stack.className = 'gs-case-stack';
  stack.append(captioned('Plan', plan), captioned('Workload', workload));

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = PANEL_HINT;

  const stopTheme = followSiteTheme(plan, workload);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, stack, status, hint);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

/** A chart under its caption. */
function captioned(text: string, chart: HTMLElement): HTMLElement {
  const caption = document.createElement('p');
  caption.className = 'gs-case-caption';
  caption.textContent = text;
  const item = document.createElement('div');
  item.append(caption, chart);
  return item;
}

/** A switch: a checkbox with `role="switch"` inside its label. */
function toggle(id: string, label: string, checked: boolean, onToggle: (on: boolean) => void): HTMLElement {
  const input = document.createElement('input');
  input.id = id;
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.checked = checked;
  input.addEventListener('change', () => onToggle(input.checked));
  const text = document.createElement('span');
  text.textContent = label;
  const control = document.createElement('label');
  control.className = 'gs-switch gs-case-control';
  control.append(text, input);
  return control;
}

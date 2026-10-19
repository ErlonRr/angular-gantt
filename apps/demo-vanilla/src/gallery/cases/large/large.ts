// 10,000 tasks in a tree, virtualised in both panes: only the rows in view are in the DOM. Each plan
// is handed over as a new array (the element compares `tasks` by reference: replace the array to
// update it, never mutate it in place).
import '@gantryjs/vanilla';
import type { GanttTask } from '@gantryjs/vanilla';
import { LARGE_COUNT, LARGE_COUNTS, LARGE_OPTIONS, largeCaseTasks } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  const now = new Date();
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.options = LARGE_OPTIONS;

  // The task count, next to the controls (the element has no toolbar slot)
  const total = document.createElement('span');
  total.className = 'gs-pill';
  const show = (tasks: GanttTask[]) => {
    chart.tasks = tasks;
    total.textContent = `${tasks.length.toLocaleString('en-US')} tasks`;
  };
  show(largeCaseTasks(LARGE_COUNT, now));

  // "Rows": a segmented control
  const label = document.createElement('span');
  label.id = 'large-rows-label';
  label.textContent = 'Rows';
  const group = document.createElement('div');
  group.className = 'gs-seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', label.id);
  const buttons = LARGE_COUNTS.map(({ value, label: text }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gs-seg-btn';
    button.textContent = text;
    button.setAttribute('aria-pressed', String(value === LARGE_COUNT));
    button.addEventListener('click', () => {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === button));
      show(largeCaseTasks(value, now));
    });
    return button;
  });
  group.append(...buttons);
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(label, group);
  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(control, total);

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = 'Scroll either pane: only the rows in view are in the DOM.';

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, hint);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

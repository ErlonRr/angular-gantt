// The built-in cell editors (`options.editing`, whose `cells` is on unless set to false) in the task
// list beside the chart, or as a table (`options.view`). The chart keeps the edits by itself.
import '@gantryjs/vanilla';
import {
  CELL_EDITING_HINT,
  CELL_EDITING_INITIAL,
  CELL_EDITING_KEYS,
  CELL_EDITING_VIEWS,
  cellEditingOptions,
  cellEditingTasks,
  type CellEditingView,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = cellEditingTasks(new Date());

  // "View": a segmented control over the shared choices
  const label = document.createElement('span');
  label.id = 'cell-editing-view-label';
  label.textContent = 'View';
  const group = document.createElement('div');
  group.className = 'gs-seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', label.id);
  const buttons = CELL_EDITING_VIEWS.map(choice => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gs-seg-btn';
    button.textContent = choice.label;
    button.addEventListener('click', () => pick(choice.value));
    return button;
  });
  group.append(...buttons);
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(label, group);
  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(control);

  // New options keep the tasks, edits included
  function pick(view: CellEditingView): void {
    chart.options = cellEditingOptions(view);
    CELL_EDITING_VIEWS.forEach(({ value }, i) => buttons[i].setAttribute('aria-pressed', String(value === view)));
  }
  pick(CELL_EDITING_INITIAL.view);

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = CELL_EDITING_HINT;

  // The key map: the keys of each row in <kbd>, then what they do
  const keys = document.createElement('dl');
  keys.className = 'gs-case-keys';
  for (const { keys: combo, action } of CELL_EDITING_KEYS) {
    const term = document.createElement('dt');
    for (const key of combo) {
      const kbd = document.createElement('kbd');
      kbd.className = 'gs-kbd';
      kbd.textContent = key;
      term.append(kbd);
    }
    const detail = document.createElement('dd');
    detail.textContent = action;
    keys.append(term, detail);
  }

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, hint, keys);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

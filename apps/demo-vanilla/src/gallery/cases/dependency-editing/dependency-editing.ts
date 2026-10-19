// Links drawn and removed in the chart (`editing.dependencies`): from a connector, with two clicks or
// with L and Enter; Delete removes the selected link. `parentChild` allows links between a task and
// its own parent. Each accepted change fires `tasks-change` and goes to the log.
import '@gantryjs/vanilla';
import {
  DEPENDENCY_EDITING_INITIAL,
  LINK_KEYS,
  dependencyEditingOptions,
  dependencyEditingTasks,
  describeTasksChange,
  pushLog,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  // Uncontrolled: the element keeps the links you draw in its own `tasks`
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = dependencyEditingTasks(new Date());
  chart.options = dependencyEditingOptions(DEPENDENCY_EDITING_INITIAL.parentChild);

  const input = document.createElement('input');
  input.id = 'dependency-editing-parent-child';
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.checked = DEPENDENCY_EDITING_INITIAL.parentChild;
  input.addEventListener('change', () => {
    chart.options = dependencyEditingOptions(input.checked);
  });
  const caption = document.createElement('span');
  caption.textContent = 'Parent–child links';
  const toggle = document.createElement('label');
  toggle.className = 'gs-switch gs-case-control';
  toggle.append(caption, input);
  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(toggle);

  // The ways to link: the keys of each row in <kbd>, then what they do
  const keys = document.createElement('dl');
  keys.className = 'gs-case-keys';
  for (const { keys: combo, action } of LINK_KEYS) {
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

  // Not a live region: the chart announces each change itself
  const list = document.createElement('ol');
  list.className = 'gs-case-log';
  list.setAttribute('aria-label', 'Last changes');
  let log: string[] = [];
  chart.addEventListener('tasks-change', e => {
    log = pushLog(log, describeTasksChange(e.detail, e.detail.tasks));
    list.replaceChildren(
      ...log.map(line => {
        const item = document.createElement('li');
        item.textContent = line;
        return item;
      }),
    );
  });

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, keys, list);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

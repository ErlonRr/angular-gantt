// The app owns the tasks (`editing.controlled`): the chart proposes each change in a cancelable
// `before-change` event, where `event.preventDefault()` vetoes it, and `tasks-change` carries the
// proposed tasks, which the app sets itself (`chart.tasks = event.detail.tasks`). The chart applies
// nothing and keeps no history.
import '@gantryjs/vanilla';
import { CONTROLLED_INITIAL, CONTROLLED_OPTIONS, controlledDecision, controlledTasks, pushLog } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  // The plan as it was, built once: Reset sets it again
  const initial = controlledTasks(new Date());
  let lockDone = CONTROLLED_INITIAL.lockDone;
  let lines: string[] = [];

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.options = CONTROLLED_OPTIONS;
  chart.tasks = initial;

  const log = document.createElement('ol');
  log.className = 'gs-case-log';
  log.setAttribute('aria-label', 'Decisions');

  // The app's rule, synchronously: veto any change to a finished task while the lock is on
  chart.addEventListener('before-change', event => {
    const { veto, line } = controlledDecision(event.detail, lockDone);
    if (veto) event.preventDefault();
    lines = pushLog(lines, line);
    log.replaceChildren(
      ...lines.map(text => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      }),
    );
  });
  // Nothing was applied: the app sets the proposed tasks
  chart.addEventListener('tasks-change', event => {
    chart.tasks = event.detail.tasks;
  });

  // "Lock finished tasks": a switch
  const lock = document.createElement('input');
  lock.type = 'checkbox';
  lock.setAttribute('role', 'switch');
  lock.checked = lockDone;
  lock.addEventListener('change', () => (lockDone = lock.checked));
  const lockText = document.createElement('span');
  lockText.textContent = 'Lock finished tasks';
  const lockSwitch = document.createElement('label');
  lockSwitch.className = 'gs-switch gs-case-control';
  lockSwitch.append(lockText, lock);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'gs-btn gs-btn--sm';
  reset.textContent = 'Reset';
  reset.addEventListener('click', () => (chart.tasks = initial));

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(lockSwitch, reset);

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, log);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

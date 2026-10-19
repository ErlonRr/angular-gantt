// Bars you drag, resize, set the progress of (the grip, or ↑ / ↓ in move mode) and undo. The buttons
// call the element's `undo()` / `redo()` and read its `canUndo` / `canRedo` getters on
// `history-change` (`aria-disabled`, not `disabled`: an unavailable button keeps focus);
// `tasks-change` feeds the log of the last changes.
import '@gantryjs/vanilla';
import { EDITING_OPTIONS, describeTasksChange, editingTasks, pushLog } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  // Uncontrolled: the element keeps each edit, and `tasks-change` reports the new array
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = editingTasks(new Date());
  chart.options = EDITING_OPTIONS;

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  const button = (id: string, label: string, run: () => void) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.id = id;
    el.className = 'gs-btn gs-btn--sm';
    el.textContent = label;
    el.ariaDisabled = 'true';
    el.addEventListener('click', () => {
      if (el.ariaDisabled !== 'true') run();
    });
    controls.append(el);
    return el;
  };
  const undo = button('editing-undo', 'Undo', () => chart.undo());
  const redo = button('editing-redo', 'Redo', () => chart.redo());
  chart.addEventListener('history-change', () => {
    undo.ariaDisabled = chart.canUndo ? null : 'true';
    redo.ariaDisabled = chart.canRedo ? null : 'true';
  });

  // Not a live region: the chart announces each change itself
  const log = document.createElement('ol');
  log.className = 'gs-case-log';
  log.setAttribute('aria-label', 'Last changes');
  let lines: string[] = [];
  chart.addEventListener('tasks-change', ({ detail }) => {
    lines = pushLog(lines, describeTasksChange(detail, detail.tasks));
    log.replaceChildren(
      ...lines.map(line => {
        const item = document.createElement('li');
        item.textContent = line;
        return item;
      }),
    );
  });

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

import '../../demo.css';
import '@gantry/vanilla';
import { ViewMode, type GanttOptions } from '@gantry/vanilla';
import { DEMO_TASKS, DEMO_ANNOTATIONS } from '@gantry/core/demo';

const gantt = document.querySelector('gantry-element')!;
const log = document.getElementById('log')!;
const options: GanttOptions = { viewMode: ViewMode.Month, baseline: false, criticalPath: false };

gantt.tasks = DEMO_TASKS;
gantt.annotations = DEMO_ANNOTATIONS;
gantt.options = options;
gantt.showLegend = true;

gantt.addEventListener('task-dragged', e => {
  log.textContent = `moved ${e.detail.taskId} by ${e.detail.daysMoved} day(s)`;
});
gantt.addEventListener('task-resized', e => {
  log.textContent = `resized ${e.detail.taskId} (${e.detail.handle}) by ${e.detail.daysDelta} day(s)`;
});
gantt.addEventListener('selection-change', e => {
  log.textContent = `selected: ${e.detail.selectedIds.join(', ') || 'none'}`;
});

const select = document.getElementById('view-mode') as HTMLSelectElement;
select.addEventListener('change', () => gantt.setViewMode(select.value as ViewMode));
gantt.addEventListener('view-mode-change', e => { select.value = e.detail.viewMode; });

function toggle(id: string, apply: (on: boolean) => void): void {
  const btn = document.getElementById(id)!;
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on));
    apply(on);
  });
}
toggle('baseline', on => { gantt.options = { ...gantt.options, baseline: on }; });
toggle('critical', on => { gantt.options = { ...gantt.options, criticalPath: on }; });
toggle('dark', on => { gantt.darkMode = on; });

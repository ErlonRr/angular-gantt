// The critical path, lags and float counted in working time: `calendar.durations` picks working or
// calendar days and `nonWorkingTime.weekends` the days off. The Float column is a `ColumnDef` with a
// `render` function; the line under the chart follows each edit reported by `tasks-change`.
import '@gantryjs/vanilla';
import {
  CRITICAL_DURATIONS,
  CRITICAL_FLOAT_HINT,
  CRITICAL_FLOAT_INITIAL,
  criticalFloatOptions,
  criticalFloatTasks,
  criticalSummary,
  type CriticalFloatState,
  type GalleryChoice,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  let state: CriticalFloatState = { ...CRITICAL_FLOAT_INITIAL };
  let options = criticalFloatOptions(state);
  // Uncontrolled: the chart keeps each edit and reports the current tasks in `tasks-change`
  let tasks = criticalFloatTasks(new Date());

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = tasks;
  chart.options = options;

  const status = document.createElement('p');
  status.className = 'gs-case-status';
  const showSummary = () => {
    status.textContent = criticalSummary(tasks, options);
  };
  showSummary();
  chart.addEventListener('tasks-change', event => {
    tasks = event.detail.tasks;
    showSummary();
  });

  const apply = (change: Partial<CriticalFloatState>) => {
    state = { ...state, ...change };
    options = criticalFloatOptions(state);
    chart.options = options;
    showSummary();
  };

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    segmented('critical-float-durations', 'Durations', CRITICAL_DURATIONS, state.durations, durations =>
      apply({ durations }),
    ),
    toggle('critical-float-saturdays', 'Work on Saturdays', state.saturdays, saturdays => apply({ saturdays })),
  );

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = CRITICAL_FLOAT_HINT;

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

/** A segmented control: a labelled group of buttons, the picked one pressed. */
function segmented<T extends string>(
  id: string,
  label: string,
  choices: readonly GalleryChoice<T>[],
  initial: T,
  onPick: (value: T) => void,
): HTMLElement {
  const caption = document.createElement('span');
  caption.id = `${id}-label`;
  caption.textContent = label;
  const group = document.createElement('div');
  group.className = 'gs-seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', caption.id);
  for (const choice of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gs-seg-btn';
    button.textContent = choice.label;
    button.setAttribute('aria-pressed', String(choice.value === initial));
    button.addEventListener('click', () => {
      for (const b of group.children) b.setAttribute('aria-pressed', String(b === button));
      onPick(choice.value);
    });
    group.append(button);
  }
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(caption, group);
  return control;
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

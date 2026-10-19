// Milestones (`type: TaskType.Milestone`) in three shapes (`milestone.shape`), and baseline bars
// (`task.baseline`, shown with `baseline: true`) under the actual dates; the Variance column reads the difference.
import '@gantryjs/vanilla';
import {
  MILESTONE_SHAPES,
  MILESTONES_BASELINES_INITIAL,
  milestonesBaselinesOptions,
  milestonesBaselinesTasks,
  type GalleryChoice,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  let { shape, baseline } = MILESTONES_BASELINES_INITIAL;

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  // The plan, with `baseline: { start, end }` on the tasks that slipped or ran early
  chart.tasks = milestonesBaselinesTasks(new Date());
  const apply = () => {
    chart.options = milestonesBaselinesOptions(shape, baseline);
  };
  apply();

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    segmented('milestones-baselines-shape', 'Milestone shape', MILESTONE_SHAPES, shape, value => {
      shape = value;
      apply();
    }),
    toggle('Baselines', baseline, on => {
      baseline = on;
      apply();
    }),
  );

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
function toggle(label: string, checked: boolean, onToggle: (on: boolean) => void): HTMLElement {
  const input = document.createElement('input');
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

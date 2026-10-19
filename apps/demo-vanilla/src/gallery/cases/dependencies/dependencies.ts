// The four dependency types with lag and lead (`task.dependency`), the critical path
// (`criticalPath`) and orthogonal or straight arrows (`arrows.routing`).
import '@gantryjs/vanilla';
import {
  DEPENDENCIES_INITIAL,
  DEPENDENCIES_ROUTINGS,
  DEPENDENCY_LEGEND,
  dependenciesOptions,
  dependenciesTasks,
  type GalleryChoice,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  let { routing, criticalPath } = DEPENDENCIES_INITIAL;

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = dependenciesTasks(new Date());
  const apply = () => {
    chart.options = dependenciesOptions(routing, criticalPath);
  };
  apply();

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(
    segmented('dependencies-arrows', 'Arrows', DEPENDENCIES_ROUTINGS, routing, value => {
      routing = value;
      apply();
    }),
    toggle('Critical path', criticalPath, on => {
      criticalPath = on;
      apply();
    }),
  );

  // The link types of this plan
  const legend = document.createElement('dl');
  legend.className = 'gs-case-keys';
  for (const { type, label, example } of DEPENDENCY_LEGEND) {
    const code = document.createElement('code');
    code.className = 'gs-code-inline';
    code.textContent = type;
    const term = document.createElement('dt');
    term.append(code, ` ${label}`);
    const description = document.createElement('dd');
    description.textContent = example;
    legend.append(term, description);
  }

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, legend);
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

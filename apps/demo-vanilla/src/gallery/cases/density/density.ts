// Compact, normal or comfortable rows, header and toolbar (`options.density`). The chart sets
// its row and bar heights as read-only CSS variables on its element; the list beside it copies
// them, so its rows keep the chart's pitch without knowing the density.
import '@gantryjs/vanilla';
import { DENSITIES, DENSITY_CSS_VARIABLES, DENSITY_INITIAL, densityOptions, densityTasks } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';
import './density.css';

export function mount(host: HTMLElement): () => void {
  const tasks = densityTasks(new Date());
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = tasks;
  chart.options = densityOptions(DENSITY_INITIAL);

  // The side list: one item per task, as tall as a chart row (its CSS reads the variables)
  const caption = document.createElement('p');
  caption.id = 'density-list-caption';
  caption.className = 'gs-case-caption';
  caption.textContent = 'Page content at the chart’s row pitch';
  const list = document.createElement('ul');
  list.className = 'density-list';
  list.setAttribute('aria-labelledby', caption.id);
  for (const task of tasks) {
    const name = document.createElement('span');
    name.textContent = task.name;
    const item = document.createElement('li');
    item.append(name);
    list.append(item);
  }
  const aside = document.createElement('div');
  aside.append(caption, list);
  const split = document.createElement('div');
  split.className = 'gs-case-split';
  split.append(aside, chart);

  // The readout: "The chart sets --gantt-row-height: 28px and --gantt-bar-height: 16.8px on its element."
  const rowHeight = inlineCode();
  const barHeight = inlineCode();
  const readout = document.createElement('p');
  readout.className = 'gs-case-hint';
  readout.append('The chart sets ', rowHeight, ' and ', barHeight, ' on its element.');

  // The variables live on the chart element (written as soon as it gets its options): copy them
  const copyVariables = () => {
    const style = getComputedStyle(chart);
    for (const name of DENSITY_CSS_VARIABLES) list.style.setProperty(name, style.getPropertyValue(name));
    rowHeight.textContent = `--gantt-row-height: ${style.getPropertyValue('--gantt-row-height')}`;
    barHeight.textContent = `--gantt-bar-height: ${style.getPropertyValue('--gantt-bar-height')}`;
  };

  // "Density": a segmented control
  const label = document.createElement('span');
  label.id = 'density-density-label';
  label.textContent = 'Density';
  const group = document.createElement('div');
  group.className = 'gs-seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', label.id);
  const buttons = DENSITIES.map(({ value, label: text }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gs-seg-btn';
    button.textContent = text;
    button.setAttribute('aria-pressed', String(value === DENSITY_INITIAL));
    button.addEventListener('click', () => {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b === button));
      chart.options = densityOptions(value);
      copyVariables();
    });
    return button;
  });
  group.append(...buttons);
  const control = document.createElement('div');
  control.className = 'gs-case-control';
  control.append(label, group);
  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(control);

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, split, readout);
  host.append(root);
  copyVariables(); // the element writes them once it is connected
  return () => {
    stopTheme();
    root.remove();
  };
}

function inlineCode(): HTMLElement {
  const code = document.createElement('code');
  code.className = 'gs-code-inline';
  return code;
}

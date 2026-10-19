// Collapsed parents painted from their children: `rollup.color` is `'status'` (the summary status of
// the children) or a callback (`mainTeamColor`), and `rollup.segments` draws each child inside the bar.
import '@gantryjs/vanilla';
import {
  ONLY_PARENTS_STYLED_COLORS,
  ONLY_PARENTS_STYLED_INITIAL,
  ONLY_PARENTS_STYLED_TEAMS,
  onlyParentsStyledOptions,
  onlyParentsStyledTasks,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  let { color, segments } = ONLY_PARENTS_STYLED_INITIAL;

  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  // The tree, every task in its team's colour (what the segments show)
  chart.tasks = onlyParentsStyledTasks(new Date());
  const apply = () => {
    chart.options = onlyParentsStyledOptions(color, segments);
  };
  apply();

  // "Parent colour": a select with its own label
  const colorSelect = document.createElement('select');
  colorSelect.id = 'only-parents-styled-color';
  colorSelect.className = 'gs-select';
  for (const choice of ONLY_PARENTS_STYLED_COLORS) {
    colorSelect.append(new Option(choice.label, choice.value, false, choice.value === color));
  }
  colorSelect.addEventListener('change', () => {
    color = ONLY_PARENTS_STYLED_COLORS[colorSelect.selectedIndex].value;
    apply();
  });
  const colorLabel = document.createElement('label');
  colorLabel.htmlFor = colorSelect.id;
  colorLabel.textContent = 'Parent colour';
  const colorControl = document.createElement('div');
  colorControl.className = 'gs-case-control';
  colorControl.append(colorLabel, colorSelect);

  // "Child segments": a switch
  const segmentsInput = document.createElement('input');
  segmentsInput.type = 'checkbox';
  segmentsInput.setAttribute('role', 'switch');
  segmentsInput.checked = segments;
  segmentsInput.addEventListener('change', () => {
    segments = segmentsInput.checked;
    apply();
  });
  const segmentsText = document.createElement('span');
  segmentsText.textContent = 'Child segments';
  const segmentsSwitch = document.createElement('label');
  segmentsSwitch.className = 'gs-switch gs-case-control';
  segmentsSwitch.append(segmentsText, segmentsInput);

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(colorControl, segmentsSwitch);

  // The legend: each team's colour
  const legend = document.createElement('ul');
  legend.className = 'gs-case-legend';
  legend.setAttribute('aria-label', 'Team colours');
  for (const team of ONLY_PARENTS_STYLED_TEAMS) {
    const swatch = document.createElement('span');
    swatch.className = 'gs-case-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.backgroundColor = team.color;
    const item = document.createElement('li');
    item.append(swatch, team.label);
    legend.append(item);
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

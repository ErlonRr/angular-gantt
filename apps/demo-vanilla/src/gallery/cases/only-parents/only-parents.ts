// Parents that start collapsed (`groupBar.collapsed`) and roll up the dates and the progress of their
// children (`rollup`). The buttons call the element's own `expandAll()` / `collapseAll()`.
import '@gantryjs/vanilla';
import { ONLY_PARENTS_INITIAL_ROLLUP, TREE_ACTIONS, onlyParentsOptions, onlyParentsTasks } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = onlyParentsTasks(new Date());

  // "Roll up children": a switch; without the rollup the parents keep their own dates and progress
  const rollup = document.createElement('input');
  rollup.type = 'checkbox';
  rollup.setAttribute('role', 'switch');
  rollup.checked = ONLY_PARENTS_INITIAL_ROLLUP;
  const applyRollup = () => {
    chart.options = onlyParentsOptions(rollup.checked);
  };
  rollup.addEventListener('change', applyRollup);
  applyRollup();
  const rollupText = document.createElement('span');
  rollupText.textContent = 'Roll up children';
  const rollupSwitch = document.createElement('label');
  rollupSwitch.className = 'gs-switch gs-case-control';
  rollupSwitch.append(rollupText, rollup);

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  controls.append(rollupSwitch);
  // "Expand all" and "Collapse all": methods of the element
  for (const { method, label } of TREE_ACTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gs-btn gs-btn--sm';
    button.textContent = label;
    button.addEventListener('click', () => chart[method]());
    controls.append(button);
  }

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

// A three-level task tree (`parentId`). The element's own methods collapse or expand every row
// (`collapseAll()` / `expandAll()`), and the `view-mode-change` event reports the zoom level.
import '@gantryjs/vanilla';
import { TREE_ACTIONS, TREE_OPTIONS, TREE_VIEW_MODE, treeTasks } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

export function mount(host: HTMLElement): () => void {
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = treeTasks(new Date());
  chart.options = TREE_OPTIONS;

  // "Expand all" and "Collapse all": methods of the element
  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  for (const { method, label } of TREE_ACTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gs-btn gs-btn--sm';
    button.textContent = label;
    button.addEventListener('click', () => chart[method]());
    controls.append(button);
  }

  // The event's detail is `{ viewMode }`
  const zoom = document.createElement('p');
  zoom.className = 'gs-case-hint';
  const showZoom = (viewMode: string) => {
    zoom.textContent = `Zoom level: ${viewMode}`;
  };
  chart.addEventListener('view-mode-change', event => showZoom(event.detail.viewMode));
  showZoom(TREE_VIEW_MODE);

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, zoom);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

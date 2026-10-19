// Task-list cells of your own: a column's `cellTemplate(row, ctx)` returns a DOM node (cells.ts).
// The shared columns keep their label, width and sort rule; the template draws only the cell.
import '@gantryjs/vanilla';
import { CUSTOM_COLUMNS, CUSTOM_COLUMNS_OPTIONS, customColumnsTasks } from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';
import { CELL_TEMPLATES } from './cells';
import './custom-columns.css';

export function mount(host: HTMLElement): () => void {
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = customColumnsTasks(new Date());
  chart.columns = CUSTOM_COLUMNS.map(column => ({ ...column, cellTemplate: CELL_TEMPLATES[column.key] }));
  chart.options = CUSTOM_COLUMNS_OPTIONS;

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = 'Owner, Priority and Progress are cell templates; the Owner and Priority headers sort.';

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(chart, hint);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

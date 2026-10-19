// Cell editors of your own: Owner is a built-in `select`, Estimate a `number` editor with your own
// `validate`, and Colour's `editor` a function that returns its DOM node (`colourEditor`). The
// buttons call the element's `editCell()` and `focusTask()`.
import '@gantryjs/vanilla';
import type { CellEditorContext, VanillaColumnDef } from '@gantryjs/vanilla';
import {
  COLOUR_COLUMN,
  CUSTOM_EDITORS_FIRST_TASK,
  CUSTOM_EDITORS_HINT,
  CUSTOM_EDITORS_MILESTONE,
  CUSTOM_EDITORS_OPTIONS,
  CUSTOM_EDITOR_COLUMNS,
  customEditorsTasks,
} from 'demo-kit/gallery';
import { followSiteTheme } from '../../site-theme';

/** The Colour editor: a native colour picker. The chart focuses it; Enter or leaving the cell commits */
function colourEditor(ctx: CellEditorContext): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = ctx.value;
  input.setAttribute('aria-label', ctx.labels.ariaCellEditor('Colour', ctx.row.task.name));
  input.addEventListener('input', () => ctx.setValue(input.value));
  return input;
}

/** The shared columns, the Colour one with its editor */
const COLUMNS: VanillaColumnDef[] = CUSTOM_EDITOR_COLUMNS.map(column =>
  column.key === COLOUR_COLUMN.key ? { ...COLOUR_COLUMN, editor: colourEditor } : { ...column },
);

export function mount(host: HTMLElement): () => void {
  const chart = document.createElement('gantry-element');
  chart.className = 'gs-chart gs-case-chart';
  chart.tasks = customEditorsTasks(new Date());
  chart.columns = COLUMNS;
  chart.options = CUSTOM_EDITORS_OPTIONS;

  const controls = document.createElement('div');
  controls.className = 'gs-case-controls';
  const button = (label: string, action: () => void) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'gs-btn gs-btn--sm';
    node.textContent = label;
    node.addEventListener('click', action);
    controls.append(node);
  };
  button('Edit first estimate', () => chart.editCell(CUSTOM_EDITORS_FIRST_TASK, 'estimate'));
  button('Focus the launch', () => chart.focusTask(CUSTOM_EDITORS_MILESTONE));

  const hint = document.createElement('p');
  hint.className = 'gs-case-hint';
  hint.textContent = CUSTOM_EDITORS_HINT;

  const stopTheme = followSiteTheme(chart);
  const root = document.createElement('div');
  root.className = 'gs-case';
  root.append(controls, chart, hint);
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

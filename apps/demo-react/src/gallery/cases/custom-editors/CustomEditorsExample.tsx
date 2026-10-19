// Cell editors of your own: Owner is a built-in `select`, Estimate a `number` editor with your own
// `validate`, and Colour's `editor` a function that returns a DOM node, not a React element. The
// buttons call `editCell()` and `focusTask()` on the ref (the `<gantry-element>` itself).
import { useRef, useState } from 'react';
import { Gantry, type CellEditorContext, type ColumnDef, type GantryElement } from '@gantryjs/react';
import {
  COLOUR_COLUMN,
  CUSTOM_EDITORS_FIRST_TASK,
  CUSTOM_EDITORS_HINT,
  CUSTOM_EDITORS_MILESTONE,
  CUSTOM_EDITORS_OPTIONS,
  CUSTOM_EDITOR_COLUMNS,
  customEditorsTasks,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

/** The Colour editor: a native colour picker. The chart focuses it; Enter or leaving the cell commits */
function colourEditor(ctx: CellEditorContext): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = ctx.value;
  input.setAttribute('aria-label', ctx.labels.ariaCellEditor('Colour', ctx.row.task.name));
  input.addEventListener('input', () => ctx.setValue(input.value));
  return input;
}

// A module constant: the same array on every render (a new one rebuilds the task list)
const COLUMNS: ColumnDef[] = CUSTOM_EDITOR_COLUMNS.map(column =>
  column.key === COLOUR_COLUMN.key ? { ...COLOUR_COLUMN, editor: colourEditor } : { ...column },
);

export default function CustomEditorsExample() {
  const darkMode = useDarkMode();
  const gantt = useRef<GantryElement>(null);
  const [tasks] = useState(() => customEditorsTasks(new Date()));

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <button
          type="button"
          className="gs-btn gs-btn--sm"
          onClick={() => gantt.current?.editCell(CUSTOM_EDITORS_FIRST_TASK, 'estimate')}
        >
          Edit first estimate
        </button>
        <button
          type="button"
          className="gs-btn gs-btn--sm"
          onClick={() => gantt.current?.focusTask(CUSTOM_EDITORS_MILESTONE)}
        >
          Focus the launch
        </button>
      </div>

      <Gantry
        ref={gantt}
        className="gs-chart gs-case-chart"
        tasks={tasks}
        columns={COLUMNS}
        options={CUSTOM_EDITORS_OPTIONS}
        darkMode={darkMode}
      />

      <p className="gs-case-hint">{CUSTOM_EDITORS_HINT}</p>
    </div>
  );
}

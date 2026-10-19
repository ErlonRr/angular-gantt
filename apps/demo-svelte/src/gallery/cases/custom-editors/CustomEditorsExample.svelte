<!--
  Cell editors of your own: Owner is a built-in `select`, Estimate a `number` editor with your own
  `validate`, and Colour's `editor` a function that returns a DOM node, not a snippet. The buttons
  call `editCell()` and `focusTask()` through `bind:element`.
-->
<script lang="ts">
  import { Gantry, type CellEditorContext, type ColumnDef, type GantryElement } from '@gantryjs/svelte';
  import {
    COLOUR_COLUMN,
    CUSTOM_EDITORS_FIRST_TASK,
    CUSTOM_EDITORS_HINT,
    CUSTOM_EDITORS_MILESTONE,
    CUSTOM_EDITORS_OPTIONS,
    CUSTOM_EDITOR_COLUMNS,
    customEditorsTasks,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  /** The Colour editor: a native colour picker. The chart focuses it; Enter or leaving the cell commits */
  function colourEditor(ctx: CellEditorContext): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = ctx.value;
    input.setAttribute('aria-label', ctx.labels.ariaCellEditor('Colour', ctx.row.task.name));
    input.addEventListener('input', () => ctx.setValue(input.value));
    return input;
  }

  // The chart keeps the edits itself, so the tasks are a plain constant (never reassigned)
  const tasks = customEditorsTasks(new Date());
  // The shared columns, the Colour one with its editor
  const columns: ColumnDef[] = CUSTOM_EDITOR_COLUMNS.map(column =>
    column.key === COLOUR_COLUMN.key ? { ...COLOUR_COLUMN, editor: colourEditor } : { ...column },
  );
  let gantt = $state<GantryElement>();
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <button
      type="button"
      class="gs-btn gs-btn--sm"
      onclick={() => gantt?.editCell(CUSTOM_EDITORS_FIRST_TASK, 'estimate')}
    >
      Edit first estimate
    </button>
    <button type="button" class="gs-btn gs-btn--sm" onclick={() => gantt?.focusTask(CUSTOM_EDITORS_MILESTONE)}>
      Focus the launch
    </button>
  </div>

  <Gantry
    bind:element={gantt}
    class="gs-chart gs-case-chart"
    {tasks}
    {columns}
    options={CUSTOM_EDITORS_OPTIONS}
    darkMode={siteTheme.dark}
  />

  <p class="gs-case-hint">{CUSTOM_EDITORS_HINT}</p>
</div>

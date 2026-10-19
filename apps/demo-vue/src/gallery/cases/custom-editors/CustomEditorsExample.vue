<!--
  Cell editors of your own: Owner is a built-in `select`, Estimate a `number` editor with your own
  `validate`, and Colour's `editor` a function that returns a DOM node, not a component. The
  buttons call `editCell()` and `focusTask()` on the template ref's `element`.
-->
<script setup lang="ts">
import { useTemplateRef } from 'vue';
import { Gantry, type CellEditorContext, type ColumnDef } from '@gantryjs/vue';
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

const dark = useDarkMode();
const chart = useTemplateRef<InstanceType<typeof Gantry>>('chart');
const tasks = customEditorsTasks(new Date());
// The shared columns, the Colour one with its editor
const columns: ColumnDef[] = CUSTOM_EDITOR_COLUMNS.map(column =>
  column.key === COLOUR_COLUMN.key ? { ...COLOUR_COLUMN, editor: colourEditor } : { ...column },
);
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <button
        type="button"
        class="gs-btn gs-btn--sm"
        @click="chart?.element?.editCell(CUSTOM_EDITORS_FIRST_TASK, 'estimate')"
      >
        Edit first estimate
      </button>
      <button type="button" class="gs-btn gs-btn--sm" @click="chart?.element?.focusTask(CUSTOM_EDITORS_MILESTONE)">
        Focus the launch
      </button>
    </div>
    <Gantry
      ref="chart"
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :columns="columns"
      :options="CUSTOM_EDITORS_OPTIONS"
      :dark-mode="dark"
    />
    <p class="gs-case-hint">{{ CUSTOM_EDITORS_HINT }}</p>
  </div>
</template>

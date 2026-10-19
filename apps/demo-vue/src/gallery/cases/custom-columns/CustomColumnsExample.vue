<!--
  Custom columns: a column's `cellTemplate` returns the cell's DOM node (cells.ts), not a VNode.
  The shared columns keep their label, width and sort rule; the template draws only the cell.
-->
<script setup lang="ts">
import { Gantry, type ColumnDef } from '@gantryjs/vue';
import { CUSTOM_COLUMNS, CUSTOM_COLUMNS_OPTIONS, customColumnsTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';
import { CELL_TEMPLATES } from './cells';

const dark = useDarkMode();
const tasks = customColumnsTasks(new Date());
const columns: ColumnDef[] = CUSTOM_COLUMNS.map(column => ({ ...column, cellTemplate: CELL_TEMPLATES[column.key] }));
</script>

<template>
  <div class="gs-case">
    <Gantry
      class="gs-chart gs-case-chart"
      :tasks="tasks"
      :columns="columns"
      :options="CUSTOM_COLUMNS_OPTIONS"
      :dark-mode="dark"
    />
    <p class="gs-case-hint">Owner, Priority and Progress are cell templates; the Owner and Priority headers sort.</p>
  </div>
</template>

<style>
/* Forced colours replace the cells' backgrounds: the `part` names of cells.ts let page CSS reach them */
@media (forced-colors: active) {
  gantry-element::part(avatar) {
    border: 1px solid CanvasText;
  }
  gantry-element::part(meter-fill) {
    background: CanvasText;
  }
}
</style>

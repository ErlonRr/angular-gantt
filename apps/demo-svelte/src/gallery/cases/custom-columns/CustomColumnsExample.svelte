<!--
  Task-list cells from templates: a column's `cellTemplate` returns a DOM node (cells.ts), not a
  snippet. The shared columns keep their label, width and sort rule; the template draws only the cell.
-->
<script lang="ts">
  import { Gantry, type ColumnDef } from '@gantryjs/svelte';
  import { CUSTOM_COLUMNS, CUSTOM_COLUMNS_OPTIONS, customColumnsTasks } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';
  import { CELL_TEMPLATES } from './cells';

  const tasks = customColumnsTasks(new Date());
  const columns: ColumnDef[] = CUSTOM_COLUMNS.map(column => ({ ...column, cellTemplate: CELL_TEMPLATES[column.key] }));
</script>

<div class="gs-case">
  <Gantry class="gs-chart gs-case-chart" {tasks} {columns} options={CUSTOM_COLUMNS_OPTIONS} darkMode={siteTheme.dark} />

  <p class="gs-case-hint">Owner, Priority and Progress are cell templates; the Owner and Priority headers sort.</p>
</div>

<style>
  /* Forced colours replace the cells' backgrounds: the `part` names of cells.ts let page CSS reach them */
  @media (forced-colors: active) {
    :global(gantry-element::part(avatar)) {
      border: 1px solid CanvasText;
    }
    :global(gantry-element::part(meter-fill)) {
      background: CanvasText;
    }
  }
</style>

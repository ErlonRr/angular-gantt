<!-- Test harness: a consumer that binds the element (`bind:element`) and reads it back. -->
<script lang="ts">
  import { Gantry, type GantryElement, type GanttTask } from '../index';

  let { tasks }: { tasks?: GanttTask[] } = $props();
  let gantt = $state<GantryElement>();
  let shown = $state(true);

  /** The bound element (cleared once the chart is gone) */
  export const bound = (): GantryElement | undefined => gantt;
  /** Removes the chart, keeping this component */
  export const hide = (): void => {
    shown = false;
  };
</script>

{#if shown}
  <Gantry bind:element={gantt} {tasks} />
{/if}

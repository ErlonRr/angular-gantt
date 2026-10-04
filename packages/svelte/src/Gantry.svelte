<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { GanttTask, GanttOptions, ColumnDef } from '@gantry/core';
  import '@gantry/vanilla';

  export let tasks: GanttTask[] = [];
  export let columns: ColumnDef[] | undefined = undefined;
  export let options: GanttOptions | undefined = undefined;

  let gantryRef: HTMLElement;

  $: if (gantryRef) {
    (gantryRef as any).tasks = tasks;
  }

  $: if (gantryRef && columns) {
    (gantryRef as any).columns = columns;
  }

  $: if (gantryRef && options) {
    (gantryRef as any).options = options;
  }

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher<{ taskUpdated: GanttTask }>();

  function handleUpdate(e: Event) {
    const customEvent = e as CustomEvent<GanttTask>;
    dispatch('taskUpdated', customEvent.detail);
  }

  onMount(() => {
    if (gantryRef) {
      gantryRef.addEventListener('taskUpdated', handleUpdate);
    }
  });

  onDestroy(() => {
    if (gantryRef) {
      gantryRef.removeEventListener('taskUpdated', handleUpdate);
    }
  });
</script>

<gantry-element bind:this={gantryRef} style="width: 100%; height: 100%; display: block;"></gantry-element>

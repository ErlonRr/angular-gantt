<!--
  Gantry Gantt chart for Svelte 5.

  A thin binding over the `<gantry-element>` Web Component. Data props
  (`tasks`, `annotations`) are read deeply, so mutating `$state` arrays
  re-renders the chart. Events arrive as callback props with the event
  `detail` (`onTaskDragged`, `onSelectionChange`, …). `bind:element` gives
  the `GantryElement` with its imperative API (`zoomIn()`, `scrollToToday()`, …).
-->
<script lang="ts">
  import '@gantry/vanilla';
  import { GANTRY_EVENTS } from '@gantry/vanilla';
  import type { GantryElement, GantryProperties, GantryEventCallbacks } from '@gantry/vanilla';
  import type { HTMLAttributes } from 'svelte/elements';

  type Props = GantryProperties & GantryEventCallbacks
    & Omit<HTMLAttributes<HTMLElement>, keyof GantryProperties | keyof GantryEventCallbacks>
    & { element?: GantryElement };

  let {
    tasks, columns, options, annotations, darkMode, showToolbar, enableDrag,
    enableResize, tooltipEnabled, showLegend, dataSource, renderBar,
    onTaskDragged, onTaskResized, onSelectionChange, onRowClick, onRowDblClick, onViewModeChange, onStateChange,
    element = $bindable(),
    style = '',
    ...rest
  }: Props = $props();

  // One effect per property so a change re-assigns only that property.
  // $state.snapshot reads data arrays deeply (tracking in-place mutation)
  // and hands the element a plain copy instead of a proxy.
  $effect(() => { if (element && tasks !== undefined) element.tasks = $state.snapshot(tasks) as typeof tasks; });
  $effect(() => { if (element && annotations !== undefined) element.annotations = $state.snapshot(annotations) as typeof annotations; });
  $effect(() => { if (element && columns !== undefined) element.columns = columns; });
  $effect(() => { if (element && options !== undefined) element.options = options; });
  $effect(() => { if (element && darkMode !== undefined) element.darkMode = darkMode; });
  $effect(() => { if (element && showToolbar !== undefined) element.showToolbar = showToolbar; });
  $effect(() => { if (element && enableDrag !== undefined) element.enableDrag = enableDrag; });
  $effect(() => { if (element && enableResize !== undefined) element.enableResize = enableResize; });
  $effect(() => { if (element && tooltipEnabled !== undefined) element.tooltipEnabled = tooltipEnabled; });
  $effect(() => { if (element && showLegend !== undefined) element.showLegend = showLegend; });
  $effect(() => { if (element && dataSource !== undefined) element.dataSource = dataSource; });
  $effect(() => { if (element && renderBar !== undefined) element.renderBar = renderBar; });

  const callbacks = $derived<GantryEventCallbacks>({
    onTaskDragged, onTaskResized, onSelectionChange, onRowClick, onRowDblClick, onViewModeChange, onStateChange,
  });

  $effect(() => {
    const el = element;
    if (!el) return;
    const entries = Object.entries(GANTRY_EVENTS).map(([type, prop]) => {
      const listener = (e: Event) => {
        const cb = callbacks[prop] as ((detail: unknown) => void) | undefined;
        cb?.((e as CustomEvent).detail);
      };
      el.addEventListener(type, listener);
      return [type, listener] as const;
    });
    return () => entries.forEach(([type, listener]) => el.removeEventListener(type, listener));
  });
</script>

<gantry-element
  bind:this={element}
  style="display: block; width: 100%; height: 100%; {style}"
  {...rest}
></gantry-element>

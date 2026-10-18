<!--
  Gantry Gantt chart for Svelte 5.

  A thin binding over the `<gantry-element>` Web Component: props are set as element
  properties, events arrive as callback props with the event `detail` (`onTaskDragged`,
  `onSelectionChange`, …), and `bind:element` gives the `GantryElement` with its imperative API
  (`zoomIn()`, `scrollToToday()`, …). Other props (`class`, `id`, `aria-*`, …) go to the element.
-->
<script module lang="ts">
  /** The data props, copied one level (`shallow`); the others (`dataSource`, `renderBar`, …) pass as they are */
  const COPIED: ReadonlySet<string> = new Set(['tasks', 'columns', 'annotations', 'options']);

  /**
   * One level, never a deep clone: an array becomes a new array of the same items and a plain
   * object a new object with the same values, so the element gets no `$state` proxy at the top
   * and reading the copy tracks a proxy's items / fields. Anything else passes as is.
   */
  function shallow<T>(value: T): T {
    if (Array.isArray(value)) return [...(value as unknown[])] as T;
    if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      return { ...value };
    }
    return value;
  }
</script>

<script lang="ts">
  import '@gantryjs/vanilla';
  import { untrack } from 'svelte';
  import { GANTRY_EVENTS, GANTRY_PROPERTIES } from '@gantryjs/vanilla';
  import type { GantryElement, GantryProperties, GantryEventCallbacks } from '@gantryjs/vanilla';
  import type { HTMLAttributes } from 'svelte/elements';

  type Props = GantryProperties &
    GantryEventCallbacks &
    Omit<HTMLAttributes<HTMLElement>, keyof GantryProperties | keyof GantryEventCallbacks> & {
      element?: GantryElement | undefined;
    };

  // Every name of GANTRY_PROPERTIES and GANTRY_EVENTS is destructured explicitly: what is left
  // in `rest` is spread onto the element as attributes
  let {
    tasks,
    columns,
    options,
    annotations,
    darkMode,
    showToolbar,
    enableDrag,
    enableResize,
    tooltipEnabled,
    showLegend,
    dataSource,
    renderBar,
    onTaskDragged,
    onTaskResized,
    onSelectionChange,
    onRowClick,
    onRowDblClick,
    onViewModeChange,
    onStateChange,
    onLoadError,
    element = $bindable(),
    style = '',
    ...rest
  }: Props = $props();

  // By name. Every key is required, so a property or event the element gains fails the typecheck
  // here until it is destructured above.
  const properties: { [K in keyof Required<GantryProperties>]: () => GantryProperties[K] } = {
    tasks: () => tasks,
    columns: () => columns,
    options: () => options,
    annotations: () => annotations,
    darkMode: () => darkMode,
    showToolbar: () => showToolbar,
    enableDrag: () => enableDrag,
    enableResize: () => enableResize,
    tooltipEnabled: () => tooltipEnabled,
    showLegend: () => showLegend,
    dataSource: () => dataSource,
    renderBar: () => renderBar,
  };
  const callbacks: { [K in keyof Required<GantryEventCallbacks>]: () => GantryEventCallbacks[K] } = {
    onTaskDragged: () => onTaskDragged,
    onTaskResized: () => onTaskResized,
    onSelectionChange: () => onSelectionChange,
    onRowClick: () => onRowClick,
    onRowDblClick: () => onRowDblClick,
    onViewModeChange: () => onViewModeChange,
    onStateChange: () => onStateChange,
    onLoadError: () => onLoadError,
  };

  // Listeners first: assigning a property can fire an event at once (`view-mode-change`), so they
  // are attached before the property effects below run. Each reads its callback when it fires,
  // untracked: an event fired inside an effect (the consumer's `gantt.setViewMode()`) must not
  // subscribe that effect to the callback prop or to the state the callback reads.
  $effect(() => {
    const el = element;
    if (!el) return;
    const listeners = Object.entries(GANTRY_EVENTS).map(([type, name]) => {
      const listener = (e: Event) =>
        untrack(() => {
          const callback = callbacks[name]() as ((detail: unknown) => void) | undefined;
          callback?.((e as CustomEvent<unknown>).detail);
        });
      el.addEventListener(type, listener);
      return [type, listener] as const;
    });
    return () => {
      for (const [type, listener] of listeners) el.removeEventListener(type, listener);
    };
  });

  // One effect per property, so a change re-assigns only that property. The element renders on
  // the next animation frame, after these effects: its first frame already has every prop.
  for (const name of GANTRY_PROPERTIES) forward(name);

  function forward<K extends keyof GantryProperties>(name: K): void {
    /** The element this property was last written to */
    let written: GantryElement | undefined;
    $effect(() => {
      const el = element;
      const value = COPIED.has(name) ? shallow(properties[name]()) : properties[name]();
      // A prop never set leaves the element's own value (its default, or an attribute such as
      // `dark-mode`); once set, `undefined` is forwarded and restores the default
      if (!el || (value === undefined && written !== el)) return;
      written = el;
      // Untracked: the setter (and an event it fires) must not subscribe this effect
      untrack(() => {
        (el as GantryProperties)[name] = value;
      });
    });
  }
</script>

<gantry-element bind:this={element} style="display: block; width: 100%; height: 100%; {style}" {...rest}
></gantry-element>

import {
  defineComponent, h, onMounted, onBeforeUnmount, shallowRef, toRaw, watch,
  type PropType,
} from 'vue';
import {
  GANTRY_EVENTS, GANTRY_PROPERTIES,
  type GantryElement, type GantryEventDetailMap, type VanillaColumnDef,
  type GanttDataSourceConfig, type GanttDataSource, type GanttBarRenderer,
} from '@gantry/vanilla';
import type { GanttTask, GanttOptions, GanttAnnotation } from '@gantry/core';

/** Vue emit names: `task-dragged` → `taskDragged` (use `@task-dragged` in templates). */
type Camel<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
type Emits = {
  [K in keyof GantryEventDetailMap as Camel<K>]:
    (detail: GantryEventDetailMap[K]) => boolean;
};

const camel = (s: string) => s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

// `default: undefined` stops Vue's boolean casting (absent → false), so an
// omitted prop keeps the element's own default.
const optional = <T>(type: PropType<T>) => ({ type, default: undefined });

/**
 * Gantry Gantt chart for Vue 3.
 *
 * A thin binding over the `<gantry-element>` Web Component. Array props
 * (`tasks`, `columns`, `annotations`) are watched one level deep, so
 * `tasks.push(…)` on a reactive array re-renders the chart.
 * The template ref exposes `element` — the `GantryElement` with its
 * imperative API (`zoomIn()`, `scrollToToday()`, `getSelectedTasks()`, …).
 */
export const Gantry = defineComponent({
  name: 'Gantry',
  props: {
    tasks: optional(Array as PropType<GanttTask[]>),
    columns: optional(Array as PropType<VanillaColumnDef[]>),
    options: optional(Object as PropType<GanttOptions>),
    annotations: optional(Array as PropType<GanttAnnotation[]>),
    darkMode: optional([Boolean, String] as PropType<boolean | 'auto'>),
    showToolbar: optional(Boolean),
    enableDrag: optional(Boolean),
    enableResize: optional(Boolean),
    tooltipEnabled: optional(Boolean),
    showLegend: optional(Boolean),
    dataSource: optional(Object as PropType<GanttDataSourceConfig | GanttDataSource | null>),
    renderBar: optional(Function as PropType<GanttBarRenderer>),
  },
  emits: Object.fromEntries(
    Object.keys(GANTRY_EVENTS).map(type => [camel(type), null]),
  ) as unknown as Emits,
  setup(props, { emit }) {
    const element = shallowRef<GantryElement | null>(null);
    const setElement = (el: unknown) => { element.value = el as GantryElement | null; };

    const assign = (key: (typeof GANTRY_PROPERTIES)[number], value: unknown) => {
      const el = element.value;
      if (!el || value === undefined) return;
      const raw = toRaw(value);
      // Fresh array so the element sees a change after in-place mutation
      (el as unknown as Record<string, unknown>)[key] = Array.isArray(raw) ? [...raw] : raw;
    };

    const listeners = Object.keys(GANTRY_EVENTS).map(type => {
      const listener = (e: Event) => (emit as (event: string, detail: unknown) => void)(camel(type), (e as CustomEvent).detail);
      return [type, listener] as const;
    });

    onMounted(() => {
      for (const key of GANTRY_PROPERTIES) {
        assign(key, props[key]);
        const isArray = key === 'tasks' || key === 'columns' || key === 'annotations';
        watch(() => props[key], v => assign(key, v), { deep: isArray ? 1 : false });
      }
      for (const [type, listener] of listeners) element.value!.addEventListener(type, listener);
    });

    onBeforeUnmount(() => {
      for (const [type, listener] of listeners) element.value?.removeEventListener(type, listener);
    });

    // Returned bindings are public on the component instance: `ganttRef.value.element`
    return { element, setElement };
  },
  render() {
    return h('gantry-element', {
      ref: this.setElement,
      style: { display: 'block', width: '100%', height: '100%' },
    });
  },
});

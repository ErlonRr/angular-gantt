/**
 * @file Gantry.ts
 * Vue 3 binding of `<gantry-element>`. A render-function component (`h()`), so consumers need no
 * `isCustomElement` compiler option. It only forwards: props → element properties, element events
 * → emits, the default slot → the element's light DOM (`<div slot="empty">`), the element → the
 * template ref (`expose({ element })`). No inline style: `:host` sizes the element (block,
 * 100% × 100%), so the server markup has no `style` attribute of its own (strict CSP).
 *
 * Lifecycle, through a directive on the element (`bridge`):
 * - `created`: the element exists but Vue has neither patched nor inserted it. The event listeners
 *   go on first, then every defined prop. So the element connects and paints its first frame (it
 *   renders on the next animation frame) with the consumer's props, never with its defaults, and an
 *   event fired by an assignment (`view-mode-change` from `options.viewMode`) or by the first connect
 *   (`load-error` of a data source that already failed) reaches the emits.
 * - prop changes: one watcher per property (array props and `options` one level deep),
 *   `undefined` included — it restores the element's default.
 * - `unmounted`: after the element was removed, so an event its disconnect fires (a pending
 *   `state-change`) still arrives; then the listeners come off.
 *
 * Object identity: the element gets the consumer's own objects, never clones. Vue proxies are
 * unwrapped with `toRaw` (the element never reads through a proxy); an array that holds proxies
 * (`tasks.value.map(t => …)` returns the unchanged items as proxies) becomes a new array of the raw
 * items. The element compares arrays by identity, so after an in-place change (`tasks.value.push(…)`)
 * it gets a shallow copy (same items). A reactive `options` object is handed over as a one-level
 * copy, every time: the element compares new options field by field with the ones it holds, which
 * must not be the very object then changed in place (`options.viewMode = …`).
 */

import {
  defineComponent,
  h,
  isProxy,
  shallowRef,
  toRaw,
  watch,
  withDirectives,
  type ObjectDirective,
  type PropType,
  type ShallowRef,
} from 'vue';
import {
  GANTRY_EVENTS,
  GANTRY_PROPERTIES,
  type GantryElement,
  type GantryEventDetailMap,
  type GantryProperties,
  type GanttBarRenderer,
  type GanttDataSource,
  type GanttDataSourceConfig,
  type VanillaColumnDef,
} from '@gantryjs/vanilla';
import type { GanttAnnotation, GanttOptions, GanttTask } from '@gantryjs/core';

type PropertyName = (typeof GANTRY_PROPERTIES)[number];

/** Vue emit names: `task-dragged` → `taskDragged` (use `@task-dragged` in templates). */
type Camel<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
type Emits = {
  [K in keyof GantryEventDetailMap as Camel<K>]: (detail: GantryEventDetailMap[K]) => boolean;
};

const camel = (s: string) => s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

// `default: undefined` stops Vue's boolean casting (absent → false), so an omitted prop keeps the
// element's own default.
const optional = <T>(type: PropType<T>) => ({ type, default: undefined });

/** Each prop's declared type: the element property's type, without `undefined` (an omitted prop). */
type PropTypes = {
  [K in PropertyName]: { type: PropType<Exclude<GantryProperties[K], undefined>>; default: undefined };
};

/**
 * One prop per `GANTRY_PROPERTIES` entry, in its order. `satisfies` rejects a missing or unknown
 * name and a type the element property does not accept; a test compares the order, and one the
 * exact types (a wider element type too). When the element gains a property, add it here.
 */
const props = {
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
  loading: optional(Boolean),
  errorMessage: optional(String as PropType<string | null>),
} satisfies PropTypes;

/** Array props, watched one level deep (`push`, `splice`, `list[i] = …` re-render the chart). */
const isList = (key: PropertyName): boolean => (props[key].type as unknown) === Array;
/** Props watched one level deep: the arrays, and `options` (`options.viewMode = …` on a reactive object). */
const isDeep = (key: PropertyName): boolean => isList(key) || key === 'options';

/** What the template ref exposes (`expose({ element })`). */
interface ExposedBindings {
  element: ShallowRef<GantryElement | null>;
}

/** `value` without Vue proxies: `toRaw`, and an array holding proxies becomes an array of the raw items. */
function unwrap(value: unknown): unknown {
  const raw = toRaw(value);
  return Array.isArray(raw) && raw.some(item => isProxy(item)) ? raw.map(item => toRaw(item) as unknown) : raw;
}

/**
 * Gantry Gantt chart for Vue 3.
 *
 * A thin binding over the `<gantry-element>` Web Component: props are set as element properties
 * (`undefined` restores the element's default), events are emitted with their `detail`. Array props
 * (`tasks`, `columns`, `annotations`) and `options` are watched one level deep, so `tasks.push(…)`
 * on a reactive array or `options.viewMode = …` on a reactive object re-renders the chart. The
 * template ref exposes `element`: the `GantryElement` with its
 * imperative API (`zoomIn()`, `scrollToToday()`, `getSelectedTasks()`, …). The default slot is
 * rendered inside the element: `<div slot="empty">…</div>` replaces the empty-state text.
 */
export const Gantry = defineComponent({
  name: 'Gantry',
  props,
  emits: Object.fromEntries(Object.keys(GANTRY_EVENTS).map(type => [camel(type), null])) as unknown as Emits,
  setup(props, { emit, expose, slots }): ExposedBindings {
    const element = shallowRef<GantryElement | null>(null);
    expose({ element });

    // One listener per event, for the component's lifetime: the event's `detail` → the emit
    const listeners = Object.keys(GANTRY_EVENTS).map(type => {
      const name = camel(type);
      const listener = (e: Event) =>
        (emit as (event: string, detail: unknown) => void)(name, (e as CustomEvent<unknown>).detail);
      return [type, listener] as const;
    });

    /**
     * `copy`: hand over a new array (for one changed in place: the element compares by identity).
     * Reactive `options` always go over as a one-level copy: the element compares new options with
     * the ones it holds, so those must not be the object that is then changed in place.
     */
    const assign = (el: GantryElement, key: PropertyName, value: unknown, copy = false): void => {
      const raw = unwrap(value);
      let next = raw;
      if (key === 'options' && isProxy(value)) next = { ...(raw as GanttOptions) };
      else if (copy && Array.isArray(raw)) next = [...(raw as unknown[])];
      (el as unknown as Record<PropertyName, unknown>)[key] = next;
    };

    for (const key of GANTRY_PROPERTIES) {
      const list = isList(key);
      watch(
        () => props[key],
        (value, previous) => {
          const el = element.value;
          // `undefined` too (the element's default); the same array again = changed in place
          if (el) assign(el, key, value, list && value === previous);
        },
        { deep: isDeep(key) ? 1 : false },
      );
    }

    const bridge: ObjectDirective<GantryElement> = {
      created(el) {
        for (const [type, listener] of listeners) el.addEventListener(type, listener);
        // A new element holds every default already
        for (const key of GANTRY_PROPERTIES) if (props[key] !== undefined) assign(el, key, props[key]);
        element.value = el;
      },
      unmounted(el) {
        for (const [type, listener] of listeners) el.removeEventListener(type, listener);
        element.value = null;
      },
    };

    // The default slot goes into the element's light DOM (its own slots: `slot="empty"`)
    const render = () => withDirectives(h('gantry-element', null, slots['default']?.()), [[bridge]]);
    // Vue types a setup() that returns its render function as exposing nothing: typed as the
    // binding it exposes, `InstanceType<typeof Gantry>` (a template ref) has `element`
    return render as unknown as ExposedBindings;
  },
});

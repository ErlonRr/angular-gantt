import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
} from 'react';
import {
  GANTRY_EVENTS,
  GANTRY_PROPERTIES,
  type GantryElement,
  type GantryProperties,
  type GantryEventCallbacks,
} from '@gantry/vanilla';

export type {
  GantryElement,
  GantryProperties,
  GantryEventCallbacks,
  VanillaColumnDef as ColumnDef,
  GanttDataSourceConfig,
  GanttBarRenderer,
} from '@gantry/vanilla';
export { GanttDataSource } from '@gantry/vanilla';
export * from '@gantry/core';

type NativeProps = Omit<HTMLAttributes<HTMLElement>, keyof GantryProperties | keyof GantryEventCallbacks | 'children'>;

export interface GantryProps extends GantryProperties, GantryEventCallbacks, NativeProps {
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_STYLE: CSSProperties = { display: 'block', width: '100%', height: '100%' };

/**
 * Gantry Gantt chart for React (18 and 19).
 *
 * A thin binding over the `<gantry-element>` Web Component: props are set as
 * element properties, events arrive as `on*` callbacks with the event `detail`.
 * The ref is the underlying `GantryElement`, exposing the imperative API
 * (`zoomIn()`, `scrollToToday()`, `getSelectedTasks()`, …).
 */
export const Gantry = forwardRef<GantryElement, GantryProps>(function Gantry(props, ref) {
  const elRef = useRef<GantryElement>(null);
  useImperativeHandle(ref, () => elRef.current!, []);

  // Forward each property only when it changes (hook count is constant)
  for (const key of GANTRY_PROPERTIES) {
    const value = props[key];
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      const el = elRef.current;
      if (el && value !== undefined) (el as unknown as Record<string, unknown>)[key] = value;
    }, [value]);
  }

  // Keep the latest callbacks in a ref so listeners are attached only once
  const callbacks = useRef<GantryEventCallbacks>(props);
  callbacks.current = props;
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const entries = Object.entries(GANTRY_EVENTS).map(([type, prop]) => {
      const listener = (e: Event) => {
        const cb = callbacks.current[prop] as ((detail: unknown) => void) | undefined;
        cb?.((e as CustomEvent).detail);
      };
      el.addEventListener(type, listener);
      return [type, listener] as const;
    });
    return () => entries.forEach(([type, listener]) => el.removeEventListener(type, listener));
  }, []);

  const native: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (
      !(GANTRY_PROPERTIES as readonly string[]).includes(k) &&
      !(Object.values(GANTRY_EVENTS) as string[]).includes(k)
    ) {
      native[k] = v;
    }
  }

  return createElement('gantry-element', {
    ...native,
    ref: elRef,
    style: { ...DEFAULT_STYLE, ...props.style },
  });
});

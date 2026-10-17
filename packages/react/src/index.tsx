import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
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
  className?: string | undefined;
  style?: CSSProperties | undefined;
}

const DEFAULT_STYLE: CSSProperties = { display: 'block', width: '100%', height: '100%' };

/**
 * `useLayoutEffect` in the browser: listeners and properties reach the element during the commit,
 * before it paints its first frame (it renders on the next animation frame). On the server neither
 * effect runs, and `useEffect` keeps React 18 from warning about a layout effect.
 */
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/** DOM event name → callback prop, e.g. `['task-dragged', 'onTaskDragged']`. */
const EVENTS = Object.entries<keyof GantryEventCallbacks>(GANTRY_EVENTS);

/** The event listeners on one element. `active` while the effect that attached them is mounted. */
interface Listening {
  readonly el: GantryElement;
  active: boolean;
  readonly detach: () => void;
}

/** One listener per event on `el`; each calls the latest callback in `callbacks` with the event `detail`. */
function listen(el: GantryElement, callbacks: { readonly current: GantryEventCallbacks }): Listening {
  const listeners = EVENTS.map(([type, prop]) => {
    const listener = (e: Event): void => {
      const cb = callbacks.current[prop] as ((detail: unknown) => void) | undefined;
      cb?.((e as CustomEvent<unknown>).detail);
    };
    el.addEventListener(type, listener);
    return [type, listener] as const;
  });
  return {
    el,
    active: true,
    detach: () => {
      for (const [type, listener] of listeners) el.removeEventListener(type, listener);
    },
  };
}

/** Props the wrapper consumes itself: never forwarded to `<gantry-element>` as attributes. */
const OWN_PROPS: ReadonlySet<string> = new Set<string>([
  ...GANTRY_PROPERTIES,
  ...Object.values(GANTRY_EVENTS),
  'className',
  'style',
]);

/**
 * Gantry Gantt chart for React (18 and 19).
 *
 * A thin binding over the `<gantry-element>` Web Component: props are set as element properties
 * (the consumer's objects, unchanged), events arrive as `on*` callbacks with the event `detail`.
 * Props and listeners are applied in layout effects, so the element's first frame already shows
 * the passed props; a prop that goes back to `undefined` restores the element's default. The ref
 * is the underlying `GantryElement`, exposing the imperative API (`zoomIn()`, `scrollToToday()`,
 * `getSelectedTasks()`, …).
 */
export const Gantry = forwardRef<GantryElement, GantryProps>(function Gantry(props, ref) {
  const elRef = useRef<GantryElement>(null);

  // Events — declared first: the listeners are on the element before any property is written, so
  // the events those writes fire (`view-mode-change`, `load-error`, …) reach their callbacks.
  // Attached once; each listener reads the latest callback from `callbacks`. They come off a
  // microtask after the cleanup, unless the effect ran again meanwhile (StrictMode, an <Activity>
  // shown again): React runs this cleanup before it removes the element, and the `state-change` the
  // element fires as it disconnects (a pending state save) must still reach `onStateChange`.
  const callbacks = useRef<GantryEventCallbacks>(props);
  const listening = useRef<Listening | null>(null);
  useIsomorphicLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (listening.current?.el !== el) {
      listening.current?.detach();
      listening.current = listen(el, callbacks);
    }
    const current = listening.current;
    current.active = true;
    return () => {
      current.active = false;
      queueMicrotask(() => {
        if (current.active || listening.current !== current) return;
        listening.current = null;
        current.detach();
      });
    };
  }, []);
  // The latest callbacks, kept in the commit (never during a render React may discard)
  useIsomorphicLayoutEffect(() => {
    callbacks.current = props;
  });

  // Properties — one effect each (the hook count is constant), written when the value changes.
  // `undefined` is written too once the prop had a value: the element restores its default. Before
  // that it is skipped, so the element keeps its default (or what an attribute set).
  const written = useRef<Set<string> | null>(null);
  for (const key of GANTRY_PROPERTIES) {
    const value = props[key];
    // eslint-disable-next-line react-hooks/rules-of-hooks -- a loop over a constant list
    useIsomorphicLayoutEffect(() => {
      const el = elRef.current;
      if (!el) return;
      const keys = (written.current ??= new Set());
      if (value === undefined && !keys.has(key)) return;
      keys.add(key);
      (el as unknown as Record<string, unknown>)[key] = value;
    }, [key, value]);
  }

  // The ref gets the element once its properties are set
  useImperativeHandle(ref, () => elRef.current!, []);

  const { className, style } = props;
  const native: Record<string, unknown> = { ref: elRef, style: { ...DEFAULT_STYLE, ...style } };
  // `class`: React 18 sets a custom element's `className` prop as a `classname` attribute
  if (className !== undefined) native['class'] = className;
  for (const [k, v] of Object.entries(props)) if (!OWN_PROPS.has(k)) native[k] = v;

  return createElement('gantry-element', native);
});

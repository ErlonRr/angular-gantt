/**
 * @file props.ts
 * The settable properties of `<gantry-element>` in one table: name, default, attribute and how the
 * attribute's text becomes the property value. It is the single source of `GANTRY_PROPERTIES`
 * (what the React / Vue / Svelte bindings forward), of the defaults an `undefined` assignment
 * restores, and of `observedAttributes`.
 *
 * The element still declares one explicit accessor per entry (a one-liner calling its private
 * setter), so the `.d.ts` and the Custom Elements Manifest analyzer see every property; a test
 * checks that the table and the accessors match.
 */

import type { GantryProperties } from '../types';

export type PropertyName = keyof GantryProperties;

export interface PropertySpec {
  readonly name: PropertyName;
  /** Value of a new element, restored by assigning `undefined` or removing the attribute */
  readonly default: unknown;
  /** Attribute the property is also read from (the element never writes it back) */
  readonly attr?: string;
  /** Attribute text → property value; `null` (attribute removed) → `undefined` (the default) */
  readonly parse?: (value: string | null) => unknown;
}

/** Boolean attribute: present → `true`, `"false"` → `false`, removed → the default. */
const flag = (v: string | null): boolean | undefined => (v === null ? undefined : v !== 'false');

/** Text attribute: its value as is, removed → the default. */
const text = (v: string | null): string | undefined => v ?? undefined;

/** Names missing from the table make the table a type error. */
type Complete<T extends readonly PropertySpec[]> = [Exclude<PropertyName, T[number]['name']>] extends [never]
  ? T
  : { readonly missing: Exclude<PropertyName, T[number]['name']> };

const table = <const T extends readonly PropertySpec[]>(specs: T & Complete<T>): T => specs;

/** Every settable property, in the order of `GANTRY_PROPERTIES`. */
export const PROPERTY_TABLE = table([
  { name: 'tasks', default: [] },
  // `undefined`: the built-in columns (`options.columns` wins over the property)
  { name: 'columns', default: undefined },
  { name: 'options', default: {} },
  { name: 'annotations', default: [] },
  {
    name: 'darkMode',
    default: false,
    attr: 'dark-mode',
    parse: v => (v === null ? undefined : v === 'auto' ? 'auto' : v !== 'false'),
  },
  { name: 'showToolbar', default: true, attr: 'show-toolbar', parse: flag },
  { name: 'enableDrag', default: true, attr: 'enable-drag', parse: flag },
  { name: 'enableResize', default: true, attr: 'enable-resize', parse: flag },
  { name: 'tooltipEnabled', default: true, attr: 'tooltip-enabled', parse: flag },
  { name: 'showLegend', default: false, attr: 'show-legend', parse: flag },
  { name: 'dataSource', default: null },
  { name: 'renderBar', default: undefined },
  // The chart states (core `resolveChartState`): consumer-driven loading and error
  { name: 'loading', default: false, attr: 'loading', parse: flag },
  { name: 'errorMessage', default: null, attr: 'error-message', parse: text },
  // Phase 10: charts that share one timeline (core `createGanttSyncGroup`); an object, so no attribute
  { name: 'syncGroup', default: null },
]);

const names = <const T extends readonly PropertySpec[]>(specs: T) =>
  Object.freeze(specs.map(spec => spec.name)) as unknown as { readonly [I in keyof T]: T[I]['name'] };

/** Settable properties of `<gantry-element>`, in table order: what framework bindings forward. */
export const GANTRY_PROPERTIES = names(PROPERTY_TABLE);

/** Default value of every property (frozen; an object default is copied before it is used). */
export const DEFAULTS: { readonly [K in PropertyName]: unknown } = Object.freeze(
  Object.fromEntries(
    PROPERTY_TABLE.map(spec => [
      spec.name,
      typeof spec.default === 'object' ? Object.freeze(spec.default) : spec.default,
    ]),
  ) as Record<PropertyName, unknown>,
);

/** `undefined` → a fresh copy of `name`'s default (never the shared table value), else `value`. */
export function orDefault(name: PropertyName, value: unknown): unknown {
  if (value !== undefined) return value;
  const def = DEFAULTS[name];
  return Array.isArray(def) ? [...(def as unknown[])] : def !== null && typeof def === 'object' ? { ...def } : def;
}

/** The zoom level: an attribute without a property (`setViewMode()`; removing it changes nothing). */
export const VIEW_MODE_ATTR = 'view-mode';

const byAttribute = new Map<string, PropertySpec>(
  PROPERTY_TABLE.flatMap(spec => ('attr' in spec ? [[spec.attr, spec] as const] : [])),
);

/** The property an observed attribute sets (`undefined` for `view-mode`). */
export const propertyOfAttribute = (attr: string): PropertySpec | undefined => byAttribute.get(attr);

/** The element's `observedAttributes`: every property attribute, then `view-mode`. */
export const OBSERVED_ATTRIBUTES: readonly string[] = [...byAttribute.keys(), VIEW_MODE_ATTR];

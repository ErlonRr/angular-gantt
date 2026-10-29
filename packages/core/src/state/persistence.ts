// ─────────────────────────────────────────────────────────────
//  gantry · state/persistence.ts
//  Versioned UI state (`GanttState`): serialisation, validation, reading of
//  legacy (unversioned) snapshots, and the storage key every binding uses.
//  DOM-free: storage is passed in by the binding (e.g. `window.localStorage`).
// ─────────────────────────────────────────────────────────────

import type { GanttRowsMode, GanttState, GanttView } from '../types';
import { viewFromState } from './view';

/** Version written by `serializeState`. Unversioned snapshots are treated as version 1. */
export const GANTT_STATE_VERSION = 2;

/** Prefix of the storage key used for `options.stateKey`. */
export const STATE_STORAGE_PREFIX = 'gantry:';

/**
 * Debounce (ms) between a UI-state change and its report (`stateChange` / `state-change`) and
 * write under `options.stateKey`: a burst of changes (a splitter drag, a column resize) saves once.
 */
export const STATE_SAVE_DELAY = 150;

/** Minimal `Storage` subset the persistence helpers need (`localStorage` satisfies it). */
export interface GanttStateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * A storage, or a lazy getter for one. Use the getter form for `window.localStorage`:
 * merely reading that property throws when site data is blocked, and the helpers catch it.
 */
export type GanttStateStorageSource =
  GanttStateStorage | (() => GanttStateStorage | null | undefined) | null | undefined;

/** Every `GanttView`; a `Record` so adding a view to the type is a compile error here. */
const VIEWS: Record<GanttView, true> = { split: true, table: true, chart: true };

/** Every `GanttRowsMode`, like `VIEWS`. */
const ROWS: Record<GanttRowsMode, true> = { tasks: true, resources: true };

/** Storage key for a `stateKey` option: `'gantry:' + key`. */
export function stateStorageKey(key: string): string {
  return STATE_STORAGE_PREFIX + key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** One validator per `GanttState` field (`undefined` = drop); a missing key is a compile error. */
type StateValidators = { [K in keyof Required<GanttState>]: (value: unknown) => GanttState[K] };

const VALIDATORS: StateValidators = {
  panelWidth: value => (isPositiveFinite(value) ? value : undefined),
  panelCollapsed: value => (typeof value === 'boolean' ? value : undefined),
  view: value => (typeof value === 'string' && Object.hasOwn(VIEWS, value) ? (value as GanttView) : undefined),
  viewMode: value => (typeof value === 'string' && value.length > 0 ? value : undefined),
  columnWidths: value =>
    isRecord(value)
      ? Object.fromEntries(
          // `__proto__` is dropped so painters copying the map with `obj[key] = width` stay safe
          Object.entries(value).filter(
            (entry): entry is [string, number] => entry[0] !== '__proto__' && isPositiveFinite(entry[1]),
          ),
        )
      : undefined,
  collapsedIds: value =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : undefined,
  sort: value => {
    if (value === null) return null;
    if (!isRecord(value)) return undefined;
    const { key, dir } = value;
    return typeof key === 'string' && (dir === 'asc' || dir === 'desc') ? { key, dir } : undefined;
  },
  rows: value => (typeof value === 'string' && Object.hasOwn(ROWS, value) ? (value as GanttRowsMode) : undefined),
};

const STATE_KEYS = Object.keys(VALIDATORS) as (keyof GanttState)[];

function assignValid<K extends keyof GanttState>(state: GanttState, key: K, raw: unknown): void {
  const value = VALIDATORS[key](raw);
  if (value !== undefined) state[key] = value;
}

/**
 * Keep only the valid fields of a state-like value (any unknown input is accepted).
 * Invalid fields are dropped rather than failing the whole snapshot:
 * - `panelWidth`: finite number > 0
 * - `panelCollapsed`: boolean
 * - `view`: `'split' | 'table' | 'chart'`
 * - `viewMode`: non-empty string
 * - `columnWidths`: object; entries that are not finite numbers > 0 (and `__proto__`) are dropped
 * - `collapsedIds`: array; non-string entries are dropped
 * - `sort`: `{ key: string; dir: 'asc' | 'desc' }` or `null`
 * - `rows`: `'tasks' | 'resources'`
 * Unknown keys (including the `v` version marker) are removed.
 */
export function normalizeState(value: unknown): GanttState {
  const state: GanttState = {};
  if (!isRecord(value)) return state;
  for (const key of STATE_KEYS) assignValid(state, key, value[key]);
  return state;
}

/** Serialise a state snapshot as versioned JSON: `{ "v": 2, ...state }` (invalid fields dropped). */
export function serializeState(state: GanttState): string {
  return JSON.stringify({ v: GANTT_STATE_VERSION, ...normalizeState(state) });
}

/**
 * Parse a stored snapshot. Accepts version 2 and legacy unversioned (or `v: 1`) objects,
 * validating every field (see `normalizeState`); a missing `view` is derived from
 * `panelCollapsed` (`viewFromState`). Returns `null` for empty, unparseable or non-object
 * input and for any other `v` (including `null`). A snapshot written by a newer major is
 * therefore ignored and replaced on the next save.
 */
export function parseState(raw: string | null | undefined): GanttState | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const version = 'v' in value ? value['v'] : 1;
  if (version !== GANTT_STATE_VERSION && version !== 1) return null;
  const state = normalizeState(value);
  const view = viewFromState(state);
  return view && !state.view ? { ...state, view } : state;
}

function resolveStorage(source: GanttStateStorageSource): GanttStateStorage | null {
  return (typeof source === 'function' ? source() : source) ?? null;
}

/** Read and parse the snapshot saved under `stateKey`; `null` when absent, invalid or storage is unavailable. */
export function readStoredState(source: GanttStateStorageSource, stateKey: string): GanttState | null {
  try {
    return parseState(resolveStorage(source)?.getItem(stateStorageKey(stateKey)));
  } catch {
    return null;
  }
}

/** Save a snapshot under `stateKey`. Returns `false` when storage is unavailable or full. */
export function writeStoredState(source: GanttStateStorageSource, stateKey: string, state: GanttState): boolean {
  try {
    const storage = resolveStorage(source);
    if (!storage) return false;
    storage.setItem(stateStorageKey(stateKey), serializeState(state));
    return true;
  } catch {
    return false;
  }
}

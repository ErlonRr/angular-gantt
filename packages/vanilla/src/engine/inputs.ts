/**
 * @file inputs.ts
 * The engine's input signals: everything `<gantry-element>` reacts to. Property setters,
 * attributes, the API methods, pointer / keyboard / scroll handlers, measurements, the clock and
 * the colour-scheme listener write these signals only; the graph (`engine/graph/*`) derives the
 * render model from them and the render effect paints it.
 */

import {
  emptySelection,
  type DragPreview,
  type GanttAnnotation,
  type GanttOptions,
  type GanttTask,
  type GanttThemeOverrides,
  type GanttView,
  type SelectionState,
  type SortDirection,
} from '@gantryjs/core';
import { signal, type WritableSignal } from '../reactive';
import type { GanttDataSource } from '../datasource/gantt-datasource';
import type { GanttBarRenderer, VanillaColumnDef } from '../types';
import { orDefault, type PropertyName } from './props';

/** Sort of the task list: column key and direction (`null` = original order). */
export interface SortState {
  key: string;
  dir: SortDirection;
}

/** Footer state of the task list while a data source is set. */
export interface GanttLoadMoreState {
  isLoading: boolean;
  hasMore: boolean;
  loadedCount: number;
  /** The last page failed: show the error and a Retry button */
  error?: boolean | undefined;
}

/** Heights of the horizontal scrollbars of the task-list panel and the timeline viewport (px). */
export interface ScrollbarHeights {
  panel: number;
  canvas: number;
}

export interface Inputs {
  // ── Properties ──────────────────────────────────────────
  /** `tasks` as set (normalised by `graph.tasks`) */
  readonly tasksIn: WritableSignal<GanttTask[]>;
  /**
   * `options`. Structurally equal objects do not notify, so re-assigning equal options (a
   * framework re-render, `structuredClone`) recomputes nothing. Re-assigning the same object
   * does notify: it may have been mutated in place.
   */
  readonly optionsIn: WritableSignal<GanttOptions>;
  /** `columns` property (`null` = none; `options.columns` wins over it) */
  readonly columnsIn: WritableSignal<VanillaColumnDef[] | null>;
  readonly annotationsIn: WritableSignal<GanttAnnotation[]>;
  readonly darkModeIn: WritableSignal<boolean | 'auto'>;
  readonly enableDrag: WritableSignal<boolean>;
  readonly enableResize: WritableSignal<boolean>;
  readonly showToolbar: WritableSignal<boolean>;
  readonly showLegend: WritableSignal<boolean>;
  readonly tooltipEnabled: WritableSignal<boolean>;
  readonly renderBar: WritableSignal<GanttBarRenderer | undefined>;
  readonly dataSource: WritableSignal<GanttDataSource | null>;
  /** `loading`: the consumer is loading the tasks (skeleton while there are no rows, `aria-busy`) */
  readonly loading: WritableSignal<boolean>;
  /** `errorMessage`: a non-blank string shows the error state with that message (`null` = none) */
  readonly errorMessage: WritableSignal<string | null>;

  // ── Theme ───────────────────────────────────────────────
  /** `prefers-color-scheme: dark` (followed while `darkMode` is `'auto'` and connected) */
  readonly prefersDark: WritableSignal<boolean>;
  /** `setTheme()` / `patchTheme()` overrides (on top of `options.theme`) */
  readonly apiTheme: WritableSignal<GanttThemeOverrides>;

  // ── UI state ────────────────────────────────────────────
  /**
   * Zoom level chosen through the API, the toolbar, the keyboard or a restored state, or taken
   * from `options.viewMode` when that option changes. `graph.viewMode` is the level actually
   * shown (a name missing from `zoomLevels` falls back).
   */
  readonly viewModeOverride: WritableSignal<string>;
  /** View chosen through the API, the toolbar, the splitter or a restored state, or taken from the options when they change */
  readonly viewOverride: WritableSignal<GanttView>;
  readonly collapsedIds: WritableSignal<Set<string>>;
  readonly sort: WritableSignal<SortState | null>;
  readonly selection: WritableSignal<SelectionState>;
  readonly dragPreview: WritableSignal<DragPreview | null>;
  /** Row holding focus (a task-list row or cell, or a bar; `interaction/keyboard.ts`): pinned, both panes' tab stops follow it */
  readonly focusedRowId: WritableSignal<string | null>;
  /**
   * Where a zoom keeps its date: x in viewport px (from the viewport's left edge) of the pointer
   * for Ctrl/⌘ + wheel and pinch zooms, `null` = the viewport's centre (toolbar, keyboard, API).
   * Written by the zoom gestures with the zoom, read and cleared by the scroll-commands region.
   */
  readonly zoomAnchor: WritableSignal<number | null>;
  /** Bar under a fine pointer (mouse / pen hover): its grips show (`g.gantt-bar-overlay`) */
  readonly hoveredBarId: WritableSignal<string | null>;
  /**
   * Bar that holds keyboard focus reached from the keyboard (the last input was a key, not a
   * pointer): its focus ring and grips show (`g.gantt-bar-overlay`). `null` otherwise.
   */
  readonly focusVisibleBarId: WritableSignal<string | null>;
  /** Panel width the user chose (splitter, restored state), in px; `null` = from `panel.width` */
  readonly panelW: WritableSignal<number | null>;
  /** Data-source footer state (`null` without a data source) */
  readonly loadState: WritableSignal<GanttLoadMoreState | null>;
  /** The clock: ticks every minute while connected (today line, statuses) */
  readonly nowTick: WritableSignal<Date>;

  // ── Measurements ────────────────────────────────────────
  // Read only in the scroll handlers (`interaction/scroll.ts`), when the element connects and in
  // its ResizeObserver callback — never during a render (D9). 0 = not measured.
  /** Vertical scroll of the timeline viewport (the panel mirrors it) */
  readonly scrollTop: WritableSignal<number>;
  readonly scrollLeft: WritableSignal<number>;
  /** Timeline viewport size (`canvasH` 0 = not measured: the window assumes `VIEWPORT_FALLBACK_HEIGHT`) */
  readonly canvasW: WritableSignal<number>;
  readonly canvasH: WritableSignal<number>;
  /** Width of `.gantry-main` (the host width the panel width resolves against) */
  readonly mainW: WritableSignal<number>;
  /**
   * Height of the sticky timeline header, which the vertical window leaves out of the viewport.
   * The header is sized by the model, so the host region writes the model's height here (first
   * in the flush, before the windowed regions read it) instead of measuring it.
   */
  readonly headerH: WritableSignal<number>;
  /** Horizontal scrollbar heights of the panel and the timeline viewport (measured; not used yet) */
  readonly scrollbarX: WritableSignal<ScrollbarHeights>;
  /** Width of the timeline viewport's vertical scrollbar (measured; not used yet) */
  readonly scrollbarY: WritableSignal<number>;
}

const MAX_DEPTH = 64;

/**
 * Deep equality for plain data: arrays and plain objects compare by content, Dates by time,
 * functions and every other object (Map, Set, DOM nodes, class instances) by identity.
 */
export function structuralEqual(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || depth > MAX_DEPTH) return false;
  if (a instanceof Date || b instanceof Date)
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => structuralEqual(v, b[i], depth + 1));
  }
  const proto = Object.getPrototypeOf(a) as unknown;
  if (proto !== Object.getPrototypeOf(b) || (proto !== Object.prototype && proto !== null)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every(k => Object.hasOwn(rb, k) && structuralEqual(ra[k], rb[k], depth + 1));
}

/** `options` equality: structural, but the same object always counts as changed (mutated in place). */
const sameOptions = (a: GanttOptions, b: GanttOptions) => a !== b && structuralEqual(a, b);

const sameTime = (a: Date, b: Date) => a.getTime() === b.getTime();

/** A fresh copy of a property's default (see `engine/props.ts`). */
const fresh = <T>(name: PropertyName): T => orDefault(name, undefined) as T;

export function createInputs(): Inputs {
  const num = (v = 0) => signal(v);
  const flag = (v: boolean) => signal(v);
  return {
    // Property inputs start at the property table's defaults (the single source)
    tasksIn: signal(fresh<GanttTask[]>('tasks')),
    optionsIn: signal(fresh<GanttOptions>('options'), { equals: sameOptions }),
    columnsIn: signal(fresh<VanillaColumnDef[] | undefined>('columns') ?? null),
    annotationsIn: signal(fresh<GanttAnnotation[]>('annotations')),
    darkModeIn: signal(fresh<boolean | 'auto'>('darkMode')),
    enableDrag: flag(fresh<boolean>('enableDrag')),
    enableResize: flag(fresh<boolean>('enableResize')),
    showToolbar: flag(fresh<boolean>('showToolbar')),
    showLegend: flag(fresh<boolean>('showLegend')),
    tooltipEnabled: flag(fresh<boolean>('tooltipEnabled')),
    renderBar: signal(fresh<GanttBarRenderer | undefined>('renderBar')),
    dataSource: signal(fresh<GanttDataSource | null>('dataSource')),
    loading: flag(fresh<boolean>('loading')),
    errorMessage: signal(fresh<string | null>('errorMessage')),
    prefersDark: flag(false),
    apiTheme: signal<GanttThemeOverrides>({}),
    viewModeOverride: signal('Month'),
    viewOverride: signal<GanttView>('split'),
    collapsedIds: signal(new Set<string>()),
    sort: signal<SortState | null>(null),
    selection: signal(emptySelection()),
    dragPreview: signal<DragPreview | null>(null),
    focusedRowId: signal<string | null>(null),
    zoomAnchor: signal<number | null>(null),
    hoveredBarId: signal<string | null>(null),
    focusVisibleBarId: signal<string | null>(null),
    panelW: signal<number | null>(null),
    loadState: signal<GanttLoadMoreState | null>(null, { equals: structuralEqual }),
    // The engine's clock: the one place that reads the time
    nowTick: signal(new Date(), { equals: sameTime }),
    scrollTop: num(),
    scrollLeft: num(),
    canvasW: num(),
    canvasH: num(),
    mainW: num(),
    headerH: num(),
    scrollbarX: signal<ScrollbarHeights>({ panel: 0, canvas: 0 }, { equals: structuralEqual }),
    scrollbarY: num(),
  };
}

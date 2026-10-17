/**
 * @file context.ts
 * What every layer is built with, and the shape of a layer.
 *
 * A layer paints one region of the element. `engine/render.ts` runs `layer.paint()` inside that
 * region's effect, on the per-element frame scheduler, in the fixed flush order (`REGIONS`):
 * every signal the body reads becomes a dependency, so a region re-runs only when something it
 * paints changed. Layer bodies only *write* the DOM (through `dom/h.ts`, `dom/patch.ts` and
 * `dom/keyed.ts`) and never read layout (D9): measurements arrive as input signals.
 *
 * Layers are created once per element (`createLayers`), so a layer's closure is the place for its
 * persistent nodes and caches; `disconnect()` runs when the element leaves the document.
 */

import type { GanttFlatRow, GanttView } from '@gantry/core';
import type { Graph } from '../engine/engine';
import type { Inputs } from '../engine/inputs';
import type { Columns } from '../interaction/columns';
import type { Drag } from '../interaction/drag';
import type { Selection } from '../interaction/selection';
import type { GantryEventDetailMap } from '../types';
import type { FocusTracker } from './focus-restore';
import type { Skeleton } from './skeleton';

/** The element's public API the layers and interactions call (toolbar buttons, splitter, keys). */
export interface HostApi extends HTMLElement {
  zoomIn(): void;
  zoomOut(): void;
  setViewMode(mode: string): void;
  setView(view: GanttView): void;
  togglePanel(): void;
  scrollToToday(behavior?: ScrollBehavior): void;
  selectAll(): void;
}

/** Dispatches one of the element's public events (`bubbles` + `composed`). */
export type Emit = <K extends keyof GantryEventDetailMap>(type: K, detail: GantryEventDetailMap[K]) => void;

export interface LayerContext {
  /** The `<gantry-element>` (its public API) */
  readonly host: HostApi;
  readonly shadow: ShadowRoot;
  /** Input signals: write them from event handlers, never from a layer body */
  readonly inputs: Inputs;
  /** The render model (computeds) */
  readonly graph: Graph;
  readonly columns: Columns;
  /** Persistent nodes (`layers/skeleton.ts`) */
  readonly dom: Skeleton;
  readonly drag: Drag;
  readonly selection: Selection;
  /** Keeps keyboard focus on a control a layer rebuilds (`capture()` before replacing nodes) */
  readonly focus: FocusTracker;
  readonly emit: Emit;
  /** Debounced `state-change` + persistence under `options.stateKey` */
  readonly saveState: () => void;
  /** A row clicked (or Enter / Space) in either pane: selection rules, then `row-click` */
  readonly rowClick: (row: GanttFlatRow, event: MouseEvent | KeyboardEvent) => void;
}

/** One region's painter. */
export interface Layer {
  /** The region body: tracked reads of inputs / graph, DOM writes only */
  readonly paint: () => void;
  /** The element left the document: cancel timers, gestures, pending work */
  readonly disconnect?: (() => void) | undefined;
}

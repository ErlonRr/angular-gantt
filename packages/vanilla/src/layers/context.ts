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

import type { Announcer, GanttExportFormat, GanttExportTrigger, GanttFlatRow, GanttView } from '@gantryjs/core';
import type { Editor } from '../engine/edit';
import type { Graph } from '../engine/engine';
import type { Inputs } from '../engine/inputs';
import type { CellEditApi } from '../interaction/cell-edit';
import type { Columns } from '../interaction/columns';
import type { Drag } from '../interaction/drag';
import type { LinkApi } from '../interaction/link';
import type { ProgressDrag } from '../interaction/progress';
import type { Selection } from '../interaction/selection';
import type { GantryEventDetailMap } from '../types';
import type { FocusTracker } from './focus-restore';
import type { Skeleton } from './skeleton';
import type { SyncLayer } from './sync';

/** The element's public API the layers and interactions call (toolbar buttons, splitter, keys). */
export interface HostApi extends HTMLElement {
  zoomIn(): void;
  zoomOut(): void;
  setViewMode(mode: string): void;
  setView(view: GanttView): void;
  togglePanel(): void;
  scrollToToday(behavior?: ScrollBehavior): void;
  /** Zoom so every task fits the timeline viewport, then scroll to the first one (toolbar Fit, the F key). */
  fitToScreen(): void;
  selectAll(): void;
}

/**
 * Dispatches one of the element's public events (`bubbles` + `composed`; `before-change` is also
 * `cancelable`). Returns `false` when a listener called `preventDefault()` on a cancelable event.
 */
export type Emit = <K extends keyof GantryEventDetailMap>(type: K, detail: GantryEventDetailMap[K]) => boolean;

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
  /**
   * The change pipeline and the history (`engine/edit.ts`): every task change goes through
   * `edit.commit()` (never `inputs.tasksIn.set` in a feature); build changes from `edit.rawTask(id)`
   */
  readonly edit: Editor;
  /** Drawing, selecting and deleting dependency links (`interaction/link.ts`) */
  readonly link: LinkApi;
  /** The progress-grip drag (`interaction/progress.ts`) */
  readonly progress: ProgressDrag;
  /** Cell editing (`interaction/cell-edit.ts`; `editCell()` starts it) */
  readonly cells: CellEditApi;
  /** Keeps keyboard focus on a control a layer rebuilds (`capture()` before replacing nodes) */
  readonly focus: FocusTracker;
  readonly emit: Emit;
  /** Debounced `state-change` + persistence under `options.stateKey` */
  readonly saveState: () => void;
  /**
   * The polite live region (`.gantt-sr-live`) through core `createAnnouncer`: `say()` is
   * debounced (250 ms, the last message wins), `now()` is not. Errors go to `dom.srAlert` instead.
   */
  readonly announce: Announcer;
  /** Marks the host region busy (`aria-busy`, through `ElementInternals` when available) */
  readonly setBusy: (busy: boolean) => void;
  /** A row clicked (or Enter / Space) in either pane: selection rules, then `row-click` */
  readonly rowClick: (row: GanttFlatRow, event: MouseEvent | KeyboardEvent) => void;
  /**
   * Flushes the pending frame now (no-op while flushing or disconnected): only from an event
   * handler that must see its result before the next event — the key or double-click that opens a
   * cell editor mounts and focuses its field at once, so fast typing loses no key
   */
  readonly renderNow: () => void;
  /**
   * The sync-group link (`layers/sync.ts`) for the interactions: the splitter reports the panel
   * width it sets (`reportPanel`; never for a width the group applied)
   */
  readonly sync: Pick<SyncLayer, 'reportPanel'>;
  /**
   * Runs an export from the toolbar's Export menu: `download(format)`, or `print()` for
   * `'print'`, with `trigger` (plan §3c). The engine loads the export code on first use
   * (`import('../export/run')`, a lazy chunk). Resolves `false` when `before-export` vetoed it or
   * a print is running; never rejects (a toolbar failure goes to the alert region).
   */
  readonly runExport: (format: GanttExportFormat, trigger: GanttExportTrigger) => Promise<boolean>;
}

/** One region's painter. */
export interface Layer {
  /** The region body: tracked reads of inputs / graph, DOM writes only */
  readonly paint: () => void;
  /** The element left the document: cancel timers, gestures, pending work */
  readonly disconnect?: (() => void) | undefined;
}

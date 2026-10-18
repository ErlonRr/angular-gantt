// ─────────────────────────────────────────────────────────────
//  gantry · bars/bar-focus.service.ts
//
//  Keyboard focus on the bars (D3–D5 of Gantry 2 phase 9), one per chart
//  (provided by GantryComponent, read by the chart, its canvas, the bar
//  overlay and the keyboard directive) — the Web Component's
//  `layers/bars.ts` roving tab stop and overlay, and the modality part of
//  `interaction/keyboard.ts`:
//
//   - the bars rove: every bar is focusable (`data-focus-key=bar:<id>`)
//     and one is the timeline's tab stop (`tabStopId`: the focused row's
//     bar — in either pane, `focusedRowId` — else the one focused last
//     while it is mounted, else the first bar in view; core
//     `tabStopIndex`), the others `tabindex=-1` (the bar outlet writes it
//     from `tabStop(id)`);
//   - the viewport is a tab stop (`viewportTabIndex` 0) only while no bar
//     is mounted, else -1;
//   - input modality, tracked on the document like `:focus-visible`: the
//     last input was a key (initially too: focus moved by a script shows
//     its ring) or a pointer press. A bar focused from the keyboard is
//     `layout.focusVisibleBarId` (a key pressed on a bar the pointer
//     focused makes it so; a pointer press anywhere clears it);
//   - the bar overlay (`g.gantt-bar-overlay`, `overlay` / `shown`): the
//     focus ring (`BarVisual.focusRect`) of `focusVisibleBarId` and the
//     resize grips (`handles.*.grip`) of that bar, of the bar under a fine
//     pointer (`layout.hoveredBarId`) and, on coarse pointers, of the
//     selected bars — per mounted row, in row order: ring, left grip,
//     right grip. Attached only while it holds a shape.
// ─────────────────────────────────────────────────────────────

import { DOCUMENT, DestroyRef, Injectable, computed, inject, linkedSignal, signal, untracked } from '@angular/core';
import { tabStopIndex, type BarVisual, type Rect } from '@gantryjs/core';

import { type RowGeometry } from '../types';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttScrollService } from '../scroll/gantt-scroll.service';
import { GanttSelectionService } from '../selection/gantt-selection.service';

/** One shape of the bar overlay: a focus ring or a resize grip. */
export interface BarOverlayShape {
  /** `<task id>\u0001ring` / `\u0001left` / `\u0001right` */
  readonly key: string;
  readonly className: 'gantt-bar-focus-ring' | 'gantt-bar-grip';
  readonly rect: Rect & { readonly rx: number };
}

/** Keys that alone don't make focus "visible" (pressing them with a pointer is common). */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn']);

const NO_SHAPES: readonly BarOverlayShape[] = [];
const NONE: ReadonlySet<string> = new Set();

const sameShapes = (a: readonly BarOverlayShape[], b: readonly BarOverlayShape[]): boolean =>
  a === b ||
  (a.length === b.length &&
    a.every((s, i) => {
      const t = b[i];
      return (
        s.key === t.key &&
        s.className === t.className &&
        s.rect.x === t.rect.x &&
        s.rect.y === t.rect.y &&
        s.rect.width === t.rect.width &&
        s.rect.height === t.rect.height &&
        s.rect.rx === t.rect.rx
      );
    }));

/** The bar (`g.gantt-bars-layer > [data-task-id]`) of `host` that `el` is or is inside, `null` elsewhere. */
export function barHostOf(el: EventTarget | null | undefined, host?: Element): Element | null {
  const bar = el instanceof Element ? el.closest('.gantt-bars-layer > [data-task-id]') : null;
  return bar && (!host || host.contains(bar)) ? bar : null;
}

@Injectable()
export class GanttBarFocusService {
  private readonly layout = inject(GanttLayoutService);
  private readonly scroll = inject(GanttScrollService);
  private readonly selection = inject(GanttSelectionService);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  /** The chart's bar visuals (bound once by GantryComponent) */
  private readonly visualSource = signal<(() => (geo: RowGeometry) => BarVisual) | null>(null);

  /** The row focused last (kept while focus is elsewhere): its bar keeps the tab stop while mounted */
  private readonly lastFocusedId = linkedSignal<string | null, string | null>({
    source: this.layout.focusedRowId,
    computation: (id, prev) => id ?? prev?.value ?? null,
  });

  /** The primary pointer is coarse (touch): selected bars show their grips. Read once, in the browser. */
  private readonly coarse = signal(false);

  /** The last input was a key (initially: focus moved by a script shows its ring, like `:focus-visible`) */
  private keyboard = true;

  /** Task id of the timeline's tab-stop bar (`null` while no bar is mounted) */
  readonly tabStopId = computed<string | null>(() => {
    const geos = this.layout.mountedGeometries();
    const vw = this.layout.vWindow();
    const preferred = [this.layout.focusedRowId(), this.lastFocusedId()];
    // Read, not tracked: the window (read above) changes whenever a row crosses the top
    const firstInView = Math.max(vw.first, Math.ceil(untracked(this.scroll.scrollTop) / this.layout.rowHeight()));
    const stop = tabStopIndex(
      geos.map(geo => geo.row.task.id),
      preferred,
      geos.findIndex(geo => geo.row.visibleIndex >= firstInView && geo.row.visibleIndex <= vw.last),
    );
    return stop < 0 ? null : (geos[stop]?.row.task.id ?? null);
  });

  /** `tabindex` of the timeline viewport: a tab stop only while no bar is mounted */
  readonly viewportTabIndex = computed<0 | -1>(() => (this.layout.mountedGeometries().length ? -1 : 0));

  /**
   * The bar overlay's shapes: the focus ring of the keyboard-focused bar, the grips of that bar, of
   * the hovered one and (coarse pointers) of the selected ones, for the mounted rows in row order.
   */
  readonly overlay = computed<readonly BarOverlayShape[]>(
    () => {
      const visualOf = this.visualSource()?.();
      const ringId = this.layout.focusVisibleBarId();
      const hoverId = this.layout.hoveredBarId();
      const selected = this.coarse() ? this.selection.selectedIds() : NONE;
      if (!visualOf || (ringId === null && hoverId === null && selected.size === 0)) return NO_SHAPES;
      const shapes: BarOverlayShape[] = [];
      for (const geo of this.layout.mountedGeometries()) {
        const id = geo.row.task.id;
        const ring = id === ringId;
        if (!ring && id !== hoverId && !selected.has(id)) continue;
        const v = visualOf(geo);
        if (ring) shapes.push({ key: `${id}\u0001ring`, className: 'gantt-bar-focus-ring', rect: v.focusRect });
        if (!v.handles) continue;
        shapes.push({ key: `${id}\u0001left`, className: 'gantt-bar-grip', rect: v.handles.left.grip });
        shapes.push({ key: `${id}\u0001right`, className: 'gantt-bar-grip', rect: v.handles.right.grip });
      }
      return shapes;
    },
    { equal: sameShapes },
  );

  /** Attach `g.gantt-bar-overlay`: it holds a ring or a grip */
  readonly shown = computed(() => this.overlay().length > 0);

  /** The chart's bar visual of a geometry (memoised per geometry by GantryComponent); bound once. */
  bindVisuals(visuals: () => (geo: RowGeometry) => BarVisual): void {
    this.visualSource.set(visuals);
  }

  /**
   * The roving `tabindex` of the bar of `taskId`: `true` = 0 (the tab stop), `false` = -1. Read in
   * the canvas template (it reads signals).
   */
  tabStop(taskId: string): boolean {
    return this.tabStopId() === taskId;
  }

  /**
   * Starts tracking the input modality on the document (after the first render, in the browser;
   * released with the chart): a key (not a lone modifier) is keyboard input — a bar of `host` the
   * pointer focused shows its ring from then on — a pointer press is not, and hides the ring.
   */
  connect(host: Element): void {
    const doc = this.doc;
    const win = doc.defaultView;
    this.coarse.set(typeof win?.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches);
    const onKey = (e: KeyboardEvent): void => {
      if (MODIFIER_KEYS.has(e.key)) return;
      this.keyboard = true;
      const id = barHostOf(doc.activeElement, host)?.getAttribute('data-task-id') ?? null;
      if (id !== null) this.layout.focusVisibleBarId.set(id);
    };
    const onPointer = (): void => {
      this.keyboard = false;
      this.layout.focusVisibleBarId.set(null);
    };
    doc.addEventListener('keydown', onKey, { capture: true });
    doc.addEventListener('pointerdown', onPointer, { capture: true });
    this.destroyRef.onDestroy(() => {
      doc.removeEventListener('keydown', onKey, { capture: true });
      doc.removeEventListener('pointerdown', onPointer, { capture: true });
    });
  }

  /**
   * Focus moved onto the bar of `taskId` (the canvas' `focusin`): it is the focus-visible bar when
   * the last input was a key. Returns whether it is focus-visible.
   */
  focusIn(taskId: string): boolean {
    const visible = this.keyboard;
    this.layout.focusVisibleBarId.set(visible ? taskId : null);
    return visible;
  }

  /** Focus left the bars for something else (the canvas' `focusout`): no bar is focused or focus-visible. */
  focusOut(): void {
    this.layout.focusVisibleBarId.set(null);
  }
}

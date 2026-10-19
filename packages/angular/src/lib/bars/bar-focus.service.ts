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
//   - the bar overlay (`g.gantt-bar-overlay`, `overlay` / `shown`): core
//     `computeBarOverlay` (D11 of Gantry 2 phase 11, the Web Component's
//     `layers/bars.ts`) over the mounted rows, in its order — per bar the
//     focus ring (`BarVisual.focusRect`) of `focusVisibleBarId`, the
//     resize grips (`handles.*.grip`), the progress grip
//     (`progressGrip.grip`) and the link connectors (`connectors.*.dot`,
//     with their `--source` / `--target` / `--invalid` modifiers) of that
//     bar, of the bar under a fine pointer (`layout.hoveredBarId`), on
//     coarse pointers of the selected bars, of the bar whose progress is
//     dragged (`layout.progressPreview`) and of a link session's ends
//     (`layout.link`). Without editing: the ring and the grips, as before.
//     Attached only while it holds a shape. The canvas hits the progress
//     grip and the connectors only where they show (`hitTargets`).
// ─────────────────────────────────────────────────────────────

import { DOCUMENT, DestroyRef, Injectable, computed, inject, linkedSignal, signal, untracked } from '@angular/core';
import {
  computeBarOverlay,
  tabStopIndex,
  type BarHitTarget,
  type BarOverlayInput,
  type BarOverlayLink,
  type BarVisual,
  type OverlayShape,
} from '@gantryjs/core';

import { type RowGeometry } from '../types';
import { GanttLayoutService, type GanttLinkState } from '../layout/gantt-layout.service';
import { GanttScrollService } from '../scroll/gantt-scroll.service';
import { GanttSelectionService } from '../selection/gantt-selection.service';

/** Keys that alone don't make focus "visible" (pressing them with a pointer is common). */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn']);

const NO_SHAPES: readonly OverlayShape[] = [];
const NONE: ReadonlySet<string> = new Set();

/**
 * The link session as the bar overlay shows it (the Web Component's `overlayLink`): its source
 * connector, the preview's target connector and whether that target is valid.
 */
export function overlayLink(state: GanttLinkState | null): BarOverlayLink | null {
  if (!state) return null;
  const p = state.preview;
  return {
    sourceId: state.sourceId,
    sourceSide: state.side,
    targetId: p?.targetId ?? null,
    targetSide: p?.targetSide ?? null,
    valid: p?.valid ?? false,
  };
}

const sameShapes = (a: readonly OverlayShape[], b: readonly OverlayShape[]): boolean =>
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
   * The bar overlay's shapes (core `computeBarOverlay`) for the mounted rows: the focus ring of the
   * keyboard-focused bar, the grips, progress grip and link connectors of that bar, of the hovered
   * one, (coarse pointers) of the selected ones, of the bar whose progress is dragged and of a link
   * session's ends. Compared by value: a hover that changes nothing repaints nothing.
   */
  readonly overlay = computed<readonly OverlayShape[]>(
    () => {
      const visualOf = this.visualSource()?.();
      const state = this.overlayState();
      if (
        !visualOf ||
        (state.focusVisibleId === null &&
          state.hoveredId === null &&
          state.selected.size === 0 &&
          state.link === null &&
          state.progressPreview === null)
      )
        return NO_SHAPES;
      return computeBarOverlay({
        ...state,
        rows: this.layout.mountedGeometries().map(geo => ({ id: geo.row.task.id, visual: visualOf(geo) })),
      });
    },
    { equal: sameShapes },
  );

  /** Attach `g.gantt-bar-overlay`: it holds a shape */
  readonly shown = computed(() => this.overlay().length > 0);

  /** The chart's bar visual of a geometry (memoised per geometry by GantryComponent); bound once. */
  bindVisuals(visuals: () => (geo: RowGeometry) => BarVisual): void {
    this.visualSource.set(visuals);
  }

  /**
   * What `computeBarOverlay` reads besides the rows (the Web Component's `overlayState`): the
   * keyboard-focused and the hovered bar, the selection (coarse pointers only), the pointer kind,
   * the link session and the progress being dragged. Tracked where it is read.
   */
  private overlayState(): Omit<BarOverlayInput, 'rows'> {
    const coarse = this.coarse();
    return {
      focusVisibleId: this.layout.focusVisibleBarId(),
      hoveredId: this.layout.hoveredBarId(),
      selected: coarse ? this.selection.selectedIds() : NONE,
      coarse,
      link: overlayLink(this.layout.link()),
      progressPreview: this.layout.progressPreview(),
    };
  }

  /**
   * The pointer targets of the bar `taskId` (visual `v`) as they show (D11): its resize handles and
   * body always; its progress grip and link connectors only while the overlay draws them (core
   * `computeBarOverlay` of that one row, from the state the overlay is painted from, read
   * untracked). Without editing the visual has neither. The canvas hit-tests this.
   */
  hitTargets(taskId: string, v: BarVisual): BarHitTarget {
    if (!v.progressGrip && !v.connectors) return v;
    const shapes = untracked(() => computeBarOverlay({ ...this.overlayState(), rows: [{ id: taskId, visual: v }] }));
    const shows = (cls: string): boolean => shapes.some(shape => shape.className.startsWith(cls));
    return {
      handles: v.handles,
      hitBox: v.hitBox,
      progressGrip: shows('gantt-progress-grip') ? v.progressGrip : null,
      connectors: shows('gantt-link-connector') ? v.connectors : null,
    };
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
   * Focus will be moved by a script that wants its ring shown (`focusTask()`, maybe from a button
   * a pointer pressed): the modality becomes the keyboard's, and a bar `activeId` names that
   * already has focus shows its ring now (the Web Component's `focus.keyboard`).
   */
  showFocus(activeId: string | null): void {
    this.keyboard = true;
    if (activeId !== null) this.layout.focusVisibleBarId.set(activeId);
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

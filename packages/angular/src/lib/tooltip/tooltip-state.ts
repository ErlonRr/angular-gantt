// ─────────────────────────────────────────────────────────────
//  gantry · tooltip/tooltip-state.ts
//
//  State of the task tooltip, one per chart (provided by the canvas).
//  The canvas' delegated pointer handlers drive it the way the Web
//  Component's `interaction/canvas-pointer.ts` drives its
//  `layers/tooltip.ts`, with the same timers:
//
//    enter(row) on a bar  ── TOOLTIP_SHOW_DELAY ──►  open (row)
//      (the delay restarts while the pointer moves to another bar)
//    leave()              ── TOOLTIP_HIDE_DELAY ──►  closed
//    hide()               ─────────────────────────► closed now (drag start)
//
//  The tooltip closes whenever it stops being allowed: `tooltipEnabled`
//  changes, or a drag / resize starts (a linkedSignal over both). The
//  tooltip component paints `row` and follows `pointer`; it is created
//  on the first hover (`requested`), so a chart nobody hovers — and a
//  server render — has no popover.
// ─────────────────────────────────────────────────────────────

import { DestroyRef, Injectable, computed, inject, linkedSignal, signal, type Signal } from '@angular/core';
import { TOOLTIP_HIDE_DELAY, TOOLTIP_SHOW_DELAY, type GanttFlatRow } from '@gantry/core';

import { GanttDragService } from '../drag/gantt-drag.service';

/** Pointer position in viewport (client) pixels */
export interface TooltipPointer {
  readonly x: number;
  readonly y: number;
}

const samePointer = (a: TooltipPointer, b: TooltipPointer): boolean => a.x === b.x && a.y === b.y;

@Injectable()
export class GanttTooltipState {
  private readonly drag = inject(GanttDragService);
  private readonly enabledSource = signal<() => boolean>(() => true);

  /** Tooltips may open: `tooltipEnabled` and no drag / resize in progress */
  private readonly allowed = computed(() => this.enabledSource()() && !this.drag.isActive());

  /** The row whose tooltip is open (`null`: closed); closes whenever `allowed` changes */
  private readonly openRow = linkedSignal<boolean, GanttFlatRow | null>({
    source: this.allowed,
    computation: () => null,
  });

  /** The row whose tooltip is open, `null` while closed */
  readonly row: Signal<GanttFlatRow | null> = this.openRow.asReadonly();
  /** Whether the tooltip is open */
  readonly open = computed(() => this.openRow() !== null);
  /** Pointer position while open (client px): the popover follows it */
  private readonly pointerPos = signal<TooltipPointer>({ x: 0, y: 0 }, { equal: samePointer });
  readonly pointer: Signal<TooltipPointer> = this.pointerPos.asReadonly();
  /** A bar was hovered at least once: the popover exists from then on */
  private readonly requestedFlag = signal(false);
  readonly requested: Signal<boolean> = this.requestedFlag.asReadonly();

  /** The row under the pointer (pending or open), like the Web Component layer's `row` */
  private current: GanttFlatRow | null = null;
  private lastX = 0;
  private lastY = 0;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.hide();
      this.destroyed = true;
    });
  }

  /** The chart's `tooltipEnabled` (bound once by the canvas) */
  bindEnabled(enabled: () => boolean): void {
    this.enabledSource.set(enabled);
  }

  /** The pointer is over `row`'s bar: opens its tooltip after the hover delay. */
  enter(row: GanttFlatRow, x: number, y: number): void {
    if (this.destroyed) return;
    this.lastX = x;
    this.lastY = y;
    this.requestedFlag.set(true);
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
    if (this.open() && this.current?.task.id === row.task.id) return;
    // Hover intent: the delay restarts while the pointer moves on before the tooltip opens
    this.current = row;
    clearTimeout(this.showTimer);
    this.showTimer = setTimeout(this.show, TOOLTIP_SHOW_DELAY);
  }

  /** The pointer moved: the open tooltip follows it. */
  move(x: number, y: number): void {
    this.lastX = x;
    this.lastY = y;
    if (this.open()) this.pointerPos.set({ x, y });
  }

  /** The pointer left the bars: closes after the hide delay (the first deadline holds). */
  leave(): void {
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
    if (!this.open()) {
      this.current = null;
      return;
    }
    this.hideTimer ??= setTimeout(this.hide, TOOLTIP_HIDE_DELAY);
  }

  /** Closes now and clears both timers (drag start, destroy). */
  readonly hide = (): void => {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.showTimer = undefined;
    this.hideTimer = undefined;
    this.current = null;
    if (this.openRow() !== null) this.openRow.set(null);
  };

  private readonly show = (): void => {
    this.showTimer = undefined;
    const row = this.current;
    if (!row || this.destroyed) return;
    if (!this.allowed()) {
      this.current = null;
      return;
    }
    this.pointerPos.set({ x: this.lastX, y: this.lastY });
    this.openRow.set(row);
  };
}

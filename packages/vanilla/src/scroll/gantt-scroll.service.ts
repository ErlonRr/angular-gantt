/**
 * @file gantt-scroll.service.ts
 * Vanilla JS scroll synchronization between the task-list panel and the timeline.
 *
 * The timeline viewport scrolls in both axes (its header is sticky); the panel
 * scrolls vertically only. Vertical scroll is mirrored in both directions so
 * wheel/touch scrolling works over either pane.
 */

import { dateToPixel, snapToDay } from '@gantry/core';

export class GanttScrollService {
  private panelEl?: HTMLElement;
  private canvasEl?: HTMLElement;

  /** Called (at most once per frame) after any scroll of either pane. */
  onScroll?: () => void;
  private frame = 0;

  bindViewports(panel: HTMLElement, canvas: HTMLElement): void {
    this.panelEl = panel;
    this.canvasEl = canvas;

    canvas.addEventListener('scroll', () => this.sync('canvas'), { passive: true });
    panel.addEventListener('scroll', () => this.sync('panel'), { passive: true });
  }

  private sync(source: 'panel' | 'canvas'): void {
    const [from, to] = source === 'canvas'
      ? [this.canvasEl!, this.panelEl!]
      : [this.panelEl!, this.canvasEl!];
    // The mirrored pane fires its own scroll event; equal offsets end the loop.
    if (to.scrollTop !== from.scrollTop) to.scrollTop = from.scrollTop;

    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.onScroll?.();
      });
    }
  }

  get scrollTop(): number {
    return this.canvasEl?.scrollTop ?? 0;
  }

  get viewportHeight(): number {
    return this.canvasEl?.clientHeight ?? 0;
  }

  /** Centre `date` horizontally in the timeline viewport. */
  scrollToDate(date: Date, origin: Date, pxPerDay: number, behavior: ScrollBehavior = 'smooth'): void {
    if (!this.canvasEl) return;
    const x = dateToPixel(date, origin, pxPerDay);
    const left = Math.max(0, x - this.canvasEl.clientWidth / 2);
    scrollTo(this.canvasEl, { left, behavior });
  }

  scrollToToday(origin: Date, pxPerDay: number, behavior: ScrollBehavior = 'smooth'): void {
    this.scrollToDate(snapToDay(new Date()), origin, pxPerDay, behavior);
  }

  /** Scroll vertically so the row at `rowIndex` is visible. */
  scrollToRow(rowIndex: number, rowHeight: number, behavior: ScrollBehavior = 'smooth'): void {
    if (!this.canvasEl) return;
    scrollTo(this.canvasEl, { top: rowIndex * rowHeight, behavior });
  }

  destroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}

// `scrollTo` is missing on some non-browser DOMs (jsdom); fall back to assignment.
function scrollTo(el: HTMLElement, opts: ScrollToOptions): void {
  if (typeof el.scrollTo === 'function') el.scrollTo(opts);
  else {
    if (opts.left != null) el.scrollLeft = opts.left;
    if (opts.top != null) el.scrollTop = opts.top;
  }
}

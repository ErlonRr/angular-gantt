/**
 * @file gantt-scroll.service.ts
 * Vanilla JS scroll synchronization engine across panel, header, and timeline canvas.
 */

import { EventEmitter } from '../core/event-emitter';

export class GanttScrollService {
  private panelBodyEl?: HTMLElement;
  private canvasHeaderViewportEl?: HTMLElement;
  private canvasBodyViewportEl?: HTMLElement;

  readonly scrollX$ = new EventEmitter<number>();
  readonly scrollY$ = new EventEmitter<number>();

  private isSyncing = false;

  bindViewports(
    panelBody: HTMLElement,
    canvasHeaderViewport: HTMLElement,
    canvasBodyViewport: HTMLElement
  ): void {
    this.panelBodyEl = panelBody;
    this.canvasHeaderViewportEl = canvasHeaderViewport;
    this.canvasBodyViewportEl = canvasBodyViewport;

    this.canvasBodyViewportEl.addEventListener('scroll', () => {
      if (this.isSyncing) return;
      this.isSyncing = true;
      requestAnimationFrame(() => {
        if (this.canvasBodyViewportEl && this.canvasHeaderViewportEl && this.panelBodyEl) {
          const scrollLeft = this.canvasBodyViewportEl.scrollLeft;
          const scrollTop = this.canvasBodyViewportEl.scrollTop;

          this.canvasHeaderViewportEl.scrollLeft = scrollLeft;
          this.panelBodyEl.scrollTop = scrollTop;

          this.scrollX$.emit(scrollLeft);
          this.scrollY$.emit(scrollTop);
        }
        this.isSyncing = false;
      });
    }, { passive: true });
  }

  scrollToDate(targetX: number): void {
    if (this.canvasBodyViewportEl) {
      this.canvasBodyViewportEl.scrollTo({ left: targetX, behavior: 'smooth' });
    }
  }

  scrollToRow(targetY: number): void {
    if (this.canvasBodyViewportEl) {
      this.canvasBodyViewportEl.scrollTo({ top: targetY, behavior: 'smooth' });
    }
  }
}

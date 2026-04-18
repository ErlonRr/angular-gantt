// ─────────────────────────────────────────────────────────────
//  ngx-gantt · selection/gantt-keyboard.directive.ts
//
//  Attaches keyboard shortcuts to the gantt host element.
//  Applied as a host directive on NgxGanttComponent.
//
//  Shortcuts:
//    Escape      → clear selection
//    Ctrl/Cmd+A  → select all visible rows
//    +  / =      → zoom in
//    -           → zoom out
//    T           → scroll to today
// ─────────────────────────────────────────────────────────────

import {
  Directive,
  HostListener,
  inject,
  input,
} from '@angular/core';

import { GanttSelectionService } from './gantt-selection.service';
import { GanttLayoutService }    from '../layout/gantt-layout.service';
import { GanttScrollService }    from '../scroll/gantt-scroll.service';
import { GanttFlatRow }          from '../types';

@Directive({
  selector:   '[ganttKeyboard]',
  standalone:  true,
})
export class GanttKeyboardDirective {

  /** Visible rows — needed for Ctrl+A range */
  readonly visibleRows = input<GanttFlatRow[]>([]);

  private readonly selection = inject(GanttSelectionService);
  private readonly layout    = inject(GanttLayoutService);
  private readonly scroll    = inject(GanttScrollService);

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const ctrl = event.ctrlKey || event.metaKey;

    switch (event.key) {
      case 'Escape':
        this.selection.clear();
        event.preventDefault();
        break;

      case 'a':
      case 'A':
        if (ctrl) {
          this.selection.selectAll(this.visibleRows());
          event.preventDefault();
        }
        break;

      case '+':
      case '=':
        if (!ctrl) {
          this.layout.zoomIn();
          event.preventDefault();
        }
        break;

      case '-':
        if (!ctrl) {
          this.layout.zoomOut();
          event.preventDefault();
        }
        break;

      case 't':
      case 'T':
        if (!ctrl) {
          this.scroll.scrollToToday(
            this.layout.startDate(),
            this.layout.pxPerDay(),
          );
          event.preventDefault();
        }
        break;
    }
  }
}

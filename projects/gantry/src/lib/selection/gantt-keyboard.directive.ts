// ─────────────────────────────────────────────────────────────
//  gantry · selection/gantt-keyboard.directive.ts
//
//  Attaches keyboard shortcuts to the gantt host element.
//  Applied as a host directive on GantryComponent; mirrors the
//  Web Component's `onKeyDown`.
//
//  Shortcuts:
//    Escape      → cancel a drag, else clear selection
//    Ctrl/Cmd+A  → select all visible rows (when selection + multiSelect are on)
//    +  / =      → zoom in
//    -           → zoom out
//    T           → scroll to today
//
//  Keys typed into inputs, selects, text areas, contenteditable
//  cells and the splitter are left alone.
// ─────────────────────────────────────────────────────────────

import { Directive, inject, input } from '@angular/core';

import { GanttSelectionService } from './gantt-selection.service';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttScrollService } from '../scroll/gantt-scroll.service';
import { GanttDragService } from '../drag/gantt-drag.service';
import { type GanttFlatRow } from '../types';

@Directive({
  selector: '[ganttKeyboard]',
  standalone: true,
  host: { '(keydown)': 'onKeyDown($event)' },
})
export class GanttKeyboardDirective {
  /** @deprecated Ignored — the visible rows come from the layout service. */
  readonly visibleRows = input<GanttFlatRow[]>([]);

  private readonly selection = inject(GanttSelectionService);
  private readonly layout = inject(GanttLayoutService);
  private readonly scroll = inject(GanttScrollService);
  private readonly drag = inject(GanttDragService);

  onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || isTextEntry(event)) return;
    const ctrl = event.ctrlKey || event.metaKey;

    switch (event.key) {
      case 'Escape':
        if (this.drag.isActive()) this.drag.cancel();
        else this.selection.clear();
        event.preventDefault();
        break;

      case 'a':
      case 'A':
        if (ctrl) {
          const { enabled, multi } = this.layout.cfg().selection;
          if (enabled && multi) this.selection.selectAll(this.layout.visibleRows());
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
          const x = this.layout.timeline().toX(new Date());
          this.scroll.scrollToX(x - this.scroll.viewportWidth / 2);
          event.preventDefault();
        }
        break;
    }
  }
}

/** The key belongs to a form control, an editable cell or the splitter. */
function isTextEntry(event: KeyboardEvent): boolean {
  const origin = event.composedPath()[0];
  if (!(origin instanceof HTMLElement)) return false;
  return (
    /^(INPUT|TEXTAREA|SELECT)$/.test(origin.tagName) ||
    origin.isContentEditable ||
    origin.closest('.gantry-splitter') !== null
  );
}

// ─────────────────────────────────────────────────────────────
//  gantry · selection/gantt-keyboard.directive.ts
//
//  Attaches keyboard shortcuts to the gantt host element.
//  Applied as a host directive on GantryComponent; mirrors the
//  Web Component's `onKeyDown`.
//
//  Keys resolve through the @gantry/core keymap (`resolveKey`).
//  Handled commands:
//    Escape          → cancel a drag, else clear selection
//    Ctrl/Cmd(+Shift)+A → select all visible rows (when selection + multiSelect are on)
//    +  / =          → zoom in
//    -               → zoom out
//    T               → scroll to today
//  Alt / AltGr disable the shortcuts (except Escape); other commands
//  (fit, undo, redo, …) are not handled yet and keep their default action.
//
//  Keys typed into inputs, selects, text areas, contenteditable
//  cells and the splitter are left alone.
// ─────────────────────────────────────────────────────────────

import { Directive, inject, input } from '@angular/core';
import { resolveKey } from '@gantry/core';

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

    // Shared key → command table (@gantry/core); only the commands handled here swallow the key
    switch (resolveKey(event, 'any', { active: this.drag.isActive() })) {
      case 'cancel':
        this.drag.cancel();
        break;
      case 'clearSelection':
        this.selection.clear();
        break;
      case 'selectAll':
        this.selection.selectAll(this.layout.visibleRows(), this.layout.cfg().selection);
        break;
      case 'zoomIn':
        this.layout.zoomIn();
        break;
      case 'zoomOut':
        this.layout.zoomOut();
        break;
      case 'today': {
        const x = this.layout.timeline().toX(new Date());
        this.scroll.scrollToX(x - this.scroll.viewportWidth / 2);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
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

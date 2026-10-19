// ─────────────────────────────────────────────────────────────
//  gantry · editing/progress.ts
//
//  Dragging a bar's progress grip (D11 of Gantry 2 phase 11), the Web
//  Component's `interaction/progress.ts`. The canvas starts it when a
//  press on a bar's progress grip (`BarVisual.progressGrip.hit`, hit only
//  while the bar overlay shows the grip) becomes a drag, feeds it the
//  pointer's content x and drops or cancels it with the press.
//
//  - `start()` opens a core `ProgressSession(task, bar, { step:
//    editing.progress.step })` on a bar whose `editRules(row).progress`
//    holds and that has a grip. The session reads the pointer relative to
//    the press: `x - pressX + progressGrip.x`, so the first move does not
//    jump (at 0 % or 100 % the grip's target sits up to 36 px beside the
//    progress edge). The visual is the one without a preview (bound by the
//    canvas: `bindVisual`).
//  - Meanwhile `layout.progressPreview` holds `{ taskId, progress }`
//    (written from the start, so the bar keeps its grip shown while the
//    pointer leaves it): the bar draws that progress (the chart's bar
//    visuals), the bar overlay keeps that bar's shapes, the readout chip
//    shows it (while `active()`).
//  - `drop()` clears the preview, then commits `progressChange(event,
//    editor.rawTask(id), 'progress')` through the chart's editor (one undo
//    step; coalesce key `progress:<id>`) when the progress changed; the
//    pipeline emits `taskProgressChanged` and announces it. `cancel()`
//    clears it without a change (Escape during the press,
//    `pointercancel`, the chart destroyed).
// ─────────────────────────────────────────────────────────────

import { Injectable, inject, signal, untracked } from '@angular/core';
import { ProgressSession, progressChange, type BarVisual, type RowGeometry } from '@gantryjs/core';

import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttEditorService } from './gantt-editor.service';

/** The open drag: the session and the offset from the pointer to the grip's progress edge */
interface ProgressDragState {
  readonly session: ProgressSession;
  readonly offset: number;
}

@Injectable()
export class GanttProgressService {
  private readonly layout = inject(GanttLayoutService);
  private readonly editor = inject(GanttEditorService);

  /** The bar visuals without a progress preview (bound once by the canvas) */
  private visualOf: (() => (geo: RowGeometry) => BarVisual) | null = null;

  /** The drag in progress (a signal: the readout chip reads `active()` in a computed) */
  private readonly current = signal<ProgressDragState | null>(null);

  /** The bar visuals a drag starts from, without a progress preview; bound once by the canvas. */
  bindVisual(visuals: () => (geo: RowGeometry) => BarVisual): void {
    this.visualOf = visuals;
  }

  /** A progress drag is in progress. */
  active(): boolean {
    return this.current() !== null;
  }

  /** Starts dragging `geo`'s progress grip from content x `x` (where the press started). */
  start(geo: RowGeometry, x: number): void {
    untracked(() => {
      if (this.current() || !this.visualOf) return;
      const progress = this.layout.cfg().editing.progress;
      if (!progress || !this.layout.editRules()(geo.row).progress) return;
      const v = this.visualOf()(geo);
      const grip = v.progressGrip;
      if (!grip) return;
      // The session first, then the preview (the readout reads `active()` with the preview)
      this.current.set({
        session: new ProgressSession(geo.row.task, { x: v.x, width: v.width }, { step: progress.step }),
        offset: grip.x - x,
      });
      this.show(x);
    });
  }

  /** The pointer is at content x `x`: the preview follows, snapped. */
  move(x: number): void {
    this.show(x);
  }

  /** Released at content x `x`: commits the new progress through the editor when it changed. */
  drop(x: number): void {
    const drag = untracked(this.current);
    if (!drag) return;
    const event = drag.session.finish(x + drag.offset);
    this.end();
    const task = event && this.editor.rawTask(event.taskId);
    if (event && task) this.editor.commit(progressChange(event, task, 'progress'));
  }

  /** Ends the drag without a change. */
  cancel(): void {
    this.end();
  }

  private show(x: number): void {
    const drag = untracked(this.current);
    if (!drag) return;
    const { taskId, progress } = drag.session.preview(x + drag.offset);
    const prev = untracked(this.layout.progressPreview);
    if (prev?.taskId !== taskId || prev.progress !== progress) this.layout.progressPreview.set({ taskId, progress });
  }

  private end(): void {
    this.current.set(null);
    this.layout.progressPreview.set(null);
  }
}

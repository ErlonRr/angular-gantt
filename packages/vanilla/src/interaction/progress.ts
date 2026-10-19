/**
 * @file progress.ts
 * The progress-grip drag (Gantry 2 phase 11, D11), through core `ProgressSession` (Angular:
 * `editing/progress.ts`). `interaction/canvas-pointer.ts` starts it when a press on a bar's
 * progress grip (`BarVisual.progressGrip.hit`, hit only while the bar overlay shows the grip)
 * becomes a drag, feeds it the pointer's content x and drops or cancels it with the press.
 *
 * - `start()` opens a `ProgressSession(task, bar, { step: editing.progress.step })` on a bar whose
 *   `editRules(row).progress` holds and that has a grip. The session reads the pointer **relative
 *   to the press**: `x - pressX + progressGrip.x`, so the first move does not jump (at 0 % or
 *   100 % the grip's target sits up to 36 px beside the progress edge). The visual is the one
 *   without a preview (`graph.barVisualBase`).
 * - Meanwhile `inputs.progressPreview` holds `{ taskId, progress }` (from the start, so the bar
 *   keeps its grip shown while the pointer leaves it): the bar draws that progress
 *   (`graph.barVisual`), the bar overlay keeps that bar's shapes, the readout chip shows it
 *   (`layers/readout.ts`, while `active()`).
 * - `drop()` commits `progressChange(event, edit.rawTask(id), 'progress')` through `ctx.edit.commit`
 *   (one undo step; coalesce key `progress:<id>`) when the progress changed, after clearing the
 *   preview; the pipeline emits `task-progress-changed` and announces it. `cancel()` clears it
 *   without a change (Escape during the press, `pointercancel`, a disconnect).
 */

import { ProgressSession, progressChange, type RowGeometry } from '@gantryjs/core';
import type { LayerContext } from '../layers/context';

/** The progress-grip drag (`ctx.progress`). Content coordinates: timeline px. */
export interface ProgressDrag {
  /** A progress drag is on */
  active(): boolean;
  /** Starts dragging `geo`'s progress grip from content x `x` (where the press started). */
  start(geo: RowGeometry, x: number): void;
  /** The pointer is at content x `x`: the preview follows. */
  move(x: number): void;
  /** Released at content x `x`: commits the new progress when it changed. */
  drop(x: number): void;
  /** Ends the drag without a change. */
  cancel(): void;
}

export function createProgressDrag(ctx: LayerContext): ProgressDrag {
  const { inputs: I, graph: G } = ctx;
  /** The session and the offset from the pointer to the grip's progress edge */
  let current: { session: ProgressSession; offset: number } | null = null;

  const show = (x: number): void => {
    if (!current) return;
    const { taskId, progress } = current.session.preview(x + current.offset);
    I.progressPreview.set({ taskId, progress });
  };
  const end = (): void => {
    current = null;
    I.progressPreview.set(null);
  };

  return {
    active: () => current !== null,
    start(geo, x) {
      if (current) return;
      const step = G.config.peek().editing.progress;
      if (!step || !G.editRules.peek()(geo.row).progress) return;
      const v = G.barVisualBase.peek()(geo);
      const grip = v.progressGrip;
      if (!grip) return;
      current = {
        session: new ProgressSession(geo.row.task, { x: v.x, width: v.width }, { step: step.step }),
        offset: grip.x - x,
      };
      show(x);
    },
    move(x) {
      show(x);
    },
    drop(x) {
      const drag = current;
      if (!drag) return;
      const event = drag.session.finish(x + drag.offset);
      end();
      const task = event && ctx.edit.rawTask(event.taskId);
      if (event && task) ctx.edit.commit(progressChange(event, task, 'progress'));
    },
    cancel() {
      end();
    },
  };
}

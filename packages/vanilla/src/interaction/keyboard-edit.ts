/**
 * @file keyboard-edit.ts
 * Move mode: moving, resizing and changing the progress of a bar with the keyboard (Enter / F2 on
 * a bar the row's `editRules` let move, resize or change the progress), through core
 * `KeyboardEditSession` — the same snapping, minimum length and change as a pointer drag.
 *
 *   ←/→           move one unit (a day, or an hour on hour scales) earlier / later
 *   Shift+←/→     resize the end        (task bars, with `enableResize`)
 *   Alt+←/→       resize the start
 *   ↑/↓           progress ± `editing.progress.step` (`editRules(row).progress`)
 *   Enter / F2    commit: one change through the pipeline (`keyboardEditChange`, coalesce key
 *                 `kbd:<id>`): `before-change`, the history, `task-dragged` / `task-resized` /
 *                 `task-progress-changed`, `tasks-change`; announced by the pipeline
 *   Esc, Tab, blur, a pointer press   cancel (announced)
 *
 * The date preview goes to the engine's `dragPreview` input, so the pointer drag's ghost, its
 * pinned row and the dimmed source bar show it (and the readout chip); each date step reads the
 * new dates out (core `formatDragReadout`, debounced). A progress step writes `progressPreview`
 * (the bar draws the new progress) and reads it out (`announceProgress`). While move mode is on,
 * other plain keys do nothing. A change of the timeline (zoom, new range) or of the task under
 * edit cancels it at the next key.
 */

import {
  KeyboardEditSession,
  editTiming,
  formatDragReadout,
  isEmptyChange,
  keyboardEditChange,
  keyboardEditOptionsFor,
  keyboardEditStartText,
  taskChange,
  type DragPreview,
  type GanttChange,
  type GanttFlatRow,
  type GanttTask,
  type TimelineModel,
} from '@gantryjs/core';
import type { LayerContext } from '../layers/context';

export interface KeyboardEdit {
  /** Move mode is on */
  active(): boolean;
  /** Task id of the bar in move mode, `null` when it is off */
  taskId(): string | null;
  /**
   * Starts move mode on `row`'s bar; `false` when its `editRules` allow no move, resize or
   * progress change (drag off, `draggable: false`, `editable: false`, …) or a pointer drag is on.
   */
  start(row: GanttFlatRow): boolean;
  /** A key while move mode is on (prevents the default action of what it uses). */
  key(event: KeyboardEvent): void;
  /** Ends move mode without changing the task; announced unless `quiet`. */
  cancel(quiet?: boolean): void;
}

/** What the edit started from: a change of either cancels it. */
interface Origin {
  readonly session: KeyboardEditSession;
  /** The row's task (a rolled-up parent's copy, or the normalised task) */
  readonly task: GanttTask;
  readonly timeline: TimelineModel;
  readonly milestone: boolean;
  /** The progress shown now (the session's) */
  progress: number;
}

export function createKeyboardEdit(ctx: LayerContext): KeyboardEdit {
  const { inputs: I, graph: G, drag } = ctx;
  let edit: Origin | null = null;

  const labels = () => G.i18n.peek().labels;
  const finish = (): void => {
    edit = null;
    I.dragPreview.set(null);
    I.progressPreview.set(null);
  };

  const cancel = (quiet = false): void => {
    if (!edit) return;
    const { session, task } = edit;
    session.cancel();
    finish();
    if (!quiet) ctx.announce.say(labels().announceEditCancel(task.name));
  };

  /**
   * The session's change, built from the raw task (undo restores the app's values). The fields come
   * from the row's task the session edited, so a rolled-up value is never written back.
   */
  const changeOf = (session: KeyboardEditSession, task: GanttTask): GanttChange | null => {
    const proposed = keyboardEditChange(session, task);
    const raw = ctx.edit.rawTask(task.id);
    if (!proposed || !raw || raw === task) return proposed;
    const change = taskChange(raw, proposed.updates[0]?.after ?? {}, 'keyboard', {
      coalesceKey: proposed.coalesceKey,
      dates: G.config.peek(),
    });
    return isEmptyChange(change) ? null : change;
  };

  /** Enter / F2: the change through the pipeline (it announces the result, a rejection or a veto). */
  const commit = (): void => {
    if (!edit) return;
    const { session, task } = edit;
    finish();
    const change = changeOf(session, task);
    if (change) ctx.edit.commit(change);
    else ctx.announce.say(labels().announceEditNoChange(task.name));
  };

  /** The new dates of a step, read out (the readout chip's text). */
  const readout = (preview: DragPreview, milestone: boolean): string => {
    const i18n = G.i18n.peek();
    return formatDragReadout(preview, {
      labels: i18n.labels,
      locale: i18n.locale,
      dates: G.config.peek(),
      unit: preview.unit,
      milestone,
    });
  };

  return {
    active: () => edit !== null,
    taskId: () => edit?.session.taskId ?? null,
    start(row) {
      const task = row.task;
      if (edit || drag.state.peek().kind !== 'idle') return false;
      const geo = G.geoById.peek().get(task.id);
      if (!geo) return false;
      const cfg = G.config.peek();
      const options = keyboardEditOptionsFor(G.editRules.peek()(geo.row), cfg.editing);
      if (!options) return false;
      const timeline = G.timeline.peek();
      const visual = G.barVisual.peek()(geo);
      const session = new KeyboardEditSession(task, geo, editTiming(timeline, cfg), options);
      edit = { session, task, timeline, milestone: visual.kind === 'milestone', progress: session.state.progress };
      I.dragPreview.set(session.preview());
      ctx.announce.say(keyboardEditStartText(task.name, options.progressEditable === true, labels()));
      return true;
    },
    key(event) {
      if (!edit) return;
      // Tab leaves the bar (blur would cancel too): the focus move goes on
      if (event.key === 'Tab') {
        cancel();
        return;
      }
      const { session, task, timeline, milestone } = edit;
      if (G.timeline.peek() !== timeline || G.geoById.peek().get(task.id)?.row.task !== task) {
        cancel();
        event.preventDefault();
        return;
      }
      const result = session.handleKey(event);
      if (result === null) {
        // Move mode is modal: plain keys do nothing (browser shortcuts with a modifier stay)
        if (!event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault();
        return;
      }
      event.preventDefault();
      if (result.type === 'commit') commit();
      else if (result.type === 'cancel') {
        finish();
        ctx.announce.say(labels().announceEditCancel(task.name));
      } else if (result.changed) {
        const { progress } = result.preview;
        if (progress !== edit.progress) {
          // ↑/↓: the bar draws the new progress (none while back at the task's own)
          edit.progress = progress;
          I.progressPreview.set(progress === (task.progress ?? 0) ? null : { taskId: task.id, progress });
          ctx.announce.say(labels().announceProgress(task.name, progress));
        } else {
          I.dragPreview.set(result.preview);
          ctx.announce.say(readout(result.preview, milestone));
        }
      }
    },
    cancel,
  };
}

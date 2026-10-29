// ─────────────────────────────────────────────────────────────
//  gantry · drag/keyboard-edit.ts
//
//  Move mode: moving and resizing a bar, and changing its progress, with
//  the keyboard (Enter / F2 on a bar the edit rules let change), the Web
//  Component's `interaction/keyboard-edit.ts`, through core
//  `KeyboardEditSession` — the same snapping, minimum length and event
//  shapes as a pointer drag (`DragSession`).
//
//    ←/→           move one unit (a day, or an hour on hour scales) earlier / later
//    Shift+←/→     resize the end        (task bars, with `enableResize`)
//    Alt+←/→       resize the start
//    ↑/↓           progress ± `editing.progress.step` (with `editing.progress`)
//    Enter / F2    commit: one change through the chart's editor (core
//                  `keyboardEditChange`, coalesce key `kbd:<id>`), so the
//                  events, the history and the announcement are a drop's
//    Esc, Tab, blur, a pointer press   cancel (announced)
//
//  What a bar allows is core `editRules` (`layout.editRules`, D9) through
//  `keyboardEditOptionsFor`: a bar that allows nothing does not start move
//  mode. The preview goes through the drag service's external-preview
//  hooks (`startExternal` / `setExternalPreview` / `endExternal`), so the
//  pointer drag's ghost, its pinned row, the dimmed source bar, the
//  readout chip and the closed tooltip show it. Each date step reads the
//  new dates out (core `formatDragReadout`, debounced); each progress step
//  reads the new progress out and the bar draws it (`layout.progressPreview`,
//  none while back at the task's own). While move mode is on, other plain
//  keys do nothing. A
//  change of the timeline (zoom, new range) or of the task under edit
//  cancels it at the next key.
// ─────────────────────────────────────────────────────────────

import { inject } from '@angular/core';
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

import { type GanttKeyContext } from '../a11y/grid-keys';
import { GanttEditorService } from '../editing/gantt-editor.service';

export interface KeyboardEdit {
  /** Move mode is on */
  active(): boolean;
  /** Task id of the bar in move mode, `null` when it is off */
  taskId(): string | null;
  /** Starts move mode on `row`'s bar; `false` when its edit rules allow nothing there, or during a pointer drag. */
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
  /** The progress shown after the last step (a step that changed it reads the progress out) */
  progress: number;
}

/**
 * Move mode for the chart of `ctx`. Call it in the chart's injection context (the keyboard
 * directive's `bind`, from GantryComponent's constructor): commits go through its
 * `GanttEditorService`.
 */
export function createKeyboardEdit(ctx: GanttKeyContext): KeyboardEdit {
  const { layout, drag, announcer, i18n, chart } = ctx;
  const editor = inject(GanttEditorService);
  let edit: Origin | null = null;

  const finish = (): void => {
    edit = null;
    drag.endExternal();
    layout.progressPreview.set(null);
  };

  const cancel = (quiet = false): void => {
    if (!edit) return;
    const { session, task } = edit;
    session.cancel();
    finish();
    if (!quiet) announcer.announce(i18n.labels().announceEditCancel(task.name));
  };

  /**
   * The session's change, built from the raw task (undo restores the app's values). The fields come
   * from the row's task the session edited, so a rolled-up value is never written back.
   */
  const changeOf = (session: KeyboardEditSession, task: GanttTask): GanttChange | null => {
    const proposed = keyboardEditChange(session, task);
    const raw = editor.rawTask(task.id);
    if (!proposed || !raw || raw === task) return proposed;
    const change = taskChange(raw, proposed.updates[0]?.after ?? {}, 'keyboard', {
      coalesceKey: proposed.coalesceKey,
      // The chart's date reading (as the Web Component): a working move stays one `move` op
      dates: layout.cfg(),
    });
    return isEmptyChange(change) ? null : change;
  };

  /** Enter / F2: the change through the editor (it emits, records and announces it); nothing changed: said so. */
  const commit = (): void => {
    if (!edit) return;
    const { session, task } = edit;
    finish();
    const change = changeOf(session, task);
    if (change) editor.commit(change);
    else announcer.announce(i18n.labels().announceEditNoChange(task.name));
  };

  /** The new dates of a step, read out (the readout chip's text). */
  const readout = (preview: DragPreview, milestone: boolean): string =>
    formatDragReadout(preview, {
      labels: i18n.labels(),
      locale: i18n.locale(),
      dates: layout.cfg(),
      unit: preview.unit,
      milestone,
    });

  return {
    active: () => edit !== null,
    taskId: () => edit?.session.taskId ?? null,
    start(row) {
      const task = row.task;
      if (edit || drag.isActive()) return false;
      const geo = layout.geometryById().get(task.id);
      if (!geo) return false;
      const cfg = layout.cfg();
      const options = keyboardEditOptionsFor(layout.editRules()(geo.row), cfg.editing);
      if (!options) return false;
      const timeline = layout.timeline();
      const visual = chart.barVisual(geo);
      const session = new KeyboardEditSession(task, geo, editTiming(timeline, cfg), options);
      if (!drag.startExternal(task.id)) return false;
      edit = { session, task, timeline, milestone: visual.kind === 'milestone', progress: session.state.progress };
      drag.setExternalPreview(session.preview());
      announcer.announce(keyboardEditStartText(task.name, options.progressEditable === true, i18n.labels()));
      return true;
    },
    key(event) {
      if (!edit) return;
      // Tab leaves the bar (blur would cancel too): the focus move goes on
      if (event.key === 'Tab') {
        cancel();
        return;
      }
      const origin = edit;
      const { session, task, timeline, milestone } = origin;
      if (layout.timeline() !== timeline || layout.geometryById().get(task.id)?.row.task !== task) {
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
        announcer.announce(i18n.labels().announceEditCancel(task.name));
      } else if (result.changed) {
        const { preview } = result;
        if (preview.progress !== origin.progress) {
          // ↑/↓: the bar draws the new progress (none while back at the task's own)
          origin.progress = preview.progress;
          const own = preview.progress === (task.progress ?? 0);
          layout.progressPreview.set(own ? null : { taskId: task.id, progress: preview.progress });
          announcer.announce(i18n.labels().announceProgress(task.name, preview.progress));
        } else {
          drag.setExternalPreview(preview);
          announcer.announce(readout(preview, milestone));
        }
      }
    },
    cancel,
  };
}

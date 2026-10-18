// ─────────────────────────────────────────────────────────────
//  gantry · drag/keyboard-edit.ts
//
//  Move mode: moving and resizing a bar with the keyboard (Enter / F2 on
//  a movable bar), the Web Component's `interaction/keyboard-edit.ts`,
//  through core `KeyboardEditSession` — the same snapping, minimum length
//  and event shapes as a pointer drag (`DragSession`).
//
//    ←/→           move one unit (a day, or an hour on hour scales) earlier / later
//    Shift+←/→     resize the end        (task bars, with `enableResize`)
//    Alt+←/→       resize the start
//    Enter / F2    commit: `taskDragged` / `taskResized` as after a pointer drag, then the change is announced
//    Esc, Tab, blur, a pointer press   cancel (announced)
//
//  The preview goes through the drag service's external-preview hooks
//  (`startExternal` / `setExternalPreview` / `endExternal`), so the
//  pointer drag's ghost, its pinned row, the dimmed source bar, the
//  readout chip and the closed tooltip show it. Each step reads the new
//  dates out (core `formatDragReadout`, debounced). While move mode is
//  on, other plain keys do nothing; the progress keys (↑/↓) wait for the
//  progress event of Phase 11. A change of the timeline (zoom, new range)
//  or of the task under edit cancels it at the next key.
// ─────────────────────────────────────────────────────────────

import {
  KeyboardEditSession,
  announceKeyboardEdit,
  bottomScale,
  formatDragReadout,
  taskSpan,
  type DragPreview,
  type DragTiming,
  type GanttFlatRow,
  type GanttTask,
  type KeyboardEditEvent,
  type ResolvedGanttConfig,
  type TimelineModel,
} from '@gantryjs/core';

import { type GanttKeyContext } from '../a11y/grid-keys';

export interface KeyboardEdit {
  /** Move mode is on */
  active(): boolean;
  /** Task id of the bar in move mode, `null` when it is off */
  taskId(): string | null;
  /** Starts move mode on `row`'s bar; `false` when it can't move (drag off, `draggable: false`, a pointer drag). */
  start(row: GanttFlatRow): boolean;
  /** A key while move mode is on (prevents the default action of what it uses). */
  key(event: KeyboardEvent): void;
  /** Ends move mode without changing the task; announced unless `quiet`. */
  cancel(quiet?: boolean): void;
}

/** Scale of the current timeline for an edit that starts now (the pointer drag's timing). */
function editTiming(tl: TimelineModel, cfg: ResolvedGanttConfig): DragTiming {
  return {
    pxPerDay: tl.pxPerDay,
    toX: tl.toX,
    span: (start, end) => taskSpan({ start, end }, cfg),
    snap: bottomScale(cfg.scales).unit === 'hour' ? 'hour' : 'day',
  };
}

/** What the edit started from: a change of either cancels it. */
interface Origin {
  readonly session: KeyboardEditSession;
  readonly task: GanttTask;
  readonly timeline: TimelineModel;
  readonly milestone: boolean;
}

export function createKeyboardEdit(ctx: GanttKeyContext): KeyboardEdit {
  const { layout, drag, announcer, i18n, chart } = ctx;
  let edit: Origin | null = null;

  const finish = (): void => {
    edit = null;
    drag.endExternal();
  };

  const cancel = (quiet = false): void => {
    if (!edit) return;
    const { session, task } = edit;
    session.cancel();
    finish();
    if (!quiet) announcer.announce(i18n.labels().announceEditCancel(task.name));
  };

  /** Applies the commit's events like a pointer drop: update the task, then emit (in order). */
  const commit = (events: readonly KeyboardEditEvent[]): void => {
    if (!edit) return;
    const { session, task } = edit;
    finish();
    for (const ev of events) {
      if (ev.kind === 'progress') continue; // no progress event before Phase 11 (sessions don't edit it)
      if (ev.kind === 'drag') chart.taskDragged(ev.event);
      else chart.taskResized(ev.event);
    }
    announcer.announce(announceKeyboardEdit(events, task.name, i18n.labels(), session.unit));
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
      if (edit || !chart.dragEnabled() || task.draggable === false || drag.isActive()) return false;
      const geo = layout.geometryById().get(task.id);
      if (!geo) return false;
      const cfg = layout.cfg();
      const timeline = layout.timeline();
      const visual = chart.barVisual(geo);
      const session = new KeyboardEditSession(task, geo, editTiming(timeline, cfg), {
        movable: true,
        resizable: chart.resizeEnabled() && visual.kind === 'task',
        // ↑/↓ change the progress once Phase 11 has its event
        progressEditable: false,
      });
      if (!drag.startExternal(task.id)) return false;
      edit = { session, task, timeline, milestone: visual.kind === 'milestone' };
      drag.setExternalPreview(session.preview());
      announcer.announce(i18n.labels().announceEditStart(task.name));
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
      if (result.type === 'commit') commit(result.events);
      else if (result.type === 'cancel') {
        finish();
        announcer.announce(i18n.labels().announceEditCancel(task.name));
      } else if (result.changed) {
        drag.setExternalPreview(result.preview);
        announcer.announce(readout(result.preview, milestone));
      }
    },
    cancel,
  };
}

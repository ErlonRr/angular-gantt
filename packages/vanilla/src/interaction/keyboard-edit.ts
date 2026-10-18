/**
 * @file keyboard-edit.ts
 * Move mode: moving and resizing a bar with the keyboard (Enter / F2 on a movable bar), through
 * core `KeyboardEditSession` — the same snapping, minimum length and event shapes as a pointer
 * drag (`DragSession`).
 *
 *   ←/→           move one unit (a day, or an hour on hour scales) earlier / later
 *   Shift+←/→     resize the end        (task bars, with `enableResize`)
 *   Alt+←/→       resize the start
 *   Enter / F2    commit: `task-dragged` / `task-resized` as after a pointer drag, then the change is announced
 *   Esc, Tab, blur, a pointer press   cancel (announced)
 *
 * The preview goes to the engine's `dragPreview` input, so the pointer drag's ghost, its pinned
 * row and the dimmed source bar show it (and the readout chip, step 4.4). Each step reads the
 * new dates out (core `formatDragReadout`, debounced). While move mode is on, other plain keys
 * do nothing; the progress keys (↑/↓) wait for the progress event of Phase 11. A change of the
 * timeline (zoom, new range) or of the task under edit cancels it at the next key.
 */

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
import type { LayerContext } from '../layers/context';

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

export function createKeyboardEdit(ctx: LayerContext): KeyboardEdit {
  const { inputs: I, graph: G, drag } = ctx;
  let edit: Origin | null = null;

  const labels = () => G.i18n.peek().labels;
  const finish = (): void => {
    edit = null;
    I.dragPreview.set(null);
  };

  const cancel = (quiet = false): void => {
    if (!edit) return;
    const { session, task } = edit;
    session.cancel();
    finish();
    if (!quiet) ctx.announce.say(labels().announceEditCancel(task.name));
  };

  /** Applies the commit's events like a pointer drop: update the task, then emit (in order). */
  const commit = (events: readonly KeyboardEditEvent[]): void => {
    if (!edit) return;
    const { session, task } = edit;
    finish();
    let tasks = G.tasks.peek();
    for (const ev of events) {
      if (ev.kind === 'progress') continue; // no progress event before Phase 11 (sessions don't edit it)
      const { taskId, newStart, newEnd } = ev.event;
      tasks = tasks.map(t => (t.id === taskId ? { ...t, start: newStart, end: newEnd } : t));
      I.tasksIn.set(tasks);
      if (ev.kind === 'drag') ctx.emit('task-dragged', ev.event);
      else ctx.emit('task-resized', ev.event);
    }
    ctx.announce.say(announceKeyboardEdit(events, task.name, labels(), session.unit));
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
      if (edit || !I.enableDrag.peek() || task.draggable === false || drag.state.peek().kind !== 'idle') return false;
      const geo = G.geoById.peek().get(task.id);
      if (!geo) return false;
      const cfg = G.config.peek();
      const timeline = G.timeline.peek();
      const visual = G.barVisual.peek()(geo);
      const session = new KeyboardEditSession(task, geo, editTiming(timeline, cfg), {
        movable: true,
        resizable: I.enableResize.peek() && visual.kind === 'task',
        // ↑/↓ change the progress once Phase 11 has its event
        progressEditable: false,
      });
      edit = { session, task, timeline, milestone: visual.kind === 'milestone' };
      I.dragPreview.set(session.preview());
      ctx.announce.say(labels().announceEditStart(task.name));
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
      if (result.type === 'commit') commit(result.events);
      else if (result.type === 'cancel') {
        finish();
        ctx.announce.say(labels().announceEditCancel(task.name));
      } else if (result.changed) {
        I.dragPreview.set(result.preview);
        ctx.announce.say(readout(result.preview, milestone));
      }
    },
    cancel,
  };
}

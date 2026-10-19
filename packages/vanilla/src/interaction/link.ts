/**
 * @file link.ts
 * Drawing, selecting and deleting dependency links (Gantry 2 phase 11, D12 / D13), through core
 * `LinkSession`, `hitTestBar`, `arrowAt` and `linkChange` (Angular: `editing/link.ts`, the same
 * rules).
 *
 * **Drawing** (`editing.dependencies.create`, a bar whose `editRules(row).linkFrom` allows it):
 * - `start()` opens a session from a bar's connector: `'drag'` (pressing a connector and moving),
 *   `'click'` (a click on a connector, then a click on the target; WCAG 2.5.7) or `'keyboard'` (L
 *   on a bar, from its end). `inputs.link` = `{ sourceId, side, mode, preview }`; the element's
 *   `:state(linking)` follows it, the bar overlay shows the source and target connectors
 *   (`overlayLink`, read by `layers/bars.ts`), the overlay region draws `path.gantt-link-preview`
 *   (`preview`). Click and keyboard modes announce `announceLinkStart`. A drag, a progress drag or
 *   no connector: no session.
 * - `move()` (pointer modes): the target is the bar under the content point (core `hitTestBar`,
 *   its connectors included), the preview `LinkSession.hover`'s (to the target's connector, else to
 *   the pointer). `over()` names the target from the keys (keyboard mode: the focused bar; Enter,
 *   F2 or L finishing a click-mode link: the focused bar), linked at its start whatever the pointer
 *   did (`hover(…, 'key')`); keyboard mode draws the preview only while a target other than the
 *   source is focused. The overlay region draws the preview from the bars as they are now
 *   (`graph.linkPreviewPath`), so a zoom during a session moves it with them.
 * - `finish()` commits the link through `ctx.edit.commit` (built on the current raw tasks, source
 *   `'link'`: validated, vetoable, announced by the pipeline) and ends the session. Without a target
 *   it ends like `cancel()` (silent for a drag); on an invalid one it announces the reason
 *   (`announceChangeRejected`). `cancel()` announces `announceLinkCancel` unless `quiet` (a
 *   disconnect).
 *
 * **Deleting** (`editing.dependencies.delete`): `selectAt()` selects the arrow under a content
 * point (`keyAt`: core `arrowAt` over `arrowIndex.query(y ± ARROW_HIT_TOLERANCE)`, the last
 * painted wins; a bar there wins over arrows): `inputs.selectedLinkKey` = its `ArrowLink.key`
 * (drawn by `graph.arrowVisual` with `selectedArrowVisual`), announced `announceLinkSelected`;
 * nothing there deselects. `deleteSelected()` removes it (`linkChange(…, 'unlink', 'delete')`)
 * and deselects. Starting a link deselects too, and so does the link leaving the chart (the app
 * changed the tasks, its row was collapsed: `engine.ts`). Escape and Delete / Backspace are routed
 * by `keyboard.ts`; a press deselects (`keyboard.ts` outside the timeline, `canvas-pointer.ts` on
 * it, except a press on the selected link itself, whose click selects it again: no flicker).
 */

import {
  ARROW_HIT_TOLERANCE,
  DependencyType,
  LinkSession,
  arrowAt,
  hitTestBar,
  linkChange,
  rowIndexAtY,
  type ArrowLink,
  type BarOverlayLink,
  type GanttLabels,
  type LinkHoverTarget,
  type LinkMode,
  type LinkPreview,
  type LinkSide,
  type ResolvedGanttConfig,
  type RowGeometry,
} from '@gantryjs/core';
import type { LinkState } from '../engine/inputs';
import type { LayerContext } from '../layers/context';

/** The link interactions (`ctx.link`). Content coordinates: timeline px, canvas-relative. */
export interface LinkApi {
  /** A link session is on (`inputs.link` is set) */
  active(): boolean;
  /**
   * Starts a session from `taskId`'s bar, its `side` connector, by `mode`; `at` is the content
   * point the pointer pressed (`null` for the keyboard). Nothing starts when the row can't link
   * (`editRules(row).linkFrom`), while a bar or a progress grip is dragged, or without the
   * connector; `active()` tells. A session already on is replaced (quietly).
   */
  start(taskId: string, side: LinkSide, mode: LinkMode, at: { x: number; y: number } | null): void;
  /** The pointer moved to content `x` / `y`: the preview follows (and finds the target under it). Pointer modes only. */
  move(x: number, y: number): void;
  /**
   * The target bar named by the keys (keyboard mode: the focused bar; Enter / F2 / L finishing a
   * click-mode link), linked at its start; `null` = none.
   */
  over(taskId: string | null): void;
  /** Creates the link to the current target through the pipeline; `true` when one was created. Ends the session. */
  finish(): boolean;
  /** Ends the session without a link (announced unless `quiet`). */
  cancel(quiet?: boolean): void;
  /** Selects the arrow at content `x` / `y` (`false` and deselected when none is there). */
  selectAt(x: number, y: number): boolean;
  /** The key of the arrow `selectAt(x, y)` would select (`null`: none there, a bar wins, deletion off). */
  keyAt(x: number, y: number): string | null;
  /** No link is selected any more (Escape, a press elsewhere, the link gone). */
  deselect(): void;
  /** Deletes the selected link through the pipeline; `true` when one was removed. */
  deleteSelected(): boolean;
}

/**
 * The link session as the bar overlay shows it (core `computeBarOverlay`'s `link`, read by
 * `layers/bars.ts`): the source connector, and the target's (`--target`, or `--invalid`) once a
 * target is hovered or focused.
 */
export function overlayLink(state: LinkState | null): BarOverlayLink | null {
  if (!state) return null;
  const p = state.preview;
  return {
    sourceId: state.sourceId,
    sourceSide: state.side,
    targetId: p?.targetId ?? null,
    targetSide: p?.targetSide ?? null,
    valid: p?.valid ?? false,
  };
}

/** The open session and what it was started on. */
interface Open {
  readonly session: LinkSession;
  /** The raw tasks the session validates against (`finish()` rebuilds the change when they changed) */
  readonly tasks: readonly unknown[];
  /** The last pointer position (content px), `null` before one */
  pointer: { x: number; y: number } | null;
  /** The last preview, drawn or not (keyboard mode hides it without a target) */
  last: LinkPreview | null;
}

export function createLink(ctx: LayerContext): LinkApi {
  const { inputs: I, graph: G } = ctx;
  let open: Open | null = null;

  /** The resolved config and labels, `null` while the options are invalid (the render reports them). */
  const settings = (): { cfg: ResolvedGanttConfig; labels: GanttLabels } | null => {
    try {
      return { cfg: G.config.peek(), labels: G.i18n.peek().labels };
    } catch {
      return null;
    }
  };
  const nameOf = (id: string): string => G.geoById.peek().get(id)?.row.task.name ?? id;

  /** The row geometry under a content `y` (core `rowIndexAtY`). */
  const geoAt = (y: number, cfg: ResolvedGanttConfig): RowGeometry | undefined => {
    const geos = G.geometries.peek();
    const i = rowIndexAtY(y, cfg.rowHeight, geos.length);
    return i === null ? undefined : geos[i];
  };
  /** A target bar as the session reads it. */
  const targetOf = (geo: RowGeometry): LinkHoverTarget => ({
    taskId: geo.row.task.id,
    visual: G.barVisual.peek()(geo),
    linkTo: G.editRules.peek()(geo.row).linkTo,
  });

  /** Publishes the session's preview (keyboard mode: only towards a target). */
  const publish = (o: Open, preview: LinkPreview | null): void => {
    o.last = preview;
    const shown = preview && (o.session.mode !== 'keyboard' || preview.targetId !== null) ? preview : null;
    const { from, mode } = o.session;
    I.link.set({ sourceId: from.taskId, side: from.side, mode, preview: shown, pointer: o.pointer });
  };

  /** Ends the session (no announcement). */
  const end = (): void => {
    open?.session.cancel();
    open = null;
    if (I.link.peek() !== null) I.link.set(null);
  };

  const deselect = (): void => {
    if (I.selectedLinkKey.peek() !== null) I.selectedLinkKey.set(null);
  };

  /** The arrow a click at content `x` / `y` selects (deletion on; a bar there wins), if any. */
  const linkAt = (x: number, y: number, cfg: ResolvedGanttConfig): ArrowLink | undefined => {
    if (!cfg.editing.dependencies.delete) return undefined;
    // Bars win over the arrows that end at them
    const geo = geoAt(y, cfg);
    if (geo && hitTestBar(G.barVisual.peek()(geo), x, y, false)) return undefined;
    const tol = ARROW_HIT_TOLERANCE;
    const links = G.arrowIndex.peek().query(y - tol, y + tol);
    const key = arrowAt(links, G.arrowVisual.peek(), x, y, tol);
    return key === null ? undefined : links.find(l => l.key === key);
  };

  const cancel = (quiet = false): void => {
    if (!open) {
      if (I.link.peek() !== null) I.link.set(null);
      return;
    }
    end();
    const s = quiet ? null : settings();
    if (s) ctx.announce.say(s.labels.announceLinkCancel);
  };

  return {
    active: () => I.link.peek() !== null,

    start(taskId, side, mode, at) {
      const s = settings();
      if (!s?.cfg.editing.dependencies.create) return;
      if (ctx.drag.state.peek().kind !== 'idle' || ctx.progress.active()) return;
      const geo = G.geoById.peek().get(taskId);
      if (!geo || !G.editRules.peek()(geo.row).linkFrom) return;
      const connector = G.barVisual.peek()(geo).connectors?.[side];
      if (!connector) return;
      if (open) end();
      deselect();
      const tasks = ctx.edit.rawTasks();
      const session = new LinkSession(
        { taskId, side, x: connector.cx, y: connector.cy },
        { tasks, config: s.cfg, mode, labels: s.labels },
      );
      const o: Open = { session, tasks, pointer: at, last: null };
      open = o;
      if (at && mode !== 'keyboard') {
        const g = geoAt(at.y, s.cfg);
        publish(o, session.hover(g ? targetOf(g) : null, at));
      } else publish(o, null);
      if (mode !== 'drag') ctx.announce.say(s.labels.announceLinkStart(geo.row.task.name));
    },

    move(x, y) {
      const o = open;
      if (!o || o.session.mode === 'keyboard') return;
      const s = settings();
      if (!s) return;
      const pointer = { x, y };
      o.pointer = pointer;
      const geo = geoAt(y, s.cfg);
      const visual = geo && G.barVisual.peek()(geo);
      const hit = geo && visual && hitTestBar(visual, x, y, true) ? targetOf(geo) : null;
      publish(o, o.session.hover(hit, pointer));
    },

    over(taskId) {
      const o = open;
      if (!o) return;
      const geo = taskId === null ? undefined : G.geoById.peek().get(taskId);
      const target = geo ? targetOf(geo) : null;
      // A target named by a key is linked at its start (FS from an end), wherever the pointer was
      const pointer = o.pointer ?? { x: o.session.from.x, y: o.session.from.y };
      publish(o, o.session.hover(target, pointer, 'key'));
    },

    finish() {
      const o = open;
      if (!o) return false;
      const last = o.last;
      let change = o.session.finish();
      end();
      const s = settings();
      if (!change) {
        if (s && last?.targetId != null && last.reason !== null) {
          ctx.announce.say(s.labels.announceChangeRejected(last.reason));
        } else if (s && o.session.mode !== 'drag') ctx.announce.say(s.labels.announceLinkCancel);
        return false;
      }
      // The tasks changed meanwhile (a page loaded, the app set them): the change on the current ones
      const tasks = ctx.edit.rawTasks();
      const op = change.ops[0];
      if (tasks !== o.tasks && op?.op === 'link') {
        const { fromId, toId, type } = op.event;
        change = linkChange(tasks, { fromId, toId, type }, 'link', 'link');
      }
      return ctx.edit.commit(change);
    },

    cancel,

    selectAt(x, y) {
      const s = settings();
      const link = s ? linkAt(x, y, s.cfg) : undefined;
      if (!s || !link) {
        deselect();
        return false;
      }
      I.selectedLinkKey.set(link.key);
      ctx.announce.say(s.labels.announceLinkSelected(nameOf(link.from), nameOf(link.to)));
      return true;
    },

    keyAt(x, y) {
      const s = settings();
      return (s && linkAt(x, y, s.cfg)?.key) ?? null;
    },

    deselect,

    deleteSelected() {
      const key = I.selectedLinkKey.peek();
      if (key === null) return false;
      const s = settings();
      const link: ArrowLink | undefined = s?.cfg.editing.dependencies.delete
        ? G.arrowIndex.peek().links.find(l => l.key === key)
        : undefined;
      if (!link) {
        deselect();
        return false;
      }
      const type = link.dep.type ?? DependencyType.FS;
      const removed = ctx.edit.commit(
        linkChange(ctx.edit.rawTasks(), { fromId: link.from, toId: link.to, type }, 'unlink', 'delete'),
      );
      if (removed) deselect();
      return removed;
    },
  };
}

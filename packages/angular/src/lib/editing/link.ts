// ─────────────────────────────────────────────────────────────
//  gantry · editing/link.ts
//
//  Drawing, selecting and deleting dependency links (D12, D13 of Gantry 2
//  phase 11), the Web Component's `interaction/link.ts` (the same rules),
//  through core `LinkSession`, `hitTestBar`, `arrowAt` and `linkChange`.
//
//  Drawing (`editing.dependencies.create`, a bar whose
//  `editRules(row).linkFrom` allows it):
//   - `start()` opens a session from a bar's connector: `'drag'` (pressing
//     a connector and moving), `'click'` (a click on a connector, then a
//     click on the target; WCAG 2.5.7) or `'keyboard'` (L on a bar, from
//     its end). `layout.link` = `{ sourceId, side, mode, preview }`: the
//     host's `.gantry-linking` class, the source and target connectors of
//     the bar overlay (`overlayLink`, `bars/bar-focus.service.ts`) and the
//     canvas' `path.gantt-link-preview` follow it. Click and keyboard modes announce `announceLinkStart`. A
//     drag, a progress drag or no connector: no session.
//   - `move()` (pointer modes): the target is the bar under the canvas
//     point (core `hitTestBar`, its connectors included), the preview
//     `LinkSession.hover`'s (to the target's connector, else to the
//     pointer). `over()` names the target from the keys (keyboard mode:
//     the focused bar, from the keyboard directive's `focusin`; Enter, F2
//     or L finishing a click-mode link: the focused bar), linked at its
//     start whatever the pointer did (`hover(…, 'key')`); keyboard mode
//     shows the preview only while a target other than the source is
//     focused. The canvas draws the preview from the bars as they are now
//     (`linkPreviewD`), so a zoom during a session moves it with them.
//   - `finish()` commits the link through the chart's editor (built on
//     the current raw tasks, source `'link'`: validated, vetoable,
//     announced by the pipeline) and ends the session. Without a target it
//     ends like `cancel()` (silent for a drag); on an invalid one it
//     announces the reason (`announceChangeRejected`). `cancel()`
//     announces `announceLinkCancel` unless `quiet` (the chart is
//     destroyed, the press that ends a link drag).
//
//  Deleting (`editing.dependencies.delete`): `selectAt()` selects the
//  arrow under a canvas point (`keyAt`: core `arrowAt` over the links
//  whose span meets y ± `ARROW_HIT_TOLERANCE`, the last painted wins; a
//  bar there wins over arrows): `layout.selectedLinkKey` = its
//  `ArrowLink.key` (painted through `layout.arrowSelection`:
//  `gantt-arrow--selected`), announced `announceLinkSelected`; nothing
//  there deselects. `deleteSelected()` removes it (`linkChange(…,
//  'unlink', 'delete')`) and deselects (a veto keeps the selection).
//  Starting a link deselects too, and so does the link leaving the chart
//  (`layout.selectedLinkKey` follows the links drawn). Escape and Delete /
//  Backspace are routed by the keyboard directive
//  (`selection/gantt-keyboard.directive.ts`); a press deselects (the
//  directive outside the canvas, the canvas on it, except a press on the
//  selected link itself, whose click selects it again: no flicker).
//
//  The chart's bar visuals (connectors, hit tests, targets) are bound once
//  by the keyboard directive (`bind`), from GantryComponent's.
// ─────────────────────────────────────────────────────────────

import { Injectable, inject, untracked } from '@angular/core';
import {
  ARROW_HIT_TOLERANCE,
  DependencyType,
  LinkSession,
  arrowAt,
  computeArrowVisual,
  hitTestBar,
  linkChange,
  rowIndexAtY,
  type ArrowLink,
  type ArrowVisual,
  type BarVisual,
  type GanttLabels,
  type GanttTask,
  type LinkHoverTarget,
  type LinkMode,
  type LinkPreview,
  type LinkSide,
  type ResolvedGanttConfig,
  type RowGeometry,
} from '@gantryjs/core';

import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttDragService } from '../drag/gantt-drag.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttAnnouncer } from '../a11y/announcer';
import { GanttEditorService } from './gantt-editor.service';
import { GanttProgressService } from './progress';

/** What the link interactions read from the chart (bound once: `GanttLinkService.bind`). */
export interface GanttLinkHost {
  /** The chart's bar visual of a row geometry (its connectors, the hit tests, the targets) */
  barVisual(geo: RowGeometry): BarVisual;
}

/** The open session and what it was started on. */
interface Open {
  readonly session: LinkSession;
  /** The raw tasks the session validates against (`finish()` rebuilds the change when they changed) */
  readonly tasks: readonly GanttTask[];
  /** The last pointer position (canvas px), `null` before one */
  pointer: { x: number; y: number } | null;
  /** The last preview, shown or not (keyboard mode hides it without a target) */
  last: LinkPreview | null;
}

@Injectable()
export class GanttLinkService {
  private readonly layout = inject(GanttLayoutService);
  private readonly editor = inject(GanttEditorService);
  private readonly drag = inject(GanttDragService);
  private readonly progress = inject(GanttProgressService);
  private readonly i18n = inject(GanttI18nService);
  private readonly announcer = inject(GanttAnnouncer);

  private host: GanttLinkHost | null = null;
  private open: Open | null = null;

  /** The dependency links between the rows, indexed by their vertical span, as the canvas paints them */
  private readonly arrowIndex = this.layout.arrowIndex;

  /** The chart's bar visuals (the keyboard directive's `bind`, from GantryComponent's constructor). */
  bind(host: GanttLinkHost): void {
    this.host = host;
  }

  /** A link is being drawn (`layout.link`). */
  active(): boolean {
    return untracked(this.layout.link) !== null;
  }

  /**
   * Starts a link from `taskId`'s `side` connector: a pointer drag, an armed click, or the keys
   * (L). `at` is the pointer in canvas coordinates (`null` from the keys). Nothing starts when the
   * row can't link (`editRules(row).linkFrom`), while a bar or a progress grip is dragged, or
   * without the connector; `active()` tells. A session already on is replaced (quietly).
   */
  start(taskId: string, side: LinkSide, mode: LinkMode, at: { x: number; y: number } | null): void {
    untracked(() => {
      const host = this.host;
      const { cfg, labels } = this.settings();
      if (!host || !cfg.editing.dependencies.create) return;
      if (this.drag.isActive() || this.progress.active()) return;
      const geo = this.layout.geometryById().get(taskId);
      if (!geo || !this.layout.editRules()(geo.row).linkFrom) return;
      const connector = host.barVisual(geo).connectors?.[side];
      if (!connector) return;
      if (this.open) this.end();
      this.deselect();
      const tasks = this.editor.rawTasks();
      const session = new LinkSession(
        { taskId, side, x: connector.cx, y: connector.cy },
        { tasks, config: cfg, mode, labels },
      );
      const o: Open = { session, tasks, pointer: at, last: null };
      this.open = o;
      if (at && mode !== 'keyboard') {
        const g = this.geoAt(at.y, cfg);
        this.publish(o, session.hover(g ? this.targetOf(g, host) : null, at));
      } else this.publish(o, null);
      if (mode !== 'drag') this.announcer.announce(labels.announceLinkStart(geo.row.task.name));
    });
  }

  /** The pointer moved to (`x`, `y`) in canvas coordinates: the preview follows it. Pointer modes only. */
  move(x: number, y: number): void {
    const o = this.open;
    const host = this.host;
    if (!o || !host || o.session.mode === 'keyboard') return;
    untracked(() => {
      const pointer = { x, y };
      o.pointer = pointer;
      const geo = this.geoAt(y, this.layout.cfg());
      const hit = geo && hitTestBar(host.barVisual(geo), x, y, true) ? this.targetOf(geo, host) : null;
      this.publish(o, o.session.hover(hit, pointer));
    });
  }

  /** The bar the keys moved to or finish on (`null`: none): validated, previewed, linked at its start. */
  over(taskId: string | null): void {
    const o = this.open;
    const host = this.host;
    if (!o || !host) return;
    untracked(() => {
      const geo = taskId === null ? undefined : this.layout.geometryById().get(taskId);
      const target = geo ? this.targetOf(geo, host) : null;
      // A target named by a key is linked at its start (FS from an end), wherever the pointer was
      const pointer = o.pointer ?? { x: o.session.from.x, y: o.session.from.y };
      this.publish(o, o.session.hover(target, pointer, 'key'));
    });
  }

  /** Creates the link to the current target through the editor; `false` when there is no valid one. Ends the session. */
  finish(): boolean {
    const o = this.open;
    if (!o) return false;
    return untracked(() => {
      const last = o.last;
      let change = o.session.finish();
      this.end();
      const { labels } = this.settings();
      if (!change) {
        if (last?.targetId != null && last.reason !== null) {
          this.announcer.announce(labels.announceChangeRejected(last.reason));
        } else if (o.session.mode !== 'drag') this.announcer.announce(labels.announceLinkCancel);
        return false;
      }
      // The tasks changed meanwhile (a page loaded, the app set them): the change on the current ones
      const tasks = this.editor.rawTasks();
      const op = change.ops[0];
      if (tasks !== o.tasks && op?.op === 'link') {
        const { fromId, toId, type } = op.event;
        change = linkChange(tasks, { fromId, toId, type }, 'link', 'link');
      }
      return this.editor.commit(change);
    });
  }

  /** Ends the session without a link (announced unless `quiet`). */
  cancel(quiet = false): void {
    untracked(() => {
      if (!this.open) {
        if (this.layout.link() !== null) this.layout.link.set(null);
        return;
      }
      this.end();
      if (!quiet) this.announcer.announce(this.settings().labels.announceLinkCancel);
    });
  }

  /** Selects the arrow at (`x`, `y`) when links can be deleted; `false` (and deselected) when there is none there. */
  selectAt(x: number, y: number): boolean {
    return untracked(() => {
      const link = this.linkAt(x, y);
      if (!link) {
        this.deselect();
        return false;
      }
      this.layout.selectedLinkKey.set(link.key);
      const { labels } = this.settings();
      this.announcer.announce(labels.announceLinkSelected(this.nameOf(link.from), this.nameOf(link.to)));
      return true;
    });
  }

  /** The key of the arrow `selectAt(x, y)` would select (`null`: none there, a bar wins, deletion off). */
  keyAt(x: number, y: number): string | null {
    return untracked(() => this.linkAt(x, y)?.key ?? null);
  }

  /** Removes the selected link through the editor; `false` when none is selected or the change was refused. */
  deleteSelected(): boolean {
    return untracked(() => {
      const key = this.layout.selectedLinkKey();
      if (key === null) return false;
      const link: ArrowLink | undefined = this.settings().cfg.editing.dependencies.delete
        ? this.arrowIndex().links.find(l => l.key === key)
        : undefined;
      if (!link) {
        this.deselect();
        return false;
      }
      const type = link.dep.type ?? DependencyType.FS;
      const removed = this.editor.commit(
        linkChange(this.editor.rawTasks(), { fromId: link.from, toId: link.to, type }, 'unlink', 'delete'),
      );
      if (removed) this.deselect();
      return removed;
    });
  }

  /** No link is selected any more (Escape, a press anywhere, a new link session). */
  deselect(): void {
    if (untracked(this.layout.selectedLinkKey) !== null) this.layout.selectedLinkKey.set(null);
  }

  // ── Helpers ───────────────────────────────────────────────

  /** The arrow a click at (`x`, `y`) selects (deletion on; a bar there wins), if any. Read untracked. */
  private linkAt(x: number, y: number): ArrowLink | undefined {
    const host = this.host;
    const { cfg } = this.settings();
    if (!host || !cfg.editing.dependencies.delete) return undefined;
    // Bars win over the arrows that end at them
    const geo = this.geoAt(y, cfg);
    if (geo && hitTestBar(host.barVisual(geo), x, y, false)) return undefined;
    const tol = ARROW_HIT_TOLERANCE;
    const links = this.arrowIndex().query(y - tol, y + tol);
    const key = arrowAt(links, this.arrowVisualOf(host, cfg), x, y, tol);
    return key === null ? undefined : links.find(l => l.key === key);
  }

  /** The resolved config and labels (read untracked by the callers). */
  private settings(): { cfg: ResolvedGanttConfig; labels: GanttLabels } {
    return { cfg: this.layout.cfg(), labels: this.i18n.labels() };
  }

  private nameOf(id: string): string {
    return this.layout.geometryById().get(id)?.row.task.name ?? id;
  }

  /** The row geometry under a canvas `y` (core `rowIndexAtY`). */
  private geoAt(y: number, cfg: ResolvedGanttConfig): RowGeometry | undefined {
    const geos = this.layout.rowGeometries();
    const i = rowIndexAtY(y, cfg.rowHeight, geos.length);
    return i === null ? undefined : geos[i];
  }

  /** A target bar as the session reads it. */
  private targetOf(geo: RowGeometry, host: GanttLinkHost): LinkHoverTarget {
    return {
      taskId: geo.row.task.id,
      visual: host.barVisual(geo),
      linkTo: this.layout.editRules()(geo.row).linkTo,
    };
  }

  /**
   * The arrow visual of a link as the canvas computes it (core `computeArrowVisual` over the chart's
   * bar visuals, the critical path and the font size), for the few links a click is near.
   */
  private arrowVisualOf(host: GanttLinkHost, cfg: ResolvedGanttConfig): (link: ArrowLink) => ArrowVisual | null {
    const geoById = this.layout.geometryById();
    const critical = this.layout.criticalIds();
    const fontPx = this.layout.fontPx();
    return link => {
      const from = geoById.get(link.from);
      const to = geoById.get(link.to);
      return from && to
        ? computeArrowVisual(
            host.barVisual(from),
            host.barVisual(to),
            { type: link.dep.type ?? DependencyType.FS, lag: link.dep.lag },
            cfg,
            { fromTop: from.y, fromBottom: from.y + from.height },
            critical.has(link.from) && critical.has(link.to),
            fontPx,
          )
        : null;
    };
  }

  /** Publishes the session's preview (keyboard mode: only towards a target). */
  private publish(o: Open, preview: LinkPreview | null): void {
    o.last = preview;
    const shown = preview && (o.session.mode !== 'keyboard' || preview.targetId !== null) ? preview : null;
    const { from, mode } = o.session;
    this.layout.link.set({ sourceId: from.taskId, side: from.side, mode, preview: shown, pointer: o.pointer });
  }

  /** Ends the session (no announcement). */
  private end(): void {
    this.open?.session.cancel();
    this.open = null;
    if (untracked(this.layout.link) !== null) this.layout.link.set(null);
  }
}

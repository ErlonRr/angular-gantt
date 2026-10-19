// ─────────────────────────────────────────────────────────────
//  gantry · sync/gantt-sync.ts
//
//  The chart's member of a sync group (`[syncGroup]`, core
//  `createGanttSyncGroup`): one stable member per chart that shares the
//  timeline range, the zoom level, the horizontal scroll and the panel
//  width with the other charts of the group (§3d of the Gantry 2 phase 10
//  plan). The Web Component's `layers/sync.ts`; one per chart, provided by
//  GantryComponent.
//
//  GantryComponent calls the hooks:
//  - `connect(group)` whenever `[syncGroup]` changes (an effect: `null`
//    leaves), `disconnect()` when the chart is destroyed;
//  - `reportLevel(level)` from its `viewModeChange` effect (not on the
//    first render), `takeGroupLevel(level)` there too: a level the group
//    applied is emitted and saved but not announced (O1-p10-sync);
//  - `reportPanel(px)` when the splitter (drag end, Arrow keys) or
//    `setState()` set the panel width;
//  - in its scroll sync (an `afterRenderEffect`, after the render):
//    `pendingScroll()` (tracked, so a group scroll schedules it),
//    `takeLevelCorrection()` on every run, `applyScroll()` ahead of
//    `initialScroll` and of the anchoring, `dropScroll()` when the chart's
//    own scroll request replaces a waiting group scroll, `correct()` for
//    the anchoring of a new timeline.
//
//  Joining: the same group again changes nothing; another group is joined
//  after leaving the old one. The group sends its state before `join()`
//  returns, so the member's `update` never uses the handle. Leaving
//  (`null`, another group, the chart destroyed) takes the chart's range out
//  of the group's union, clears the shared range and drops a group scroll
//  waiting for the render; the level and the panel width the group set stay.
//
//  Applying (`update`) only writes the layout graph, never reports:
//  - `range` / `extent` → `layout.shared` (a field present as `null`
//    clears it, an absent field keeps the current value; equal dates
//    change nothing: the signal compares them by value);
//  - `level` → `layout.level` with a `null` zoom anchor (each chart keeps
//    its centre). A level this chart's `zoomLevels` don't have is ignored:
//    showing its fallback would report a level the group never chose;
//  - `scrollLeft` → queued on the viewport's `ViewportSync`
//    (`GanttScrollService.group`); the chart's scroll sync applies it
//    after the render of the same patch, with the echo guard, instead of
//    `initialScroll` when it comes first;
//  - `panelWidth` → `layout.panelWidthPx`, neither saved nor reported;
//  - `null` for level, scroll or panel: nothing shared yet, the chart
//    keeps its own.
//
//  Reporting happens from effects created while joined (never from a
//  render) and from the event handlers: the natural range
//  (`layout.naturalRange`, core `timelineRange`: the chart's own range and
//  task extent, never the shared timeline it draws) from the join on; the
//  level when it changes and differs from the group's (a level the group
//  applied is not sent back); the horizontal scroll from the viewport's
//  scroll handler unless it is the echo of a scroll the group caused
//  (`GanttScrollService`); the panel width from the splitter and
//  `setState()`. The group itself drops what its options turn off and
//  values equal to its own.
// ─────────────────────────────────────────────────────────────

import { Injectable, Injector, effect, inject, untracked, type EffectRef } from '@angular/core';
import {
  clampScroll,
  type GanttSyncGroup,
  type GanttSyncHandle,
  type GanttSyncMember,
  type GanttSyncState,
  type NaturalTimelineRange,
  type TimelineModel,
} from '@gantryjs/core';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttScrollService } from '../scroll/gantt-scroll.service';

@Injectable()
export class GanttSync {
  private readonly layout = inject(GanttLayoutService);
  private readonly scroll = inject(GanttScrollService);
  /** The viewport's side of the group: echo guard, queued scroll, reporter */
  private readonly viewport = this.scroll.group;
  /** The chart's injector: the membership's reporting effects end with the chart at the latest */
  private readonly injector = inject(Injector);

  /** The group of `[syncGroup]` (`null`: none) */
  private _group: GanttSyncGroup | null = null;
  private handle: GanttSyncHandle | null = null;
  /** The level the group applied last and nobody announced yet */
  private appliedLevel: string | null = null;
  /** The level shown since the join or the last report (the level reporter's baseline) */
  private shownLevel: string | null = null;
  /** The reporting effects of the current membership */
  private reporters: EffectRef[] = [];

  /** One member per chart, for every group it joins: the group sends the shared state here. */
  private readonly member: GanttSyncMember = {
    update: patch =>
      untracked(() => {
        if ('range' in patch || 'extent' in patch) this.applyShared(patch);
        if (typeof patch.level === 'string') this.applyLevel(patch.level);
        if (patch.panelWidth != null) this.layout.panelWidthPx.set(patch.panelWidth);
        if (patch.scrollLeft != null) this.viewport.queue(patch.scrollLeft);
      }),
  };

  /** The group the chart is connected to (`null`: none) */
  get group(): GanttSyncGroup | null {
    return this._group;
  }

  /** A scroll the group sent that the chart has not applied yet (a tracked read: schedules the scroll sync) */
  pendingScroll(): number | null {
    return this.viewport.waiting();
  }

  /** `[syncGroup]` is `next` now: the same group changes nothing; another one replaces it; `null` leaves. */
  connect(next: GanttSyncGroup | null): void {
    if (next === this._group) return;
    this.leave();
    if (!next) return;
    this._group = next;
    // The group sends its state (level, panel, shared range, scroll) to `member` before returning
    const link = (this.handle = next.join(this.member));
    untracked(() => this.startReporters(next, link));
  }

  /** Leave the group (the chart is destroyed). Idempotent. */
  disconnect(): void {
    this.leave();
  }

  /**
   * The zoom level changed (the chart's `viewModeChange` effect, not on the first render): sent to
   * the group when it differs from the level shown at the join and from the group's own (a level
   * the group applied is not sent back). `_level` is the level requested; what is sent is the
   * level shown (the resolved zoom level's name, as the Web Component's `viewMode`).
   */
  reportLevel(_level: string): void {
    const group = this._group;
    const link = this.handle;
    if (!group || !link || !group.options.zoom) return;
    const name = this.level();
    if (name === null || name === this.shownLevel) return;
    this.shownLevel = name;
    if (name !== group.state.level) link.report({ level: name });
  }

  /** The splitter or `setState()` set the panel width to `px`: the other charts get it. */
  reportPanel(px: number): void {
    this.handle?.report({ panelWidth: px });
  }

  /**
   * Whether `level` is the one the group applied (a zoom the user made in another chart): true
   * once, so the announcement skips it — that chart announces it, not every member.
   */
  takeGroupLevel(level: string): boolean {
    const fromGroup = level === this.appliedLevel;
    this.appliedLevel = null;
    return fromGroup;
  }

  /**
   * Whether the timeline rendered now comes from a level the group applied (its zoom anchoring is
   * the group's correction, not the chart's move). Read and cleared on every run of the scroll sync.
   */
  takeLevelCorrection(): boolean {
    const groupLevel = this.viewport.groupLevel;
    this.viewport.groupLevel = false;
    return groupLevel;
  }

  /**
   * After a render: scroll to the offset the group sent, if any (an instant jump, its echo
   * expected), and say whether it did. It replaces `initialScroll` when it comes first, and the
   * anchoring of the timeline the same patch brought.
   */
  applyScroll(): boolean {
    const x = this.viewport.waiting();
    if (x === null) return false;
    this.viewport.consume();
    this.scroll.echoJump(x);
    return true;
  }

  /** The chart's own scroll (a request made before this render) replaces a group scroll waiting for it. */
  dropScroll(): void {
    this.viewport.consume();
  }

  /**
   * Keep the anchor date of `prev` in place on `tl` by scrolling to `x` (core `anchoredScrollLeft`;
   * `viewportWidth` = the viewport's width). Inside a group whose scroll is shared, the correction
   * stays out of the group (its scroll event is an echo) when it is the zoom anchoring after a level
   * the group applied (`groupLevel`: each chart would keep its own centre; the chart that zoomed
   * reports its anchored scroll and the others apply it), or a start correction at the chart's scroll
   * limit (a chart that cannot scroll as far would pull the others back). Any other correction is
   * reported like a scroll: after a new shared start every chart keeps the same date at the left
   * edge, so their reports agree and the group's scroll stays measured from the shared start.
   */
  correct(prev: TimelineModel, tl: TimelineModel, x: number, viewportWidth: number, groupLevel: boolean): void {
    const quiet =
      prev.pxPerDay !== tl.pxPerDay ? groupLevel : x >= clampScroll(Number.POSITIVE_INFINITY, tl, viewportWidth);
    if (this.viewport.report !== null && quiet) this.scroll.echoJump(x);
    else this.scroll.scrollToX(x, 'instant');
  }

  // ── Membership ────────────────────────────────────────────

  /** The reporters of a membership: the natural range (now and on change), the level baseline, the scroll. */
  private startReporters(joined: GanttSyncGroup, link: GanttSyncHandle): void {
    if (joined.options.range) {
      // The natural range from the join on (the group compares dates by value: an equal range sends nothing)
      const send = (natural: NaturalTimelineRange | null): void => {
        if (natural) untracked(() => link.report({ range: natural.range, extent: natural.extent }));
      };
      send(this.naturalRange());
      this.reporters.push(effect(() => send(this.naturalRange()), { injector: this.injector }));
    }
    // The level shown when joining (the group's, when it had one) is not a change
    if (joined.options.zoom) this.shownLevel = this.level();
    if (joined.options.scroll) this.viewport.report = x => link.report({ scrollLeft: x });
  }

  private leave(): void {
    const link = this.handle;
    if (!link) return;
    this.handle = null;
    this._group = null;
    for (const ref of this.reporters) ref.destroy();
    this.reporters = [];
    this.viewport.report = null;
    this.viewport.groupLevel = false;
    this.appliedLevel = null;
    this.shownLevel = null;
    this.viewport.queue(null);
    link.leave();
    this.layout.shared.set(null);
  }

  // ── Applying ──────────────────────────────────────────────

  /** The group's range and extent in the shared timeline input (absent fields keep their value). */
  private applyShared(patch: Partial<GanttSyncState>): void {
    const prev = this.layout.shared();
    const range = 'range' in patch ? (patch.range ?? null) : (prev?.range ?? null);
    const extent = 'extent' in patch ? (patch.extent ?? null) : (prev?.extent ?? null);
    this.layout.shared.set(range || extent ? { range, extent } : null);
  }

  /** The group's level, unless the chart shows it already or doesn't have it. */
  private applyLevel(name: string): void {
    if (name === this.layout.level() || !this.hasLevel(name)) return;
    // The next rendered timeline's zoom anchoring is the group's correction (`correct`)
    this.viewport.groupLevel = true;
    this.appliedLevel = name;
    this.layout.zoomAnchorX.set(null);
    this.layout.level.set(name);
  }

  // ── Reads that tolerate invalid options (the chart reports them) ──

  /** The zoom level shown (the resolved level's name), or `null` while the options are invalid */
  private level(): string | null {
    try {
      return untracked(() => this.layout.cfg().level.name);
    } catch {
      return null;
    }
  }

  /** The chart's own range and task extent, or `null` while the options are invalid */
  private naturalRange(): NaturalTimelineRange | null {
    try {
      return this.layout.naturalRange();
    } catch {
      return null;
    }
  }

  /** Whether this chart has a zoom level named `name` (invalid options: let the chart report them) */
  private hasLevel(name: string): boolean {
    try {
      return this.layout.cfg().zoomLevels.some(l => l.name === name);
    } catch {
      return true;
    }
  }
}

/**
 * @file sync.ts
 * The chart's link to its sync group (`syncGroup` property, core `createGanttSyncGroup`): one
 * stable member per element that shares the timeline range, the zoom level, the horizontal scroll
 * and the panel width with the other charts of the group (§3d of the Phase 10 plan).
 *
 * Wiring (in `engine/engine.ts` and `gantry.element.ts`):
 * - `connect(group)` runs inside an effect of the connection's owner: when the element connects
 *   and whenever `syncGroup` changes while connected (`null` = leave);
 * - `disconnect()` runs when the element disconnects;
 * - `reportPanel(px)` runs when `setState()` sets a panel width, and is `ctx.sync.reportPanel` for
 *   the splitter (`interaction/splitter.ts`).
 *
 * Joining: the same group again changes nothing; another group is joined after leaving the old
 * one. The group sends its state before `join()` returns, so the member's `update` never uses the
 * handle. Leaving (`null`, another group, a disconnect) takes the chart's range out of the group's
 * union, clears the shared range and drops a group scroll waiting for the paint; the level and
 * the panel width the group set stay.
 *
 * Applying (`update`) only writes inputs, never reports and never paints:
 * - `range` / `extent` → `inputs.shared` (a field present as `null` clears it, an absent field
 *   keeps the current value; equal dates change nothing);
 * - `level` → `viewModeOverride` with a `null` zoom anchor (each chart keeps its centre). A level
 *   this chart's `zoomLevels` don't have is ignored: showing its fallback would report a level
 *   the group never chose;
 * - `scrollLeft` → queued on the viewport's `ViewportSync` (`interaction/scroll.ts`); the
 *   scroll-commands region applies it once the timeline of the same patch is painted, with the
 *   echo guard, instead of `initialScroll` when it comes first;
 * - `panelWidth` → `panelW`, neither saved nor reported;
 * - `null` for level, scroll or panel: nothing shared yet, the chart keeps its own.
 *
 * Reporting happens from effects created while joined (never from a paint) and from the event
 * handlers: the natural range (`graph.naturalRange`, core `timelineRange`: the chart's own range
 * and task extent, never the shared timeline it draws) whenever it changes, from the join on;
 * the level when it changes and differs from the group's (a level the group applied is not sent
 * back: the toolbar, keys, API, gestures, fit to screen, `setState()` or a new `options.viewMode`
 * are); the horizontal scroll from the viewport's scroll handler unless it is the echo of a
 * scroll the group caused (`interaction/scroll.ts`); the panel width from the splitter and
 * `setState()`. The group itself drops what its options turn off and values equal to its own.
 */

import {
  type GanttSyncGroup,
  type GanttSyncHandle,
  type GanttSyncMember,
  type GanttSyncState,
  type NaturalTimelineRange,
  type SharedTimelineRange,
} from '@gantryjs/core';
import { batch, createRoot, effect, runWithOwner, untracked, type Owner } from '../reactive';
import { structuralEqual } from '../engine/inputs';
import { viewportSync } from '../interaction/scroll';
import type { LayerContext } from './context';

export interface SyncLayer {
  /**
   * Joins `group` (`null`: leaves the current one; the same group again: nothing). Called inside
   * the connection's sync effect (see the file comment).
   */
  connect(group: GanttSyncGroup | null): void;
  /** The element disconnected: leave the group, drop pending work. */
  disconnect(): void;
  /** The panel width was set locally (splitter, `setState()`): report it to the group. */
  reportPanel(px: number): void;
  /**
   * `level` is the one the group applied (a zoom the user made in another chart): true once, so the
   * announcement skips it — that chart announces it, not every member.
   */
  takeGroupLevel(level: string): boolean;
}

export function createSyncLayer(ctx: LayerContext): SyncLayer {
  const { inputs: I, graph: G, dom } = ctx;
  const viewport = viewportSync(dom.viewport);
  let group: GanttSyncGroup | null = null;
  let handle: GanttSyncHandle | null = null;
  /** The level the group applied last and nobody announced yet */
  let groupLevel: string | null = null;
  /** The reporting effects of the current membership */
  let scope: Owner | null = null;

  /** The zoom level shown, or `null` while the options are invalid (the render reports them) */
  const level = (): string | null => {
    try {
      return G.viewMode();
    } catch {
      return null;
    }
  };
  /** The chart's own range and task extent, or `null` while the options are invalid */
  const naturalRange = (): NaturalTimelineRange | null => {
    try {
      return G.naturalRange();
    } catch {
      return null;
    }
  };
  /** Whether this chart has a zoom level named `name` (invalid options: let the render report them) */
  const hasLevel = (name: string): boolean => {
    try {
      return G.config.peek().zoomLevels.some(l => l.name === name);
    } catch {
      return true;
    }
  };

  /** The group's range and extent in the shared timeline input (absent fields keep their value). */
  const applyShared = (patch: Partial<GanttSyncState>): void => {
    const prev = I.shared.peek();
    const range = 'range' in patch ? (patch.range ?? null) : (prev?.range ?? null);
    const extent = 'extent' in patch ? (patch.extent ?? null) : (prev?.extent ?? null);
    const next: SharedTimelineRange | null = range || extent ? { range, extent } : null;
    if (!structuralEqual(prev, next)) I.shared.set(next);
  };

  /** The group's level, unless the chart shows it already or doesn't have it. */
  const applyLevel = (name: string): void => {
    if (name === I.viewModeOverride.peek() || !hasLevel(name)) return;
    // The next painted timeline's zoom anchoring is the group's correction (`layers/scroll-commands.ts`)
    viewport.groupLevel = true;
    groupLevel = name;
    I.zoomAnchor.set(null);
    I.viewModeOverride.set(name);
  };

  /** One member per chart, for every group it joins: the group sends the shared state here. */
  const member: GanttSyncMember = {
    update(patch) {
      batch(() => {
        if ('range' in patch || 'extent' in patch) applyShared(patch);
        if (typeof patch.level === 'string') applyLevel(patch.level);
        if (patch.panelWidth != null) I.panelW.set(patch.panelWidth);
        if (patch.scrollLeft != null) viewport.queue(patch.scrollLeft);
      });
    },
  };

  /** The effects that report the chart's own changes while it is a member. */
  const reporters = (joined: GanttSyncGroup, link: GanttSyncHandle): void => {
    if (joined.options.range) {
      // The natural range from the join on (it compares dates by value: an equal range sends nothing)
      effect(() => {
        const natural = naturalRange();
        if (natural) untracked(() => link.report({ range: natural.range, extent: natural.extent }));
      });
    }
    if (joined.options.zoom) {
      // The level shown when joining (the group's, when it had one) is not a change
      let shown = untracked(level);
      effect(() => {
        const name = level();
        if (name === null || name === shown) return;
        shown = name;
        if (name !== joined.state.level) untracked(() => link.report({ level: name }));
      });
    }
    if (joined.options.scroll) viewport.report = x => link.report({ scrollLeft: x });
  };

  const leave = (): void => {
    const link = handle;
    if (!link) return;
    handle = null;
    group = null;
    scope?.dispose();
    scope = null;
    viewport.report = null;
    viewport.groupLevel = false;
    groupLevel = null;
    viewport.queue(null);
    link.leave();
    I.shared.set(null);
  };

  return {
    connect(next) {
      if (next === group) return;
      leave();
      if (!next) return;
      group = next;
      // The group sends its state (level, panel, shared range, scroll) to `member` before returning
      const link = (handle = next.join(member));
      // A root: the membership's effects end when the chart leaves, whoever calls `connect`
      scope = createRoot();
      runWithOwner(scope, () => reporters(next, link));
    },
    disconnect: leave,
    takeGroupLevel(level) {
      const fromGroup = level === groupLevel;
      groupLevel = null;
      return fromGroup;
    },
    reportPanel(px) {
      handle?.report({ panelWidth: px });
    },
  };
}

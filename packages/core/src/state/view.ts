// ─────────────────────────────────────────────────────────────
//  gantry · state/view.ts
//  Framework-free view and task-list panel sizing shared by every binding:
//  which view ('split' | 'table' | 'chart') a chart opens in, and how wide
//  the panel is in each view.
// ─────────────────────────────────────────────────────────────

import type { GanttLength, GanttOptions, GanttState, GanttView } from '../types';
import { resolveLength } from '../render/config';

/** Host width assumed before the chart has been measured (px) */
export const DEFAULT_HOST_WIDTH = 1000;
/** Splitter width assumed when it cannot be measured (px) */
export const DEFAULT_SPLITTER_WIDTH = 6;
/** Split-view panel width when `panel.width` is an unparsable length (px) */
export const FALLBACK_PANEL_WIDTH = 320;
/** Room always left to the timeline next to the panel in split view (px) */
export const MIN_TIMELINE_WIDTH = 40;

/** Panel size limits from the resolved config (`cfg.panel`). */
export interface PanelWidthBounds {
  minWidth: number;
  maxWidth?: GanttLength | undefined;
}

/** Panel config that sizes the split view (`cfg.panel` fits as is). */
export interface PanelWidthConfig extends PanelWidthBounds {
  /** Resolved `panel.width` (px or % of the host) */
  width: GanttLength;
}

export interface PanelWidthInput {
  view: GanttView;
  /** Resolved panel config: pass `cfg.panel` */
  panel: PanelWidthConfig;
  /** Width the user dragged / restored (`panelWidthPx`), `null` / `undefined` = none */
  userWidth?: number | null | undefined;
  /** Measured chart width (px); `0` / unmeasured falls back to `DEFAULT_HOST_WIDTH` */
  hostWidth: number;
  /** Measured splitter width (px); `0` / unmeasured falls back to `DEFAULT_SPLITTER_WIDTH` */
  splitterWidth?: number | undefined;
}

/** Width the panel and timeline share in split view: host minus splitter (with measurement fallbacks). */
export function availablePanelWidth(hostWidth: number, splitterWidth?: number): number {
  return (hostWidth || DEFAULT_HOST_WIDTH) - (splitterWidth || DEFAULT_SPLITTER_WIDTH);
}

/**
 * Clamp a split-view panel width to `[minWidth, min(available - 40, maxWidth)]`, rounded to whole px.
 * `maxWidth` may be a % of `available`; `minWidth` wins when the two cross.
 */
export function clampPanelWidth(px: number, bounds: PanelWidthBounds, available: number): number {
  const max = Math.min(available - MIN_TIMELINE_WIDTH, resolveLength(bounds.maxWidth, available, available));
  return Math.round(Math.max(bounds.minWidth, Math.min(px, max)));
}

/**
 * Panel width (px) for a view: the whole host in `'table'`, `0` in `'chart'`, and in `'split'`
 * the user's width (or `panel.width` resolved against the host) clamped by `clampPanelWidth`.
 */
export function resolvePanelWidth(input: PanelWidthInput): number {
  const hostWidth = input.hostWidth || DEFAULT_HOST_WIDTH;
  if (input.view === 'table') return hostWidth;
  if (input.view === 'chart') return 0;
  const width = input.userWidth ?? resolveLength(input.panel.width, hostWidth, FALLBACK_PANEL_WIDTH);
  return clampPanelWidth(width, input.panel, availablePanelWidth(hostWidth, input.splitterWidth));
}

/**
 * View requested by an options object: `view`, else `'chart'` when the panel starts hidden
 * (`panel.collapsed`, else the legacy `panelVisible: false` — as in `resolveConfig`), else `undefined`
 * (keep the current view).
 * Bindings compare it with the previous options' value to re-apply only what the consumer changed.
 */
export function viewFromOptions(options: GanttOptions): GanttView | undefined {
  return options.view ?? ((options.panel?.collapsed ?? options.panelVisible === false) ? 'chart' : undefined);
}

/** View stored in a state snapshot: `view`, else `panelCollapsed` (`'chart'` / `'split'`), else `undefined`. */
export function viewFromState(state: GanttState): GanttView | undefined {
  if (state.view) return state.view;
  if (state.panelCollapsed != null) return state.panelCollapsed ? 'chart' : 'split';
  return undefined;
}

/**
 * View a chart opens in: the saved state (`stateKey` / `setState`) wins over the options,
 * which win over the `'split'` default.
 */
export function resolveInitialView(options: GanttOptions, savedState?: GanttState | null): GanttView {
  return (savedState ? viewFromState(savedState) : undefined) ?? viewFromOptions(options) ?? 'split';
}

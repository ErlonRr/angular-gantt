// ─────────────────────────────────────────────────────────────
//  gantry · render/layout-vars.ts
//  Read-only layout CSS variables on the chart host
//  (`--gantt-row-height`, `--gantt-bar-height`) and row lookup by y.
//  Pure: the bindings write the pairs on the host (WC `:host` sheet,
//  Angular host style map); page CSS and slotted content read them.
// ─────────────────────────────────────────────────────────────

import type { ResolvedGanttConfig } from './config';
import { resolveBarHeight } from './bars';

/** A px length for CSS: at most 3 decimals (`21.599999999999998` → `'21.6px'`), never `-0`. */
const px = (v: number): string => `${Math.round(v * 1000) / 1000 + 0}px`;

/**
 * The read-only layout CSS variables of a resolved config, as `[name, value]` pairs:
 * `--gantt-row-height` = `rowHeight` (the density's unless set) and `--gantt-bar-height` = the
 * task bar height in that row (`resolveBarHeight(bar.height, rowHeight)`: 60 % of the row by
 * default, e.g. `'21.6px'` in a 36 px row). Chart-wide values: group and milestone bars and a
 * task's `style.height` can differ.
 *
 * They are outputs, not inputs: setting them in CSS changes nothing (set `rowHeight` /
 * `bar.height`). Default config → `[['--gantt-row-height', '36px'], ['--gantt-bar-height', '21.6px']]`.
 */
export function layoutCssVars(
  cfg: Pick<ResolvedGanttConfig, 'rowHeight' | 'bar'>,
): ReadonlyArray<readonly [cssVar: string, value: string]> {
  return [
    ['--gantt-row-height', px(cfg.rowHeight)],
    ['--gantt-bar-height', px(resolveBarHeight(cfg.bar.height, cfg.rowHeight))],
  ];
}

/** Index of the row at timeline `y` among `count` rows `rowHeight` tall, or `null` outside them. */
export function rowIndexAtY(y: number, rowHeight: number, count: number): number | null {
  if (!(rowHeight > 0) || !Number.isFinite(y) || y < 0) return null;
  const i = Math.floor(y / rowHeight);
  return i < count ? i : null;
}

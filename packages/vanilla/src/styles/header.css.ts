/**
 * @file header.css.ts
 * Timeline header tiers (`.g-*`): cells, sticky labels, the current period, non-working tint
 * and the today pointer. Class names are shared with Angular. The current-period label uses the
 * derived `--gantt-today-label` (core `todayLabelColor`: readable on the 14 % today tint).
 *
 * Cells, bands and the pointer are positioned by the custom properties the header layer writes
 * through the CSSOM (`--x`, `--w`), so a cell's geometry is two custom properties and never
 * style text.
 */

export const HEADER_CSS = `
    /* ── Header tiers ───────────────────────────────────── */
    .g-header { position: relative; }
    .g-tier { position: absolute; left: 0; right: 0; border-bottom: 1px solid var(--gantt-border); box-sizing: border-box; }
    .g-cell {
      position: absolute; top: 0; bottom: 0; left: var(--x); width: var(--w); box-sizing: border-box;
      display: flex; align-items: center; justify-content: center;
      overflow: clip; white-space: nowrap;
      font-size: calc(var(--gantt-font-size, 13px) - 1px);
      color: var(--gantt-text-sec);
    }
    .g-tier:first-child .g-cell { color: var(--gantt-text); font-weight: 600; font-size: var(--gantt-font-size, 13px); }
    .g-tier--start .g-cell { justify-content: flex-start; }
    .g-cell-label { position: sticky; left: 0; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; max-width: 100%; box-sizing: border-box; }
    .g-cell--current { background: color-mix(in srgb, var(--gantt-today) 14%, transparent); }
    .g-cell--current .g-cell-label { color: var(--gantt-today-label); font-weight: 600; }
    .g-band { position: absolute; top: 0; bottom: 0; left: var(--x); width: var(--w); pointer-events: none; }
    .g-today-pointer {
      position: absolute; bottom: 0; left: var(--x); width: 0; height: 0; margin-left: -5px;
      border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid var(--gantt-today);
    }
`;

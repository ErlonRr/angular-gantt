// ─────────────────────────────────────────────────────────────
//  gantry · render/header.ts
//  Timeline header cells: the left border of a cell. Upper tiers are
//  period delimiters; bottom-tier cells are delimiters only on a major line.
// ─────────────────────────────────────────────────────────────

import type { ResolvedGanttConfig, ResolvedLine } from './config';
import type { TimelineModel } from './timeline';
import type { ScaleCell } from './scales';
import { themeVar } from './paint';

const majorSets = new WeakMap<readonly number[], ReadonlySet<number>>();

function majorSetOf(lines: readonly number[]): ReadonlySet<number> {
  let set = majorSets.get(lines);
  if (!set) {
    set = new Set(lines);
    majorSets.set(lines, set);
  }
  return set;
}

/** The left border of a header cell that is not a period delimiter (or without major lines). */
const PLAIN_BORDER: Readonly<ResolvedLine> = Object.freeze({ paint: themeVar('borderColor'), width: 1 });

/**
 * The left border of a header cell as a line: the major line's paint, width and dash
 * (`gridLines.major`) on a period delimiter — every cell of an upper tier, a bottom-tier cell on a
 * major line — else 1 px of `var(--gantt-border)`; `null` for the first cell (no border). The
 * painters' CSS border (`headerCellBorder`) and the export's SVG line (Phase 12) both read it.
 */
export function headerCellStroke(
  cfg: Pick<ResolvedGanttConfig, 'gridLines'>,
  timeline: Pick<TimelineModel, 'tiers' | 'majorLines'>,
  tierIndex: number,
  cell: Pick<ScaleCell, 'x'>,
): ResolvedLine | null {
  if (cell.x <= 0) return null;
  const major = cfg.gridLines.major;
  const isMajor = tierIndex < timeline.tiers.length - 1 || majorSetOf(timeline.majorLines).has(cell.x);
  return isMajor && major ? major : PLAIN_BORDER;
}

/**
 * CSS `border-left` of a header cell, e.g. `'1px solid var(--gantt-border)'` or
 * `'1px dashed <major paint>'` (`headerCellStroke` as CSS: a dash pattern draws `dashed`);
 * `null` for the first cell (no border).
 */
export function headerCellBorder(
  cfg: Pick<ResolvedGanttConfig, 'gridLines'>,
  timeline: Pick<TimelineModel, 'tiers' | 'majorLines'>,
  tierIndex: number,
  cell: Pick<ScaleCell, 'x'>,
): string | null {
  const line = headerCellStroke(cfg, timeline, tierIndex, cell);
  return line && `${line.width}px ${line.dash ? 'dashed' : 'solid'} ${line.paint}`;
}

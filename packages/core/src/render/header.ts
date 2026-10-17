// ─────────────────────────────────────────────────────────────
//  gantry · render/header.ts
//  Timeline header cells: the left border of a cell. Upper tiers are
//  period delimiters; bottom-tier cells are delimiters only on a major line.
// ─────────────────────────────────────────────────────────────

import type { ResolvedGanttConfig } from './config';
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

/**
 * CSS `border-left` of a header cell, e.g. `'1px solid var(--gantt-border)'` or
 * `'1px dashed <major paint>'`; `null` for the first cell (no border).
 */
export function headerCellBorder(
  cfg: Pick<ResolvedGanttConfig, 'gridLines'>,
  timeline: Pick<TimelineModel, 'tiers' | 'majorLines'>,
  tierIndex: number,
  cell: Pick<ScaleCell, 'x'>,
): string | null {
  if (cell.x <= 0) return null;
  const major = cfg.gridLines.major;
  const isMajor = tierIndex < timeline.tiers.length - 1 || majorSetOf(timeline.majorLines).has(cell.x);
  return isMajor && major
    ? `${major.width}px ${major.dash ? 'dashed' : 'solid'} ${major.paint}`
    : `1px solid ${themeVar('borderColor')}`;
}

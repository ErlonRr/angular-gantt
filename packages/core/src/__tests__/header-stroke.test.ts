// ─────────────────────────────────────────────────────────────
//  Tests — a header cell's left border as a line (`headerCellStroke`,
//  Phase 12: the export draws it as an SVG line) and the CSS border
//  built on it (`headerCellBorder`): the same strings as before
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { headerCellBorder, headerCellStroke } from '../render/header';
import { resolveConfig, type ResolvedGanttConfig } from '../render/config';
import { buildTimeline, type TimelineModel } from '../render/timeline';
import { ViewMode, type GanttOptions, type GanttTask } from '../types';

const NOW = new Date(2026, 2, 4);
const TASKS: GanttTask[] = [
  { id: 'a', name: 'A', start: new Date(2026, 0, 12), end: new Date(2026, 2, 20) },
  { id: 'b', name: 'B', start: new Date(2026, 2, 2), end: new Date(2026, 4, 6) },
];

/** `headerCellBorder` before it was built on `headerCellStroke`. */
function previousBorder(
  cfg: Pick<ResolvedGanttConfig, 'gridLines'>,
  timeline: Pick<TimelineModel, 'tiers' | 'majorLines'>,
  tierIndex: number,
  cell: { x: number },
): string | null {
  if (cell.x <= 0) return null;
  const major = cfg.gridLines.major;
  const isMajor = tierIndex < timeline.tiers.length - 1 || new Set(timeline.majorLines).has(cell.x);
  return isMajor && major
    ? `${major.width}px ${major.dash ? 'dashed' : 'solid'} ${major.paint}`
    : '1px solid var(--gantt-border)';
}

const OPTIONS: GanttOptions[] = [
  {},
  { viewMode: ViewMode.Day },
  { viewMode: ViewMode.Month, gridLines: { major: { color: '#abcdef', dash: '4 2', width: 2 } } },
  { viewMode: ViewMode.Week, gridLines: { major: false } },
  { viewMode: ViewMode.Hour, timelinePadding: 0 },
  { viewMode: ViewMode.Day, gridLines: { majorUnit: 'week' } },
  { viewMode: ViewMode.Quarter },
];

describe('headerCellBorder on headerCellStroke', () => {
  it('gives the same CSS borders as before for every cell of every tier', () => {
    let cells = 0;
    for (const options of OPTIONS) {
      const cfg = resolveConfig(options);
      const timeline = buildTimeline({ tasks: TASKS, config: cfg, now: NOW, viewportWidth: 1500 });
      timeline.tiers.forEach((tier, i) => {
        for (const cell of tier.cells) {
          expect(headerCellBorder(cfg, timeline, i, cell)).toBe(previousBorder(cfg, timeline, i, cell));
          cells++;
        }
      });
    }
    expect(cells).toBeGreaterThan(100);
  });
});

describe('headerCellStroke', () => {
  const cfg = resolveConfig({
    viewMode: ViewMode.Day,
    gridLines: { major: { color: '#abcdef', dash: '4 2', width: 2 } },
  });
  const timeline = buildTimeline({ tasks: TASKS, config: cfg, now: NOW });
  const bottom = timeline.tiers.length - 1;

  it('null for the first cell', () => {
    expect(headerCellStroke(cfg, timeline, bottom, { x: 0 })).toBeNull();
    expect(headerCellStroke(cfg, timeline, 0, { x: -4 })).toBeNull();
  });

  it('the major line on period delimiters: every upper-tier cell, bottom cells on a major line', () => {
    const major = { paint: '#abcdef', width: 2, dash: '4 2' };
    const upper = timeline.tiers[0].cells[1];
    expect(headerCellStroke(cfg, timeline, 0, upper)).toEqual(major);
    const onMajor = timeline.tiers[bottom].cells.find(c => timeline.majorLines.includes(c.x))!;
    expect(headerCellStroke(cfg, timeline, bottom, onMajor)).toEqual(major);
  });

  it('1 px of the border token elsewhere, and everywhere without major lines', () => {
    const plain = { paint: 'var(--gantt-border)', width: 1 };
    const cell = timeline.tiers[bottom].cells.find(c => c.x > 0 && !timeline.majorLines.includes(c.x))!;
    expect(headerCellStroke(cfg, timeline, bottom, cell)).toEqual(plain);
    const none = resolveConfig({ viewMode: ViewMode.Day, gridLines: { major: false } });
    expect(headerCellStroke(none, timeline, 0, timeline.tiers[0].cells[1])).toEqual(plain);
  });

  it('the default major line is the major grid token, solid', () => {
    const def = resolveConfig({ viewMode: ViewMode.Day });
    const tl = buildTimeline({ tasks: TASKS, config: def, now: NOW });
    expect(headerCellStroke(def, tl, 0, tl.tiers[0].cells[1])).toMatchObject({
      paint: 'var(--gantt-grid-line-major)',
      width: 1,
    });
    expect(headerCellStroke(def, tl, 0, tl.tiers[0].cells[1])!.dash).toBeUndefined();
  });
});

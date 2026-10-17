// ─────────────────────────────────────────────────────────────
//  Tests — Hour view in any time zone: scale cells are local dates,
//  so an hour boundary that falls on UTC midnight (16:00 in
//  Los Angeles, 10:30/11:00 on Lord Howe) is not read as a date-only value.
//  Run with `pnpm test:tz`.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../render/timeline';
import { resolveConfig } from '../render/config';
import { calendarDays } from '../gantt-math';
import type { GanttTask } from '../types';

const config = resolveConfig({ viewMode: 'Hour' });

function hourTimeline(tasks: GanttTask[]) {
  return buildTimeline({ tasks, config, now: new Date(2026, 2, 10, 12) });
}

describe('Hour view', () => {
  // Every local hour of every day, including a task that starts on the half hour
  const starts = Array.from({ length: 24 }, (_, h) => new Date(2026, 2, 10, h, 30));

  it.each(starts.map(d => [d.getHours(), d] as const))('cells are contiguous with a task at %i:30', (_h, start) => {
    const tl = hourTimeline([{ id: 'a', name: 'A', start, end: new Date(2026, 2, 12, 18), progress: 0 }]);
    const cells = tl.tiers.at(-1)!.cells;
    expect(cells[0].x).toBe(0);
    for (let i = 1; i < cells.length; i++) {
      expect(cells[i].x).toBe(cells[i - 1].x + cells[i - 1].width);
      expect(cells[i].start.getTime()).toBe(cells[i - 1].end.getTime());
    }
    expect(cells.at(-1)!.x + cells.at(-1)!.width).toBe(tl.totalWidth);
  });

  it('keeps one cell per local hour, with sorted grid lines', () => {
    const tl = hourTimeline([
      { id: 'a', name: 'A', start: new Date(2026, 2, 10, 9), end: new Date(2026, 2, 11, 18), progress: 0 },
    ]);
    const cells = tl.tiers.at(-1)!.cells;
    const hours = Math.round((tl.end.getTime() - tl.start.getTime()) / 3_600_000);
    expect(cells).toHaveLength(hours);
    // Cell widths follow the length of their local day (23 h / 25 h days on DST changes)
    for (const c of cells) {
      const dayHours = Math.round(
        (new Date(c.start.getFullYear(), c.start.getMonth(), c.start.getDate() + 1).getTime() -
          new Date(c.start.getFullYear(), c.start.getMonth(), c.start.getDate()).getTime()) /
          3_600_000,
      );
      expect(Math.abs(c.width - config.pxPerDay / dayHours)).toBeLessThanOrEqual(1);
    }
    const lines = [...tl.minorLines, ...tl.majorLines].sort((a, b) => a - b);
    expect(tl.minorLines).toEqual([...tl.minorLines].sort((a, b) => a - b));
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('places today at its local hour', () => {
    for (let h = 0; h < 24; h++) {
      const now = new Date(2026, 2, 10, h);
      const tl = buildTimeline({
        tasks: [{ id: 'a', name: 'A', start: new Date(2026, 2, 9), end: new Date(2026, 2, 12), progress: 0 }],
        config,
        now,
      });
      expect(tl.todayX).toBe(Math.round((calendarDays(now, false) - calendarDays(tl.start, false)) * config.pxPerDay));
    }
  });

  it('ends every hour cell on a whole hour, even after a 30-minute DST jump (Lord Howe, 4 Oct 2026)', () => {
    const tl = hourTimeline([
      { id: 'a', name: 'A', start: new Date(2026, 9, 3, 20), end: new Date(2026, 9, 5, 6), progress: 0 },
    ]);
    const cells = tl.tiers.at(-1)!.cells;
    // Only the boundary inside the skipped half hour (02:00 → 02:30) may fall off the hour; before
    // the fix every later cell ran from hh:30 to hh+1:30
    expect(cells.filter(c => c.start.getMinutes() !== 0).length).toBeLessThanOrEqual(1);
    expect(cells.filter(c => c.end.getMinutes() !== 0).length).toBeLessThanOrEqual(1);
  });
});

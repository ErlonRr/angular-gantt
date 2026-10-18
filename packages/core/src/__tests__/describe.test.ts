// ─────────────────────────────────────────────────────────────
//  Tests — a11y/describe.ts (accessible task names)
//  (runs under test:tz: dates are built with new Date(y, m, d))
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { taskAccessibleName, taskDateRange } from '../a11y/describe';
import { TaskType, type GanttTask } from '../types';

const day = (y: number, m: number, d: number) => new Date(y, m, d);
const task = (extra: Partial<GanttTask> = {}): GanttTask => ({
  id: 'be',
  name: 'Backend',
  start: day(2026, 1, 10),
  end: day(2026, 2, 20),
  progress: 65,
  ...extra,
});

describe('taskDateRange', () => {
  it('compact range within a year, full dates across years, one date when equal', () => {
    expect(taskDateRange(task())).toBe('10 Feb – 20 Mar 2026');
    expect(taskDateRange(task({ start: day(2025, 11, 29) }))).toBe('29 Dec 2025 – 20 Mar 2026');
    expect(taskDateRange(task({ end: day(2026, 1, 10) }))).toBe('10 Feb 2026');
  });

  it('reads date-only (UTC midnight) values as local days', () => {
    const t = { start: new Date(Date.UTC(2026, 1, 10)), end: new Date(Date.UTC(2026, 2, 20)) };
    expect(taskDateRange(t)).toBe('10 Feb – 20 Mar 2026');
  });

  it('adds the time of day when either date is not at midnight', () => {
    const at = (d: number, h: number, min = 0) => new Date(2026, 2, d, h, min);
    expect(taskDateRange({ start: at(10, 9), end: at(10, 12, 30) })).toBe('10 Mar 2026 09:00 – 12:30');
    expect(taskDateRange({ start: at(10, 9), end: at(12, 0) })).toBe('10 Mar 09:00 – 12 Mar 2026 00:00');
    expect(taskDateRange({ start: at(10, 9), end: at(10, 9) })).toBe('10 Mar 2026 09:00');
    expect(taskAccessibleName({ task: { id: 'd', name: 'Deploy', start: at(10, 9), end: at(10, 12) } })).toBe(
      'Deploy, Task, 10 Mar 2026 09:00 – 12:00, 0% complete',
    );
  });

  it('takes its compact formats from the labels', () => {
    const labels = { ariaDateFormatShort: 'M月D日', ariaDateFormatLong: 'YYYY年M月D日', ariaTimeFormat: 'H時' };
    expect(taskDateRange(task(), { labels })).toBe('2月10日 – 2026年3月20日');
    expect(taskDateRange({ start: new Date(2026, 2, 10, 9), end: new Date(2026, 2, 10, 12) }, { labels })).toBe(
      '2026年3月10日 9時 – 12時',
    );
  });

  it('uses a given dateFormat on both ends', () => {
    expect(taskDateRange(task(), { dateFormat: 'MMM D, YYYY' })).toBe('Feb 10, 2026 – Mar 20, 2026');
  });
});

describe('taskAccessibleName', () => {
  it('name, type, dates, progress, critical', () => {
    expect(taskAccessibleName({ task: task() }, { critical: true })).toBe(
      'Backend, Task, 10 Feb – 20 Mar 2026, 65% complete, critical',
    );
  });

  it('mentions a drawn baseline', () => {
    expect(taskAccessibleName({ task: task() }, { baseline: true, critical: true })).toBe(
      'Backend, Task, 10 Feb – 20 Mar 2026, 65% complete, critical, planned baseline shown',
    );
  });

  it('never mentions the baseline for milestones', () => {
    const go = task({ name: 'Go', type: TaskType.Milestone, end: day(2026, 1, 10) });
    expect(taskAccessibleName({ task: go }, { baseline: true })).toBe('Go, Milestone, 10 Feb 2026');
    expect(taskAccessibleName({ task: task({ name: 'Go' }), barType: 'milestone' }, { baseline: true })).toBe(
      'Go, Milestone, 10 Feb – 20 Mar 2026',
    );
  });

  it('uses the type rule of the type column', () => {
    expect(taskAccessibleName({ task: task(), hasChildren: true })).toMatch(/^Backend, Group, /);
    expect(taskAccessibleName({ task: task({ type: TaskType.Milestone, end: day(2026, 1, 10) }) })).toBe(
      'Backend, Milestone, 10 Feb 2026',
    );
    expect(taskAccessibleName({ task: task(), barType: 'risk' })).toMatch(/^Backend, risk, /);
  });

  it('adds the status when now is given, or when the task has one', () => {
    expect(taskAccessibleName({ task: task() }, { now: day(2026, 3, 1) })).toBe(
      'Backend, Task, 10 Feb – 20 Mar 2026, 65% complete, Overdue',
    );
    expect(taskAccessibleName({ task: task() }, { now: day(2026, 2, 1) })).toMatch(/, In progress$/);
    expect(taskAccessibleName({ task: task({ status: 'Blocked' }) })).toMatch(/, Blocked$/);
    // inclusive ends: the task runs through 20 Mar
    expect(
      taskAccessibleName(
        { task: task() },
        { now: day(2026, 2, 20), dates: { endDateMode: 'inclusive', normalizeDateOnly: true } },
      ),
    ).toMatch(/, In progress$/);
  });

  it('is translatable', () => {
    const name = taskAccessibleName(
      { task: task() },
      {
        critical: true,
        locale: 'en',
        labels: {
          typeTask: 'attività',
          ariaProgress: p => `${p}% completata`,
          ariaCritical: 'critica',
          ariaDateRange: (s, e) => `dal ${s} al ${e}`,
        },
      },
    );
    expect(name).toBe('Backend, attività, dal 10 Feb al 20 Mar 2026, 65% completata, critica');
  });

  it('clamps progress and can leave it out', () => {
    expect(taskAccessibleName({ task: task({ progress: 140 }) })).toMatch(/100% complete$/);
    expect(taskAccessibleName({ task: task({ progress: undefined }) })).toMatch(/0% complete$/);
    expect(taskAccessibleName({ task: task() }, { progress: false })).toBe('Backend, Task, 10 Feb – 20 Mar 2026');
  });
});

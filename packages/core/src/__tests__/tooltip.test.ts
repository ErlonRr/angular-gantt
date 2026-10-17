import { describe, it, expect } from 'vitest';
import { DEFAULT_LABELS, DependencyType, TaskType, type GanttTask } from '../types';
import { formatDate } from '../gantt-math';
import { baselineVarianceDays, buildTooltipModel, type TooltipInput } from '../state/tooltip';

const FMT = 'MMM D, YYYY';
const exclusive = { endDateMode: 'exclusive', normalizeDateOnly: true } as const;

const task = (over: Partial<GanttTask> = {}): GanttTask => ({
  id: 'a',
  name: 'Design',
  start: new Date(2025, 0, 6),
  end: new Date(2025, 0, 9),
  progress: 40,
  ...over,
});

const input = (over: Partial<TooltipInput> = {}): TooltipInput => ({
  task: task(),
  config: { ...exclusive, baseline: false },
  labels: DEFAULT_LABELS,
  dateFormat: FMT,
  now: new Date(2025, 0, 7, 12),
  ...over,
});

describe('buildTooltipModel', () => {
  it('lists start, end, duration and progress for a task (the content both painters show today)', () => {
    const m = buildTooltipModel(input());
    expect(m.title).toBe('Design');
    expect(m.kind).toBe('task');
    expect(m.rows).toEqual([
      { label: 'Start', value: formatDate(new Date(2025, 0, 6), FMT), kind: 'date' },
      { label: 'End', value: formatDate(new Date(2025, 0, 9), FMT), kind: 'date' },
      { label: 'Duration', value: '3 days', kind: 'duration' },
      { label: 'Progress', value: '40%', kind: 'progress' },
    ]);
    expect(m.progress).toBe(40);
    expect(m.status).toBe('inProgress');
    expect(m.critical).toBe(false);
    expect(m.baselineVariance).toBeNull();
    expect(m.predecessors).toEqual([]);
    expect(m.successors).toEqual([]);
  });

  it('reads the duration like the bar: an inclusive end counts its last day', () => {
    const m = buildTooltipModel(
      input({ config: { endDateMode: 'inclusive', normalizeDateOnly: true, baseline: false } }),
    );
    expect(m.rows.find(r => r.kind === 'duration')?.value).toBe('4 days');
  });

  it('shows a single date for a milestone and no progress bar', () => {
    const m = buildTooltipModel(
      input({ task: task({ type: TaskType.Milestone, end: new Date(2025, 0, 6), progress: 80 }) }),
    );
    expect(m.kind).toBe('milestone');
    expect(m.progress).toBeNull();
    expect(m.rows).toEqual([{ label: 'Milestone', value: formatDate(new Date(2025, 0, 6), FMT), kind: 'date' }]);
  });

  it('clamps the progress and defaults a missing one to 0', () => {
    expect(buildTooltipModel(input({ task: task({ progress: 140 }) })).progress).toBe(100);
    expect(buildTooltipModel(input({ task: task({ progress: -5 }) })).progress).toBe(0);
    const none = buildTooltipModel(input({ task: task({ progress: undefined }) }));
    expect(none.progress).toBe(0);
    expect(none.rows.find(r => r.kind === 'progress')?.value).toBe('0%');
  });

  it('is a group by type or when the row has children', () => {
    expect(buildTooltipModel(input({ task: task({ type: TaskType.Group }) })).kind).toBe('group');
    expect(buildTooltipModel(input({ hasChildren: true })).kind).toBe('group');
    expect(buildTooltipModel(input({ task: task({ type: TaskType.Task }), hasChildren: true })).kind).toBe('task');
  });

  it('follows the bar type when the task has no type (the type column rule)', () => {
    const fromRow = buildTooltipModel(input({ barType: 'milestone' }));
    expect(fromRow.kind).toBe('milestone');
    expect(fromRow.progress).toBeNull();
    expect(fromRow.rows.map(r => r.label)).toEqual(['Milestone']);
    expect(buildTooltipModel(input({ task: task({ barType: 'milestone' }) })).kind).toBe('milestone');
    expect(buildTooltipModel(input({ barType: 'group' })).kind).toBe('group');
    // An explicit type and children win over the bar type; an unknown bar type is a task
    expect(buildTooltipModel(input({ task: task({ type: TaskType.Task }), barType: 'milestone' })).kind).toBe('task');
    expect(buildTooltipModel(input({ hasChildren: true, barType: 'milestone' })).kind).toBe('group');
    expect(buildTooltipModel(input({ barType: 'custom' })).kind).toBe('task');
  });

  it('formats dates with the locale and format given', () => {
    const m = buildTooltipModel(input({ dateFormat: 'YYYY-MM-DD' }));
    expect(m.rows[0]?.value).toBe('2025-01-06');
  });

  it('adds a translated status row on request', () => {
    const m = buildTooltipModel(input({ showStatus: true, now: new Date(2025, 0, 20) }));
    expect(m.status).toBe('overdue');
    expect(m.rows.find(r => r.kind === 'status')).toEqual({ label: 'Status', value: 'Overdue', kind: 'status' });
    expect(buildTooltipModel(input()).rows.some(r => r.kind === 'status')).toBe(false);
  });

  it('marks a critical task and shows its float', () => {
    const m = buildTooltipModel(
      input({ criticalIds: new Set(['a']), floatDays: new Map([['a', 0]]), labels: { ...DEFAULT_LABELS } }),
    );
    expect(m.critical).toBe(true);
    expect(m.rows.filter(r => r.kind === 'critical' || r.kind === 'float')).toEqual([
      { label: 'Critical path', value: 'Yes', kind: 'critical' },
      { label: 'Float', value: '0d', kind: 'float' },
    ]);
    const slack = buildTooltipModel(input({ criticalIds: new Set(['b']), floatDays: new Map([['a', 2.04]]) }));
    expect(slack.critical).toBe(false);
    expect(slack.rows.find(r => r.kind === 'float')?.value).toBe('2d');
  });

  it('rounds a negative float and never shows -0', () => {
    const floatOf = (days: number) =>
      buildTooltipModel(input({ floatDays: new Map([['a', days]]) })).rows.find(r => r.kind === 'float')?.value;
    expect(floatOf(-1.96)).toBe('-2d');
    const seen: number[] = [];
    buildTooltipModel(
      input({
        floatDays: new Map([['a', -0.04]]),
        labels: {
          ...DEFAULT_LABELS,
          ttFloatDays: d => {
            seen.push(d);
            return `${d}d`;
          },
        },
      }),
    );
    expect(Object.is(seen[0], 0)).toBe(true);
  });

  it('leaves the float out for a group', () => {
    const m = buildTooltipModel(input({ hasChildren: true, floatDays: new Map([['a', 2]]) }));
    expect(m.rows.some(r => r.kind === 'float')).toBe(false);
  });

  it('uses overridden tooltip-only labels', () => {
    const m = buildTooltipModel(
      input({
        criticalIds: new Set(['a']),
        floatDays: new Map([['a', 3]]),
        labels: {
          ...DEFAULT_LABELS,
          ttCritical: 'Kritisch',
          ttFloatDays: d => `${d} Tage`,
        },
      }),
    );
    expect(m.rows.find(r => r.kind === 'critical')).toEqual({ label: 'Kritisch', value: 'Yes', kind: 'critical' });
    expect(m.rows.find(r => r.kind === 'float')?.value).toBe('3 Tage');
  });

  it('shows the baseline and its finish variance when the baseline option is on', () => {
    const t = task({ baseline: { start: new Date(2025, 0, 6), end: new Date(2025, 0, 7) } });
    const m = buildTooltipModel(input({ task: t, config: { ...exclusive, baseline: true } }));
    expect(m.baselineVariance).toBe('+2d');
    expect(m.rows.filter(r => r.kind === 'baseline')).toEqual([
      { label: 'Baseline start', value: formatDate(new Date(2025, 0, 6), FMT), kind: 'baseline' },
      { label: 'Baseline end', value: formatDate(new Date(2025, 0, 7), FMT), kind: 'baseline' },
      { label: 'Variance', value: '+2d', kind: 'baseline' },
    ]);
    const off = buildTooltipModel(input({ task: t, config: { ...exclusive, baseline: false } }));
    expect(off.baselineVariance).toBeNull();
    expect(off.rows.some(r => r.kind === 'baseline')).toBe(false);
  });

  it('shows one baseline date for a milestone', () => {
    const t = task({
      type: TaskType.Milestone,
      end: new Date(2025, 0, 6),
      baseline: { start: new Date(2025, 0, 6), end: new Date(2025, 0, 6) },
    });
    const m = buildTooltipModel(input({ task: t, config: { ...exclusive, baseline: true } }));
    expect(m.baselineVariance).toBe('On schedule');
    expect(m.rows.filter(r => r.kind === 'baseline').map(r => r.label)).toEqual(['Baseline start', 'Variance']);
  });

  it('requires the baseline flag, so a painter cannot forget it (the chart defaults it to off)', () => {
    // @ts-expect-error -- `baseline` is required
    const config: TooltipInput['config'] = { ...exclusive };
    const t = task({ baseline: { start: new Date(2025, 0, 6), end: new Date(2025, 0, 7) } });
    const m = buildTooltipModel(input({ task: t, config }));
    expect(m.baselineVariance).toBeNull();
    expect(m.rows.some(r => r.kind === 'baseline')).toBe(false);
  });

  it('computes the variance across a DST change in whole days', () => {
    const t = {
      start: new Date(2025, 2, 1),
      end: new Date(2025, 3, 10),
      baseline: { start: new Date(2025, 2, 1), end: new Date(2025, 2, 25) },
    };
    expect(baselineVarianceDays(t, exclusive)).toBe(16);
    expect(baselineVarianceDays({ start: t.start, end: t.end }, exclusive)).toBeNull();
  });

  it('lists predecessors and successors with their dependency type and lag', () => {
    const a = task({ id: 'a', name: 'Design' });
    const b = task({ id: 'b', name: 'Build', dependency: [{ taskId: 'a', type: DependencyType.SS, lag: 2 }] });
    const c = task({ id: 'c', name: 'Test', dependency: 'b' });
    const d = task({ id: 'd', name: 'Ship', dependency: { taskId: 'missing' } });
    const tasksById = new Map([a, b, c, d].map(t => [t.id, t]));

    const mb = buildTooltipModel(input({ task: b, tasksById }));
    expect(mb.predecessors).toEqual(['Design (SS+2d)']);
    expect(mb.successors).toEqual(['Test']);
    expect(mb.rows.filter(r => r.kind === 'deps')).toEqual([
      { label: 'Predecessors', value: 'Design (SS+2d)', kind: 'deps' },
      { label: 'Successors', value: 'Test', kind: 'deps' },
    ]);
    expect(buildTooltipModel(input({ task: a, tasksById })).successors).toEqual(['Build (SS+2d)']);
    // Unknown predecessor: its id; no lookup table: ids and no successors
    expect(buildTooltipModel(input({ task: d, tasksById })).predecessors).toEqual(['missing']);
    const bare = buildTooltipModel(input({ task: c }));
    expect(bare.predecessors).toEqual(['b']);
    expect(bare.successors).toEqual([]);
  });

  it('does not list a task as its own successor', () => {
    const self = task({ id: 'a', name: 'Design', dependency: 'a' });
    const m = buildTooltipModel(input({ task: self, tasksById: new Map([['a', self]]) }));
    expect(m.predecessors).toEqual(['Design']);
    expect(m.successors).toEqual([]);
  });

  it('keeps the row order both painters rely on when every optional row is present', () => {
    const a = task({
      id: 'a',
      name: 'Design',
      dependency: 'p',
      baseline: { start: new Date(2025, 0, 6), end: new Date(2025, 0, 7) },
    });
    const p = task({ id: 'p', name: 'Plan' });
    const s = task({ id: 's', name: 'Build', dependency: 'a' });
    const m = buildTooltipModel(
      input({
        task: a,
        config: { ...exclusive, baseline: true },
        showStatus: true,
        criticalIds: new Set(['a']),
        floatDays: new Map([['a', 0]]),
        tasksById: new Map([a, p, s].map(t => [t.id, t])),
      }),
    );
    expect(m.rows.map(r => r.kind)).toEqual([
      'date',
      'date',
      'duration',
      'progress',
      'status',
      'critical',
      'float',
      'baseline',
      'baseline',
      'baseline',
      'deps',
      'deps',
    ]);
    expect(m.rows.slice(-2).map(r => r.label)).toEqual(['Predecessors', 'Successors']);
  });

  it('fills the progress like the bar: theme tokens or the task colour', () => {
    const m = buildTooltipModel(input());
    expect(m.paint).toEqual({ progress: 'var(--gantt-bar)' });
    expect(m.critical).toBe(false);
    expect(buildTooltipModel(input({ task: task({ barColor: '#ff0000' }) })).paint.progress).toBe('#ff0000');
    // A critical bar is filled with the critical colour, over its own bar colour
    const critical = buildTooltipModel(input({ task: task({ barColor: '#ff0000' }), criticalIds: new Set(['a']) }));
    expect(critical.critical).toBe(true);
    expect(critical.paint.progress).toBe('var(--gantt-critical)');
  });

  it('is pure: the same input gives the same model', () => {
    const i = input({ criticalIds: new Set(['a']) });
    expect(buildTooltipModel(i)).toEqual(buildTooltipModel(i));
  });
});

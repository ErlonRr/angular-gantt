// Task styles (Phase 10, D9/D10): merging layers, the deprecated flat fields as a style, and
// the per-row resolver with the cascade theme < kind < parent < level < rollup colour < rule <
// flat fields < task.style (className accumulates).
import { describe, it, expect, vi } from 'vitest';
import {
  EMPTY_TASK_STYLE,
  TaskType,
  createStyleResolver,
  filterVisible,
  flattenTree,
  mergeTaskStyles,
  reindexVisible,
  resolveConfig,
  sameTaskStyle,
  taskAliasStyle,
  taskOwnStyle,
  type GanttFlatRow,
  type GanttOptions,
  type GanttRollupInfo,
  type GanttStyleOptions,
  type GanttStyleRuleContext,
  type GanttTask,
  type StyleResolverInput,
} from '../index';

const NOW = new Date(2026, 0, 14, 10);

const task = (id: string, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: `Task ${id}`,
  start: new Date(2026, 0, 12),
  end: new Date(2026, 0, 20),
  ...extra,
});

/** g (group) > p (plain parent) > c (child); m (milestone); e (custom bar type); r (root task) */
const TASKS: GanttTask[] = [
  task('g', { type: TaskType.Group }),
  task('p', { parentId: 'g' }),
  task('c', { parentId: 'p' }),
  task('m', { type: TaskType.Milestone, start: new Date(2026, 0, 15), end: new Date(2026, 0, 15) }),
  task('e', { barType: 'epic' }),
  task('r'),
];

const rowsOf = (tasks: GanttTask[]): GanttFlatRow[] => reindexVisible(filterVisible(flattenTree(tasks, new Set())));

function resolver(
  styles: GanttStyleOptions | undefined,
  tasks: GanttTask[] = TASKS,
  extra: Partial<StyleResolverInput> & { options?: GanttOptions } = {},
) {
  const { options, ...rest } = extra;
  const config = resolveConfig({ ...options, ...(styles && { styles }) });
  const resolve = createStyleResolver({ config, now: NOW, ...rest });
  const rows = new Map(rowsOf(tasks).map(r => [r.task.id, r]));
  const row = (id: string) => rows.get(id)!;
  return { resolve, row, of: (id: string) => resolve(row(id)) };
}

const info = (over: Partial<GanttRollupInfo> = {}): GanttRollupInfo => ({
  progress: null,
  start: null,
  end: null,
  status: 'inProgress',
  color: null,
  children: [],
  ...over,
});

describe('mergeTaskStyles', () => {
  it('merges field by field, later layers winning; unset fields fall through', () => {
    expect(
      mergeTaskStyles({ color: 'red', textColor: 'white', height: 20 }, { color: 'blue', radius: 0 }, undefined, null, {
        label: 'left',
        progressColor: 'green',
        rowColor: 'pink',
      }),
    ).toEqual({
      color: 'blue',
      textColor: 'white',
      height: 20,
      radius: 0,
      label: 'left',
      progressColor: 'green',
      rowColor: 'pink',
    });
  });

  it('an undefined or null field does not override (0 and empty values set by a layer do)', () => {
    const merged = mergeTaskStyles(
      { color: 'red', radius: 4, height: '50%' },
      { color: undefined, radius: null as unknown as number, height: undefined },
    );
    expect(merged).toEqual({ color: 'red', radius: 4, height: '50%' });
    expect(mergeTaskStyles({ radius: 4 }, { radius: 0 })).toEqual({ radius: 0 });
  });

  it('accumulates className across layers, in order, each class once, whitespace normalised', () => {
    expect(mergeTaskStyles({ className: 'a b' }, { className: ' b  c ' }, {}, { className: 'a d' })).toEqual({
      className: 'a b c d',
    });
    expect(mergeTaskStyles({ className: '' }, { className: '  ' })).toBe(EMPTY_TASK_STYLE);
  });

  it('gives the shared, frozen empty style when nothing is set', () => {
    expect(mergeTaskStyles()).toBe(EMPTY_TASK_STYLE);
    expect(mergeTaskStyles(null, undefined, {}, { color: undefined })).toBe(EMPTY_TASK_STYLE);
    expect(Object.isFrozen(EMPTY_TASK_STYLE)).toBe(true);
    expect(EMPTY_TASK_STYLE).toEqual({});
  });

  it('never mutates its layers', () => {
    const a = { color: 'red', className: 'x' };
    const b = { color: 'blue', className: 'y' };
    const out = mergeTaskStyles(a, b);
    expect(a).toEqual({ color: 'red', className: 'x' });
    expect(b).toEqual({ color: 'blue', className: 'y' });
    expect(out).not.toBe(a);
    expect(out).not.toBe(b);
  });
});

describe('taskAliasStyle / taskOwnStyle', () => {
  it('maps the deprecated flat fields onto the style fields', () => {
    expect(
      taskAliasStyle(
        task('a', { barColor: '#111', progressColor: '#222', textColor: '#333', rowColor: '#444', className: 'k' }),
      ),
    ).toEqual({ color: '#111', progressColor: '#222', textColor: '#333', rowColor: '#444', className: 'k' });
    expect(taskAliasStyle(task('a'))).toBe(EMPTY_TASK_STYLE);
  });

  it('task.style wins over the flat fields, field by field; both classes apply', () => {
    const t = task('a', {
      barColor: '#111',
      rowColor: '#444',
      className: 'old',
      style: { color: '#999', className: 'new old', height: 12 },
    });
    expect(taskOwnStyle(t)).toEqual({ color: '#999', rowColor: '#444', className: 'old new', height: 12 });
    expect(taskOwnStyle(task('a'))).toBe(EMPTY_TASK_STYLE);
    expect(taskOwnStyle(task('a', { style: {} }))).toBe(EMPTY_TASK_STYLE);
  });
});

describe('sameTaskStyle', () => {
  it('compares every field and the classes, not the object', () => {
    const a = {
      color: '#111',
      progressColor: '#222',
      height: '70%',
      radius: 2,
      label: 'left',
      className: 'x y',
    } as const;
    expect(sameTaskStyle(a, { ...a })).toBe(true);
    expect(sameTaskStyle(EMPTY_TASK_STYLE, {})).toBe(true);
    for (const [key, value] of [
      ['color', '#000'],
      ['progressColor', '#000'],
      ['textColor', '#000'],
      ['rowColor', '#000'],
      ['height', '60%'],
      ['radius', 3],
      ['label', 'right'],
      ['className', 'x'],
    ] as const) {
      expect(sameTaskStyle(a, { ...a, [key]: value }), key).toBe(false);
    }
  });

  it('undefined (no resolved style) equals only undefined', () => {
    expect(sameTaskStyle(undefined, undefined)).toBe(true);
    expect(sameTaskStyle(undefined, EMPTY_TASK_STYLE)).toBe(false);
    expect(sameTaskStyle(EMPTY_TASK_STYLE, null)).toBe(false);
  });

  it('holds for the same row rebuilt: a new resolved object with the same fields', () => {
    const styles: GanttStyleOptions = { task: { progressColor: '#0EA5E9' } };
    const first = resolver(styles).of('r');
    const again = resolver(styles).of('r');
    expect(again).not.toBe(first);
    expect(sameTaskStyle(first, again)).toBe(true);
    expect(sameTaskStyle(first, resolver({ task: { progressColor: '#22C55E' } }).of('r'))).toBe(false);
  });
});

describe('createStyleResolver — precedence (D10)', () => {
  /** Every layer sets `color` to its own name, so the winner is visible. */
  const ALL: GanttStyleOptions = {
    task: { color: 'kind' },
    group: { color: 'kind' },
    milestone: { color: 'kind' },
    parent: { color: 'parent' },
    levels: [{ color: 'level' }, { color: 'level' }, { color: 'level' }],
    rule: () => ({ color: 'rule' }),
  };
  const ROLLUPS = new Map([
    ['g', info({ color: 'rollup' })],
    ['p', info({ color: 'rollup' })],
  ]);
  const own = { barColor: 'alias', style: { color: 'style' } };

  it('peels the layers one by one: task.style > flat fields > rule > rollup > level > parent > kind > theme', () => {
    const tasks = TASKS.map(t => (t.id === 'p' ? { ...t, ...own } : t));
    const layers: [string, GanttStyleOptions, GanttTask[], ReadonlyMap<string, GanttRollupInfo> | null][] = [
      ['style', ALL, tasks, ROLLUPS],
      ['alias', ALL, TASKS.map(t => (t.id === 'p' ? { ...t, barColor: 'alias' } : t)), ROLLUPS],
      ['rule', ALL, TASKS, ROLLUPS],
      ['rollup', { ...ALL, rule: undefined }, TASKS, ROLLUPS],
      ['level', { ...ALL, rule: undefined }, TASKS, null],
      ['parent', { ...ALL, rule: undefined, levels: undefined }, TASKS, null],
      ['kind', { task: ALL.task }, TASKS, null],
    ];
    for (const [winner, styles, ts, rollups] of layers) {
      expect(resolver(styles, ts, { rollups }).of('p').color, winner).toBe(winner);
    }
    // No layer: the theme (no colour in the style)
    expect(resolver(undefined).of('p').color).toBeUndefined();
  });

  it('every field follows the same order, independently of the others', () => {
    const { of } = resolver(
      {
        task: { color: 'k', textColor: 'k', height: 10, radius: 1, label: 'left', className: 'kind' },
        levels: [{ textColor: 'l', radius: 2 }],
        rule: () => ({ radius: 3, progressColor: 'r' }),
      },
      [task('a', { rowColor: 'alias-row', style: { label: 'none', className: 'own' } })],
    );
    expect(of('a')).toEqual({
      color: 'k',
      textColor: 'l',
      height: 10,
      radius: 3,
      progressColor: 'r',
      rowColor: 'alias-row',
      label: 'none',
      className: 'kind own',
    });
  });

  it('className accumulates through every layer, each class once', () => {
    const { of } = resolver(
      {
        task: { className: 'k shared' },
        parent: { className: 'p' },
        levels: [null, { className: 'l1 shared' }],
        rule: () => ({ className: 'r' }),
      },
      TASKS.map(t => (t.id === 'p' ? { ...t, className: 'alias', style: { className: 'own k' } } : t)),
      { rollups: new Map([['p', info({ color: '#123456' })]]) },
    );
    expect(of('p').className).toBe('k shared p l1 r alias own');
    expect(of('p').color).toBe('#123456');
  });

  it('kind layers follow the bar kind: group, milestone, task (custom bar types are tasks)', () => {
    const { of } = resolver({ task: { color: 'T' }, group: { color: 'G' }, milestone: { color: 'M' } });
    expect(of('g').color).toBe('G');
    expect(of('m').color).toBe('M');
    expect(of('r').color).toBe('T');
    expect(of('e').color).toBe('T');
    // A plain task with children is still a task bar
    expect(of('p').color).toBe('T');
  });

  it('parent styles every row with children, whatever its kind', () => {
    const { of } = resolver({ parent: { rowColor: 'P' } });
    expect(['g', 'p', 'c', 'm', 'e', 'r'].map(id => of(id).rowColor)).toEqual([
      'P',
      'P',
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('levels match the exact depth; holes and levels past the end add nothing', () => {
    const { of } = resolver({ levels: [{ color: 'L0' }, null, { color: 'L2' }] });
    expect(of('g').color).toBe('L0');
    expect(of('p').color).toBeUndefined();
    expect(of('c').color).toBe('L2');
    expect(of('r').color).toBe('L0');
    const deep = resolver({ levels: [null, { color: 'L1' }] });
    expect(deep.of('c').color).toBeUndefined();
  });

  it('the rolled-up colour sits above the levels and below the rule; a null colour adds nothing', () => {
    const rollups = new Map([
      ['g', info({ color: 'R' })],
      ['p', info({ color: null })],
    ]);
    const { of } = resolver({ levels: [{ color: 'L' }, { color: 'L' }] }, TASKS, { rollups });
    expect(of('g').color).toBe('R');
    expect(of('p').color).toBe('L');
    const ruled = resolver({ rule: row => (row.task.id === 'g' ? { color: 'rule' } : null) }, TASKS, { rollups });
    expect(ruled.of('g').color).toBe('rule');
  });
});

describe('createStyleResolver — the rule', () => {
  it('receives the row and its context: rollup info, critical flag and status at now', () => {
    const seen = new Map<string, GanttStyleRuleContext>();
    const gInfo = info({ status: 'overdue', color: null });
    const tasks = [
      ...TASKS,
      task('done', { progress: 100 }),
      task('late', { end: new Date(2026, 0, 13) }),
      task('later', { start: new Date(2026, 1, 1), end: new Date(2026, 1, 5) }),
      task('custom', { status: 'blocked' }),
    ];
    const { of, row } = resolver(
      {
        rule: (r, ctx) => {
          seen.set(r.task.id, ctx);
          return null;
        },
      },
      tasks,
      { rollups: new Map([['g', gInfo]]), critical: new Set(['p']) },
    );
    for (const t of tasks) of(t.id);
    expect(seen.get('g')).toEqual({ rollup: gInfo, critical: false, status: 'inProgress' });
    expect(seen.get('g')!.rollup).toBe(gInfo);
    expect(seen.get('p')).toEqual({ rollup: null, critical: true, status: 'inProgress' });
    expect(seen.get('done')!.status).toBe('done');
    expect(seen.get('late')!.status).toBe('overdue');
    expect(seen.get('later')!.status).toBe('notStarted');
    expect(seen.get('custom')!.status).toBe('blocked');
    expect(row('g').task.id).toBe('g');
  });

  it('reads dates as configured (inclusive ends) unless `dates` is passed', () => {
    const statuses: string[] = [];
    const rule = (_: GanttFlatRow, ctx: GanttStyleRuleContext) => void statuses.push(String(ctx.status));
    // Ends on the 14th: overdue at 10:00 on the 14th with an exclusive end, not with an inclusive one
    const tasks = [task('a', { start: new Date(2026, 0, 10), end: new Date(2026, 0, 14) })];
    resolver({ rule }, tasks).of('a');
    resolver({ rule }, tasks, { options: { endDateMode: 'inclusive' } }).of('a');
    resolver({ rule }, tasks, {
      options: { endDateMode: 'inclusive' },
      dates: { endDateMode: 'exclusive', normalizeDateOnly: true },
    }).of('a');
    expect(statuses).toEqual(['overdue', 'inProgress', 'overdue']);
  });

  it('runs once per row object (memoised), again for a new row object', () => {
    const rule = vi.fn(() => ({ color: 'x' }));
    const { resolve, row } = resolver({ rule });
    const first = resolve(row('r'));
    expect(resolve(row('r'))).toBe(first);
    expect(rule).toHaveBeenCalledTimes(1);
    const copy = { ...row('r') };
    expect(resolve(copy)).toEqual(first);
    expect(rule).toHaveBeenCalledTimes(2);
  });

  it('a null or undefined result adds nothing', () => {
    expect(resolver({ task: { color: 'k' }, rule: () => null }).of('r')).toEqual({ color: 'k' });
    expect(resolver({ task: { color: 'k' }, rule: () => undefined }).of('r')).toEqual({ color: 'k' });
  });

  it('is not called without a rule, and the status is not derived then', () => {
    const t = task('r');
    const progress = vi.fn(() => 10);
    Object.defineProperty(t, 'progress', { get: progress, enumerable: true });
    expect(resolver({ task: { color: 'k' } }, [t]).of('r')).toEqual({ color: 'k' });
    expect(progress).not.toHaveBeenCalled();
    resolver({ rule: () => null }, [t]).of('r');
    expect(progress).toHaveBeenCalled();
  });
});

describe('createStyleResolver — without layers (default output)', () => {
  it('a row is styled by its task alone; an unstyled task gets the shared empty style', () => {
    const tasks = [task('a'), task('b', { barColor: '#123', style: { height: 9 } })];
    const { of } = resolver(undefined, tasks);
    expect(of('a')).toBe(EMPTY_TASK_STYLE);
    expect(of('b')).toEqual({ color: '#123', height: 9 });
    // Empty layers, holes and a rollup map without colours change nothing
    const empty = resolver({ task: {}, parent: {}, levels: [null] }, tasks, {
      rollups: new Map([['a', info()]]),
    });
    expect(empty.of('a')).toBe(EMPTY_TASK_STYLE);
    expect(empty.of('b')).toEqual({ color: '#123', height: 9 });
  });

  it('equals taskOwnStyle for every demo-like row', () => {
    const tasks = TASKS.map((t, i) => ({ ...t, ...(i % 2 ? { barColor: `#00000${i}` } : { style: { radius: i } }) }));
    const { of } = resolver(undefined, tasks);
    for (const t of tasks) expect(of(t.id)).toEqual(taskOwnStyle(t));
  });
});

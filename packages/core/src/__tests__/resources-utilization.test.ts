// ─────────────────────────────────────────────────────────────
//  Tests — Phase 14 (step 1.2): the daily load. A day-by-day oracle
//  (it asks, for every local day, whether the task's real instants
//  overlap it — no floor / ceil of fractional days, no difference
//  array) checks 40 seeded random fixtures; hand-computed cases pin
//  the rules: groups and milestones carry nothing, an inclusive end
//  covers its day, a working calendar blanks the days off, a team adds
//  up its members, the unassigned row. October 2026: Monday the 12th,
//  Saturday the 17th, Wednesday the 21st a holiday. Dates are built
//  with `new Date(y, m, d, …)`: every assertion holds in any time zone
//  (`pnpm test:tz`), the daylight-saving changes of the fixtures
//  included.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  MAX_LOAD_DAYS,
  computeResourceUtilization,
  contributorsAt,
  indexResources,
  loadAt,
  loadTasks,
  resolveConfig,
  resourceCapacity,
  resourceGroup,
  resourceRowId,
  teamRowId,
  UNASSIGNED_ROW_ID,
  type DateReading,
  type GanttResource,
  type GanttTask,
} from '../index';
import { epochDayOf, midnightOf, seeded } from './calendar-oracle';

const PLAIN: DateReading = { endDateMode: 'exclusive', normalizeDateOnly: true };
const INCLUSIVE: DateReading = { endDateMode: 'inclusive', normalizeDateOnly: true };
const oct = (day: number, h = 0, mi = 0): Date => new Date(2026, 9, day, h, mi);
const HOLIDAY = oct(21);
const WORKING = resolveConfig({ calendar: true, nonWorkingTime: { holidays: [HOLIDAY] } });
const SATURDAYS = resolveConfig({ calendar: true, nonWorkingTime: { weekends: [0], holidays: [HOLIDAY] } });
const D12 = epochDayOf(oct(12));

const task = (id: string, from: Date, to: Date, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: id.toUpperCase(),
  start: from,
  end: to,
  ...extra,
});
const util = (tasks: GanttTask[], resources: GanttResource[], dates: DateReading = PLAIN, unassigned = true) =>
  computeResourceUtilization(tasks, indexResources(resources), dates, { unassigned });
/** The loads of a row from the 12th, `count` days. */
const loadsOf = (u: ReturnType<typeof util>, key: string, count: number, from = D12): number[] => {
  const row = u.rows.get(key);
  if (!row) throw new Error(`no row ${key}`);
  return Array.from({ length: count }, (_, i) => loadAt(row, from + i));
};

const ANA: GanttResource = { id: 'ana', name: 'Ana' };
const BO: GanttResource = { id: 'bo', name: 'Bo', capacity: 50 };

describe('computeResourceUtilization: the rules', () => {
  it('adds a task to every day of its drawn span, the end excluded', () => {
    const u = util([task('t', oct(12), oct(15), { resources: ['ana'] })], [ANA]);
    expect(u.firstDay).toBe(D12);
    expect(u.days).toBe(3);
    expect(loadsOf(u, 'res:ana', 5)).toEqual([100, 100, 100, 0, 0]);
    const row = u.rows.get('res:ana');
    expect(row).toMatchObject({ kind: 'resource', capacity: 100, peak: 100, peakDay: D12, overDays: 0, tasks: 1 });
    expect(row?.resource).toBe(ANA);
  });

  it('counts a task fully on its first and last day, whatever the time of day', () => {
    // Quarter past: a whole hour is UTC midnight in some zone, which reads as a date-only value there
    const u = util([task('t', oct(12, 17, 15), oct(14, 9, 15), { resources: ['ana'] })], [ANA]);
    expect(loadsOf(u, 'res:ana', 4)).toEqual([100, 100, 100, 0]);
    // Within one day
    const one = util([task('t', oct(12, 9, 15), oct(12, 17, 15), { resources: ['ana'] })], [ANA]);
    expect(loadsOf(one, 'res:ana', 2)).toEqual([100, 0]);
    // A millisecond into the next day still touches it
    const ms = util([task('t', oct(12), new Date(2026, 9, 13, 0, 0, 0, 1), { resources: ['ana'] })], [ANA]);
    expect(loadsOf(ms, 'res:ana', 3)).toEqual([100, 100, 0]);
  });

  it('lets an inclusive midnight end cover its day', () => {
    const t = task('t', oct(12), oct(14), { resources: ['ana'] });
    expect(loadsOf(util([t], [ANA], INCLUSIVE), 'res:ana', 4)).toEqual([100, 100, 100, 0]);
    expect(loadsOf(util([t], [ANA], PLAIN), 'res:ana', 4)).toEqual([100, 100, 0, 0]);
  });

  it('reads date-only UTC values as the calendar day', () => {
    const t = task('t', new Date(Date.UTC(2026, 9, 12)), new Date(Date.UTC(2026, 9, 15)), { resources: ['ana'] });
    const u = util([t], [ANA]);
    expect(u.firstDay).toBe(D12);
    expect(loadsOf(u, 'res:ana', 4)).toEqual([100, 100, 100, 0]);
  });

  it('adds the units of every assignment, and several tasks add up', () => {
    const u = util(
      [
        task('a', oct(12), oct(14), { resources: [{ resourceId: 'ana', units: 60 }] }),
        task('b', oct(13), oct(15), { resources: [{ resourceId: 'ana', units: 70 }, 'bo'] }),
      ],
      [ANA, BO],
    );
    expect(loadsOf(u, 'res:ana', 4)).toEqual([60, 130, 70, 0]);
    expect(loadsOf(u, 'res:bo', 4)).toEqual([0, 100, 100, 0]);
    expect(u.rows.get('res:ana')).toMatchObject({ peak: 130, peakDay: D12 + 1, overDays: 1, tasks: 2 });
    expect(u.rows.get('res:bo')).toMatchObject({ capacity: 50, peak: 100, peakDay: D12 + 1, overDays: 2, tasks: 1 });
  });

  it('is over capacity above it only, a load equal to it is not', () => {
    const u = util([task('t', oct(12), oct(14), { resources: [{ resourceId: 'bo', units: 50 }] })], [BO]);
    expect(u.rows.get('res:bo')?.overDays).toBe(0);
    const over = util([task('t', oct(12), oct(14), { resources: [{ resourceId: 'bo', units: 50.01 }] })], [BO]);
    expect(over.rows.get('res:bo')?.overDays).toBe(2);
  });

  it('leaves groups, milestones, parents and zero-length tasks out', () => {
    const tasks = [
      task('group', oct(12), oct(20), { type: 'group', resources: ['ana'] }),
      task('parent', oct(12), oct(20), { resources: ['ana'] }),
      task('child', oct(13), oct(15), { parentId: 'parent', resources: ['ana'] }),
      task('ms', oct(12), oct(13), { type: 'milestone', resources: ['ana'] }),
      task('bar-ms', oct(12), oct(13), { barType: 'milestone', resources: ['ana'] }),
      task('zero', oct(16), oct(16), { resources: ['ana'] }),
      task('backwards', oct(18), oct(17), { resources: ['ana'] }),
      task('invalid', new Date(NaN), oct(17), { resources: ['ana'] }),
    ];
    expect(loadTasks(tasks, PLAIN).map(w => w.task.id)).toEqual(['child']);
    const u = util(tasks, [ANA]);
    expect(loadsOf(u, 'res:ana', 5)).toEqual([0, 100, 100, 0, 0]);
    expect(u.rows.get('res:ana')?.tasks).toBe(1);
    expect(u.rows.has(UNASSIGNED_ROW_ID)).toBe(false);
  });

  it('cuts nothing and allocates nothing for no tasks', () => {
    const u = util([], [ANA, BO]);
    expect(u).toMatchObject({ firstDay: 0, days: 0, peak: 0, scaleMax: 150 });
    expect([...u.rows.keys()]).toEqual(['res:ana', 'res:bo']);
    expect(u.rows.get('res:ana')?.loads.length).toBe(0);
    expect(loadAt(u.rows.get('res:ana')!, D12)).toBe(0);
  });

  it('gives an idle resource a row of zeros', () => {
    const u = util([task('t', oct(12), oct(14), { resources: ['ana'] })], [ANA, BO]);
    const bo = u.rows.get('res:bo');
    expect(bo).toMatchObject({ peak: 0, peakDay: D12, overDays: 0, tasks: 0 });
    expect(loadsOf(u, 'res:bo', 2)).toEqual([0, 0]);
  });

  it('drops float residue: three thirds that end leave an exact zero', () => {
    const t = (id: string, a: number, b: number) =>
      task(id, oct(a), oct(b), { resources: [{ resourceId: 'ana', units: 33.3 }] });
    const u = util([t('a', 12, 14), t('b', 12, 15), t('c', 12, 16), t('d', 17, 19)], [ANA]);
    const loads = loadsOf(u, 'res:ana', 9);
    expect(loads[0]).toBeCloseTo(99.9, 9);
    expect(loads[3]).toBeCloseTo(33.3, 9);
    expect(loads[4]).toBe(0);
    expect(loads[5]).toBeCloseTo(33.3, 9);
    expect(loads[6]).toBeCloseTo(33.3, 9);
    expect(loads[7]).toBe(0);
    expect(loads[8]).toBe(0);
  });
});

describe('computeResourceUtilization: the working calendar (D15)', () => {
  const t = [task('t', oct(15), oct(26), { resources: ['ana'] })];

  it('carries load on every day without a calendar', () => {
    expect(loadsOf(util(t, [ANA]), 'res:ana', 11, epochDayOf(oct(15)))).toEqual(Array(11).fill(100));
  });

  it('blanks weekends and holidays with one', () => {
    const u = util(t, [ANA], WORKING);
    // Thu 15, Fri 16, Sat 17, Sun 18, Mon 19, Tue 20, Wed 21 (holiday), Thu 22, Fri 23, Sat 24, Sun 25
    expect(loadsOf(u, 'res:ana', 11, epochDayOf(oct(15)))).toEqual([100, 100, 0, 0, 100, 100, 0, 100, 100, 0, 0]);
    expect(u.rows.get('res:ana')).toMatchObject({ peak: 100, overDays: 0 });
  });

  it('respects a Saturday that works', () => {
    const u = util(t, [ANA], SATURDAYS);
    expect(loadsOf(u, 'res:ana', 11, epochDayOf(oct(15)))).toEqual([100, 100, 100, 0, 100, 100, 0, 100, 100, 100, 0]);
  });

  it('counts the tasks of a row that only touches days off', () => {
    const weekend = task('w', oct(17), oct(19), { resources: ['ana'] });
    const u = util([weekend], [ANA], WORKING);
    expect(loadsOf(u, 'res:ana', 3, epochDayOf(oct(17)))).toEqual([0, 0, 0]);
    expect(u.rows.get('res:ana')).toMatchObject({ peak: 0, tasks: 1 });
  });
});

describe('computeResourceUtilization: teams and the unassigned row', () => {
  const resources: GanttResource[] = [
    { id: 'cy', name: 'Cy', group: 'Eng' },
    { id: 'di', name: 'Di', group: 'Eng', capacity: 50 },
    { id: 'ed', name: 'Ed', capacity: 200 },
  ];

  it('adds up the members of a team, loads and capacities', () => {
    const u = util(
      [
        task('a', oct(12), oct(14), { resources: ['cy', { resourceId: 'di', units: 40 }] }),
        task('b', oct(13), oct(15), { resources: [{ resourceId: 'di', units: 40 }] }),
      ],
      resources,
    );
    expect(loadsOf(u, 'team:Eng', 4)).toEqual([140, 180, 40, 0]);
    expect(u.rows.get('team:Eng')).toMatchObject({
      kind: 'team',
      resource: null,
      capacity: 150,
      peak: 180,
      peakDay: D12 + 1,
      overDays: 1,
      tasks: 2,
    });
    // Di is over her 50 on the 13th only, and so is the team over its 150 (140 on the 12th is under)
    expect(u.rows.get('res:di')).toMatchObject({ peak: 80, overDays: 1 });
    expect(u.rows.get('res:cy')).toMatchObject({ peak: 100, overDays: 0, tasks: 1 });
    expect(u.rows.has('team:Eng')).toBe(true);
    expect(u.rows.get('res:ed')).toMatchObject({ capacity: 200, peak: 0 });
  });

  it('lets a team be under capacity while a member is over', () => {
    const u = util([task('a', oct(12), oct(13), { resources: [{ resourceId: 'di', units: 90 }] })], resources);
    expect(u.rows.get('res:di')?.overDays).toBe(1);
    expect(u.rows.get('team:Eng')).toMatchObject({ capacity: 150, peak: 90, overDays: 0 });
  });

  it('counts a task that names two members of one team once for the team, with both units', () => {
    const u = util([task('a', oct(12), oct(13), { resources: ['cy', 'di'] })], resources);
    expect(loadsOf(u, 'team:Eng', 1)).toEqual([200]);
    expect(u.rows.get('team:Eng')?.tasks).toBe(1);
  });

  it('sends the tasks without a known resource to the unassigned row, 100 each', () => {
    const tasks = [
      task('a', oct(12), oct(14)),
      task('b', oct(13), oct(15), { resources: [] }),
      task('c', oct(13), oct(14), { resources: ['ghost'] }),
      task('d', oct(12), oct(13), { resources: ['cy'] }),
    ];
    const u = util(tasks, resources);
    expect(loadsOf(u, UNASSIGNED_ROW_ID, 4)).toEqual([100, 300, 100, 0]);
    expect(u.rows.get(UNASSIGNED_ROW_ID)).toMatchObject({
      kind: 'unassigned',
      resource: null,
      capacity: null,
      peak: 300,
      peakDay: D12 + 1,
      overDays: 0,
      tasks: 3,
    });
  });

  it('leaves the unassigned row out when asked to, and when nothing is unassigned', () => {
    const tasks = [task('a', oct(12), oct(14))];
    expect(util(tasks, resources, PLAIN, false).rows.has(UNASSIGNED_ROW_ID)).toBe(false);
    expect(util([task('d', oct(12), oct(13), { resources: ['cy'] })], resources).rows.has(UNASSIGNED_ROW_ID)).toBe(
      false,
    );
  });

  it('keeps the unassigned row when only its tasks fall on days off', () => {
    const u = util([task('a', oct(17), oct(19))], resources, WORKING);
    expect(u.rows.get(UNASSIGNED_ROW_ID)).toMatchObject({ peak: 0, tasks: 1 });
  });
});

describe('computeResourceUtilization: the scale', () => {
  it('is 150 at least and grows by 25 above the highest load or capacity', () => {
    expect(util([], [ANA]).scaleMax).toBe(150);
    const task100 = task('t', oct(12), oct(13), { resources: ['ana'] });
    expect(util([task100], [ANA]).scaleMax).toBe(150);
    const heavy = [1, 2, 3].map(i =>
      task(`h${i}`, oct(12), oct(13), { resources: [{ resourceId: 'ana', units: 107 }] }),
    );
    const u = util(heavy, [ANA]);
    expect(u.peak).toBe(321);
    expect(u.scaleMax).toBe(325);
    expect(util([task100], [{ id: 'big', name: 'Big crew', capacity: 400 }]).scaleMax).toBe(400);
    expect(util([task100], [{ id: 'big', name: 'Big', capacity: 410 }]).scaleMax).toBe(425);
  });
});

describe('computeResourceUtilization: limits and daylight saving', () => {
  it('cuts a span past MAX_LOAD_DAYS instead of allocating it', () => {
    const t = [
      task('now', oct(12), oct(14), { resources: ['ana'] }),
      task('far', oct(12), new Date(3000, 0, 1), { resources: ['ana'] }),
    ];
    const u = util(t, [ANA]);
    expect(u.days).toBe(MAX_LOAD_DAYS);
    expect(u.rows.get('res:ana')?.loads.length).toBe(MAX_LOAD_DAYS);
    expect(loadsOf(u, 'res:ana', 3)).toEqual([200, 200, 100]);
    expect(loadAt(u.rows.get('res:ana')!, D12 + MAX_LOAD_DAYS - 1)).toBe(100);
    expect(loadAt(u.rows.get('res:ana')!, D12 + MAX_LOAD_DAYS)).toBe(0);
    // A task that starts beyond the cut carries nothing
    const beyond = util(
      [
        task('a', oct(12), oct(13), { resources: ['ana'] }),
        task('b', new Date(2200, 0, 1), new Date(2200, 0, 5), { resources: ['ana'] }),
      ],
      [ANA],
    );
    expect(beyond.rows.get('res:ana')?.tasks).toBe(1);
    expect(beyond.days).toBe(MAX_LOAD_DAYS);
  });

  it('covers every local day of a task across the daylight-saving change, in any zone', () => {
    // US clocks go back on Sunday 1 November 2026, the south's go forward on 4 October: the days stay whole
    const nov = util([task('t', new Date(2026, 9, 31, 12), new Date(2026, 10, 3, 12), { resources: ['ana'] })], [ANA]);
    expect(nov.days).toBe(4);
    expect(Array.from(nov.rows.get('res:ana')!.loads)).toEqual([100, 100, 100, 100]);
    const oct4 = util([task('t', new Date(2026, 9, 3, 23), new Date(2026, 9, 5, 1), { resources: ['ana'] })], [ANA]);
    expect(oct4.days).toBe(3);
    const mar = util([task('t', new Date(2026, 2, 7), new Date(2026, 2, 10), { resources: ['ana'] })], [ANA]);
    expect(Array.from(mar.rows.get('res:ana')!.loads)).toEqual([100, 100, 100]);
  });
});

describe('contributorsAt', () => {
  const resources: GanttResource[] = [
    { id: 'cy', name: 'Cy', group: 'Eng' },
    { id: 'di', name: 'Di', group: 'Eng' },
    ANA,
  ];
  const index = indexResources(resources);
  const tasks = [
    task('b', oct(12), oct(15), { name: 'Build', resources: [{ resourceId: 'cy', units: 50 }] }),
    task('a', oct(12), oct(15), { name: 'Audit', resources: [{ resourceId: 'cy', units: 50 }, 'di'] }),
    task('c', oct(13), oct(14), { name: 'Cut', resources: ['cy'] }),
    task('u', oct(12), oct(14), { name: 'Orphan' }),
    task('g', oct(12), oct(20), { type: 'group', name: 'Phase', resources: ['cy'] }),
  ];
  const names = (key: string, day: number, dates: DateReading = PLAIN) =>
    contributorsAt(tasks, index, dates, key, day).map(c => `${c.task.name} ${c.units}`);

  it('lists the tasks of a resource, the biggest first and then by name', () => {
    expect(names('res:cy', D12 + 1)).toEqual(['Cut 100', 'Audit 50', 'Build 50']);
    expect(names('res:cy', D12)).toEqual(['Audit 50', 'Build 50']);
    expect(names('res:cy', D12 + 3)).toEqual([]);
    expect(names('res:ana', D12)).toEqual([]);
  });

  it('adds the units of a team over its members and lists the unassigned tasks', () => {
    expect(names('team:Eng', D12)).toEqual(['Audit 150', 'Build 50']);
    expect(names(UNASSIGNED_ROW_ID, D12)).toEqual(['Orphan 100']);
    expect(names(UNASSIGNED_ROW_ID, D12 + 2)).toEqual([]);
  });

  it('lists nothing on a day off with a calendar and matches the load otherwise', () => {
    expect(names('res:cy', epochDayOf(oct(17)), WORKING)).toEqual([]);
    const u = computeResourceUtilization(tasks, index, PLAIN, { unassigned: true });
    for (const key of ['res:cy', 'res:di', 'team:Eng', UNASSIGNED_ROW_ID]) {
      for (let d = D12 - 1; d < D12 + 5; d++) {
        const sum = contributorsAt(tasks, index, PLAIN, key, d).reduce((s, c) => s + c.units, 0);
        expect(sum, `${key} ${d - D12}`).toBe(loadAt(u.rows.get(key)!, d));
      }
    }
  });
});

describe('row ids', () => {
  it('are res:<id>, team:<group> and unassigned', () => {
    expect(resourceRowId('ana')).toBe('res:ana');
    expect(teamRowId('Eng')).toBe('team:Eng');
    expect(UNASSIGNED_ROW_ID).toBe('unassigned');
  });
});

// ─── The day-by-day oracle ────────────────────────────────────

interface Fixture {
  seed: number;
  resources: GanttResource[];
  tasks: GanttTask[];
  dates: DateReading;
  /** Does the epoch day carry load? */
  isWorkingDay: (day: number) => boolean;
  unassigned: boolean;
}

function fixture(seed: number): Fixture {
  const rand = seeded(seed);
  const int = (n: number) => Math.floor(rand() * n);
  const pick = <T>(list: readonly T[]): T => list[int(list.length)];

  const resources: GanttResource[] = Array.from({ length: 2 + int(5) }, (_, i) => ({
    id: `r${i}`,
    name: `R${i}`,
    ...(rand() < 0.7 ? { capacity: pick([50, 100, 150, 200]) } : {}),
    ...(rand() < 0.45 ? { group: pick(['G1', 'G2']) } : {}),
  }));

  const baseDay = epochDayOf(new Date(2026, 2, 1));
  const tasks: GanttTask[] = [];
  const count = 8 + int(23);
  for (let i = 0; i < count; i++) {
    const startDay = baseDay + int(270);
    const length = rand() < 0.1 ? 0 : 1 + int(12);
    let start = midnightOf(startDay);
    let end = midnightOf(startDay + length);
    if (rand() < 0.35) {
      start = new Date(start.getFullYear(), start.getMonth(), start.getDate(), int(24), int(4) * 15);
      end = new Date(end.getFullYear(), end.getMonth(), end.getDate(), int(24), int(4) * 15);
    } else if (rand() < 0.2) {
      start = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
      end = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));
    }
    const assignments: NonNullable<GanttTask['resources']> = [];
    for (let k = int(4); k > 0; k--) {
      const id = rand() < 0.1 ? 'ghost' : pick<GanttResource>(resources).id;
      assignments.push(rand() < 0.5 ? id : { resourceId: id, units: pick([10, 25, 50, 100, 150]) });
    }
    const roll = rand();
    tasks.push({
      id: `t${i}`,
      name: `T${i}`,
      start,
      end,
      resources: assignments,
      ...(roll < 0.07 ? { type: 'milestone' as const } : roll < 0.14 ? { type: 'group' as const } : {}),
      ...(i > 0 && rand() < 0.12 ? { parentId: `t${int(i)}` } : {}),
    });
  }

  const holidays = [new Date(2026, 3, 3), new Date(2026, 4, 1), new Date(2026, 9, 12), new Date(2026, 10, 2)];
  const holidayDays = new Set(holidays.map(epochDayOf));
  const weekday = (day: number) => new Date(day * 86_400_000).getUTCDay();
  const variants: Pick<Fixture, 'dates' | 'isWorkingDay'>[] = [
    { dates: PLAIN, isWorkingDay: () => true },
    { dates: INCLUSIVE, isWorkingDay: () => true },
    {
      dates: resolveConfig({ calendar: true, nonWorkingTime: { holidays } }),
      isWorkingDay: day => weekday(day) !== 0 && weekday(day) !== 6 && !holidayDays.has(day),
    },
    {
      dates: resolveConfig({ calendar: true, endDateMode: 'inclusive', nonWorkingTime: { weekends: [0], holidays } }),
      isWorkingDay: day => weekday(day) !== 0 && !holidayDays.has(day),
    },
  ];
  return {
    seed,
    resources,
    tasks,
    unassigned: rand() < 0.8,
    ...variants[seed % variants.length],
  };
}

/** What the load must be, asked of the task's real instants day by day. */
function expectedLoads(f: Fixture) {
  const norm = (d: Date): Date =>
    f.dates.normalizeDateOnly &&
    d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds() + d.getUTCMilliseconds() === 0 &&
    d.getTimezoneOffset() !== 0
      ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      : d;
  const parents = new Set(f.tasks.flatMap(t => (t.parentId ? [t.parentId] : [])));
  const byId = new Map(f.resources.map(r => [r.id, r]));
  const rows = new Map<string, { loads: Map<number, number>; tasks: Set<string> }>();
  const row = (key: string) => {
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { loads: new Map(), tasks: new Set() }));
    return r;
  };
  for (const r of f.resources) {
    row(`res:${r.id}`);
    if (r.group) row(`team:${r.group}`);
  }
  const covered = new Set<number>();
  for (const t of f.tasks) {
    if (t.type === 'group' || t.type === 'milestone' || parents.has(t.id)) continue;
    const start = norm(t.start);
    let end = norm(t.end);
    if (
      f.dates.endDateMode === 'inclusive' &&
      end >= start &&
      end.getHours() + end.getMinutes() + end.getSeconds() + end.getMilliseconds() === 0
    )
      end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
    if (!(end > start)) continue;
    const days: number[] = [];
    for (let d = epochDayOf(start) - 1; d <= epochDayOf(end) + 1; d++) {
      if (start < midnightOf(d + 1) && end > midnightOf(d)) days.push(d);
    }
    for (const d of days) covered.add(d);
    const seen = new Set<string>();
    const known: { id: string; units: number }[] = [];
    for (const a of t.resources ?? []) {
      const id = typeof a === 'string' ? a : a.resourceId;
      if (!byId.has(id) || seen.has(id)) continue;
      seen.add(id);
      known.push({ id, units: typeof a === 'string' ? 100 : (a.units ?? 100) });
    }
    const add = (key: string, units: number) => {
      const r = row(key);
      r.tasks.add(t.id);
      for (const d of days) if (f.isWorkingDay(d)) r.loads.set(d, (r.loads.get(d) ?? 0) + units);
    };
    if (known.length === 0) {
      if (f.unassigned) add('unassigned', 100);
      continue;
    }
    for (const k of known) {
      add(`res:${k.id}`, k.units);
      const group = byId.get(k.id)?.group;
      if (group) add(`team:${group}`, k.units);
    }
  }
  return { rows, covered };
}

describe('computeResourceUtilization: oracle on 40 seeded fixtures', () => {
  for (let seed = 1; seed <= 40; seed++) {
    it(`fixture ${seed}`, () => {
      const f = fixture(seed);
      const u = computeResourceUtilization(f.tasks, indexResources(f.resources), f.dates, { unassigned: f.unassigned });
      const { rows: expected, covered } = expectedLoads(f);
      if (covered.size === 0) {
        expect(u.days).toBe(0);
        return;
      }
      const first = Math.min(...covered);
      expect(u.firstDay).toBe(first);
      expect(u.days).toBe(Math.max(...covered) - first + 1);
      let peak = 0;
      let maxCapacity = 0;
      for (const [key, want] of expected) {
        const got = u.rows.get(key);
        expect(got, key).toBeDefined();
        if (!got) continue;
        const caps = key.startsWith('res:')
          ? resourceCapacity(f.resources.find(r => `res:${r.id}` === key) as GanttResource)
          : key.startsWith('team:')
            ? f.resources.filter(r => resourceGroup(r) === key.slice(5)).reduce((s, r) => s + resourceCapacity(r), 0)
            : null;
        expect(got.capacity, key).toBe(caps);
        let rowPeak = 0;
        let peakDay = first;
        let over = 0;
        for (let i = 0; i < u.days; i++) {
          const day = first + i;
          const w = want.loads.get(day) ?? 0;
          expect(loadAt(got, day), `${key} day ${i}`).toBeCloseTo(w, 9);
          if (w > rowPeak + 1e-9) {
            rowPeak = w;
            peakDay = day;
          }
          if (caps !== null && w > caps + 1e-6) over++;
        }
        expect(got.peak, `${key} peak`).toBeCloseTo(rowPeak, 9);
        if (rowPeak > 0) expect(loadAt(got, got.peakDay), `${key} peakDay`).toBeCloseTo(rowPeak, 9);
        if (rowPeak > 0) expect(got.peakDay, `${key} first peak day`).toBe(peakDay);
        expect(got.overDays, `${key} overDays`).toBe(over);
        expect(got.tasks, `${key} tasks`).toBe(want.tasks.size);
        peak = Math.max(peak, rowPeak);
        if (caps !== null) maxCapacity = Math.max(maxCapacity, caps);
      }
      // Every resource and team has a row; the unassigned row only when a task is unassigned
      for (const key of u.rows.keys()) expect(expected.has(key), key).toBe(true);
      expect(u.peak).toBeCloseTo(peak, 9);
      void maxCapacity;
    });
  }

  it('covers the four reading variants, over-allocation, teams and the unassigned row', () => {
    const variants = new Set<string>();
    const seen = { loaded: 0, over: 0, team: 0, unassigned: 0 };
    for (let seed = 1; seed <= 40; seed++) {
      const f = fixture(seed);
      variants.add(`${f.dates.endDateMode}/${f.dates.calendar ? 'cal' : 'plain'}`);
      const u = computeResourceUtilization(f.tasks, indexResources(f.resources), f.dates, { unassigned: f.unassigned });
      const rows = [...u.rows.values()];
      if (u.peak > 0) seen.loaded++;
      if (rows.some(r => r.overDays > 0)) seen.over++;
      if (rows.some(r => r.kind === 'team' && r.peak > 0)) seen.team++;
      if (u.rows.has(UNASSIGNED_ROW_ID)) seen.unassigned++;
    }
    expect([...variants].sort()).toEqual(['exclusive/cal', 'exclusive/plain', 'inclusive/cal', 'inclusive/plain']);
    expect(seen.loaded).toBeGreaterThanOrEqual(35);
    expect(seen.over).toBeGreaterThanOrEqual(15);
    expect(seen.team).toBeGreaterThanOrEqual(10);
    expect(seen.unassigned).toBeGreaterThanOrEqual(10);
  });
});

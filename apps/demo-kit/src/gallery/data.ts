/**
 * Task data for the gallery cases: deterministic builders placed around `now` (the same `now` and
 * seed always give the same tasks), shared by every framework.
 *
 * Dates are local calendar days (`addDays` on `snapToDay(now)`), so bars line up with day cells in
 * every time zone.
 */

import { DependencyType, TaskType, addDays, snapToDay, type GanttDependency, type GanttTask } from '@gantryjs/core';

// ─── Helpers ─────────────────────────────────────────────────

/** A seeded pseudo-random generator (mulberry32): numbers in [0, 1), the same sequence for a seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number in [min, max] from `rand`. */
const between = (rand: () => number, min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

/** A seed from a string (FNV-1a), for builders keyed by name. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** `now`'s calendar day moved by `offset` days (local midnight). */
export function dayAt(now: Date, offset: number): Date {
  return addDays(snapToDay(now), offset);
}

/** Progress of a task from its dates at `now`: 100 when it ended, 0 before it starts, else the elapsed share. */
function progressAt(start: Date, end: Date, now: Date): number {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return end <= now ? 100 : 0;
  const share = (now.getTime() - start.getTime()) / total;
  return Math.max(0, Math.min(100, Math.round(share * 100)));
}

/** A parent spanning `children` (earliest start, latest end), its progress the duration-weighted mean. */
function parentOf(id: string, name: string, children: readonly GanttTask[], extra: Partial<GanttTask> = {}): GanttTask {
  let start = children[0].start;
  let end = children[0].end;
  let weight = 0;
  let done = 0;
  for (const c of children) {
    if (c.start < start) start = c.start;
    if (c.end > end) end = c.end;
    const w = Math.max(0, c.end.getTime() - c.start.getTime());
    weight += w;
    done += w * (c.progress ?? 0);
  }
  return {
    id,
    name,
    type: TaskType.Group,
    start,
    end,
    progress: weight > 0 ? Math.round(done / weight) : 0,
    ...extra,
  };
}

/** Colours of the gallery teams (mid tones: the chart picks a readable label colour on each). */
export const TEAM_COLORS = {
  platform: '#2563eb',
  mobile: '#7c3aed',
  growth: '#db2777',
  data: '#0891b2',
  design: '#d97706',
  quality: '#059669',
} as const;

export type Team = keyof typeof TEAM_COLORS;

// ─── A small project plan ────────────────────────────────────

/**
 * A product launch of 14 tasks in three phases (groups), with every dependency type, lag and lead,
 * two milestones, and progress that matches the dates at `now`: research is done, design is under
 * way, build is ahead. Ids: `research`, `interviews`, `survey`, `design`, `wireframes`, `visual`,
 * `design-review`, `build`, `api`, `web`, `docs`, `tests`, `beta`, `launch`.
 */
export function planTasks(now: Date = new Date()): GanttTask[] {
  const d = (offset: number) => dayAt(now, offset);
  const leaf = (
    id: string,
    name: string,
    parentId: string,
    from: number,
    to: number,
    team: Team,
    dependency?: GanttTask['dependency'],
  ): GanttTask => ({
    id,
    name,
    parentId,
    start: d(from),
    end: d(to),
    progress: progressAt(d(from), d(to), now),
    ...(dependency ? { dependency } : {}),
    data: { team },
  });
  const milestone = (id: string, name: string, at: number, dependency: GanttTask['dependency'], parentId?: string) => ({
    id,
    name,
    type: TaskType.Milestone,
    start: d(at),
    end: d(at),
    progress: at <= 0 ? 100 : 0,
    dependency,
    ...(parentId ? { parentId } : {}),
  });

  const research = [
    leaf('interviews', 'Customer interviews', 'research', -24, -12, 'design'),
    leaf('survey', 'Survey analysis', 'research', -14, -4, 'data', {
      taskId: 'interviews',
      type: DependencyType.FS,
      lag: -2,
    }),
  ];
  const design = [
    leaf('wireframes', 'Wireframes', 'design', -4, 6, 'design', { taskId: 'survey', type: DependencyType.FS }),
    leaf('visual', 'Visual design', 'design', 2, 14, 'design', {
      taskId: 'wireframes',
      type: DependencyType.SS,
      lag: 6,
    }),
  ];
  const build = [
    leaf('api', 'Public API', 'build', 8, 30, 'platform', { taskId: 'wireframes', type: DependencyType.FS, lag: 2 }),
    leaf('web', 'Web app', 'build', 16, 40, 'growth', { taskId: 'visual', type: DependencyType.FS, lag: 2 }),
    leaf('docs', 'Documentation', 'build', 26, 42, 'platform', { taskId: 'web', type: DependencyType.FF, lag: 2 }),
    leaf('tests', 'End-to-end tests', 'build', 30, 46, 'quality', [
      { taskId: 'api', type: DependencyType.FS },
      { taskId: 'web', type: DependencyType.SF, lag: 6 },
    ]),
  ];
  return [
    parentOf('research', 'Research', research),
    ...research,
    parentOf('design', 'Design', design),
    ...design,
    milestone('design-review', 'Design review', 16, 'visual', 'design'),
    parentOf('build', 'Build', build),
    ...build,
    milestone('beta', 'Public beta', 40, { taskId: 'api', type: DependencyType.FS, lag: 10 }, 'build'),
    milestone('launch', 'Launch', 48, 'tests'),
  ];
}

// ─── A three-level tree ──────────────────────────────────────

/**
 * Three programmes, each with teams (groups) and their tasks: three levels and 27 rows. Some tasks
 * are done, some under way, one is overdue (Invoices) and some haven't started, so rolled-up
 * statuses differ. Leaves carry `data.team`; nothing is coloured (the cases add styles).
 */
export function treeTasks(now: Date = new Date()): GanttTask[] {
  const d = (offset: number) => dayAt(now, offset);
  const leaf = (
    id: string,
    name: string,
    parentId: string,
    from: number,
    to: number,
    team: Team,
    progress?: number,
  ): GanttTask => ({
    id,
    name,
    parentId,
    start: d(from),
    end: d(to),
    progress: progress ?? progressAt(d(from), d(to), now),
    data: { team },
  });

  const auth = [
    leaf('auth-sso', 'Single sign-on', 'platform-auth', -30, -12, 'platform'),
    leaf('auth-mfa', 'Two-factor login', 'platform-auth', -14, 6, 'platform'),
    leaf('auth-audit', 'Audit log', 'platform-auth', 4, 22, 'quality'),
  ];
  const billing = [
    leaf('billing-plans', 'Plans and prices', 'platform-billing', -20, -6, 'growth'),
    // Overdue: it should have ended two days ago
    leaf('billing-invoices', 'Invoices', 'platform-billing', -12, -2, 'platform', 60),
    { ...leaf('billing-live', 'Billing live', 'platform-billing', 12, 12, 'platform'), type: TaskType.Milestone },
  ];
  const ios = [
    leaf('ios-offline', 'Offline mode', 'mobile-ios', -6, 16, 'mobile'),
    leaf('ios-push', 'Push notifications', 'mobile-ios', 10, 26, 'mobile'),
  ];
  const android = [
    leaf('android-offline', 'Offline mode', 'mobile-android', -2, 20, 'mobile'),
    leaf('android-widgets', 'Home-screen widgets', 'mobile-android', 14, 32, 'design'),
  ];
  const onboarding = [
    leaf('onboarding-flow', 'New sign-up flow', 'growth-onboarding', -18, -4, 'growth'),
    leaf('onboarding-tour', 'Product tour', 'growth-onboarding', -2, 12, 'design'),
  ];
  const pricing = leaf('growth-pricing', 'Pricing page test', 'growth', 18, 34, 'data');

  const platformAuth = parentOf('platform-auth', 'Authentication', auth, { parentId: 'platform' });
  const platformBilling = parentOf('platform-billing', 'Billing', billing, { parentId: 'platform' });
  const mobileIos = parentOf('mobile-ios', 'iOS', ios, { parentId: 'mobile' });
  const mobileAndroid = parentOf('mobile-android', 'Android', android, { parentId: 'mobile' });
  const mobileRelease: GanttTask = {
    ...leaf('mobile-release', 'Store release', 'mobile', 34, 34, 'mobile'),
    type: TaskType.Milestone,
  };
  const growthOnboarding = parentOf('growth-onboarding', 'Onboarding', onboarding, { parentId: 'growth' });

  return [
    parentOf('platform', 'Platform', [platformAuth, platformBilling]),
    platformAuth,
    ...auth,
    platformBilling,
    ...billing,
    parentOf('mobile', 'Mobile app', [mobileIos, mobileAndroid, mobileRelease]),
    mobileIos,
    ...ios,
    mobileAndroid,
    ...android,
    mobileRelease,
    parentOf('growth', 'Growth', [growthOnboarding, pricing]),
    growthOnboarding,
    ...onboarding,
    pricing,
  ];
}

// ─── Pipelines (several charts) ──────────────────────────────

/** Stages of a pipeline, in order. */
export const PIPELINE_STAGES = ['Plan', 'Build', 'Test', 'Release'] as const;

/**
 * One delivery pipeline: its four stages chained finish-to-start, then a "Live" milestone. The
 * offsets and lengths come from `name` (a seed), so pipelines with different names cover different
 * dates. Ids are `<slug>-plan`, `<slug>-build`, `<slug>-test`, `<slug>-release`, `<slug>-live`.
 */
export function pipelineTasks(name: string, now: Date = new Date()): GanttTask[] {
  const rand = seededRandom(seedOf(name));
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'pipeline';
  const color = Object.values(TEAM_COLORS)[seedOf(name) % Object.keys(TEAM_COLORS).length];
  let offset = between(rand, -28, -6);
  const tasks: GanttTask[] = [];
  let previous: string | undefined;
  for (const stage of PIPELINE_STAGES) {
    const length = between(rand, 6, 16);
    const id = `${slug}-${stage.toLowerCase()}`;
    const start = dayAt(now, offset);
    const end = dayAt(now, offset + length);
    tasks.push({
      id,
      name: stage,
      start,
      end,
      progress: progressAt(start, end, now),
      style: { color },
      ...(previous ? { dependency: previous } : {}),
    });
    previous = id;
    offset += length + between(rand, 0, 3);
  }
  const live = dayAt(now, offset);
  tasks.push({
    id: `${slug}-live`,
    name: `${name} live`,
    type: TaskType.Milestone,
    start: live,
    end: live,
    progress: live <= now ? 100 : 0,
    dependency: previous,
  });
  return tasks;
}

// ─── A large plan ────────────────────────────────────────────

const VERBS = ['Design', 'Build', 'Review', 'Test', 'Ship', 'Document', 'Migrate', 'Measure'] as const;
const THINGS = ['API', 'search', 'billing', 'reports', 'onboarding', 'mobile app', 'exports', 'alerts'] as const;
const TEAMS = Object.keys(TEAM_COLORS) as Team[];

/**
 * `n` tasks (exactly) in workstreams of 25 rows: a group then 24 tasks, each a few weeks long within
 * a year around `now`; about one task in four depends on the one before it. The same `n`, `seed` and
 * `now` always give the same plan. Ids: `ws-<k>` for workstreams, `t-<i>` for tasks.
 */
export function largeTasks(n: number, seed = 1, now: Date = new Date()): GanttTask[] {
  const rand = seededRandom(seed);
  const tasks: GanttTask[] = [];
  let i = 0;
  for (let k = 1; tasks.length < n; k++) {
    const children: GanttTask[] = [];
    const team = TEAMS[(k - 1) % TEAMS.length];
    const base = between(rand, -180, 150);
    const count = Math.min(24, n - tasks.length - 1);
    for (let c = 0; c < count; c++) {
      i++;
      const from = base + between(rand, 0, 40);
      const to = from + between(rand, 2, 21);
      const start = dayAt(now, from);
      const end = dayAt(now, to);
      const previous = children[children.length - 1];
      children.push({
        id: `t-${i}`,
        name: `${VERBS[between(rand, 0, VERBS.length - 1)]} ${THINGS[between(rand, 0, THINGS.length - 1)]} ${i}`,
        parentId: `ws-${k}`,
        start,
        end,
        progress: progressAt(start, end, now),
        ...(previous && rand() < 0.25 ? { dependency: previous.id } : {}),
        data: { team },
      });
    }
    const group: GanttTask =
      children.length > 0
        ? parentOf(`ws-${k}`, `Workstream ${k}`, children, { data: { team } })
        : {
            id: `ws-${k}`,
            name: `Workstream ${k}`,
            type: TaskType.Group,
            start: dayAt(now, base),
            end: dayAt(now, base + 7),
          };
    tasks.push(group, ...children);
  }
  return tasks;
}

// ─── A fake paged API ────────────────────────────────────────

export interface FakeTaskApiOptions {
  /** Tasks on the server */
  total: number;
  /** Delay of every answer in ms (default 400) */
  latency?: number;
  /** Start failing at once (default false); `api.setFail()` changes it later */
  fail?: boolean;
  /** Seed of the data (default 7) */
  seed?: number;
  now?: Date;
}

export interface FakeTaskApi {
  /** A `GanttDataSource` fetcher: page `page` (1-based) of `size` tasks, after `latency` ms */
  readonly fetcher: (page: number, size: number) => Promise<GanttTask[]>;
  /** While true every request fails (the data source retries, then shows Retry) */
  readonly fail: boolean;
  /** Makes the next requests fail (`true`) or succeed again (`false`) */
  setFail(fail: boolean): void;
  /** Requests made so far, retries included */
  readonly requests: number;
  readonly total: number;
}

/**
 * A slow, fake task server for the lazy-loading case: `total` flat tasks (every tenth a milestone)
 * spread over the months around `now`, served in pages after `latency` ms. `setFail(true)` makes
 * the requests fail with a "Network error".
 */
export function createFakeTaskApi(options: FakeTaskApiOptions): FakeTaskApi {
  const { total, latency = 400, seed = 7, now = new Date() } = options;
  const rand = seededRandom(seed);
  const all: GanttTask[] = [];
  for (let i = 1; i <= total; i++) {
    const from = between(rand, -60, 90);
    const milestone = i % 10 === 0;
    const start = dayAt(now, from);
    const end = milestone ? start : dayAt(now, from + between(rand, 3, 24));
    all.push({
      id: `ticket-${i}`,
      name: milestone ? `Checkpoint ${i / 10}` : `Ticket #${1000 + i}`,
      ...(milestone ? { type: TaskType.Milestone } : {}),
      start,
      end,
      progress: progressAt(start, end, now),
    });
  }

  let requests = 0;
  let fail = options.fail ?? false;
  const api: FakeTaskApi = {
    total,
    get fail() {
      return fail;
    },
    setFail(value) {
      fail = value;
    },
    get requests() {
      return requests;
    },
    fetcher: (page, size) => {
      requests++;
      const failing = fail;
      return new Promise<GanttTask[]>((resolve, reject) => {
        setTimeout(() => {
          if (failing) reject(new Error('Network error (simulated)'));
          else resolve(all.slice((page - 1) * size, page * size));
        }, latency);
      });
    },
  };
  return api;
}

/** The dependencies of a task as a list (a string, one object or a list). */
export function dependenciesOf(task: GanttTask): GanttDependency[] {
  const dep = task.dependency;
  if (!dep) return [];
  if (typeof dep === 'string') return [{ taskId: dep }];
  return Array.isArray(dep) ? dep : [dep];
}

// Tiny plans for the live previews on /examples, each one the idea of an example page in a few
// rows, placed around today.
import {
  DependencyType,
  GanttDataSource,
  TaskType,
  addDays,
  snapToDay,
  type GanttOptions,
  type GanttTask,
} from 'ngx-gantry';

/**
 * Options every preview shares: chart only, compact header and rows, nothing to interact with,
 * and a zoom level of its own (months over weeks, 5 px a day) that fits a plan of about three
 * months into the card.
 */
export const PREVIEW_OPTIONS: GanttOptions = {
  view: 'chart',
  zoomLevels: [
    {
      name: 'Preview',
      pxPerDay: 5,
      scales: [
        { unit: 'month', format: 'MMM YYYY', align: 'start' },
        // The day each week starts on: "W42" does not fit a 35 px cell
        { unit: 'week', format: 'D' },
      ],
    },
  ],
  viewMode: 'Preview',
  initialScroll: 'start',
  headerHeight: 24,
  subHeaderHeight: 22,
  rowHeight: 26,
  showToday: true,
  enableSelection: false,
  panel: { collapsible: false, resizable: false },
};

export interface Preview {
  options: GanttOptions;
  series?: GanttTask[];
  dataSource?: GanttDataSource;
}

const day = (offset: number) => addDays(snapToDay(new Date()), offset);

/** Two squads (groups) with their release milestones. */
function roadmap(): Preview {
  const group = (id: string, name: string, from: number, to: number, barColor: string): GanttTask => ({
    id,
    name,
    type: TaskType.Group,
    start: day(from),
    end: day(to),
    barColor,
  });
  const milestone = (id: string, name: string, at: number, parentId: string, barColor: string): GanttTask => ({
    id,
    name,
    parentId,
    type: TaskType.Milestone,
    start: day(at),
    end: day(at),
    barColor,
  });
  const tasks: GanttTask[] = [
    group('p', 'Platform', -30, 36, '#4f46e5'),
    { id: 'p1', name: 'Deploys', parentId: 'p', start: day(-30), end: day(28), progress: 60 },
    { ...milestone('pm', 'v2.0', 36, 'p', '#4f46e5'), dependency: 'p1' },
    group('g', 'Growth', -16, 52, '#be185d'),
    { id: 'g1', name: 'Onboarding', parentId: 'g', start: day(-16), end: day(42), progress: 35 },
    { ...milestone('gm', 'v2.1', 52, 'g', '#be185d'), dependency: 'g1' },
  ];
  return { series: tasks, options: { ...PREVIEW_OPTIONS, rowHeight: 22 } };
}

/** A dependency chain with lag, a baseline and the critical path. */
function board(): Preview {
  const tasks: GanttTask[] = [
    { id: 'a', name: 'Discovery', start: day(-30), end: day(-12), progress: 100 },
    {
      id: 'b',
      name: 'Design',
      start: day(-10),
      end: day(8),
      progress: 60,
      dependency: { taskId: 'a', type: DependencyType.FS, lag: 2 },
    },
    {
      id: 'c',
      name: 'Build',
      start: day(8),
      end: day(32),
      progress: 10,
      dependency: 'b',
      baseline: { start: day(4), end: day(24) },
    },
    {
      id: 'd',
      name: 'QA',
      start: day(18),
      end: day(40),
      dependency: { taskId: 'c', type: DependencyType.SS, lag: 10 },
    },
    { id: 'f', name: 'Docs', start: day(12), end: day(30), progress: 20, dependency: 'b' },
    { id: 'e', name: 'Launch', type: TaskType.Milestone, start: day(44), end: day(44), dependency: 'd' },
  ];
  return { series: tasks, options: { ...PREVIEW_OPTIONS, rowHeight: 22, baseline: true, criticalPath: true } };
}

/** A real paged source, three rows per page: the second page arrives a moment after the first. */
function lazy(): Preview {
  const all: GanttTask[] = Array.from({ length: 6 }, (_, i) => ({
    id: `l${i}`,
    name: `Task ${String(i + 1).padStart(3, '0')}`,
    start: day(-24 + i * 11),
    end: day(-6 + i * 11 + (i % 3) * 5),
    progress: (i * 37) % 101,
    barColor: i % 3 === 0 ? '#4f46e5' : i % 3 === 1 ? '#047857' : undefined,
  }));
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  const dataSource = new GanttDataSource({
    pageSize: 3,
    fetcher: async (page, size) => {
      await wait(700);
      return all.slice((page - 1) * size, page * size);
    },
  });
  // The chart view has no task list (whose last row asks for the next page): ask once here
  void wait(1600).then(() => dataSource.loadNext());
  return { dataSource, options: { ...PREVIEW_OPTIONS, rowHeight: 22 } };
}

/** Epics drawn by the custom `epic` bar type (EpicBarComponent). */
function customBars(): Preview {
  const epic = (id: string, name: string, from: number, to: number, barColor: string, progress: number) => ({
    id,
    name,
    barType: 'epic',
    barColor,
    start: day(from),
    end: day(to),
    progress,
  });
  const tasks: GanttTask[] = [
    epic('e1', 'Authentication', -32, 4, '#4f46e5', 80),
    epic('e2', 'Payments', -12, 32, '#be185d', 35),
    epic('e3', 'Reporting', 14, 52, '#b45309', 10),
    { id: 'm', name: 'Scope cutoff', type: TaskType.Milestone, start: day(40), end: day(40), barColor: '#b45309' },
  ];
  return { series: tasks, options: { ...PREVIEW_OPTIONS, rowHeight: 34 } };
}

/** A fresh preview per route path (the lazy one owns a data source). */
export const PREVIEWS: Record<string, () => Preview> = {
  roadmap,
  demo: board,
  lazy,
  'custom-bar': customBars,
};

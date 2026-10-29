// The examples gallery (demo-kit/gallery): the catalog, the case modules, the seeded data, the
// framework notes, the hash router and links, and the generated code samples (they must match what
// scripts/gallery-sources.mjs writes today). Reads files: Node types for this test only.
/// <reference types="node" />
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LABELS,
  DependencyType,
  TaskType,
  addDays,
  buildColumnContext,
  calendarDays,
  commitCellValue,
  computeCriticalPath,
  createBeforeChangeDetail,
  createExportSource,
  createWorkingCalendar,
  editRules,
  exportChartCsv,
  exportChartPages,
  exportChartSvg,
  exportFileName,
  flattenTree,
  formatDuration,
  formatFloat,
  invertChange,
  linkChange,
  linkError,
  parseDuration,
  prepareChange,
  resolveCellEditor,
  resolveConfig,
  taskChange,
  type ColumnDef,
  type GanttChange,
  type GanttExportEvent,
  type GanttOptions,
  type GanttTask,
  type GanttTasksChangeEvent,
} from '@gantryjs/core';
import {
  CASE_DATA,
  CASE_IDS,
  CELL_EDITING_INITIAL,
  CELL_EDITING_OPTIONS,
  CELL_EDITING_VIEWS,
  CONTROLLED_INITIAL,
  CONTROLLED_OPTIONS,
  CRITICAL_DURATIONS,
  CRITICAL_FLOAT_HINT,
  CRITICAL_FLOAT_INITIAL,
  CUSTOM_EDITORS_FIRST_TASK,
  CUSTOM_EDITORS_MILESTONE,
  CUSTOM_EDITORS_OPTIONS,
  CUSTOM_EDITOR_COLUMNS,
  CSV_COLUMNS,
  CSV_VALUES,
  DEPENDENCY_EDITING_INITIAL,
  EDITING_OPTIONS,
  EDIT_LOG_LIMIT,
  EXPORT_CSV_HINT,
  EXPORT_CSV_INITIAL,
  EXPORT_CSV_OPTIONS,
  EXPORT_IMAGE_INITIAL,
  EXPORT_IMAGE_OPTIONS,
  EXPORT_LOG_LIMIT,
  EXPORT_RANGES,
  EXPORT_THEMES,
  EXPORT_TOOLBAR_HINT,
  EXPORT_TOOLBAR_INITIAL,
  EXPORT_TOOLBAR_OPTIONS,
  FLAG_BAR,
  FLOAT_COLUMN,
  FRAMEWORK_NOTES,
  GALLERY_CASES,
  GALLERY_CATEGORIES,
  GALLERY_FRAMEWORKS,
  PRINT_FITS,
  PRINT_HINT,
  PRINT_INITIAL,
  PRINT_OPTIONS,
  PRINT_ORIENTATIONS,
  PRINT_PAPERS,
  SHIFT_FRIDAYS,
  SHIFT_HINT,
  SHIFT_HOURS_PER_DAY,
  SHIFT_INITIAL,
  SHIFT_VIEW_MODES,
  WORKING_DAYS_HINT,
  WORKING_DAYS_INITIAL,
  WORKING_DURATIONS,
  WORKING_SHADINGS,
  caseNeighbours,
  casesByCategory,
  cellEditingOptions,
  cellEditingTasks,
  controlledDecision,
  controlledTasks,
  createFakeTaskApi,
  criticalFloatOptions,
  criticalFloatTasks,
  criticalSummary,
  csvExportOptions,
  csvPreviewLines,
  customEditorsTasks,
  currentGalleryRoute,
  dependenciesOf,
  dependencyEditingOptions,
  dependencyEditingTasks,
  describeBlockedExport,
  describeExport,
  describeFailedExport,
  describeTasksChange,
  editingTasks,
  exportCsvTasks,
  exportImageTasks,
  exportToolbarTasks,
  formatBytes,
  galleryHash,
  imageExportOptions,
  isCaseId,
  largeTasks,
  notesForCase,
  onHashChange,
  parseGalleryHash,
  pipelineTasks,
  planTasks,
  printOptionsOf,
  printTasks,
  pushLog,
  seededRandom,
  shiftOptions,
  shiftTasks,
  shiftWorkingHours,
  statesProps,
  statesTasks,
  lazyStatus,
  treeTasks,
  workWeekStart,
  workingDaysHolidays,
  workingDaysOptions,
  workingDaysTasks,
  workingSummary,
  type GalleryRoute,
} from '../gallery';
import { CASE_COVERAGE, CASE_SOURCES } from '../gallery/sources';
import { DEMO_BASE, frameworkCaseUrl, siteCaseUrl } from '../site';

const NOW = new Date(2026, 9, 14, 15, 30);
const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(KIT, '../../..');

interface GeneratorResult {
  ids: string[];
  outputs: Map<string, string>;
  changed: string[];
  stale: string[];
  missing: string[];
  errors: string[];
  coverage: Record<string, string[]>;
}
interface GeneratorModule {
  runGenerator(options?: { root?: string; write?: boolean }): GeneratorResult;
  readCaseIds(root?: string): string[];
  MAIN_FILE: Record<string, (id: string) => string>;
  FRAMEWORK_TREES: Record<string, string>;
  OUT_DIR: string;
}
// A plain .mjs script (no types): imported by path
const loadGenerator = () =>
  import(/* @vite-ignore */ join(ROOT, 'scripts/gallery-sources.mjs')) as Promise<GeneratorModule>;

/**
 * Every task starts and ends on a local midnight (unless `timed`: an hour calendar's tasks carry
 * times of day), every parent and predecessor exists.
 */
function expectSound(tasks: GanttTask[], timed = false): void {
  const ids = new Set(tasks.map(t => t.id));
  expect(ids.size).toBe(tasks.length);
  for (const t of tasks) {
    if (!timed) {
      expect(t.start.getHours() + t.start.getMinutes(), t.id).toBe(0);
      expect(t.end.getHours() + t.end.getMinutes(), t.id).toBe(0);
    }
    expect(t.end.getTime(), t.id).toBeGreaterThanOrEqual(t.start.getTime());
    if (t.parentId) expect(ids.has(t.parentId), `${t.id} → parent ${t.parentId}`).toBe(true);
    for (const dep of dependenciesOf(t)) expect(ids.has(dep.taskId), `${t.id} → ${dep.taskId}`).toBe(true);
  }
}

describe('gallery catalog', () => {
  it('has 32 unique kebab-case ids, in catalog order', () => {
    expect(CASE_IDS).toHaveLength(32);
    expect(new Set(CASE_IDS).size).toBe(CASE_IDS.length);
    for (const id of CASE_IDS) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(GALLERY_CASES.map(c => c.id)).toEqual([...CASE_IDS]);
  });

  it('keeps the cases of a category together, in category order', () => {
    const order = GALLERY_CATEGORIES.map(c => c.id);
    const seen = GALLERY_CASES.map(c => order.indexOf(c.category));
    expect(seen.every(i => i >= 0)).toBe(true);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(casesByCategory().map(g => g.category.id)).toEqual(order);
    expect(casesByCategory().flatMap(g => g.cases.map(c => c.id))).toEqual([...CASE_IDS]);
  });

  it('describes every case', () => {
    for (const c of GALLERY_CASES) {
      expect(c.title.length, c.id).toBeGreaterThan(3);
      expect(c.summary, c.id).toMatch(/\.$/);
      expect(c.summary, `${c.id}: plain text`).not.toMatch(/`/);
      expect(c.tags.length, c.id).toBeGreaterThan(0);
      expect(c.ready.charts, c.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('knows its ids and neighbours', () => {
    expect(isCaseId('tree')).toBe(true);
    expect(isCaseId('nope')).toBe(false);
    expect(isCaseId(null)).toBe(false);
    expect(caseNeighbours('states')).toEqual({ previous: null, next: GALLERY_CASES[1] });
    expect(caseNeighbours('keyboard').next).toBeNull();
    expect(caseNeighbours('tree').previous?.id).toBe('lazy');
  });

  it('lists the five frameworks in tab order', () => {
    expect(GALLERY_FRAMEWORKS).toEqual(['angular', 'vanilla', 'react', 'vue', 'svelte']);
  });
});

describe('gallery case modules', () => {
  it('every catalog id has a case module and its generic data', () => {
    for (const id of CASE_IDS) {
      expect(existsSync(join(KIT, 'gallery/cases', `${id}.ts`)), id).toBe(true);
      expect(CASE_DATA[id], id).toBeDefined();
    }
    expect(Object.keys(CASE_DATA).sort()).toEqual([...CASE_IDS].sort());
  });

  it('draws the ready charts and state of each case', () => {
    for (const c of GALLERY_CASES) {
      const charts = CASE_DATA[c.id].charts(NOW);
      expect(charts, c.id).toHaveLength(c.ready.charts);
      for (const chart of charts) {
        if (!chart.dataSource) expectSound(chart.tasks, c.id === 'shift-calendar');
        expect(chart.options.labels?.ariaChart, `${c.id}: accessible name`).toBeTruthy();
      }
      const first = charts[0];
      if (c.ready.state === 'empty') expect(first.tasks).toEqual([]);
      if (c.ready.state !== 'empty' && !first.dataSource) expect(first.tasks.length, c.id).toBeGreaterThan(0);
      if (c.ready.state === 'loading') expect(first.loading).toBe(true);
      if (c.ready.state === 'error') expect(first.errorMessage).toBeTruthy();
    }
  });

  it('gives each chart of a case its own accessible name', () => {
    const names = CASE_DATA['multi-pipeline'].charts(NOW).map(c => c.options.labels?.ariaChart);
    expect(new Set(names).size).toBe(names.length);
    expect(CASE_DATA['multi-pipeline'].sync).toBe(true);
  });

  it('maps the states case controls to chart props', () => {
    const tasks = statesTasks(NOW);
    expect(statesProps('empty', tasks)).toEqual({ tasks: [], loading: false, errorMessage: null });
    expect(statesProps('loading', tasks)).toMatchObject({ tasks: [], loading: true });
    expect(statesProps('error', tasks).errorMessage).toBeTruthy();
    // The same arrays every time: a mode change never rebuilds the plan
    expect(statesProps('tasks', tasks).tasks).toBe(tasks);
    expect(statesProps('empty', tasks).tasks).toBe(statesProps('error', tasks).tasks);
  });
});

describe('gallery data', () => {
  it('builds the same tasks for the same now', () => {
    expect(planTasks(NOW)).toEqual(planTasks(NOW));
    expect(treeTasks(NOW)).toEqual(treeTasks(NOW));
    expect(pipelineTasks('Web', NOW)).toEqual(pipelineTasks('Web', NOW));
    expect(pipelineTasks('Web', NOW)).not.toEqual(pipelineTasks('Data', NOW));
    // Placed around now: moving now by a day moves every task by a day
    const later = new Date(2026, 9, 15, 9);
    expect(planTasks(later).map(t => t.start.getDate())).not.toEqual(planTasks(NOW).map(t => t.start.getDate()));
  });

  it('builds sound plans', () => {
    expectSound(planTasks(NOW));
    expectSound(treeTasks(NOW));
    expectSound(pipelineTasks('Mobile app', NOW));
    const tree = treeTasks(NOW);
    expect(Math.max(...tree.map(t => depth(tree, t)))).toBe(2);
    expect(pipelineTasks('Mobile app', NOW)[0].id).toBe('mobile-app-plan');
  });

  it('builds a large plan of exactly n tasks, the same for a seed', () => {
    const a = largeTasks(10_000, 42, NOW);
    expect(a).toHaveLength(10_000);
    expectSound(a);
    expect(largeTasks(10_000, 42, NOW)).toEqual(a);
    expect(largeTasks(10_000, 43, NOW)).not.toEqual(a);
    expect(largeTasks(26, 1, NOW)).toHaveLength(26);
    expect(largeTasks(1, 1, NOW)).toHaveLength(1);
  });

  it('seeds a repeatable random sequence', () => {
    const a = seededRandom(5);
    const b = seededRandom(5);
    const seq = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(seq);
    expect(seq.every(n => n >= 0 && n < 1)).toBe(true);
  });

  describe('fake task API', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('serves pages after the latency, the last one short', async () => {
      vi.useFakeTimers();
      const api = createFakeTaskApi({ total: 45, latency: 300, now: NOW });
      const page = api.fetcher(2, 20);
      await vi.advanceTimersByTimeAsync(300);
      const tasks = await page;
      expect(tasks.map(t => t.id)).toEqual(Array.from({ length: 20 }, (_, i) => `ticket-${21 + i}`));
      const last = api.fetcher(3, 20);
      await vi.advanceTimersByTimeAsync(300);
      expect(await last).toHaveLength(5);
      expect(api.requests).toBe(2);
      expectSound(tasks);
    });

    it('fails while `fail` is set', async () => {
      vi.useFakeTimers();
      const api = createFakeTaskApi({ total: 10, latency: 100, fail: true, now: NOW });
      const failing = api.fetcher(1, 5);
      const caught = failing.catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(100);
      expect(await caught).toBeInstanceOf(Error);
      expect(api.fail).toBe(true);
      api.setFail(false);
      expect(api.fail).toBe(false);
      const ok = api.fetcher(1, 5);
      await vi.advanceTimersByTimeAsync(100);
      expect(await ok).toHaveLength(5);
    });
  });
});

describe('lazy status line', () => {
  const base = { loadedCount: 25, isLoading: false, hasMore: true, error: null, nextPage: 2 };
  it('reads the same in every binding for each load state', () => {
    expect(lazyStatus(base)).toBe('25 of 200 tasks loaded: scroll down for more.');
    expect(lazyStatus({ ...base, isLoading: true })).toBe('25 of 200 tasks loaded, loading page 2…');
    expect(lazyStatus({ ...base, error: new Error('x') })).toBe(
      '25 of 200 tasks loaded. Page 2 failed after 2 retries: turn off Fail requests, then press Retry.',
    );
    expect(lazyStatus({ ...base, loadedCount: 200, hasMore: false })).toBe('200 of 200 tasks loaded.');
  });
});

describe('framework notes', () => {
  it('have unique ids and known frameworks', () => {
    const ids = FRAMEWORK_NOTES.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const note of FRAMEWORK_NOTES) {
      expect(note.frameworks.length, note.id).toBeGreaterThan(0);
      for (const fw of note.frameworks) expect(GALLERY_FRAMEWORKS, note.id).toContain(fw);
      // Backticks come in pairs (code spans)
      expect((note.text.match(/`/g) ?? []).length % 2, note.id).toBe(0);
      expect(((note.workaround ?? '').match(/`/g) ?? []).length % 2, note.id).toBe(0);
    }
  });

  it('match the notes listed by each case', () => {
    for (const c of GALLERY_CASES) {
      expect(
        notesForCase(c.id).map(n => n.id),
        c.id,
      ).toEqual([...c.notes]);
    }
    for (const note of FRAMEWORK_NOTES) for (const id of note.cases) expect(isCaseId(id), note.id).toBe(true);
  });
});

describe('gallery router', () => {
  it('parses the hash routes', () => {
    const cases: [string, GalleryRoute][] = [
      ['', { page: 'home' }],
      ['#', { page: 'home' }],
      ['#/', { page: 'home' }],
      ['#main', { page: 'home' }],
      ['#/examples', { page: 'index' }],
      ['#/examples/', { page: 'index' }],
      ['#/examples/tree', { page: 'case', id: 'tree' }],
      ['#/examples/only-parents-styled/', { page: 'case', id: 'only-parents-styled' }],
      ['#/examples/tree?x=1', { page: 'case', id: 'tree' }],
      ['#/examples/nope', { page: 'index' }],
      ['#/tree', { page: 'case', id: 'tree' }],
      ['#/nope', { page: 'home' }],
      ['#/tree/extra', { page: 'home' }],
    ];
    for (const [hash, route] of cases) expect(parseGalleryHash(hash), hash).toEqual(route);
  });

  it('round-trips every case through both hash forms', () => {
    for (const id of CASE_IDS) {
      expect(parseGalleryHash(galleryHash(id))).toEqual({ page: 'case', id });
      expect(parseGalleryHash(galleryHash(id, 'page'))).toEqual({ page: 'case', id });
    }
    expect(galleryHash()).toBe('#/examples');
    expect(galleryHash(undefined, 'page')).toBe('');
  });

  it('follows hash changes, not in-page anchors', () => {
    const seen: GalleryRoute[] = [];
    const off = onHashChange(route => seen.push(route));
    location.hash = '#/examples/tree';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    location.hash = '#main';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(seen).toEqual([{ page: 'case', id: 'tree' }]);
    location.hash = '#/examples';
    expect(currentGalleryRoute()).toEqual({ page: 'index' });
    off();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(seen).toHaveLength(1);
    location.hash = '';
  });
});

describe('gallery links', () => {
  it('points each framework at its demo app', () => {
    expect(DEMO_BASE).toEqual({ vanilla: '/wc/', react: '/react/', vue: '/vue/', svelte: '/svelte/' });
    expect(siteCaseUrl('tree')).toBe('/examples/tree');
    expect(frameworkCaseUrl('angular', 'tree')).toBe('/examples/tree');
    expect(frameworkCaseUrl('angular')).toBe('/examples');
    expect(frameworkCaseUrl('vanilla', 'tree')).toBe('/wc/examples.html#/tree');
    expect(frameworkCaseUrl('vanilla')).toBe('/wc/examples.html');
    expect(frameworkCaseUrl('react', 'tree')).toBe('/react/#/examples/tree');
    expect(frameworkCaseUrl('vue')).toBe('/vue/#/examples');
    expect(frameworkCaseUrl('svelte', 'large')).toBe('/svelte/#/examples/large');
  });
});

describe('generated sources', () => {
  it('are up to date (run `pnpm gallery:sources`)', async () => {
    const { runGenerator } = await loadGenerator();
    const result = runGenerator({ root: ROOT });
    expect(result.errors).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.ids).toEqual([...CASE_IDS]);
  });

  it('load each case with its shared module', async () => {
    for (const id of CASE_IDS) {
      const sources = await CASE_SOURCES[id]();
      expect(sources.shared).toHaveLength(1);
      expect(sources.shared[0].file).toBe(`demo-kit/gallery/cases/${id}.ts`);
      expect(sources.shared[0].code).toBe(readFileSync(join(KIT, 'gallery/cases', `${id}.ts`), 'utf8'));
      for (const fw of GALLERY_FRAMEWORKS) {
        if (CASE_COVERAGE[id].includes(fw)) expect(sources[fw]?.length, `${id}/${fw}`).toBeGreaterThan(0);
      }
    }
  });

  describe('generator', () => {
    let root: string | null = null;
    afterEach(() => {
      if (root) rmSync(root, { recursive: true, force: true });
      root = null;
    });

    /** A copy of the catalog and the shared case modules in a scratch root. */
    function scratch(): string {
      const dir = mkdtempSync(join(tmpdir(), 'gallery-sources-'));
      mkdirSync(join(dir, 'apps/demo-kit/src/gallery'), { recursive: true });
      cpSync(join(KIT, 'gallery/catalog.ts'), join(dir, 'apps/demo-kit/src/gallery/catalog.ts'));
      cpSync(join(KIT, 'gallery/cases'), join(dir, 'apps/demo-kit/src/gallery/cases'), { recursive: true });
      return dir;
    }
    const put = (dir: string, path: string, text: string) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    };

    it('reads every framework tree: main file first, tests skipped, unknown cases refused', async () => {
      const gen = await loadGenerator();
      root = scratch();
      put(root, 'apps/demo-react/src/gallery/cases/tree/TreeExample.tsx', 'export default 1;\r\n');
      put(root, 'apps/demo-react/src/gallery/cases/tree/a-helper.ts', 'export const a = 1;\n');
      put(root, 'apps/demo-react/src/gallery/cases/tree/TreeExample.test.tsx', 'skipped');
      put(root, 'apps/demo-vue/src/gallery/cases/tree/parts/Row.vue', '<template />\n');
      put(root, 'apps/demo-angular/src/app/gallery/cases/tree/tree-example.component.ts', 'ng\n');

      const result = gen.runGenerator({ root });
      expect(result.errors).toEqual([]);
      expect(result.coverage['tree']).toEqual(['angular', 'react']);
      expect(result.missing).toHaveLength(CASE_IDS.length * GALLERY_FRAMEWORKS.length - 2);
      expect(result.missing).toContain('vue/tree/TreeExample.vue');
      const tree = result.outputs.get(`${gen.OUT_DIR}/tree.generated.ts`)!;
      expect(tree.startsWith('// Generated by scripts/gallery-sources.mjs')).toBe(true);
      // Main file first, then by path; CRLF → LF; tests left out
      expect(tree.indexOf('"TreeExample.tsx"')).toBeLessThan(tree.indexOf('"a-helper.ts"'));
      expect(tree).toContain('"export default 1;\\n"');
      expect(tree).not.toContain('TreeExample.test.tsx');
      // A framework without its main file still shows its files (no coverage)
      expect(tree).toContain('"parts/Row.vue"');
      expect(result.outputs.get(`${gen.OUT_DIR}/index.generated.ts`)).toContain('"tree": ["angular", "react"],');

      put(root, 'apps/demo-svelte/src/gallery/cases/nope/NopeExample.svelte', '');
      expect(gen.runGenerator({ root }).errors).toEqual([
        'apps/demo-svelte/src/gallery/cases/nope: not a case id of apps/demo-kit/src/gallery/catalog.ts',
      ]);
    });

    it('writes deterministically and removes stale files', async () => {
      const gen = await loadGenerator();
      root = scratch();
      put(root, `${gen.OUT_DIR}/old.generated.ts`, 'stale');
      const first = gen.runGenerator({ root, write: true });
      expect(first.changed).toHaveLength(CASE_IDS.length + 1);
      expect(first.stale).toEqual([`${gen.OUT_DIR}/old.generated.ts`]);
      expect(existsSync(join(root, gen.OUT_DIR, 'old.generated.ts'))).toBe(false);
      const again = gen.runGenerator({ root });
      expect(again.changed).toEqual([]);
      expect(again.stale).toEqual([]);
      expect([...again.outputs.values()]).toEqual([...first.outputs.values()]);
    });

    it('names the main file of each framework', async () => {
      const { MAIN_FILE } = await loadGenerator();
      expect(Object.fromEntries(Object.entries(MAIN_FILE).map(([fw, f]) => [fw, f('only-parents')]))).toEqual({
        angular: 'only-parents-example.component.ts',
        vanilla: 'only-parents.ts',
        react: 'OnlyParentsExample.tsx',
        vue: 'OnlyParentsExample.vue',
        svelte: 'OnlyParentsExample.svelte',
      });
    });
  });
});

describe('editing cases', () => {
  const plan = planTasks(NOW);
  const task = (tasks: readonly GanttTask[], id: string): GanttTask => tasks.find(t => t.id === id)!;
  const detail = (change: GanttChange, tasks: GanttTask[] = plan): GanttTasksChangeEvent => ({
    tasks,
    change,
    applied: true,
  });
  const line = (change: GanttChange) => describeTasksChange(detail(change), plan);
  /** A date input's value (local calendar day) */
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /** What core's cell editor of `col` makes of `value` typed on task `id`. */
  function editCell(tasks: GanttTask[], options: GanttOptions, col: ColumnDef, id: string, value: string) {
    const config = resolveConfig(options);
    const row = flattenTree(tasks).find(r => r.task.id === id)!;
    const ctx = buildColumnContext({ tasks, config, now: NOW });
    const rules = editRules(row, { config, enableDrag: true, enableResize: true });
    const editor = resolveCellEditor(col, row, { config, ctx, labels: DEFAULT_LABELS, rules });
    return { row, config, editor, result: editor ? commitCellValue(editor, value, row, ctx) : null };
  }

  it('sit in the Editing category, after Scheduling, as new one-chart cases', () => {
    const order = GALLERY_CATEGORIES.map(c => c.id);
    expect(order.indexOf('editing')).toBe(order.indexOf('scheduling') + 1);
    const cases = GALLERY_CASES.filter(c => c.category === 'editing');
    expect(cases.map(c => c.id)).toEqual([
      'editing',
      'cell-editing',
      'custom-editors',
      'dependency-editing',
      'controlled',
    ]);
    for (const c of cases) {
      expect(c.isNew, c.id).toBe(true);
      expect(c.ready, c.id).toEqual({ charts: 1 });
    }
    expect(FRAMEWORK_NOTES.map(n => n.id)).not.toContain('row-click-payload');
  });

  describe('change log', () => {
    it('describes each kind of change in one line', () => {
      const design = task(plan, 'design');
      const web = task(plan, 'web');
      const move = taskChange(design, { start: addDays(design.start, 2), end: addDays(design.end, 2) }, 'drag');
      expect(line(move)).toBe('Moved Design 2 days later');
      expect(line(taskChange(web, { end: addDays(web.end, -1) }, 'resize'))).toBe(
        'Moved the end of Web app 1 day earlier',
      );
      expect(line(taskChange(web, { start: addDays(web.start, 1), end: addDays(web.end, 3) }, 'keyboard'))).toBe(
        'Moved the start of Web app 1 day later and the end 3 days later',
      );
      expect(line(taskChange(web, { progress: 45 }, 'progress'))).toBe('Set the progress of Web app to 45%');
      expect(line(linkChange(plan, { fromId: 'research', toId: 'build' }, 'link', 'link'))).toBe(
        'Linked Research → Build (finish to start)',
      );
      expect(
        line(linkChange(plan, { fromId: 'api', toId: 'docs', type: DependencyType.SS, lag: -2 }, 'link', 'api')),
      ).toBe('Linked Public API → Documentation (start to start, −2 days)');
      expect(line(linkChange(plan, { fromId: 'survey', toId: 'wireframes' }, 'unlink', 'delete'))).toBe(
        'Removed the link Survey analysis → Wireframes (finish to start)',
      );
      expect(line(taskChange(design, { name: 'UI design' }, 'cell', { column: 'name' }))).toBe('Edited Name of Design');
      expect(line(taskChange(design, { name: 'UI design' }, 'api'))).toBe('Edited Name of Design');
      // Elapsed time that is not whole days reads in hours
      const later = (d: Date) => new Date(d.getTime() + 6 * 60 * 60 * 1000);
      expect(line(taskChange(web, { start: later(web.start), end: later(web.end) }, 'drag'))).toBe(
        'Moved Web app 6 hours later',
      );
      expect(line(taskChange(web, {}, 'api'))).toBe('');
    });

    it('marks what undo and redo did', () => {
      const design = task(plan, 'design');
      const move = taskChange(design, { start: addDays(design.start, 2), end: addDays(design.end, 2) }, 'drag');
      expect(line(invertChange(move, 'undo'))).toBe('Undo: moved Design 2 days earlier');
      expect(line({ ...move, source: 'redo' })).toBe('Redo: moved Design 2 days later');
      const link = linkChange(plan, { fromId: 'research', toId: 'build' }, 'link', 'link');
      expect(line(invertChange(link, 'undo'))).toBe('Undo: removed the link Research → Build (finish to start)');
      // A coalesced step reads as several parts: each one lowercased after "Undo: "
      const both = taskChange(
        design,
        { start: addDays(design.start, 2), end: addDays(design.end, 2), progress: 40 },
        'keyboard',
      );
      expect(line(invertChange(both, 'undo'))).toMatch(/^Undo: [a-z][^;]*; [a-z]/);
    });

    it('keeps the newest lines first, at most EDIT_LOG_LIMIT', () => {
      expect(EDIT_LOG_LIMIT).toBe(5);
      let log: string[] = [];
      for (let i = 1; i <= 7; i++) log = pushLog(log, `line ${i}`);
      expect(log).toEqual(['line 7', 'line 6', 'line 5', 'line 4', 'line 3']);
      const same = pushLog(log, '');
      expect(same).toEqual(log);
      expect(same).not.toBe(log);
    });
  });

  it('build the same tasks for the same now', () => {
    for (const build of [editingTasks, cellEditingTasks, customEditorsTasks, dependencyEditingTasks, controlledTasks]) {
      expect(build(NOW)).toEqual(build(NOW));
      expectSound(build(NOW));
    }
    const tree = dependencyEditingTasks(NOW);
    expect(tree.flatMap(dependenciesOf)).toHaveLength(3);
    expect(Math.max(...tree.map(t => depth(tree, t)))).toBe(1);
    expect(
      controlledTasks(NOW)
        .filter(t => t.progress === 100)
        .map(t => t.name),
    ).toEqual(['Research', 'Design']);
    const flat = customEditorsTasks(NOW);
    expect(flat.every(t => !t.parentId && t.type !== TaskType.Group && t.style?.color)).toBe(true);
    expect(flat[0].id).toBe(CUSTOM_EDITORS_FIRST_TASK);
    expect(task(flat, CUSTOM_EDITORS_MILESTONE).type).toBe(TaskType.Milestone);
  });

  it('turn on the editing features each case is about', () => {
    const editing = (o: GanttOptions) => resolveConfig(o).editing;
    expect(editing(EDITING_OPTIONS)).toMatchObject({
      enabled: true,
      cells: false,
      progress: { step: 5 },
      dependencies: { create: false, delete: false },
      controlled: false,
    });
    expect(editing(EDITING_OPTIONS).history).not.toBe(false);
    expect(editing(CELL_EDITING_OPTIONS)).toMatchObject({ cells: true, dependencies: { create: true, delete: true } });
    expect(editing(CUSTOM_EDITORS_OPTIONS)).toMatchObject({
      cells: true,
      progress: false,
      dependencies: { create: false },
    });
    expect(editing(dependencyEditingOptions(DEPENDENCY_EDITING_INITIAL.parentChild)).dependencies).toEqual({
      create: true,
      delete: true,
      parentChild: false,
    });
    expect(editing(dependencyEditingOptions(true)).dependencies.parentChild).toBe(true);
    expect(editing(CONTROLLED_OPTIONS)).toMatchObject({ controlled: true, history: false, progress: { step: 10 } });
    expect(CELL_EDITING_VIEWS.map(v => v.value)).toEqual(['split', 'table']);
    expect(CELL_EDITING_OPTIONS).toEqual(cellEditingOptions(CELL_EDITING_INITIAL.view));
    expect(cellEditingOptions('table')).toMatchObject({
      view: 'table',
      table: { columns: CELL_EDITING_OPTIONS.panel?.columns },
    });
  });

  it('cell-editing: the hint’s values are rejected or accepted as it says', () => {
    const tasks = cellEditingTasks(NOW);
    const builtin = (key: string): ColumnDef => ({ key, label: key, width: 100, builtin: true });
    const wireframes = task(tasks, 'wireframes');
    expect(editCell(tasks, CELL_EDITING_OPTIONS, builtin('progress'), 'wireframes', '150').result).toEqual({
      error: DEFAULT_LABELS.errorRange(0, 100),
    });
    expect(
      editCell(tasks, CELL_EDITING_OPTIONS, builtin('end'), 'wireframes', ymd(addDays(wireframes.start, -3))).result,
    ).toEqual({ error: DEFAULT_LABELS.errorEndBeforeStart });
    const typed = editCell(tasks, CELL_EDITING_OPTIONS, builtin('predecessors'), 'wireframes', 'research FS+2d');
    expect(typed.result).toEqual({ patch: { dependency: [{ taskId: 'research', lag: 2 }] } });
    if (!typed.result || !('patch' in typed.result)) throw new Error('no patch');
    const change = taskChange(wireframes, typed.result.patch, 'cell', { column: 'predecessors' });
    expect(prepareChange(change, { tasks, config: typed.config, labels: DEFAULT_LABELS }).ok).toBe(true);
  });

  it('custom-editors: owner list, estimate check (none on milestones) and colour', () => {
    const tasks = customEditorsTasks(NOW);
    const options: GanttOptions = { ...CUSTOM_EDITORS_OPTIONS, columns: CUSTOM_EDITOR_COLUMNS };
    const col = (key: string) => CUSTOM_EDITOR_COLUMNS.find(c => c.key === key)!;
    const first = CUSTOM_EDITORS_FIRST_TASK;

    const owner = editCell(tasks, options, col('owner'), first, 'Grace Hopper');
    expect(owner.editor?.kind).toBe('select');
    expect(owner.editor?.input.options).toHaveLength(5);
    expect(owner.editor?.value).toBe(task(tasks, first).data?.['owner']);
    expect(owner.result).toMatchObject({ patch: { data: { owner: 'Grace Hopper' } } });

    expect(editCell(tasks, options, col('estimate'), CUSTOM_EDITORS_MILESTONE, '4').editor).toBeNull();
    const estimate = editCell(tasks, options, col('estimate'), first, '90');
    expect(estimate.editor?.value).toBe(String(task(tasks, first).data?.['estimate']));
    expect(estimate.result).toEqual({ error: 'Between 1 and 80 hours' });
    expect(editCell(tasks, options, col('estimate'), first, '12').result).toMatchObject({
      patch: { data: { estimate: 12 } },
    });

    expect(editCell(tasks, options, col('colour'), first, 'red').result).toEqual({
      error: 'Enter a colour such as #2563eb',
    });
    expect(editCell(tasks, options, col('colour'), first, '#FF0000').result).toEqual({
      patch: { style: { color: '#ff0000' } },
    });
  });

  it('dependency-editing: parent–child links only with the switch on', () => {
    const tasks = dependencyEditingTasks(NOW);
    const parentChild = (on: boolean) => resolveConfig(dependencyEditingOptions(on)).editing.dependencies.parentChild;
    expect(linkError(tasks, 'delivery', 'build', { parentChild: parentChild(false) })?.code).toBe('parent-child');
    expect(linkError(tasks, 'delivery', 'build', { parentChild: parentChild(true) })).toBeNull();
    // The link left for you to draw
    expect(linkError(tasks, 'build', 'test', { parentChild: false })).toBeNull();
  });

  it('controlled: vetoes changes to finished tasks while locked, accepts the rest', () => {
    const tasks = controlledTasks(NOW);
    const config = resolveConfig(CONTROLLED_OPTIONS);
    const propose = (change: GanttChange) => {
      const r = prepareChange(change, { tasks, config, labels: DEFAULT_LABELS });
      if (!r.ok) throw new Error(r.message);
      return createBeforeChangeDetail(r.change, r.proposed);
    };
    const shift = (t: GanttTask) =>
      propose(taskChange(t, { start: addDays(t.start, 2), end: addDays(t.end, 2) }, 'drag'));

    const design = shift(task(tasks, 'design'));
    expect(controlledDecision(design, CONTROLLED_INITIAL.lockDone)).toEqual({
      veto: true,
      line: 'Vetoed: Design is finished',
    });
    expect(controlledDecision(design, false)).toEqual({ veto: false, line: 'Accepted: moved Design 2 days later' });
    // The caller vetoes: the decision itself has no side effect
    expect(design.defaultPrevented).toBe(false);
    expect(controlledDecision(shift(task(tasks, 'build')), true)).toEqual({
      veto: false,
      line: 'Accepted: moved Build 2 days later',
    });
    // Reopening a finished task changes it; a link from one changes only its successor
    expect(
      controlledDecision(propose(taskChange(task(tasks, 'design'), { progress: 90 }, 'progress')), true).veto,
    ).toBe(true);
    expect(
      controlledDecision(propose(linkChange(tasks, { fromId: 'research', toId: 'build' }, 'link', 'link')), true),
    ).toEqual({
      veto: false,
      line: 'Accepted: linked Research → Build (finish to start)',
    });
  });
});

describe('export cases', () => {
  const exported = (detail: Partial<GanttExportEvent>): GanttExportEvent => ({
    format: 'svg',
    trigger: 'api',
    fileName: 'release-plan.svg',
    size: 24_600,
    pages: null,
    ...detail,
  });

  it('sit in the Export category, after Editing, as new one-chart cases', () => {
    const order = GALLERY_CATEGORIES.map(c => c.id);
    expect(order.indexOf('export')).toBe(order.indexOf('editing') + 1);
    expect(GALLERY_CATEGORIES[order.indexOf('export')]).toEqual({
      id: 'export',
      label: 'Export and print',
      summary: 'Save the plan as SVG, PNG or CSV, and print it on paper with the header and task list on every page.',
    });
    const cases = GALLERY_CASES.filter(c => c.category === 'export');
    expect(cases.map(c => c.id)).toEqual(['export-image', 'export-csv', 'print', 'export-toolbar']);
    expect(CASE_IDS.indexOf('export-image')).toBe(CASE_IDS.indexOf('controlled') + 1);
    for (const c of cases) {
      expect(c.isNew, c.id).toBe(true);
      expect(c.ready, c.id).toEqual({ charts: 1 });
    }
    expect(notesForCase('export-toolbar').map(n => n.id)).toEqual([
      'before-export',
      'custom-bars',
      'export-custom-bars',
    ]);
    expect(FRAMEWORK_NOTES.find(n => n.id === 'export-ssr')?.cases).toEqual([]);
  });

  describe('export log', () => {
    it('formats sizes in B, KB and MB with one decimal', () => {
      const cases: [number, string][] = [
        [0, '0 B'],
        [980, '980 B'],
        [999, '999 B'],
        [1000, '1.0 KB'],
        [1049, '1.0 KB'],
        [1050, '1.1 KB'],
        [24_600, '24.6 KB'],
        [999_949, '999.9 KB'],
        // Rounds up to 1000 KB: reads in MB
        [999_950, '1.0 MB'],
        [1_200_000, '1.2 MB'],
        [999_950_000, '1.0 GB'],
        [-5, '0 B'],
        [Number.NaN, '0 B'],
        [12.4, '12 B'],
      ];
      for (const [n, text] of cases) expect(formatBytes(n), String(n)).toBe(text);
    });

    it('describes saved files, prints and blocked exports in one line', () => {
      expect(describeExport(exported({}))).toBe('Saved release-plan.svg (24.6 KB)');
      expect(describeExport(exported({ format: 'png', fileName: 'release-plan.png', size: 1_234_567 }))).toBe(
        'Saved release-plan.png (1.2 MB)',
      );
      expect(
        describeExport(exported({ format: 'csv', fileName: 'budget-plan.csv', size: 980, trigger: 'toolbar' })),
      ).toBe('Saved budget-plan.csv (980 B)');
      expect(describeExport(exported({ format: 'print', fileName: null, size: null, pages: 3 }))).toBe(
        'Printed 3 pages',
      );
      expect(describeExport(exported({ format: 'print', fileName: null, size: null, pages: 1 }))).toBe(
        'Printed 1 page',
      );
      expect(describeExport(exported({ size: null }))).toBe('Saved release-plan.svg');
      expect(describeBlockedExport('png')).toBe('Blocked: PNG image');
      expect(describeBlockedExport('csv')).toBe('Blocked: CSV table');
      // The menu's ellipsis is left out
      expect(describeBlockedExport('print')).toBe('Blocked: Print');
      expect(describeBlockedExport('svg', { ...DEFAULT_LABELS, exportSvg: 'Image SVG' })).toBe('Blocked: Image SVG');
      expect(describeFailedExport(new RangeError('Too large'))).toBe('Failed: Too large');
      expect(describeFailedExport('no window')).toBe('Failed: no window');
      expect(EXPORT_LOG_LIMIT).toBe(EDIT_LOG_LIMIT);
    });
  });

  it('build the same sound tasks for the same now', () => {
    for (const build of [exportImageTasks, exportCsvTasks, printTasks, exportToolbarTasks]) {
      expect(build(NOW)).toEqual(build(NOW));
      expectSound(build(NOW));
    }
    expect(
      exportImageTasks(NOW)
        .filter(t => t.baseline)
        .map(t => t.id),
    ).toEqual(['wireframes', 'web']);
    expect(exportToolbarTasks(NOW).filter(t => t.barType === FLAG_BAR.type)).toHaveLength(3);
    expect(exportCsvTasks(NOW).map(t => t.name)).toEqual([
      'Kick-off',
      '=HYPERLINK("https://example.com","Approve")',
      '+Budget review',
      '-Scope cut',
      '@Vendor sync',
      'Launch',
    ]);
    // 60 rows over ten weeks, in six phases of nine tasks
    const schedule = printTasks(NOW);
    expect(schedule).toHaveLength(60);
    expect(schedule.filter(t => t.type === TaskType.Group)).toHaveLength(6);
    expect(Math.max(...schedule.map(t => depth(schedule, t)))).toBe(1);
    const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);
    const first = new Date(Math.min(...schedule.map(t => t.start.getTime())));
    const last = new Date(Math.max(...schedule.map(t => t.end.getTime())));
    expect(days(first, last)).toBeLessThanOrEqual(70);
    expect(days(first, last)).toBeGreaterThan(63);
    expect(schedule.at(-1)).toMatchObject({ id: 'finishes-9', name: 'Handover', type: TaskType.Milestone });
  });

  it('export-image: options, choices and the file name', () => {
    expect(EXPORT_THEMES.map(c => c.label)).toEqual(['Shown', 'Light', 'Dark']);
    expect(EXPORT_RANGES.map(c => c.label)).toEqual(['Whole plan', 'On screen']);
    expect(imageExportOptions(EXPORT_IMAGE_INITIAL)).toEqual({ theme: 'current', range: 'all' });
    expect(imageExportOptions({ theme: 'dark', range: 'visible' })).toEqual({ theme: 'dark', range: 'visible' });
    const config = resolveConfig(EXPORT_IMAGE_OPTIONS);
    expect(config.criticalPath).toBe(true);
    expect(config.baseline).toBe(true);
    expect(exportFileName(config.export, 'svg')).toBe('release-plan.svg');
    expect(exportFileName(config.export, 'png')).toBe('release-plan.png');
    // The image holds every task and both baselines
    const svg = exportChartSvg(
      createExportSource({ tasks: exportImageTasks(NOW), options: EXPORT_IMAGE_OPTIONS, now: NOW }),
    );
    expect(svg).toContain('<title id=');
    expect(svg).toContain('Release plan');
    expect(svg.match(/class="gantt-bar-baseline"/g)).toHaveLength(2);
  });

  it('export-csv: options, choices and the preview lines', () => {
    expect(CSV_COLUMNS.map(c => [c.value, c.label])).toEqual([
      ['visible', 'Shown'],
      ['all', 'All'],
    ]);
    expect(CSV_VALUES.map(c => [c.value, c.label])).toEqual([
      ['data', 'Data'],
      ['display', 'As shown'],
    ]);
    expect(csvExportOptions(EXPORT_CSV_INITIAL)).toEqual({ columns: 'visible', values: 'data', bom: true });
    expect(EXPORT_CSV_HINT).toMatch(/apostrophe/);
    expect(exportFileName(resolveConfig(EXPORT_CSV_OPTIONS).export, 'csv')).toBe('budget-plan.csv');

    const source = createExportSource({ tasks: exportCsvTasks(NOW), options: EXPORT_CSV_OPTIONS, now: NOW });
    const csv = exportChartCsv(source, csvExportOptions(EXPORT_CSV_INITIAL));
    const lines = csvPreviewLines(csv);
    // A header, five tasks, then what is left out
    expect(lines).toHaveLength(7);
    expect(lines[0].split(',')).toHaveLength(4);
    expect(lines[1]).toMatch(/^Kick-off,/);
    expect(lines[2]).toMatch(/^"'=HYPERLINK\(""https:\/\/example\.com"",""Approve""\)",/);
    expect(lines[3]).toMatch(/^'\+Budget review,/);
    expect(lines[4]).toMatch(/^'-Scope cut,/);
    expect(lines[5]).toMatch(/^'@Vendor sync,/);
    expect(lines[6]).toBe('… 1 more row');
    expect(csvPreviewLines(csv, 10)).toHaveLength(7);
    expect(csvPreviewLines(csv, 10)[6]).toMatch(/^Launch,/);
    // Every column of the catalogue, and the cells as shown
    const all = exportChartCsv(source, csvExportOptions({ columns: 'all', values: 'display', bom: true }));
    expect(csvPreviewLines(all)[0].split(',').length).toBeGreaterThan(4);
  });

  it('csvPreviewLines: records, not lines', () => {
    expect(csvPreviewLines('')).toEqual([]);
    expect(csvPreviewLines('a,b\r\n1,2')).toEqual(['a,b', '1,2']);
    expect(csvPreviewLines('﻿a\r\n"x\r\ny",2\n3\r\n')).toEqual(['a', '"x↵y",2', '3']);
    expect(csvPreviewLines('a\r\nb\r\nc', 2)).toEqual(['a', 'b', '… 1 more row']);
    expect(csvPreviewLines('a\r\nb\r\nc\r\nd', 1)).toEqual(['a', '… 3 more rows']);
    expect(csvPreviewLines('a\r\nb', 0)).toEqual(['… 2 more rows']);
  });

  it('print: choices, options and pages', () => {
    expect(PRINT_PAPERS.map(c => [c.value, c.label])).toEqual([
      ['a4', 'A4'],
      ['letter', 'Letter'],
      ['a3', 'A3'],
    ]);
    expect(PRINT_ORIENTATIONS.map(c => c.label)).toEqual(['Landscape', 'Portrait']);
    expect(PRINT_FITS.map(c => [c.value, c.label])).toEqual([
      ['width', 'Page width'],
      ['page', 'One page'],
      ['none', 'Actual size'],
    ]);
    expect(printOptionsOf(PRINT_INITIAL)).toEqual({
      paper: 'a4',
      orientation: 'landscape',
      fit: 'width',
      repeatTable: true,
    });
    expect(printOptionsOf({ paper: 'letter', orientation: 'portrait', fit: 'none', repeatTable: false })).toEqual({
      paper: 'letter',
      orientation: 'portrait',
      fit: 'none',
      repeatTable: false,
    });
    expect(PRINT_HINT).toMatch(/^Ctrl\+P/);
    // The schedule takes several pages at the start, and one with "One page"
    const source = createExportSource({ tasks: printTasks(NOW), options: PRINT_OPTIONS, now: NOW });
    const pages = (state: Partial<typeof PRINT_INITIAL>) =>
      exportChartPages(source, printOptionsOf({ ...PRINT_INITIAL, ...state })).pages.length;
    expect(pages({})).toBeGreaterThan(1);
    expect(pages({ fit: 'page' })).toBe(1);
  });

  it('export-toolbar: the export menu, the switch and the flag bars', () => {
    const config = resolveConfig(EXPORT_TOOLBAR_OPTIONS);
    expect(config.toolbar).toMatchObject({ export: true });
    expect(exportFileName(config.export, 'png')).toBe('roadmap.png');
    expect(EXPORT_TOOLBAR_INITIAL).toEqual({ blockPng: false });
    expect(EXPORT_TOOLBAR_HINT).toMatch(/flag bars/);
    // A third of the bar's height above it (5 to 10 px), pole on the bar's start
    expect(FLAG_BAR.flagPath({ x: 100, y: 20, height: 21.6 })).toBe('M100 20V12.8L112.3 15.32L101.5 17.84V20Z');
    expect(FLAG_BAR.flagPath({ x: 0, y: 40, height: 60 })).toMatch(/^M0 40V30L/);
    expect(FLAG_BAR.flagPath({ x: 0, y: 10, height: 6 })).toMatch(/^M0 10V5L/);
    // Custom markup reaches the image as drawn
    const svg = exportChartSvg(
      createExportSource({
        tasks: exportToolbarTasks(NOW),
        options: EXPORT_TOOLBAR_OPTIONS,
        now: NOW,
        customBar: ctx =>
          ctx.row.task.barType === FLAG_BAR.type
            ? `<path class="flag" d="${FLAG_BAR.flagPath(ctx.visual)}" fill="#2563eb"/>`
            : null,
      }),
    );
    expect(svg.match(/class="flag"/g)).toHaveLength(3);
  });
});

describe('working calendar cases', () => {
  /** Monday 12 October 2026: the week of `NOW` (a Wednesday) */
  const MONDAY = new Date(2026, 9, 12);
  const day = (offset: number, hour = 0) => new Date(2026, 9, 12 + offset, hour);
  const caseOf = (id: string) => GALLERY_CASES.find(c => c.id === id)!;
  const calendarOf = (options: GanttOptions) =>
    createWorkingCalendar({ nonWorkingTime: options.nonWorkingTime, calendar: options.calendar })!;
  const rowsOf = (tasks: GanttTask[]) => flattenTree(tasks);
  const taskIn = (tasks: readonly GanttTask[], id: string) => tasks.find(t => t.id === id)!;

  it('sit in Scheduling after week-numbering, as new one-chart cases', () => {
    const ids = ['working-days', 'shift-calendar', 'critical-float'];
    expect(CASE_IDS.indexOf('working-days')).toBe(CASE_IDS.indexOf('week-numbering') + 1);
    expect(CASE_IDS.slice(CASE_IDS.indexOf('working-days'), CASE_IDS.indexOf('working-days') + 3)).toEqual(ids);
    for (const id of ids) {
      const c = caseOf(id);
      expect(c.category, id).toBe('scheduling');
      expect(c.isNew, id).toBe(true);
      expect(c.ready, id).toEqual({ charts: 1 });
    }
    expect(caseOf('working-days').notes).toEqual(['series-model']);
    expect(caseOf('shift-calendar').notes).toEqual([]);
    expect(caseOf('critical-float').notes).toEqual(['series-model']);
    expect(GALLERY_CATEGORIES.find(c => c.id === 'scheduling')!.summary).toBe(
      'Dependencies, milestones, baselines, non-working time, week numbers and working calendars.',
    );
  });

  it('workWeekStart is the Monday of the local week, a Sunday belonging to the week before', () => {
    for (let i = 0; i < 7; i++) expect(workWeekStart(new Date(2026, 9, 12 + i, 15, 30))).toEqual(MONDAY);
    expect(workWeekStart(new Date(2026, 9, 19, 0, 0))).toEqual(new Date(2026, 9, 19));
    // Deterministic for the e2e clock: Wednesday 14 October 2026
    expect(workWeekStart(NOW)).toEqual(MONDAY);
  });

  it('build the same sound tasks for the same now', () => {
    expect(workingDaysTasks(NOW)).toEqual(workingDaysTasks(NOW));
    expect(shiftTasks(NOW)).toEqual(shiftTasks(NOW));
    expect(criticalFloatTasks(NOW)).toEqual(criticalFloatTasks(NOW));
    expectSound(workingDaysTasks(NOW));
    expectSound(shiftTasks(NOW), true);
    expectSound(criticalFloatTasks(NOW));
    // Anchored on the Monday of the week, whichever day `now` is
    expect(workingDaysTasks(new Date(2026, 9, 18, 9))[0].start).toEqual(MONDAY);
    expect(workingDaysTasks(new Date(2026, 9, 19, 9))[0].start).toEqual(day(7));
    expect(shiftTasks(NOW)[0].start).toEqual(day(0, 8));
    expect(criticalFloatTasks(NOW)[0].start).toEqual(MONDAY);
  });

  describe('working-days', () => {
    const options = workingDaysOptions(WORKING_DAYS_INITIAL, NOW);
    const tasks = workingDaysTasks(NOW);

    it('has the controls’ choices and first values', () => {
      expect(WORKING_DURATIONS).toEqual([
        { value: 'working', label: 'Working days' },
        { value: 'calendar', label: 'Calendar days' },
      ]);
      expect(WORKING_SHADINGS.map(c => c.value)).toEqual(['shade', 'hatch', 'none']);
      expect(WORKING_SHADINGS.map(c => c.label)).toEqual(['Shade', 'Hatch', 'None']);
      expect(WORKING_DAYS_INITIAL).toEqual({ durations: 'working', skipNonWorking: true, shading: 'shade' });
      expect(WORKING_DAYS_HINT).toMatch(/^Drag a bar across a weekend/);
    });

    it('holds Founders’ day on Wednesday of week 2 and the bridge days on Wednesday and Thursday of week 3', () => {
      expect(workingDaysHolidays(NOW)).toEqual([
        { start: day(9), label: 'Founders’ day' },
        { start: day(16), end: day(17), label: 'Bridge days' },
      ]);
      expect(day(9).getDay()).toBe(3);
      expect(day(16).getDay()).toBe(3);
      expect(day(17).getDay()).toBe(4);
    });

    it('lists eight date-only tasks, chained finish-to-start, over four weeks', () => {
      expect(tasks.map(t => t.name)).toEqual([
        'Survey',
        'Floor plan',
        'Network',
        'Furniture',
        'Packing',
        'Move day',
        'Unpacking',
        'Snag list',
      ]);
      expect(tasks.filter(t => t.type === TaskType.Milestone).map(t => t.name)).toEqual(['Move day']);
      expect(dependenciesOf(tasks[1])).toEqual([{ taskId: 'survey', type: DependencyType.FS }]);
      const last = Math.max(...tasks.map(t => t.end.getTime()));
      expect(last).toBeLessThanOrEqual(day(28).getTime());
      // Every start is a working day at or after its predecessor's end
      const calendar = calendarOf(options);
      for (const t of tasks) {
        expect(calendar.isWorking(t.start), t.id).toBe(true);
        for (const dep of dependenciesOf(t))
          expect(t.start.getTime(), t.id).toBeGreaterThanOrEqual(taskIn(tasks, dep.taskId).end.getTime());
      }
    });

    it('draws a bar across a weekend and another across a holiday', () => {
      const calendar = calendarOf(options);
      const holidayDays = new Set([day(9).getTime(), day(16).getTime(), day(17).getTime()]);
      const daysOf = (t: GanttTask) => {
        const days: Date[] = [];
        for (let d = new Date(t.start); d < t.end; d = addDays(d, 1)) days.push(d);
        return days;
      };
      const crossesWeekend = tasks.filter(t => daysOf(t).some(d => d.getDay() === 0 || d.getDay() === 6));
      const crossesHoliday = tasks.filter(t => daysOf(t).some(d => holidayDays.has(d.getTime())));
      expect(crossesWeekend.map(t => t.id)).toEqual(expect.arrayContaining(['floor-plan']));
      expect(crossesHoliday.map(t => t.id)).toEqual(['network', 'furniture']);
      // Their bars are longer than their working days
      const working = Object.fromEntries(tasks.map(t => [t.id, calendar.workingDuration(t.start, t.end)]));
      expect(working).toEqual({
        survey: 3,
        'floor-plan': 3,
        network: 3,
        furniture: 3,
        packing: 1,
        'move-day': 0,
        unpacking: 2,
        'snag-list': 1,
      });
      expect(
        calendarDays(taskIn(tasks, 'floor-plan').end, false) - calendarDays(taskIn(tasks, 'floor-plan').start, false),
      ).toBe(5);
    });

    it('says how many working days the plan spans, whatever Durations and the shading say', () => {
      expect(workingSummary(tasks, options)).toBe('16 working days over 25 calendar days');
      for (const durations of ['working', 'calendar'] as const) {
        for (const shading of ['shade', 'hatch', 'none'] as const) {
          const o = workingDaysOptions({ durations, skipNonWorking: durations === 'working', shading }, NOW);
          expect(workingSummary(tasks, o), `${durations} ${shading}`).toBe('16 working days over 25 calendar days');
        }
      }
      // Singular, empty, and a plan shortened by an edit
      expect(workingSummary([taskIn(tasks, 'packing')], options)).toBe('1 working day over 1 calendar day');
      expect(workingSummary([], options)).toBe('0 working days');
      expect(workingSummary(tasks.slice(0, 2), options)).toBe('6 working days over 8 calendar days');
    });

    it('maps the state to calendar and non-working options', () => {
      const config = resolveConfig(options);
      expect(config.calendar).toMatchObject({ durations: 'working', skipNonWorking: true, unit: 'day' });
      expect(config.nonWorking?.style).toBe('shade');
      expect(options).toMatchObject({
        viewMode: 'Day',
        panel: { columns: ['name', 'start', 'end', 'duration'], width: 420 },
        initialScroll: 'start',
        labels: { ariaChart: 'Office move plan' },
      });
      const calendarDaysState = resolveConfig(
        workingDaysOptions({ durations: 'calendar', skipNonWorking: false, shading: 'none' }, NOW),
      );
      expect(calendarDaysState.calendar).toMatchObject({ durations: 'calendar', skipNonWorking: false });
      expect(calendarDaysState.nonWorking?.style).toBe('none');
    });

    it('reads a bar’s Duration in working days, or in calendar days', () => {
      const floorPlan = taskIn(tasks, 'floor-plan');
      const text = (durations: 'working' | 'calendar') =>
        formatDuration(floorPlan, resolveConfig(workingDaysOptions({ ...WORKING_DAYS_INITIAL, durations }, NOW)));
      expect(text('working')).toBe('3 days');
      expect(text('calendar')).toBe('5 days');
    });
  });

  describe('shift-calendar', () => {
    const tasks = shiftTasks(NOW);

    it('has the controls’ choices and first values', () => {
      expect(SHIFT_VIEW_MODES).toEqual([
        { value: 'Hour', label: 'Hours' },
        { value: 'Day', label: 'Days' },
      ]);
      expect(SHIFT_HOURS_PER_DAY).toEqual([
        { value: 6, label: '6 hours' },
        { value: 7.5, label: '7.5 hours' },
        { value: 8, label: '8 hours' },
      ]);
      expect(SHIFT_FRIDAYS).toEqual([
        { value: 'full', label: 'Full day' },
        { value: 'half', label: 'Half day' },
      ]);
      expect(SHIFT_INITIAL).toEqual({ viewMode: 'Hour', hoursPerDay: 8, friday: 'half' });
      expect(SHIFT_HINT).toMatch(/^Type 6h or 1\.5d in a Duration cell/);
    });

    it('works Monday to Thursday 8–12 and 13–17, and Friday as the control says', () => {
      const half = shiftWorkingHours('half');
      const full = shiftWorkingHours('full');
      expect(Object.keys(half).sort()).toEqual(['1', '2', '3', '4', '5']);
      for (const weekday of [1, 2, 3, 4]) {
        expect(half[weekday]).toEqual([
          { start: 8, end: 12 },
          { start: 13, end: 17 },
        ]);
        expect(full[weekday]).toEqual(half[weekday]);
      }
      expect(half[5]).toEqual([{ start: 8, end: 12 }]);
      expect(full[5]).toEqual(full[1]);
      // Friday afternoon: off with the half day, working with the full one
      const friday = (friday: 'full' | 'half') => calendarOf(shiftOptions({ ...SHIFT_INITIAL, friday }, NOW));
      expect(friday('half').isWorking(day(4, 14))).toBe(false);
      expect(friday('full').isWorking(day(4, 14))).toBe(true);
      expect(friday('half').isWorking(day(0, 12))).toBe(false); // lunch
    });

    it('lists seven timed tasks from Monday 08:00 to a sign-off the next Monday at 13:00', () => {
      expect(tasks.map(t => t.name)).toEqual([
        'Kick-off',
        'Prototype',
        'Review',
        'Fixes',
        'Test run',
        'Report',
        'Sign-off',
      ]);
      expect(tasks[0].start).toEqual(day(0, 8));
      const signOff = tasks[6];
      expect(signOff.type).toBe(TaskType.Milestone);
      expect(signOff.start).toEqual(day(7, 13));
      expect(signOff.end).toEqual(signOff.start);
      expect(tasks[5].end).toEqual(day(7, 12));
    });

    it('keeps every task on working time with a half or a full Friday, and its hours', () => {
      for (const friday of ['half', 'full'] as const) {
        const calendar = calendarOf(shiftOptions({ ...SHIFT_INITIAL, friday }, NOW));
        for (const t of tasks) {
          expect(calendar.snapStart(t.start), `${friday} ${t.id} start`).toBe(t.start);
          // A milestone is a point on a start (13:00 is after lunch), not the end of working time
          if (t.type !== TaskType.Milestone) expect(calendar.snapEnd(t.end), `${friday} ${t.id} end`).toBe(t.end);
        }
      }
      const calendar = calendarOf(shiftOptions(SHIFT_INITIAL, NOW));
      expect(tasks.map(t => calendar.workingDuration(t.start, t.end))).toEqual([2, 14, 4, 6, 6, 8, 0]);
    });

    it('changes Duration texts with the hours per day', () => {
      const text = (id: string, hoursPerDay: number) =>
        formatDuration(taskIn(tasks, id), resolveConfig(shiftOptions({ ...SHIFT_INITIAL, hoursPerDay }, NOW)));
      expect(text('prototype', 8)).toBe('1.75 days');
      expect(text('prototype', 6)).toBe('2.33 days');
      expect(text('fixes', 8)).toBe('6 hours');
      expect(text('fixes', 6)).toBe('1 day');
      expect(text('report', 8)).toBe('1 day');
      expect(text('report', 7.5)).toBe('1.07 days');
      // What the hint types: 6h is 6 hours, 1.5d is a day and a half of the hours per day
      const reading = resolveConfig(shiftOptions({ ...SHIFT_INITIAL, hoursPerDay: 6 }, NOW));
      expect(parseDuration('6h', reading)).toBe(1);
      expect(parseDuration('1.5d', reading)).toBe(1.5);
    });

    it('maps the state to an hour calendar with editable cells and no links or progress grip', () => {
      const options = shiftOptions(SHIFT_INITIAL, NOW);
      const config = resolveConfig(options);
      expect(config.calendar).toMatchObject({ unit: 'hour', hoursPerDay: 8, durations: 'working' });
      expect(config.editing.cells).toBe(true);
      expect(options).toMatchObject({
        viewMode: 'Hour',
        editing: { progress: false, dependencies: false },
        panel: { columns: ['name', 'start', 'duration'], width: 380 },
        formats: { dateFormat: 'ddd D MMM HH:mm' },
        initialScroll: 'start',
        labels: { ariaChart: 'Workshop shift plan' },
      });
      // Times of day stay times of day, whatever the viewer's zone
      expect(config.normalizeDateOnly).toBe(false);
      expect(shiftOptions({ ...SHIFT_INITIAL, viewMode: 'Day' }, NOW).viewMode).toBe('Day');
    });
  });

  describe('critical-float', () => {
    const tasks = criticalFloatTasks(NOW);
    const states = {
      workingOff: { durations: 'working', saturdays: false },
      calendarOff: { durations: 'calendar', saturdays: false },
      workingOn: { durations: 'working', saturdays: true },
      calendarOn: { durations: 'calendar', saturdays: true },
    } as const;
    const summary = (state: keyof typeof states) => criticalSummary(tasks, criticalFloatOptions(states[state], NOW));

    it('has the control’s choices and first values', () => {
      expect(CRITICAL_DURATIONS).toEqual([
        { value: 'working', label: 'Working days' },
        { value: 'calendar', label: 'Calendar days' },
      ]);
      expect(CRITICAL_FLOAT_INITIAL).toEqual({ durations: 'working', saturdays: false });
      expect(CRITICAL_FLOAT_HINT).toMatch(/^Hover or focus a bar to see its float in the tooltip\./);
    });

    it('names the critical chain, which changes with Durations and with Saturdays', () => {
      expect(summary('workingOff')).toBe('Critical path: Foundations → Framing → Roof → Inspection');
      expect(summary('calendarOff')).toBe('Critical path: Permits → Utilities → Inspection');
      expect(summary('workingOn')).toBe('Critical path: Permits → Utilities → Inspection');
      expect(summary('calendarOn')).toBe('Critical path: Permits → Utilities → Inspection');
      expect(summary('workingOff')).not.toBe(summary('calendarOff'));
      expect(summary('workingOff')).not.toBe(summary('workingOn'));
      expect(criticalSummary([], criticalFloatOptions(CRITICAL_FLOAT_INITIAL, NOW))).toBe('No critical path');
    });

    it('counts the float in working days, or in calendar days', () => {
      const floatOf = (state: keyof typeof states) =>
        computeCriticalPath(tasks, resolveConfig(criticalFloatOptions(states[state], NOW))).floatMap;
      const working = floatOf('workingOff');
      expect([working.get('permits'), working.get('utilities'), working.get('foundations')]).toEqual([1, 1, 0]);
      const calendar = floatOf('calendarOff');
      expect([calendar.get('foundations'), calendar.get('roof'), calendar.get('permits')]).toEqual([3, 3, 0]);
    });

    it('maps the state to a working calendar, the weekend and the Float column', () => {
      const options = criticalFloatOptions(CRITICAL_FLOAT_INITIAL, NOW);
      expect(options).toMatchObject({
        viewMode: 'Day',
        criticalPath: true,
        calendar: { durations: 'working' },
        nonWorkingTime: { weekends: [0, 6] },
        panel: { columns: ['name', 'duration', 'float'], width: 360 },
        initialScroll: 'start',
        labels: { ariaChart: 'Fit-out schedule' },
      });
      expect(options.columns).toEqual([FLOAT_COLUMN]);
      expect(criticalFloatOptions(states.workingOn, NOW)).toMatchObject({ nonWorkingTime: { weekends: [0] } });
      expect(resolveConfig(criticalFloatOptions(states.calendarOff, NOW)).calendar?.durations).toBe('calendar');
    });

    it('FLOAT_COLUMN prints formatFloat of the CPM float, and nothing for parents', () => {
      expect(FLOAT_COLUMN).toMatchObject({ key: 'float', label: 'Float', width: 72, align: 'end', sortable: false });
      for (const state of Object.values(states)) {
        const config = resolveConfig(criticalFloatOptions(state, NOW));
        const ctx = buildColumnContext({ tasks, config, now: NOW });
        const { floatMap } = computeCriticalPath(tasks, config);
        for (const row of rowsOf(tasks)) {
          expect(FLOAT_COLUMN.render?.(row, ctx), `${state.durations} ${state.saturdays} ${row.task.id}`).toBe(
            formatFloat(floatMap.get(row.task.id)!, ctx),
          );
        }
      }
      const ctx = buildColumnContext({
        tasks,
        config: resolveConfig(criticalFloatOptions(CRITICAL_FLOAT_INITIAL, NOW)),
        now: NOW,
      });
      const [row] = rowsOf(tasks);
      expect(FLOAT_COLUMN.render?.({ ...row, hasChildren: true }, ctx)).toBe('');
      expect(FLOAT_COLUMN.render?.(row)).toBe('');
    });
  });
});

function depth(tasks: GanttTask[], task: GanttTask): number {
  const parent = task.parentId ? tasks.find(t => t.id === task.parentId) : undefined;
  return parent ? 1 + depth(tasks, parent) : 0;
}

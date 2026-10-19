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
  commitCellValue,
  createBeforeChangeDetail,
  editRules,
  flattenTree,
  invertChange,
  linkChange,
  linkError,
  prepareChange,
  resolveCellEditor,
  resolveConfig,
  taskChange,
  type ColumnDef,
  type GanttChange,
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
  CUSTOM_EDITORS_FIRST_TASK,
  CUSTOM_EDITORS_MILESTONE,
  CUSTOM_EDITORS_OPTIONS,
  CUSTOM_EDITOR_COLUMNS,
  DEPENDENCY_EDITING_INITIAL,
  EDITING_OPTIONS,
  EDIT_LOG_LIMIT,
  FRAMEWORK_NOTES,
  GALLERY_CASES,
  GALLERY_CATEGORIES,
  GALLERY_FRAMEWORKS,
  caseNeighbours,
  casesByCategory,
  cellEditingOptions,
  cellEditingTasks,
  controlledDecision,
  controlledTasks,
  createFakeTaskApi,
  customEditorsTasks,
  currentGalleryRoute,
  dependenciesOf,
  dependencyEditingOptions,
  dependencyEditingTasks,
  describeTasksChange,
  editingTasks,
  galleryHash,
  isCaseId,
  largeTasks,
  notesForCase,
  onHashChange,
  parseGalleryHash,
  pipelineTasks,
  planTasks,
  pushLog,
  seededRandom,
  statesProps,
  statesTasks,
  lazyStatus,
  treeTasks,
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

/** Every task starts and ends on a local midnight, every parent and predecessor exists. */
function expectSound(tasks: GanttTask[]): void {
  const ids = new Set(tasks.map(t => t.id));
  expect(ids.size).toBe(tasks.length);
  for (const t of tasks) {
    expect(t.start.getHours() + t.start.getMinutes(), t.id).toBe(0);
    expect(t.end.getHours() + t.end.getMinutes(), t.id).toBe(0);
    expect(t.end.getTime(), t.id).toBeGreaterThanOrEqual(t.start.getTime());
    if (t.parentId) expect(ids.has(t.parentId), `${t.id} → parent ${t.parentId}`).toBe(true);
    for (const dep of dependenciesOf(t)) expect(ids.has(dep.taskId), `${t.id} → ${dep.taskId}`).toBe(true);
  }
}

describe('gallery catalog', () => {
  it('has 25 unique kebab-case ids, in catalog order', () => {
    expect(CASE_IDS).toHaveLength(25);
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
        if (!chart.dataSource) expectSound(chart.tasks);
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

function depth(tasks: GanttTask[], task: GanttTask): number {
  const parent = task.parentId ? tasks.find(t => t.id === task.parentId) : undefined;
  return parent ? 1 + depth(tasks, parent) : 0;
}

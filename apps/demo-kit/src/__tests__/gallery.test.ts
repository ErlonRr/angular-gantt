// The examples gallery (demo-kit/gallery): the catalog, the case modules, the seeded data, the
// framework notes, the hash router and links, and the generated code samples (they must match what
// scripts/gallery-sources.mjs writes today). Reads files: Node types for this test only.
/// <reference types="node" />
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GanttTask } from '@gantryjs/core';
import {
  CASE_DATA,
  CASE_IDS,
  FRAMEWORK_NOTES,
  GALLERY_CASES,
  GALLERY_CATEGORIES,
  GALLERY_FRAMEWORKS,
  caseNeighbours,
  casesByCategory,
  createFakeTaskApi,
  currentGalleryRoute,
  dependenciesOf,
  galleryHash,
  isCaseId,
  largeTasks,
  notesForCase,
  onHashChange,
  parseGalleryHash,
  pipelineTasks,
  planTasks,
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
  it('has 20 unique kebab-case ids, in catalog order', () => {
    expect(CASE_IDS).toHaveLength(20);
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
      expect(result.missing).toHaveLength(100 - 2);
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
      expect(first.changed).toHaveLength(21);
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

function depth(tasks: GanttTask[], task: GanttTask): number {
  const parent = task.parentId ? tasks.find(t => t.id === task.parentId) : undefined;
  return parent ? 1 + depth(tasks, parent) : 0;
}

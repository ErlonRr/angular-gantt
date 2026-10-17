// Accessibility of both bindings in Chromium (Gantry 2: phase 6 step 4.2 for <gantry-element>, phase 7
// step 4.2 for Angular's <gantry>):
// - axe (WCAG 2.0–2.2, levels A and AA) on the split, table, chart-only and dark views;
// - the keyboard path through the internal tab stops: toolbar → task-list row → splitter → timeline;
// - focus kept on a selected row while it scrolls away, pinned once it leaves the virtual window;
// - the host: a region named by `labels.ariaChart` (ElementInternals for the Web Component, host
//   attributes for Angular), the dark theme as `:state(dark)` / `.gantry-dark`, and no `tabindex` /
//   `data-theme`.
// The Web Component runs in the playground; Angular in the showcase's `/fixture` route, fed through
// `window.__GANTRY_FIXTURE__` (view, dark mode, extra rows).
import AxeBuilder from '@axe-core/playwright';
import { test, expect, SEL, type Chart } from './fixtures';
import { day, type FixtureTask, type PaintFixture } from './paint-fixture';
import { TARGETS } from '../playwright.config';

type Result = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number];
type NodeResult = Result['nodes'][number];

type Target = 'vanilla' | 'angular';
const TARGET_LIST: readonly Target[] = ['vanilla', 'angular'];
/** The chart element axe checks */
const HOST: Record<Target, string> = { vanilla: 'gantry-element', angular: 'gantry' };

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

type View = 'split' | 'table' | 'chart';
interface OpenOptions {
  dark: boolean;
  view: View;
  extraRows?: number;
}

/**
 * Violations that exist outside this step's scope, matched node by node (anything else fails).
 * Remove an entry once it is fixed.
 */
const KNOWN_VIOLATIONS: readonly { id: string; node: (n: NodeResult) => boolean; why: string }[] = [];

const isKnown = (v: Result, n: NodeResult) => KNOWN_VIOLATIONS.some(k => k.id === v.id && k.node(n));

/** Two animation frames: the Web Component paints once per frame, Angular renders within one. */
const frames = (chart: Chart) =>
  chart.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/** The playground's chart in `view`, light or dark, with `extraRows` generated tasks appended. */
async function openVanilla(chart: Chart, opts: OpenOptions): Promise<void> {
  await chart.open(`http://localhost:${TARGETS.vanilla.port}/`);
  await chart.host().evaluate((el, o) => {
    const g = el as HTMLElement & { darkMode: boolean; tasks: unknown[]; setView(v: string): void };
    g.darkMode = o.dark;
    g.setView(o.view);
    if (o.extraRows) {
      const base = new Date();
      g.tasks = [
        ...g.tasks,
        ...Array.from({ length: o.extraRows }, (_, i) => ({
          id: `a11y-${i}`,
          name: `A11y task ${i + 1}`,
          progress: 30,
          start: new Date(base.getFullYear(), base.getMonth(), base.getDate() - 20 + (i % 30)),
          end: new Date(base.getFullYear(), base.getMonth(), base.getDate() - 10 + (i % 30)),
        })),
      ];
    }
  }, opts);
}

/**
 * A plain plan for the Angular fixture (groups, dependencies, a milestone; no explicit colours), wide
 * enough in the Week view to scroll horizontally. Dates are relative to the fixed `NOW`.
 */
const A11Y_TASKS: FixtureTask[] = [
  { id: 'plan', name: 'Planning', type: 'group', start: day(-40), end: day(-5), progress: 80 },
  { id: 'scope', name: 'Scope', parentId: 'plan', start: day(-40), end: day(-30), progress: 100 },
  {
    id: 'research',
    name: 'Research',
    parentId: 'plan',
    start: day(-30),
    end: day(-15),
    progress: 100,
    dependency: 'scope',
  },
  {
    id: 'specs',
    name: 'Specifications',
    parentId: 'plan',
    start: day(-15),
    end: day(-5),
    progress: 60,
    dependency: 'research',
  },
  { id: 'build', name: 'Build', type: 'group', start: day(-5), end: day(40), progress: 20 },
  { id: 'api', name: 'API', parentId: 'build', start: day(-5), end: day(15), progress: 40, dependency: 'specs' },
  { id: 'ui', name: 'Interface', parentId: 'build', start: day(5), end: day(30), progress: 10, dependency: 'api' },
  { id: 'tests', name: 'Tests', parentId: 'build', start: day(20), end: day(40), dependency: 'ui' },
  { id: 'launch', name: 'Launch', type: 'milestone', start: day(45), end: day(45), dependency: 'tests' },
  { id: 'docs', name: 'Documentation', start: day(10), end: day(55), progress: 5 },
];

/** The Angular fixture for `opts` (the same extra rows as the Web Component's). */
function angularFixture(opts: OpenOptions): PaintFixture {
  const extra: FixtureTask[] = Array.from({ length: opts.extraRows ?? 0 }, (_, i) => ({
    id: `a11y-${i}`,
    name: `A11y task ${i + 1}`,
    progress: 30,
    start: day(-20 + (i % 30)),
    end: day(-10 + (i % 30)),
  }));
  return {
    tasks: [...A11Y_TASKS, ...extra],
    options: { viewMode: 'Week', initialScroll: false, view: opts.view },
    annotations: [],
    highlight: [],
    darkMode: opts.dark,
    selected: [],
  };
}

/** The showcase's `/fixture` route rendering `opts` (rows exist in every view; the chart view hides them). */
async function openAngular(chart: Chart, opts: OpenOptions): Promise<void> {
  await chart.page.addInitScript(f => {
    (window as Window & { __GANTRY_FIXTURE__?: unknown }).__GANTRY_FIXTURE__ = f;
  }, angularFixture(opts));
  await chart.page.goto(`http://localhost:${TARGETS.angular.port}/fixture`);
  await expect(chart.get(SEL.row).first()).toBeAttached();
}

/** `target`'s chart in `view`, light or dark, with `extraRows` generated tasks appended. */
async function open(chart: Chart, target: Target, opts: OpenOptions): Promise<void> {
  // No transitions: axe and the focus checks see the final state of a view switch
  await chart.page.emulateMedia({ reducedMotion: 'reduce' });
  await (target === 'vanilla' ? openVanilla(chart, opts) : openAngular(chart, opts));
  await frames(chart);
}

/**
 * What holds keyboard focus: a tab-stop kind inside the chart, `'host'` for the chart element itself,
 * or `null` once focus left the chart (shadow root for the Web Component, light DOM for Angular).
 */
function focusedKind(chart: Chart): Promise<string | null> {
  return chart.page.evaluate(() => {
    const host = document.querySelector('gantry-element, gantry');
    if (!host) return null;
    let a: Element | null;
    if (host.shadowRoot) {
      if (document.activeElement !== host) return null;
      a = host.shadowRoot.activeElement;
      if (!a) return 'host';
    } else {
      a = document.activeElement;
      if (!a || !host.contains(a)) return null;
      if (a === host) return 'host';
    }
    if (a.closest('.gantt-toolbar')) return 'toolbar';
    const kinds: Record<string, string> = {
      'gantt-tl-col-header': 'column-header',
      'gantt-tl-row': 'row',
      'gantt-collapse-btn': 'collapse',
      'gantt-load-more-btn': 'load-more',
      'gantry-splitter-handle': 'splitter',
      'gantry-splitter-toggle': 'toggle',
      'gantry-canvas-viewport': 'viewport',
    };
    for (const [cls, kind] of Object.entries(kinds)) if (a.classList.contains(cls)) return kind;
    return `${a.tagName.toLowerCase()}.${a.getAttribute('class') ?? ''}`;
  });
}

/** The region Chromium's accessibility tree has for the chart: one, named by `labels.ariaChart`. */
async function chartRegions(chart: Chart): Promise<number> {
  const cdp = await chart.page.context().newCDPSession(chart.page);
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodes } = await cdp.send('Accessibility.queryAXTree', {
    nodeId: root.nodeId,
    role: 'region',
    accessibleName: 'Gantt chart timeline',
  });
  return nodes.length;
}

const SCENARIOS: readonly ({ name: string } & OpenOptions)[] = [
  { name: 'split', dark: false, view: 'split' },
  { name: 'table', dark: false, view: 'table' },
  { name: 'chart-only', dark: false, view: 'chart' },
  { name: 'dark', dark: true, view: 'split' },
];

for (const target of TARGET_LIST) {
  test.describe(target, () => {
    for (const s of SCENARIOS) {
      test(`axe: no WCAG A/AA violations · ${s.name}`, async ({ chart, page }) => {
        await open(chart, target, s);
        const { violations } = await new AxeBuilder({ page }).include(HOST[target]).withTags(WCAG).analyze();
        const unexpected = violations.flatMap(v =>
          v.nodes
            .filter(n => !isKnown(v, n))
            .map(n => `${v.id} (${v.impact ?? '?'}): ${n.target.join(' » ')}\n  ${n.failureSummary ?? ''}`),
        );
        const known = violations.reduce((sum, v) => sum + v.nodes.filter(n => isKnown(v, n)).length, 0);
        test.info().annotations.push({
          type: 'axe',
          description: `${target} ${s.name}: ${unexpected.length} unexpected, ${known} known`,
        });
        expect(unexpected).toEqual([]);
      });
    }

    test('keyboard: Tab goes toolbar → one task-list row → splitter → timeline viewport', async ({ chart, page }) => {
      await open(chart, target, { dark: false, view: 'split' });
      // Start from a control just before the chart
      await chart.host().evaluate(el => {
        const before = document.createElement('button');
        before.id = 'a11y-before';
        before.textContent = 'Before the chart';
        el.before(before);
      });
      await page.locator('#a11y-before').focus();

      const stops: string[] = [];
      for (let i = 0; i < 150; i++) {
        await page.keyboard.press('Tab');
        const kind = await focusedKind(chart);
        if (kind === null) break;
        stops.push(kind);
      }
      const order = stops.filter((k, i) => k !== stops[i - 1]);
      test.info().annotations.push({ type: 'tab order', description: `${target}: ${order.join(' → ')}` });

      expect(stops.length, 'focus left the chart').toBeLessThan(150);
      expect(order[0]).toBe('toolbar');
      expect(order.filter(k => ['toolbar', 'row', 'splitter', 'viewport'].includes(k))).toEqual([
        'toolbar',
        'row',
        'splitter',
        'viewport',
      ]);
      // The task list is one tab stop, and the chart host is never one
      expect(stops.filter(k => k === 'row')).toHaveLength(1);
      expect(stops).not.toContain('host');

      // The focused timeline scrolls with the arrow keys (no shortcut takes them)
      const viewport = chart.get(SEL.viewport).first();
      await viewport.focus();
      const left = await viewport.evaluate(v => v.scrollLeft);
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => viewport.evaluate(v => v.scrollLeft)).toBeGreaterThan(left);

      // Shift+Tab walks back from the viewport to the splitter's toggle
      await page.keyboard.press('Shift+Tab');
      expect(await focusedKind(chart)).toBe('toggle');
    });

    test('focus stays on a selected row scrolled out of view, pinned when it leaves the window', async ({
      chart,
      page,
    }) => {
      await open(chart, target, { dark: false, view: 'split', extraRows: 200 });
      const id = await chart.evalRoot(
        root => root.querySelectorAll<HTMLElement>('.gantt-tl-row')[2].dataset['taskId']!,
      );
      const row = chart.get(`${SEL.row}[data-task-id="${id}"]`);
      await row.focus();
      await page.keyboard.press('Enter');
      await expect(row).toHaveAttribute('aria-selected', 'true');
      await chart.evalRoot((root, taskId) => {
        (window as Window & { __a11yRow?: Element | null }).__a11yRow = root.querySelector(
          `.gantt-tl-row[data-task-id="${taskId}"]`,
        );
      }, id);

      /** Scroll the timeline by `rows` rows, then report on the row node focused before. */
      const scrollBy = async (rows: number) => {
        await chart.evalRoot((root, n) => {
          const viewport = root.querySelector<HTMLElement>('.gantry-canvas-viewport')!;
          const rowHeight = root.querySelector<HTMLElement>('.gantt-tl-row')!.offsetHeight;
          viewport.scrollTop += n * rowHeight;
        }, rows);
        await frames(chart);
        await frames(chart);
        return chart.evalRoot(root => {
          const node = (window as Window & { __a11yRow?: Element | null }).__a11yRow!;
          return {
            // Shadow root (Web Component: the host is the document's active element) or light DOM (Angular)
            focused:
              root instanceof ShadowRoot
                ? root.activeElement === node && document.activeElement === root.host
                : document.activeElement === node,
            connected: node.isConnected,
            pinned: node.classList.contains('gantt-tl-row--pinned'),
            tabStop: node.getAttribute('tabindex'),
          };
        });
      };

      expect(await scrollBy(2)).toEqual({ focused: true, connected: true, pinned: false, tabStop: '0' });
      expect(await scrollBy(50)).toEqual({ focused: true, connected: true, pinned: true, tabStop: '0' });
    });
  });
}

test('vanilla › host: region named by labels.ariaChart through ElementInternals, :state(dark), no host attributes', async ({
  chart,
}) => {
  await open(chart, 'vanilla', { dark: true, view: 'split' });
  const host = chart.host();
  const isDark = () => host.evaluate(el => el.matches(':state(dark)'));
  expect(await isDark()).toBe(true);
  await host.evaluate(el => {
    (el as HTMLElement & { darkMode: boolean }).darkMode = false;
  });
  expect(await isDark()).toBe(false);
  for (const name of ['tabindex', 'data-theme', 'role', 'aria-label']) {
    expect(await host.evaluate((el, n) => el.hasAttribute(n), name), name).toBe(false);
  }

  // Chromium's accessibility tree has the host as the region
  expect(await chartRegions(chart)).toBe(1);

  // `el.focus()` delegates to the first internal tab stop
  await host.evaluate(el => (el as HTMLElement).focus());
  expect(await focusedKind(chart)).toBe('toolbar');
});

test('angular › host: region named by labels.ariaChart, .gantry-dark, no tabindex / data-theme, not a tab stop', async ({
  chart,
}) => {
  await open(chart, 'angular', { dark: true, view: 'split' });
  const host = chart.host();
  await expect(host).toHaveAttribute('role', 'region');
  await expect(host).toHaveAttribute('aria-label', 'Gantt chart timeline');
  await expect(host).toHaveClass(/(^|\s)gantry-dark(\s|$)/);
  for (const name of ['tabindex', 'data-theme']) {
    expect(await host.evaluate((el, n) => el.hasAttribute(n), name), name).toBe(false);
  }

  // Chromium's accessibility tree has the host as the region
  expect(await chartRegions(chart)).toBe(1);

  // The host takes no focus itself (Angular components have no delegatesFocus)
  await host.evaluate(el => (el as HTMLElement).focus());
  expect(await focusedKind(chart)).toBeNull();

  // The light theme: no dark class
  await open(chart, 'angular', { dark: false, view: 'split' });
  await expect(chart.host()).not.toHaveClass(/(^|\s)gantry-dark(\s|$)/);
});

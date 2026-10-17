// Accessibility of <gantry-element> in Chromium (Gantry 2 phase 6, step 4.2):
// - axe (WCAG 2.0–2.2, levels A and AA) on the split, table, chart-only and dark views;
// - the keyboard path through the internal tab stops: toolbar → task-list row → splitter → timeline;
// - focus kept on a selected row while it scrolls away, pinned once it leaves the virtual window;
// - the host: a region named by `labels.ariaChart` through ElementInternals, `:state(dark)`, and
//   no `tabindex` / `data-theme` / `role` attribute.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, SEL, type Chart } from './fixtures';
import { TARGETS } from '../playwright.config';

type Result = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number];
type NodeResult = Result['nodes'][number];

const URL = `http://localhost:${TARGETS.vanilla.port}/`;
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

type View = 'split' | 'table' | 'chart';

/**
 * Violations that exist outside this step's scope, matched node by node (anything else fails).
 * Remove an entry once it is fixed.
 */
const KNOWN_VIOLATIONS: readonly { id: string; node: (n: NodeResult) => boolean; why: string }[] = [
  {
    id: 'color-contrast',
    node: n => n.html.includes('class="g-cell-label"') && /#b45309/i.test(n.failureSummary ?? ''),
    why:
      'Light theme, both bindings: the current period header label (--gantt-today #B45309 on the 14% today tint of ' +
      'the header, 3.97:1 at 12px). Fixing it is a deliberate visual change of the header (paint and screenshot ' +
      'baselines, Angular parity).',
  },
];

const isKnown = (v: Result, n: NodeResult) => KNOWN_VIOLATIONS.some(k => k.id === v.id && k.node(n));

/** Two animation frames: the element paints once per frame. */
const frames = (chart: Chart) =>
  chart.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/** The playground's chart in `view`, light or dark, with `extraRows` generated tasks appended. */
async function open(chart: Chart, opts: { dark: boolean; view: View; extraRows?: number }): Promise<void> {
  // No transitions: axe and the focus checks see the final state of a view switch
  await chart.page.emulateMedia({ reducedMotion: 'reduce' });
  await chart.open(URL);
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
  await frames(chart);
}

const SCENARIOS: readonly { name: string; dark: boolean; view: View }[] = [
  { name: 'split', dark: false, view: 'split' },
  { name: 'table', dark: false, view: 'table' },
  { name: 'chart-only', dark: false, view: 'chart' },
  { name: 'dark', dark: true, view: 'split' },
];

for (const s of SCENARIOS) {
  test(`axe: no WCAG A/AA violations · ${s.name}`, async ({ chart, page }) => {
    await open(chart, s);
    const { violations } = await new AxeBuilder({ page }).include('gantry-element').withTags(WCAG).analyze();
    const unexpected = violations.flatMap(v =>
      v.nodes
        .filter(n => !isKnown(v, n))
        .map(n => `${v.id} (${v.impact ?? '?'}): ${n.target.join(' » ')}\n  ${n.failureSummary ?? ''}`),
    );
    const known = violations.reduce((sum, v) => sum + v.nodes.filter(n => isKnown(v, n)).length, 0);
    test
      .info()
      .annotations.push({ type: 'axe', description: `${s.name}: ${unexpected.length} unexpected, ${known} known` });
    expect(unexpected).toEqual([]);
  });
}

/** What holds keyboard focus: a tab-stop kind inside the chart, or `null` once focus left it. */
function focusedKind(chart: Chart): Promise<string | null> {
  return chart.page.evaluate(() => {
    const host = document.querySelector('gantry-element');
    if (!host || document.activeElement !== host) return null;
    const a = host.shadowRoot!.activeElement as HTMLElement | null;
    if (!a) return 'host';
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
    return `${a.tagName.toLowerCase()}.${a.className}`;
  });
}

test('keyboard: Tab goes toolbar → one task-list row → splitter → timeline viewport', async ({ chart, page }) => {
  await open(chart, { dark: false, view: 'split' });
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
  test.info().annotations.push({ type: 'tab order', description: order.join(' → ') });

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
  await open(chart, { dark: false, view: 'split', extraRows: 200 });
  const id = await chart.evalRoot(root => root.querySelectorAll<HTMLElement>('.gantt-tl-row')[2].dataset['taskId']!);
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
        focused: (root as ShadowRoot).activeElement === node && document.activeElement === (root as ShadowRoot).host,
        connected: node.isConnected,
        pinned: node.classList.contains('gantt-tl-row--pinned'),
        tabStop: node.getAttribute('tabindex'),
      };
    });
  };

  expect(await scrollBy(2)).toEqual({ focused: true, connected: true, pinned: false, tabStop: '0' });
  expect(await scrollBy(50)).toEqual({ focused: true, connected: true, pinned: true, tabStop: '0' });
});

test('host: region named by labels.ariaChart through ElementInternals, :state(dark), no host attributes', async ({
  chart,
  page,
}) => {
  await open(chart, { dark: true, view: 'split' });
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
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodes } = await cdp.send('Accessibility.queryAXTree', {
    nodeId: root.nodeId,
    role: 'region',
    accessibleName: 'Gantt chart timeline',
  });
  expect(nodes).toHaveLength(1);

  // `el.focus()` delegates to the first internal tab stop
  await host.evaluate(el => (el as HTMLElement).focus());
  expect(await focusedKind(chart)).toBe('toolbar');
});

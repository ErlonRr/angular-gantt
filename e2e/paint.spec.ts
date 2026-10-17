// Computed-colour snapshots: every colour path of the chart (bars, labels, arrows, rows, bands,
// grid, today, annotations, header, task list, status dots, legend, tooltip), per binding and
// scenario, as sorted JSON. Exact (no tolerance) and font-independent, so it runs in local
// Chromium; it proves that painter refactors keep every pixel colour. The last test checks that
// the Web Component and Angular paint the canvas the same, up to the differences in KNOWN_DIFFS.
import { test, expect, collectPaints, type Chart, type PaintRecords } from './fixtures';
import { TARGETS } from '../playwright.config';
import { SCENARIOS, paintFixture, type PaintFixture, type Scenario } from './paint-fixture';

type Target = 'vanilla' | 'angular';
const TARGET_LIST: readonly Target[] = ['vanilla', 'angular'];

/** Replace the playground's element with a fresh one (no playground listeners or state) fed by the fixture. */
async function renderVanilla(chart: Chart, fx: PaintFixture): Promise<void> {
  await chart.open(`http://localhost:${TARGETS.vanilla.port}/`);
  await chart.host().evaluate((old, f) => {
    const LOCAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
    const revive = (v: unknown): unknown => {
      if (typeof v === 'string') return LOCAL_ISO.test(v) ? new Date(v) : v;
      if (Array.isArray(v)) return v.map(revive);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
      return v;
    };
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const byDay = new Map(f.highlight.map(h => [dayKey(new Date(h.day)), h]));
    const el = document.createElement('gantry-element') as HTMLElement & Record<string, unknown>;
    el.id = old.id;
    el.className = old.className;
    el['darkMode'] = f.darkMode;
    el['showToolbar'] = true;
    el['enableDrag'] = true;
    el['enableResize'] = true;
    el['tooltipEnabled'] = true;
    el['showLegend'] = true;
    el['tasks'] = revive(f.tasks);
    el['annotations'] = revive(f.annotations);
    el['options'] = {
      ...(revive(f.options) as object),
      highlightTime: byDay.size
        ? (start: Date, unit: string) => {
            const h = unit === 'day' ? byDay.get(dayKey(start)) : undefined;
            return h ? { color: h.color, label: h.label } : null;
          }
        : undefined,
    };
    old.replaceWith(el);
    (el['setSelectedTasks'] as (ids: string[]) => void)(f.selected);
  }, fx);
}

async function renderAngular(chart: Chart, fx: PaintFixture): Promise<void> {
  await chart.page.addInitScript(f => {
    (window as Window & { __GANTRY_FIXTURE__?: unknown }).__GANTRY_FIXTURE__ = f;
  }, fx);
  await chart.open(`http://localhost:${TARGETS.angular.port}/fixture`);
}

/** Render `scenario` on `target`, wait until it is stable and collect the computed colours. */
async function paints(chart: Chart, target: Target, scenario: Scenario): Promise<PaintRecords> {
  const fx = paintFixture(scenario);
  await chart.page.emulateMedia({ colorScheme: scenario === 'auto-dark' ? 'dark' : 'light' });
  await (target === 'vanilla' ? renderVanilla(chart, fx) : renderAngular(chart, fx));

  if (scenario === 'table') await expect(chart.get('.gantt-tl-cell').first()).toBeVisible();
  else await expect(chart.get('.gantt-bars-layer [data-task-id]').first()).toBeVisible();
  for (const id of fx.selected) await expect(chart.get(`.gantt-tl-row--selected[data-task-id="${id}"]`)).toHaveCount(1);
  if (scenario === 'tooltip') {
    await chart.get('.gantt-bars-layer [data-task-id="wireframes"] .gantt-bar-body').hover();
    await chart.page.waitForTimeout(400);
    await expect(chart.page.locator('.gantt-tooltip').filter({ visible: true })).toHaveCount(1);
  }
  // Two frames: the Web Component batches renders on requestAnimationFrame
  await chart.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  return collectPaints(chart);
}

for (const target of TARGET_LIST) {
  test.describe(`paint snapshot · ${target}`, () => {
    for (const scenario of SCENARIOS) {
      test(scenario, async ({ chart }) => {
        const result = await paints(chart, target, scenario);
        expect(Object.keys(result).length).toBeGreaterThan(50);
        expect(JSON.stringify(result, null, 1)).toMatchSnapshot(`${target}-${scenario}.json`);
      });
    }
  });
}

/** Canvas layers compared between the bindings. */
const CANVAS = /^(bars\[|arrows|rows|bands|grid|today|annotations|annotation-labels)/;

/**
 * Differences between the Web Component and Angular canvas that exist at HEAD 1cedb3f.
 * Recorded, not fixed: each entry matches keys whose colours (or presence) differ.
 * Empty: at 1cedb3f the canvas records of both bindings are identical in every compared scenario
 * (the task-list chrome does differ, but it is outside this comparison).
 */
const KNOWN_DIFFS: readonly { key: RegExp; why: string }[] = [];

for (const scenario of ['light-week', 'dark-week', 'selected'] as const) {
  test(`vanilla and Angular paint the same canvas colours · ${scenario}`, async ({ chart }) => {
    const vanilla = await paints(chart, 'vanilla', scenario);
    const angular = await paints(chart, 'angular', scenario);
    const canvas = (r: PaintRecords) => Object.keys(r).filter(k => CANVAS.test(k));
    const keys = new Set([...canvas(vanilla), ...canvas(angular)]);
    const known = (k: string) => KNOWN_DIFFS.some(d => d.key.test(k));

    const diffs: string[] = [];
    let compared = 0;
    for (const k of [...keys].sort()) {
      const a = vanilla[k],
        b = angular[k];
      if (a !== undefined && b !== undefined) compared++;
      if (a === b || known(k)) continue;
      diffs.push(`${k}\n  vanilla: ${a ?? '(missing)'}\n  angular: ${b ?? '(missing)'}`);
    }
    expect(compared, 'canvas records present in both bindings').toBeGreaterThan(50);
    expect(diffs, 'canvas colours that differ (add a HEAD difference to KNOWN_DIFFS)').toEqual([]);
  });
}

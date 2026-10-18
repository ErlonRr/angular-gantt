// Computed-colour snapshots: every colour path of the chart (bars, labels, arrows, rows, bands,
// grid, today, annotations, header, task list, status dots, legend, tooltip), per binding and
// scenario, as sorted JSON. Exact (no tolerance) and font-independent, so it runs in local
// Chromium; it proves that painter refactors keep every pixel colour. The last tests check that
// the Web Component and Angular paint the canvas, the header, the task list, the toolbar, the
// legend and the tooltip the same, up to the differences in KNOWN_DIFFS.
import { test, expect, collectPaints, type Chart, type PaintRecords } from './fixtures';
import { TARGETS } from '../playwright.config';
import { SCENARIOS, paintFixture, type PaintFixture, type Scenario } from './paint-fixture';

type Target = 'vanilla' | 'angular';
const TARGET_LIST: readonly Target[] = ['vanilla', 'angular'];

/**
 * Replace the playground's element with a fresh one (no playground listeners or state) fed by the
 * fixture, in the same fixed box as the Angular `/fixture` route (1150 × 700 at the top left), so
 * both bindings window the same rows and columns.
 */
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
    for (const [prop, value] of [
      ['position', 'fixed'],
      ['top', '0'],
      ['left', '0'],
      ['z-index', '100'],
      ['width', '1150px'],
      ['height', '700px'],
    ]) {
      el.style.setProperty(prop, value);
    }
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

/** Chrome compared between the bindings in every parity scenario: task list, toolbar, legend. */
const CHROME = /^(tl-head|tl-rows|toolbar|legend)/;
/** The timeline: canvas layers and the header (both bindings window the header, bands and grid alike). */
const TIMELINE = /^(bars\[|arrows|rows|bands|grid|today|annotations|annotation-labels|header)/;
/** The timeline and the chrome compared between the bindings. */
const COMPARED = new RegExp(`${TIMELINE.source}|${CHROME.source}`);
/** The open tooltip (one popover inside the chart, same markup in both bindings since Phase 7 step 4.1) */
const TOOLTIP = /^tooltip(\/|$)/;

/**
 * Parity scenarios and the records they compare. The table view has no canvas: only its chrome.
 * The hour scenario mounts only part of its header, bands and grid lines (horizontal windowing,
 * Phase 7 step 3.1): both bindings must mount the same ones and paint them the same. The tooltip
 * scenario adds the open tooltip's title and `<dl>` rows.
 */
const PARITY: readonly { scenario: Scenario; keys: RegExp }[] = [
  { scenario: 'light-week', keys: COMPARED },
  { scenario: 'dark-week', keys: COMPARED },
  { scenario: 'selected', keys: COMPARED },
  { scenario: 'table', keys: CHROME },
  { scenario: 'hour', keys: TIMELINE },
  { scenario: 'tooltip', keys: new RegExp(`${COMPARED.source}|${TOOLTIP.source}`) },
];

/**
 * Differences between the Web Component and Angular in the compared records.
 * Recorded, not fixed: each entry matches keys whose colours (or presence) differ.
 * Empty since Phase 7 step 1.2 (base 084be6a): the canvas, task-list, toolbar and legend records of
 * both bindings are identical in every parity scenario (step 1.2 unified the task-list markup and
 * colours and the toolbar slot's first class); the header and the hour scenario since step 3.1
 * (Angular windows the header, bands and grid lines and paints the current-period label with
 * `--gantt-today-label`); the tooltip since step 4.1 (Angular's popover moved into the chart with the
 * Web Component's markup).
 */
const KNOWN_DIFFS: readonly { key: RegExp; why: string }[] = [];

/**
 * Elements one binding keeps in the DOM without rendering them while the other leaves them out.
 * Their key may be missing from the other binding, but only while the element is not rendered
 * (`checkVisibility()` false): it paints no pixel, so there is no colour to compare. A rendered
 * element present in one binding only is a difference like any other.
 */
const UNRENDERED_IN_ONE: readonly { key: RegExp; selector: string; why: string }[] = [
  {
    key: /^toolbar\/div\.gantt-tb-slot$/,
    selector: '.gantt-tb-slot',
    why: "Angular's toolbar group for `[ganttToolbar]` content, `display: none` while empty; the Web Component has no toolbar slot",
  },
  {
    key: /^legend$/,
    selector: '.gantt-legend',
    why: 'the Web Component keeps its legend container, `hidden` in the table view; Angular removes it there',
  },
];

/** For each `UNRENDERED_IN_ONE` entry: whether one of its elements is rendered in the chart on the page. */
function renderedOneSided(chart: Chart): Promise<boolean[]> {
  return chart.evalRoot(
    (root, selectors: string[]) => selectors.map(s => [...root.querySelectorAll(s)].some(e => e.checkVisibility())),
    UNRENDERED_IN_ONE.map(d => d.selector),
  );
}

for (const { scenario, keys: compare } of PARITY) {
  test(`vanilla and Angular paint the same colours · ${scenario}`, async ({ chart }) => {
    const vanilla = await paints(chart, 'vanilla', scenario);
    const vanillaRendered = await renderedOneSided(chart);
    const angular = await paints(chart, 'angular', scenario);
    const angularRendered = await renderedOneSided(chart);
    const pick = (r: PaintRecords) => Object.keys(r).filter(k => compare.test(k));
    const keys = new Set([...pick(vanilla), ...pick(angular)]);
    const known = (k: string) => KNOWN_DIFFS.some(d => d.key.test(k));
    /** Present in one binding only, and that binding does not render it. */
    const unrendered = (k: string, a: string | undefined, b: string | undefined) => {
      const i = UNRENDERED_IN_ONE.findIndex(d => d.key.test(k));
      if (i < 0 || (a === undefined) === (b === undefined)) return false;
      return a !== undefined ? !vanillaRendered[i] : !angularRendered[i];
    };

    const diffs: string[] = [];
    let compared = 0;
    for (const k of [...keys].sort()) {
      const a = vanilla[k],
        b = angular[k];
      if (a !== undefined && b !== undefined) compared++;
      if (a === b || known(k) || unrendered(k, a, b)) continue;
      diffs.push(`${k}\n  vanilla: ${a ?? '(missing)'}\n  angular: ${b ?? '(missing)'}`);
    }
    expect(compared, 'records present in both bindings').toBeGreaterThan(50);
    expect(diffs, 'colours that differ (add a HEAD difference to KNOWN_DIFFS)').toEqual([]);
  });
}

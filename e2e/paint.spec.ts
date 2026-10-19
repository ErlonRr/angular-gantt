// Computed-colour snapshots: every colour path of the chart (bars, labels, arrows, rows, bands,
// grid, today, annotations, header, task list, status dots, legend, tooltip), per binding and
// scenario, as sorted JSON. Exact (no tolerance) and font-independent, so it runs in local
// Chromium; it proves that painter refactors keep every pixel colour. The `forced` scenario
// emulates forced colours (Windows High Contrast, D25): its records are the system colours of the
// forced-colors rules. The last tests check that the Web Component and Angular paint the canvas,
// the header, the task list, the toolbar, the legend and the tooltip the same, up to the
// differences in KNOWN_DIFFS. Phase 10 adds `styled` (the task style cascade, rolled-up status
// colours and segments, straight arrows, compact density) and `narrow` (a 600 × 600 box: the
// responsive timeline-only view and the toolbar's More button). Phase 11 adds `editing`: the
// toolbar's history group, a selected link, an invalid cell editor with its message and a hovered
// bar's grips, progress grip and link connectors. Phase 12 adds `export`: the toolbar's Export group
// (`toolbar.export`) with its menu open (the open button and the four format items).
import { test, expect, arrowPoint, collectPaints, type Chart, type PaintRecords } from './fixtures';
import { SCENARIOS, paintFixture, renderFixture, type Scenario, type Target } from './paint-fixture';

const TARGET_LIST: readonly Target[] = ['vanilla', 'angular'];

/** `data-view` of the chart: on the wrapper in the Web Component's shadow root, on Angular's host. */
function shownView(chart: Chart): Promise<string | null> {
  return chart.evalRoot(
    root =>
      (root instanceof ShadowRoot ? root.querySelector('.gantry-wrapper') : (root as Element))?.getAttribute(
        'data-view',
      ) ?? null,
  );
}

/**
 * The `editing` scenario's state: the link Wireframes → Visual design selected (a click on its
 * arrow), the % cell of Wireframes editing an invalid value (the error under it), and the pointer on
 * the Docs bar (its grips, progress grip and connectors).
 */
async function editingState(chart: Chart): Promise<void> {
  const page = chart.page;
  await expect(chart.get('.gantt-tb-history')).toHaveCount(1);
  const at = await arrowPoint(chart, 'wireframes', 'visual');
  expect(at.clear).toBeGreaterThan(2);
  await page.mouse.click(at.x, at.y);
  await expect(chart.get('g.gantt-arrow--selected')).toHaveCount(1);

  await chart.get('.gantt-tl-cell[data-focus-key="cell:wireframes:progress"]').focus();
  await page.keyboard.press('F2');
  const field = chart.get('.gantt-tl-cell--editing .gantt-tl-editor');
  await expect(field).toBeFocused();
  await page.keyboard.type('150');
  await page.keyboard.press('Enter');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(chart.get('.gantt-tl-editor-error')).toBeVisible();

  const docs = await chart.box(chart.get('.gantt-bars-layer [data-task-id="docs"] .gantt-bar-body'));
  await page.mouse.move(docs.x + docs.width / 2, docs.y + docs.height / 2);
  await expect(chart.get('.gantt-bar-overlay .gantt-link-connector')).toHaveCount(2);
  await expect(chart.get('.gantt-bar-overlay .gantt-progress-grip')).toHaveCount(1);
  await expect(chart.get('g.gantt-arrow--selected')).toHaveCount(1);
  await expect(field).toBeFocused();
}

/** The `export` scenario's state: the toolbar's Export menu opened by keyboard (↓ on its button). */
async function exportMenuState(chart: Chart): Promise<void> {
  const button = chart.get('.gantt-tb-export');
  await expect(button).toHaveCount(1);
  await button.focus();
  await chart.page.keyboard.press('ArrowDown');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(chart.get('.gantt-tb-menu[role="menu"] [role="menuitem"]')).toHaveCount(4);
  await expect.poll(() => chart.focusedKey()).toBe('menu:export:svg');
}

/** Render `scenario` on `target`, wait until it is stable and collect the computed colours. */
async function paints(chart: Chart, target: Target, scenario: Scenario): Promise<PaintRecords> {
  const fx = paintFixture(scenario);
  await chart.page.emulateMedia({
    colorScheme: scenario === 'auto-dark' ? 'dark' : 'light',
    forcedColors: scenario === 'forced' ? 'active' : 'none',
  });
  await renderFixture(chart, target, fx);

  if (scenario === 'table') await expect(chart.get('.gantt-tl-cell').first()).toBeVisible();
  else await expect(chart.get('.gantt-bars-layer [data-task-id]').first()).toBeVisible();
  if (scenario === 'styled') {
    // The collapsed parent's children are drawn as segments
    await expect(chart.get('.gantt-bars-layer [data-task-id="build"] .gantt-bar-segment')).toHaveCount(3);
  }
  if (scenario === 'narrow') {
    // Angular measures first and switches after its first frame: wait for the narrow view
    await expect(chart.get('.gantt-tb-more')).toBeVisible();
    await expect.poll(() => shownView(chart)).toBe('chart');
  }
  for (const id of fx.selected) await expect(chart.get(`.gantt-tl-row--selected[data-task-id="${id}"]`)).toHaveCount(1);
  if (scenario === 'tooltip') {
    await chart.get('.gantt-bars-layer [data-task-id="wireframes"] .gantt-bar-body').hover();
    await chart.page.waitForTimeout(400);
    await expect(chart.page.locator('.gantt-tooltip').filter({ visible: true })).toHaveCount(1);
  }
  if (scenario === 'editing') await editingState(chart);
  if (scenario === 'export') await exportMenuState(chart);
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
 * The bar overlay (focus ring, grips, progress grip, link connectors) and the link preview. Their
 * keys run through the canvas markup, which differs between the bindings (the Web Component's
 * `div.gantry-canvas-container` vs Angular's `gantt-canvas/div`): `paritySide` renames them first.
 */
const EDIT_SHAPES = /^(bar-overlay|link-preview)(\/|$)/;

/** A record key as compared between the bindings: the canvas path of the overlay and the preview dropped. */
const parityKey = (k: string) =>
  k
    .replace(/^host\/.*\/svg\/g\.gantt-bar-overlay(?=\/|$)/, 'bar-overlay')
    .replace(/^host\/.*\/svg\/path\.gantt-link-preview/, 'link-preview');

/** `records` with the keys `parityKey` renames. */
const paritySide = (records: PaintRecords): PaintRecords =>
  Object.fromEntries(Object.entries(records).map(([k, v]) => [parityKey(k), v]));

/**
 * Parity scenarios and the records they compare. The table view has no canvas: only its chrome.
 * The hour scenario mounts only part of its header, bands and grid lines (horizontal windowing,
 * Phase 7 step 3.1): both bindings must mount the same ones and paint them the same. The tooltip
 * scenario adds the open tooltip's title and `<dl>` rows. The forced scenario compares the system
 * colours of both bindings' forced-colors rules (Phase 9 wave 5). `styled` and `narrow` (phase 10)
 * compare the canvas and the chrome like the light week; `editing` (phase 11) adds the bar overlay
 * and the link preview (`EDIT_SHAPES`): the selected arrow, the history group and the open editor
 * are in the canvas and the chrome already. `export` (phase 12) compares the toolbar: the Export
 * group, its open button and the open menu (`tb-` keys).
 */
const PARITY: readonly { scenario: Scenario; keys: RegExp }[] = [
  { scenario: 'light-week', keys: COMPARED },
  { scenario: 'dark-week', keys: COMPARED },
  { scenario: 'selected', keys: COMPARED },
  { scenario: 'table', keys: CHROME },
  { scenario: 'hour', keys: TIMELINE },
  { scenario: 'tooltip', keys: new RegExp(`${COMPARED.source}|${TOOLTIP.source}`) },
  { scenario: 'forced', keys: COMPARED },
  { scenario: 'styled', keys: COMPARED },
  { scenario: 'narrow', keys: COMPARED },
  { scenario: 'editing', keys: new RegExp(`${COMPARED.source}|${EDIT_SHAPES.source}`) },
  { scenario: 'export', keys: /tb-/ },
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
 * element present in one binding only is a difference like any other. (The legend is attached
 * only while shown in both bindings since Phase 9 step 4.3, D9/D27: no entry for it.)
 */
const UNRENDERED_IN_ONE: readonly { key: RegExp; selector: string; why: string }[] = [
  {
    key: /^toolbar\/div\.gantt-tb-slot$/,
    selector: '.gantt-tb-slot',
    why: "Angular's toolbar group for `[ganttToolbar]` content, `display: none` while empty; the Web Component has no toolbar slot",
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
    const vanilla = paritySide(await paints(chart, 'vanilla', scenario));
    const vanillaRendered = await renderedOneSided(chart);
    const angular = paritySide(await paints(chart, 'angular', scenario));
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

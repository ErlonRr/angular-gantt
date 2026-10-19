// Forced colours (Windows High Contrast; Phase 9 wave 5, D25) in both bindings, emulated in
// Chromium (`page.emulateMedia({ forcedColors: 'active' })`) on the paint fixture's `forced`
// scenario (the light week: the critical chain plus one selected bar off it):
// - axe (WCAG 2.0–2.2, A and AA) with the light and the dark forced palette. In the dark one
//   without color-contrast: axe reads -webkit-text-fill-color, which Chromium's getComputedStyle
//   still resolves against the unforced theme colour (the painted text and color are forced), so
//   the light theme's dark text would be measured on the black Canvas;
// - every tab stop (toolbar control, task-list row, splitter, its toggle, the bar's overlay ring)
//   shows a visible focus indicator in a system colour: Highlight, HighlightText inside the
//   selected row;
// - critical bars are dashed, the selected bar and row show in Highlight, the today line too;
// - no SVG shape keeps a theme colour: SVG is not forced by the browser
//   (`forced-color-adjust: preserve-parent-color`), so each paint must come from the rules;
// - a toolbar button whose menu is open (`.gantt-tb-export[aria-expanded="true"]`,
//   `.gantt-tb-more[aria-expanded="true"]`, phase 12) shows in Highlight, like a pressed toggle.
// System colours are read from the page (the emulated palette), never hard-coded.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Chart } from './fixtures';
import { paintFixture, renderFixture, type PaintFixture, type Target } from './paint-fixture';

const TARGET_LIST: readonly Target[] = ['vanilla', 'angular'];
/** The chart element axe checks */
const HOST: Record<Target, string> = { vanilla: 'gantry-element', angular: 'gantry' };
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const SYSTEM_COLORS = [
  'Canvas',
  'CanvasText',
  'Highlight',
  'HighlightText',
  'GrayText',
  'ButtonFace',
  'ButtonText',
] as const;
type SystemColor = (typeof SYSTEM_COLORS)[number];

/** Two animation frames: the Web Component paints once per frame, Angular renders within one. */
const frames = (chart: Chart) =>
  chart.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/** The `forced` fixture on `target` with forced colours (light or dark palette) and no motion. */
async function open(
  chart: Chart,
  target: Target,
  colorScheme: 'light' | 'dark' = 'light',
  patch: Partial<PaintFixture> = {},
): Promise<void> {
  await chart.page.emulateMedia({ forcedColors: 'active', colorScheme, reducedMotion: 'reduce' });
  const fx = { ...paintFixture('forced'), ...patch };
  await renderFixture(chart, target, fx);
  await expect(chart.get('.gantt-bars-layer [data-task-id]').first()).toBeVisible();
  for (const id of fx.selected) await expect(chart.get(`.gantt-tl-row--selected[data-task-id="${id}"]`)).toHaveCount(1);
  await frames(chart);
}

/** The computed value of each system colour in the page's (emulated) palette. */
function systemColors(chart: Chart): Promise<Record<SystemColor, string>> {
  return chart.page.evaluate(names => {
    const probe = document.body.appendChild(document.createElement('div'));
    const out = {} as Record<SystemColor, string>;
    for (const name of names) {
      probe.style.setProperty('color', name);
      out[name] = getComputedStyle(probe).color;
    }
    probe.remove();
    return out;
  }, SYSTEM_COLORS);
}

/** The focus indicator of the element focused inside the chart, or `null` once focus left it. */
interface Ring {
  kind: string;
  /** Inside the selected task-list row (its ring is HighlightText on Highlight) */
  selectedRow: boolean;
  /** `none` when the indicator is not drawn */
  style: string;
  /** Its width / thickness in px */
  width: number;
  color: string;
}

function focusRing(chart: Chart): Promise<Ring | null> {
  return chart.page.evaluate(() => {
    const host = document.querySelector('gantry-element, gantry');
    if (!host) return null;
    const root: ParentNode = host.shadowRoot ?? host;
    const active = host.shadowRoot ? host.shadowRoot.activeElement : document.activeElement;
    if (!active || (!host.shadowRoot && !host.contains(active)) || active === host) return null;
    const selectedRow = !!active.closest('.gantt-tl-row--selected');
    const px = (v: string) => parseFloat(v) || 0;

    if (active.parentElement?.classList.contains('gantt-bars-layer')) {
      // A bar draws no outline: its ring is the overlay's rect, painted on the next frame
      const ring = root.querySelector('.gantt-bar-overlay .gantt-bar-focus-ring');
      if (!ring?.isConnected) return { kind: 'bar', selectedRow, style: 'none', width: 0, color: '' };
      const cs = getComputedStyle(ring);
      return {
        kind: 'bar',
        selectedRow,
        style: cs.stroke === 'none' ? 'none' : 'solid',
        width: px(cs.strokeWidth),
        color: cs.stroke,
      };
    }
    if (active.classList.contains('gantry-splitter-handle')) {
      // The separator's focus is its line (a pseudo-element in forced colours: gradients are dropped)
      const cs = getComputedStyle(active, '::before');
      return {
        kind: 'splitter',
        selectedRow,
        style: cs.content === 'none' ? 'none' : 'solid',
        width: px(cs.width),
        color: cs.backgroundColor,
      };
    }
    const kinds: Record<string, string> = {
      'gantt-tl-col-header': 'column-header',
      'gantt-tl-cell': 'cell',
      'gantt-tl-row': 'row',
      'gantt-collapse-btn': 'collapse',
      'gantry-splitter-toggle': 'toggle',
      'gantry-canvas-viewport': 'viewport',
    };
    let kind = active.closest('.gantt-toolbar')
      ? 'toolbar'
      : `${active.tagName.toLowerCase()}.${active.getAttribute('class') ?? ''}`;
    for (const [cls, k] of Object.entries(kinds)) if (active.classList.contains(cls)) kind = k;
    const cs = getComputedStyle(active);
    return { kind, selectedRow, style: cs.outlineStyle, width: px(cs.outlineWidth), color: cs.outlineColor };
  });
}

for (const target of TARGET_LIST) {
  test.describe(`forced colors · ${target}`, () => {
    for (const scheme of ['light', 'dark'] as const) {
      test(`axe: no WCAG A/AA violations · ${scheme} palette`, async ({ chart, page }) => {
        await open(chart, target, scheme);
        const axe = new AxeBuilder({ page }).include(HOST[target]).withTags(WCAG);
        const { violations } = await (scheme === 'dark' ? axe.disableRules(['color-contrast']) : axe).analyze();
        const found = violations.flatMap(v =>
          v.nodes.map(n => `${v.id} (${v.impact ?? '?'}): ${n.target.join(' » ')}\n  ${n.failureSummary ?? ''}`),
        );
        expect(found).toEqual([]);
      });
    }

    test('every tab stop shows its focus ring in a system colour', async ({ chart, page }) => {
      await open(chart, target);
      const sys = await systemColors(chart);
      await chart.host().evaluate(el => {
        const before = document.createElement('button');
        before.id = 'fc-before';
        before.textContent = 'Before the chart';
        el.before(before);
      });
      await page.locator('#fc-before').focus();

      const rings: Ring[] = [];
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press('Tab');
        await frames(chart);
        let ring = await focusRing(chart);
        if (ring?.kind === 'bar' && ring.style === 'none') {
          // The overlay ring follows the keyboard focus on the next paint
          await expect.poll(async () => (await focusRing(chart))?.style).toBe('solid');
          ring = await focusRing(chart);
        }
        if (!ring) break;
        rings.push(ring);
      }
      test.info().annotations.push({
        type: 'rings',
        description: rings.map(r => `${r.kind}: ${r.style} ${r.width}px ${r.color}`).join(' · '),
      });

      expect(rings.map(r => r.kind)).toEqual(['toolbar', 'row', 'splitter', 'toggle', 'bar']);
      for (const ring of rings) {
        expect(ring.style, ring.kind).not.toBe('none');
        expect(ring.width, ring.kind).toBeGreaterThanOrEqual(2);
        expect(ring.color, ring.kind).toBe(ring.selectedRow ? sys.HighlightText : sys.Highlight);
      }
    });

    test('critical bars are dashed; the selected bar, the selected row and today show in Highlight', async ({
      chart,
    }) => {
      await open(chart, target);
      const sys = await systemColors(chart);
      const bars = await chart.evalRoot(root =>
        [...root.querySelectorAll('.gantt-bars-layer > [data-task-id]')].map(g => {
          const cs = getComputedStyle(g.querySelector('.gantt-bar-body')!);
          return {
            id: g.getAttribute('data-task-id')!,
            critical: g.classList.contains('gantt-bar--critical'),
            selected: g.getAttribute('aria-selected') === 'true',
            fill: cs.fill,
            stroke: cs.stroke,
            width: cs.strokeWidth,
            dash: cs.strokeDasharray,
          };
        }),
      );
      // The fixture's critical chain and its selected bar (off the chain)
      expect(bars.filter(b => b.critical).map(b => b.id)).toEqual(
        expect.arrayContaining(['research', 'api', 'frontend', 'qa', 'release']),
      );
      expect(bars.filter(b => b.selected).map(b => b.id)).toEqual(['visual']);
      for (const b of bars) {
        expect(b.fill, b.id).toBe(sys.ButtonFace);
        expect(b.stroke, b.id).toBe(b.selected ? sys.Highlight : sys.ButtonText);
        expect(b.width, b.id).toBe(b.selected ? '2.5px' : b.critical ? '2px' : '1.5px');
        expect(b.dash, b.id).toBe(b.critical ? '4px, 2px' : 'none');
      }

      const chrome = await chart.evalRoot(root => {
        const style = (sel: string) => {
          const el = root.querySelector(sel);
          return el ? getComputedStyle(el) : null;
        };
        const row = style('.gantt-tl-row--selected');
        const name = style('.gantt-tl-row--selected .gantt-tl-name .gantt-tl-ellipsis');
        const current = style('.g-cell--current');
        return {
          rowBackground: row?.backgroundColor,
          rowText: name?.color,
          today: style('.gantt-today')?.stroke,
          currentCell: current ? `${current.backgroundColor} / ${current.color}` : null,
          checkedRadio: style('.gantt-tb-pill[aria-checked="true"]')?.backgroundColor,
        };
      });
      expect(chrome.rowBackground).toBe(sys.Highlight);
      expect(chrome.rowText).toBe(sys.HighlightText);
      expect(chrome.today).toBe(sys.Highlight);
      expect(chrome.currentCell).toBe(`${sys.Highlight} / ${sys.HighlightText}`);
      expect(chrome.checkedRadio).toBe(sys.Highlight);
    });

    test('a toolbar button whose menu is open shows in Highlight: Export, then More', async ({ chart, page }) => {
      const base = paintFixture('forced');
      const options = { ...base.options, toolbar: { export: true } };
      /** The open button's text and border colours */
      const look = (key: string) =>
        chart.get(`[data-focus-key="${key}"]`).evaluate(el => {
          const cs = getComputedStyle(el);
          return { expanded: el.getAttribute('aria-expanded'), color: cs.color, border: cs.borderTopColor };
        });
      const openMenu = async (key: string) => {
        await chart.get(`[data-focus-key="${key}"]`).focus();
        await page.keyboard.press('ArrowDown');
        await expect(chart.get(`[data-focus-key="${key}"]`)).toHaveAttribute('aria-expanded', 'true');
        await expect(chart.get('.gantt-tb-menu[role="menu"]')).toHaveCount(1);
      };

      await open(chart, target, 'light', { options });
      const sys = await systemColors(chart);
      const closed = await look('export');
      expect(closed.expanded).toBe('false');
      expect(closed.color).not.toBe(sys.Highlight);
      await openMenu('export');
      expect(await look('export')).toEqual({ expanded: 'true', color: sys.Highlight, border: sys.Highlight });

      // A 480 px chart: Export moves into More
      await open(chart, target, 'light', { options, box: { width: 480, height: 600 } });
      await expect(chart.get('.gantt-tb-export')).toHaveCount(0);
      await openMenu('more');
      expect(await look('more')).toEqual({ expanded: 'true', color: sys.Highlight, border: sys.Highlight });
      await expect(chart.get('.gantt-tb-menu .gantt-tb-menu-group[aria-label="Export"]')).toHaveCount(1);
    });

    test('every SVG paint in the chart is a system colour', async ({ chart }) => {
      await open(chart, target);
      const sys = new Set(Object.values(await systemColors(chart)));
      const paints = await chart.evalRoot(root =>
        [...root.querySelectorAll('svg :is(path, rect, line, polygon, circle, text)')]
          .filter(el => !el.closest('defs') && (el as SVGGraphicsElement).checkVisibility())
          .flatMap(el => {
            const cs = getComputedStyle(el);
            const name = `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''} in ${el.parentElement?.getAttribute('class') ?? '?'}`;
            const out: { name: string; prop: string; value: string }[] = [];
            // A line has no fill area; a url() paint is a pattern (its own shapes are checked)
            if (el.tagName.toLowerCase() !== 'line' && cs.fill !== 'none' && !cs.fill.startsWith('url('))
              out.push({ name, prop: 'fill', value: cs.fill });
            if (cs.stroke !== 'none') out.push({ name, prop: 'stroke', value: cs.stroke });
            return out;
          }),
      );
      expect(paints.length).toBeGreaterThan(50);
      expect(paints.filter(p => !sys.has(p.value))).toEqual([]);
    });
  });
}

// Synchronised charts (Gantry 2 phase 10, `syncGroup` / `createGanttSyncGroup()`): the gallery's
// `multi-pipeline` case renders three charts that share one group, the first one with the toolbar,
// in the Web Component, Angular and React (a wrapper over the Web Component). In each:
// - zoom in the first chart → the three charts show the same level (same header cells, same width);
// - scroll the second chart horizontally → the others follow (same scrollLeft ±1 px);
// - drag the first chart's splitter, then move it with the arrow keys → the same task-list width;
// - the first visible cell of the bottom header tier sits at the same x in all three, on load and
//   after each of the above.
// The charts are stacked in the same column, so the same x on the page means the same date.
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { TARGETS } from '../playwright.config';

const PAGES = {
  vanilla: `http://localhost:${TARGETS.vanilla.port}/examples.html#/multi-pipeline`,
  angular: `http://localhost:${TARGETS.angular.port}/examples/multi-pipeline`,
  react: `http://localhost:${TARGETS.react.port}/#/examples/multi-pipeline`,
} as const;

/** What a chart shows: its scale, scroll, task-list width and first visible header cell. */
interface ChartView {
  /** `data-focus-key` of the checked zoom level in the toolbar (`null`: no toolbar) */
  level: string | null;
  /** Width of the scrollable timeline (same range and level → same width) */
  scrollWidth: number;
  scrollLeft: number;
  /** The task list's width (`.gantry-panel`) */
  panelWidth: number;
  /** `aria-valuenow` of the splitter handle */
  splitter: string | null;
  /** The first cell of the bottom header tier that shows inside the viewport: label, left x and width in page px */
  cell: { text: string; x: number; width: number } | null;
}

function charts(page: Page): Locator {
  return page.locator('.gs-case').locator('gantry, gantry-element');
}

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  const all = charts(page);
  await expect(all).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(all.nth(i).locator('.gantt-bars-layer > [data-task-id]').first()).toBeVisible();
  }
}

/** The three charts' views, top to bottom. */
function views(page: Page): Promise<ChartView[]> {
  return charts(page).evaluateAll(els =>
    els.map(el => {
      const root = (el as HTMLElement).shadowRoot ?? el;
      const vp = root.querySelector<HTMLElement>('.gantry-canvas-viewport')!;
      const left = vp.getBoundingClientRect().left + vp.clientLeft;
      const tiers = root.querySelectorAll('.g-header .g-tier');
      const bottom = tiers[tiers.length - 1];
      const cell = bottom
        ? [...bottom.querySelectorAll('.g-cell')]
            .map(c => ({ text: c.textContent?.trim() ?? '', r: c.getBoundingClientRect() }))
            .sort((a, b) => a.r.left - b.r.left)
            .find(c => c.r.right > left + 0.5)
        : undefined;
      return {
        level:
          root
            .querySelector(
              '.gantt-toolbar .gantt-tb-pills[role="radiogroup"]:not(.gantt-tb-views) [aria-checked="true"]',
            )
            ?.getAttribute('data-focus-key') ?? null,
        scrollWidth: vp.scrollWidth,
        scrollLeft: vp.scrollLeft,
        panelWidth: root.querySelector('.gantry-panel')!.getBoundingClientRect().width,
        splitter: root.querySelector('.gantry-splitter-handle')?.getAttribute('aria-valuenow') ?? null,
        cell: cell ? { text: cell.text, x: Math.round(cell.r.left), width: Math.round(cell.r.width) } : null,
      };
    }),
  );
}

/**
 * Whether the three charts agree (a list of the differences, `[]` when they do): the same scale,
 * scroll (±1 px), task-list width (±1 px) and first visible bottom-tier cell (label, x ±1 px).
 */
function disagreements(v: ChartView[]): string[] {
  const [first, ...others] = v as [ChartView, ...ChartView[]];
  const out: string[] = [];
  others.forEach((o, i) => {
    const n = `chart ${i + 2}`;
    if (o.scrollWidth !== first.scrollWidth) out.push(`${n} scrollWidth ${o.scrollWidth} ≠ ${first.scrollWidth}`);
    if (Math.abs(o.scrollLeft - first.scrollLeft) > 1)
      out.push(`${n} scrollLeft ${o.scrollLeft} ≠ ${first.scrollLeft}`);
    if (Math.abs(o.panelWidth - first.panelWidth) > 1) out.push(`${n} panel ${o.panelWidth} ≠ ${first.panelWidth}`);
    if (o.splitter !== first.splitter) out.push(`${n} splitter ${o.splitter} ≠ ${first.splitter}`);
    if (!o.cell || !first.cell) out.push(`${n} has no header cell in view`);
    else {
      if (o.cell.text !== first.cell.text) out.push(`${n} first cell "${o.cell.text}" ≠ "${first.cell.text}"`);
      if (Math.abs(o.cell.x - first.cell.x) > 1) out.push(`${n} first cell x ${o.cell.x} ≠ ${first.cell.x}`);
      if (Math.abs(o.cell.width - first.cell.width) > 1) {
        out.push(`${n} first cell width ${o.cell.width} ≠ ${first.cell.width}`);
      }
    }
  });
  return out;
}

/** Poll until the three charts agree. */
async function expectInStep(page: Page): Promise<ChartView[]> {
  await expect.poll(async () => disagreements(await views(page)), { timeout: 5_000 }).toEqual([]);
  return views(page);
}

for (const [fw, url] of Object.entries(PAGES)) {
  test.describe(`synchronised charts · ${fw}`, () => {
    test('on load: same level, scroll, task-list width and first header cell', async ({ page }) => {
      await open(page, url);
      const [first] = await expectInStep(page);
      expect(first.level).toBe('zoom:Week');
      expect(first.cell).not.toBeNull();
    });

    test('zoom in the first chart: all three show the same level', async ({ page }) => {
      await open(page, url);
      const [before] = await expectInStep(page);
      await charts(page).first().locator('.gantt-toolbar [data-focus-key="zoom-in"]').click();
      await expect.poll(async () => (await views(page))[0].level).toBe('zoom:Day');
      const after = await expectInStep(page);
      // The others really changed scale: a wider timeline, narrower bottom-tier cells
      for (const v of after) {
        expect(v.scrollWidth).toBeGreaterThan(before.scrollWidth);
        expect(v.cell!.width).toBeLessThan(before.cell!.width);
      }
    });

    test('scroll the second chart horizontally: the others follow', async ({ page }) => {
      await open(page, url);
      const [before] = await expectInStep(page);
      const second = charts(page).nth(1);
      await second.scrollIntoViewIfNeeded();
      const vp = second.locator('.gantry-canvas-viewport').first();
      const box = (await vp.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(300, 0);
      await expect.poll(async () => (await views(page))[1].scrollLeft).toBeGreaterThan(before.scrollLeft + 100);
      const after = await expectInStep(page);
      expect(after[0].scrollLeft).toBeGreaterThan(before.scrollLeft + 100);
      expect(after[2].scrollLeft).toBeGreaterThan(before.scrollLeft + 100);
    });

    test('drag and arrow keys on the first splitter: the same task-list width', async ({ page }) => {
      await open(page, url);
      const [before] = await expectInStep(page);
      const handle = charts(page).first().locator('.gantry-splitter-handle').first();
      const box = (await handle.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 10, y);
      await page.mouse.up();
      await expect.poll(async () => (await views(page))[0].panelWidth).toBeGreaterThan(before.panelWidth + 40);
      const dragged = await expectInStep(page);

      await handle.focus();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await expect.poll(async () => (await views(page))[0].panelWidth).toBeLessThan(dragged[0].panelWidth);
      const keyed = await expectInStep(page);
      expect(keyed[2].panelWidth).toBeLessThan(dragged[2].panelWidth);
    });
  });
}

// The five editing cases of the gallery (Gantry 2 phase 11) in all five frameworks, one
// interaction each through the page's own markup, so the wrappers' event mapping and methods are
// proven in a real browser:
// - `editing`: a keyboard move (Enter, → × 3, Enter) logs a line from `tasks-change`, enables the
//   page's Undo from `history-change`; Undo calls `undo()` and logs the inverse, and an unavailable
//   button is `aria-disabled` (not `disabled`), so the focus stays on it;
// - `cell-editing`: F2 on a name, type, Enter;
// - `custom-editors`: "Edit first estimate" (`editCell()`) opens the number editor with focus;
// - `dependency-editing`: a connector click then a click near a bar's start links them (FS), logged;
// - `controlled`: a move of a finished task is vetoed in `before-change` and logged.
// Pages: the Angular site (`/examples/<id>`) and each Vite app (`examples.html#/<id>`,
// `#/examples/<id>`), as in gallery.spec.ts; no console error (the `pageErrors` fixture).
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { TARGETS } from '../playwright.config';
import {
  GALLERY_FRAMEWORKS,
  galleryCase,
  type CaseId,
  type GalleryFramework,
} from '../apps/demo-kit/src/gallery/catalog';

function caseUrl(fw: GalleryFramework, id: CaseId): string {
  const origin = `http://localhost:${TARGETS[fw].port}`;
  if (fw === 'angular') return `${origin}/examples/${id}`;
  if (fw === 'vanilla') return `${origin}/examples.html#/${id}`;
  return `${origin}/#/examples/${id}`;
}

/** Open the case and wait for its chart's bars; returns the chart. */
async function openCase(page: Page, fw: GalleryFramework, id: CaseId): Promise<Locator> {
  await page.goto(caseUrl(fw, id));
  await expect(page.locator('h1')).toHaveText(galleryCase(id).title);
  const chart = page.locator('.gs-case').locator('gantry, gantry-element').first();
  await expect(chart.locator('.gantt-bars-layer > [data-task-id]').first()).toBeVisible({ timeout: 15_000 });
  return chart;
}

/** `data-focus-key` of the element focused inside `chart` (its shadow root, or Angular's light DOM). */
function focusKey(chart: Locator): Promise<string | null> {
  return chart.evaluate(host => {
    const active = host.shadowRoot ? host.shadowRoot.activeElement : document.activeElement;
    if (!active || (!host.shadowRoot && !host.contains(active))) return null;
    return active.getAttribute('data-focus-key');
  });
}

/** The bar group of task `id`. */
const bar = (chart: Locator, id: string) => chart.locator(`.gantt-bars-layer > [data-task-id="${id}"]`);

/** Keyboard move mode on `id`: focus its bar, Enter, → `days` times, Enter. */
async function keyboardMove(page: Page, chart: Locator, id: string, days: number): Promise<void> {
  await bar(chart, id).focus();
  await expect.poll(() => focusKey(chart)).toBe(`bar:${id}`);
  await page.keyboard.press('Enter');
  for (let i = 0; i < days; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
}

/** The newest line of the case's log (`ol.gs-case-log[aria-label=…]`). */
const newest = (page: Page, label: string) => page.locator(`ol.gs-case-log[aria-label="${label}"] > li`).first();

for (const fw of GALLERY_FRAMEWORKS) {
  test.describe(`gallery editing cases · ${fw}`, () => {
    test('editing: a keyboard move is logged, the page’s Undo calls undo()', async ({ page }) => {
      const chart = await openCase(page, fw, 'editing');
      const undo = page.locator('#editing-undo');
      const redo = page.locator('#editing-redo');
      // `aria-disabled` while unavailable (Playwright's click() refuses it: the keyboard presses it)
      await expect(undo).toHaveAttribute('aria-disabled', 'true');
      await expect(redo).toHaveAttribute('aria-disabled', 'true');
      await expect(undo).not.toHaveAttribute('disabled');

      await keyboardMove(page, chart, 'wireframes', 3);
      await expect(newest(page, 'Last changes')).toHaveText('Moved Wireframes 3 days later');
      await expect(undo).not.toHaveAttribute('aria-disabled');
      await expect(redo).toHaveAttribute('aria-disabled', 'true');

      await undo.focus();
      await page.keyboard.press('Enter');
      await expect(newest(page, 'Last changes')).toHaveText('Undo: moved Wireframes 3 days earlier');
      await expect(undo).toHaveAttribute('aria-disabled', 'true');
      await expect(redo).not.toHaveAttribute('aria-disabled');
      // The history ran out under the focus: it stays on Undo, and a further press does nothing
      await expect(undo).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(newest(page, 'Last changes')).toHaveText('Undo: moved Wireframes 3 days earlier');
      await expect(undo).toBeFocused();
    });

    test('cell-editing: F2 on a name, type, Enter saves it', async ({ page }) => {
      const chart = await openCase(page, fw, 'cell-editing');
      const cell = chart.locator('.gantt-tl-cell[data-focus-key="cell:wireframes:name"]');
      await cell.focus();
      await page.keyboard.press('F2');
      await expect.poll(() => focusKey(chart)).toBe('editor:wireframes:name');
      await page.keyboard.type('Wireframes v2');
      await page.keyboard.press('Enter');
      await expect(cell).toContainText('Wireframes v2');
      await expect.poll(() => focusKey(chart)).toBe('cell:wireframes:name');
    });

    test('custom-editors: "Edit first estimate" opens the number editor with focus', async ({ page }) => {
      const chart = await openCase(page, fw, 'custom-editors');
      await page.getByRole('button', { name: 'Edit first estimate' }).click();
      await expect.poll(() => focusKey(chart)).toBe('editor:interviews:estimate');
      const field = chart.locator('.gantt-tl-cell--editing input.gantt-tl-editor[type="number"]');
      await expect(field).toHaveCount(1);
      await page.keyboard.type('40');
      await page.keyboard.press('Enter');
      await expect(chart.locator('.gantt-tl-cell[data-focus-key="cell:interviews:estimate"]')).toHaveText('40 h');
    });

    test('dependency-editing: click a connector, then near a bar’s start: a finish-to-start link', async ({ page }) => {
      const chart = await openCase(page, fw, 'dependency-editing');
      const arrows = await chart.locator('g.gantt-arrow').count();
      // Build and Test sit right of the first screen: centre Build in the timeline
      await chart.evaluate(host => {
        const root = host.shadowRoot ?? host;
        const vp = root.querySelector<HTMLElement>('.gantry-canvas-viewport')!;
        const b = root
          .querySelector('.gantt-bars-layer > [data-task-id="build"] .gantt-bar-body')!
          .getBoundingClientRect();
        const v = vp.getBoundingClientRect();
        vp.scrollLeft += (b.left + b.right) / 2 - (v.left + v.right) / 2;
      });
      const build = bar(chart, 'build').locator('.gantt-bar-body');
      await expect.poll(async () => (await build.boundingBox())?.x ?? -1).toBeGreaterThan(0);
      const b = (await build.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      const connectors = chart.locator('.gantt-bar-overlay .gantt-link-connector');
      await expect(connectors).toHaveCount(2);
      const boxes = await connectors.evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON() as DOMRect));
      const end = boxes.sort((p, q) => p.x - q.x)[1];
      await page.mouse.click(end.x + end.width / 2, end.y + end.height / 2);
      await expect(chart.locator('.gantt-link-connector--source')).toHaveCount(1);

      const t = (await bar(chart, 'test').locator('.gantt-bar-body').boundingBox())!;
      await page.mouse.move(t.x + 6, t.y + t.height / 2, { steps: 4 });
      await expect(chart.locator('path.gantt-link-preview')).toHaveCount(1);
      await page.mouse.click(t.x + 6, t.y + t.height / 2);
      await expect(newest(page, 'Last changes')).toHaveText('Linked Build → Test (finish to start)');
      await expect(chart.locator('path.gantt-link-preview')).toHaveCount(0);
      await expect.poll(() => chart.locator('g.gantt-arrow').count()).toBe(arrows + 1);
    });

    test('controlled: a move of a finished task is vetoed in before-change and logged', async ({ page }) => {
      const chart = await openCase(page, fw, 'controlled');
      const x0 = (await bar(chart, 'design').boundingBox())!.x;
      await keyboardMove(page, chart, 'design', 1);
      await expect(newest(page, 'Decisions')).toHaveText('Vetoed: Design is finished');
      expect((await bar(chart, 'design').boundingBox())!.x).toBe(x0);

      // A task still running moves: the app sets the proposed tasks
      await keyboardMove(page, chart, 'build', 1);
      await expect(newest(page, 'Decisions')).toHaveText('Accepted: moved Build 1 day later');
      await expect.poll(async () => (await bar(chart, 'build').boundingBox())!.x).toBeGreaterThan(x0);
    });
  });
}

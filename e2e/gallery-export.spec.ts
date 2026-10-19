// The four export cases of the gallery (Gantry 2 phase 12) in all five frameworks, one interaction
// each through the page's own markup, so the wrappers' methods and event mapping are proven in a
// real browser:
// - `export-image`: "Download SVG" (`download('svg', …)`) saves release-plan.svg;
// - `export-csv`: the preview shows `exportCsv()` (neutralised formulas), "Download CSV" saves
//   budget-plan.csv with its BOM;
// - `print`: "Print…" (`print(…)`) through the print stub, logged from `export` ("Printed N pages");
// - `export-toolbar`: with "Block PNG" on, the toolbar's PNG item is vetoed in `before-export`
//   and logged ("Blocked: PNG image"), no file.
// Pages: the Angular site (`/examples/<id>`) and each Vite app (`examples.html#/<id>`,
// `#/examples/<id>`), as in gallery.spec.ts; no console error (the `pageErrors` fixture). Locators
// are scoped to the case (`.gs-case > …`): the chart's own toolbar has buttons too.
import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { TARGETS } from '../playwright.config';
import {
  GALLERY_FRAMEWORKS,
  galleryCase,
  type CaseId,
  type GalleryFramework,
} from '../apps/demo-kit/src/gallery/catalog';
import { installPrintStub, printFrames, prints } from './print-stub';

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

/** The case's controls (before the chart). */
const controls = (page: Page) => page.locator('.gs-case > .gs-case-controls');

/** The newest line of the case's log (`ol.gs-case-log[aria-label=…]`). */
const newest = (page: Page, label: string) =>
  page.locator(`.gs-case > ol.gs-case-log[aria-label="${label}"] > li`).first();

/** Run `action` and return the download it starts: its name and text. */
async function download(page: Page, action: () => Promise<unknown>): Promise<{ name: string; text: string }> {
  const [d] = await Promise.all([page.waitForEvent('download'), action()]);
  return { name: d.suggestedFilename(), text: await readFile(await d.path(), 'utf8') };
}

for (const fw of GALLERY_FRAMEWORKS) {
  test.describe(`gallery export cases · ${fw}`, () => {
    test('export-image: "Download SVG" saves release-plan.svg', async ({ page }) => {
      await openCase(page, fw, 'export-image');
      const file = await download(page, () => controls(page).locator('#export-image-svg').click());
      expect(file.name).toBe('release-plan.svg');
      expect(file.text.startsWith('<?xml')).toBe(true);
      expect(file.text).toMatch(/<svg\b[^>]*\sclass="gantry-export"/);
      expect(file.text).toContain('>Release plan</title>');
      for (const banned of ['var(', '<style', 'foreignObject']) expect(file.text, banned).not.toContain(banned);
    });

    test('export-csv: the preview shows exportCsv(), "Download CSV" saves budget-plan.csv', async ({ page }) => {
      await openCase(page, fw, 'export-csv');
      const preview = page.locator('.gs-case > pre.gs-case-csv');
      await expect(preview).toHaveAttribute('aria-label', 'CSV preview');
      await expect(preview).toContainText('Task Name,Start,End,%');
      const text = (await preview.textContent()) ?? '';
      expect(text).toContain(`"'=HYPERLINK(""https://example.com"",""Approve"")"`);
      expect(text).toContain(`'+Budget review`);

      const file = await download(page, () => controls(page).locator('#export-csv-download').click());
      expect(file.name).toBe('budget-plan.csv');
      expect(file.text.charCodeAt(0)).toBe(0xfeff);
      expect(file.text.slice(1).split('\r\n')[0]).toBe('Task Name,Start,End,%');
      expect(file.text).toContain(`'-Scope cut`);
    });

    test('print: "Print…" prints every page through the frame, logged from export', async ({ page }) => {
      await installPrintStub(page, { readSvgs: false });
      await openCase(page, fw, 'print');
      await controls(page).getByRole('button', { name: 'Print…', exact: true }).click();
      await expect.poll(async () => (await prints(page)).length).toBe(1);
      const p = (await prints(page))[0];
      expect(p.title).toBe('Construction schedule');
      expect(p.images.length).toBeGreaterThan(1);
      expect(p.images.every(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(newest(page, 'Prints')).toHaveText(`Printed ${p.images.length} pages`);
      await expect.poll(() => printFrames(page)).toBe(0);
    });

    test('export-toolbar: with "Block PNG" on, the toolbar’s PNG is vetoed and logged', async ({ page }) => {
      const chart = await openCase(page, fw, 'export-toolbar');
      let downloads = 0;
      page.on('download', () => downloads++);
      const block = controls(page).getByRole('switch', { name: 'Block PNG' });
      await expect(block).not.toBeChecked();
      await block.check();
      // Angular, Vue and Svelte update their state after the handler returns
      await expect(block).toBeChecked();

      await chart.locator('[data-focus-key="export"]').focus();
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => focusKey(chart)).toBe('menu:export:svg');
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => focusKey(chart)).toBe('menu:export:png');
      await page.keyboard.press('Enter');
      await expect(newest(page, 'Exports')).toHaveText('Blocked: PNG image');
      await expect.poll(() => focusKey(chart)).toBe('export');
      expect(downloads).toBe(0);
    });
  });
}

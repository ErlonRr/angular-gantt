// The three calendar cases of the gallery (Gantry 2 phase 13) in all five frameworks, one
// interaction each through the page's own markup, so the options reach the chart in every wrapper:
// - `working-days`: a keyboard move of the plan's last task (Enter, →, Enter) stretches the plan, so
//   the page's status line (working days over calendar days, from `tasks-change`) changes, and the
//   task keeps its Duration;
// - `shift-calendar`: F2 on a Duration cell, "6h", Enter reads "6 hours" (hours of a working day);
// - `critical-float`: Durations → Calendar days changes the critical chain, and the status line is
//   the shared module's `criticalSummary` for that state; so is "Work on Saturdays".
// The expected texts come from the cases' shared modules (the same functions the pages call) with
// the frozen clock of the fixtures. Pages: the Angular site (`/examples/<id>`) and each Vite app
// (`examples.html#/<id>`, `#/examples/<id>`), as in gallery.spec.ts; no console error (the
// `pageErrors` fixture).
import type { Locator, Page } from '@playwright/test';
import { test, expect, NOW } from './fixtures';
import { TARGETS } from '../playwright.config';
import {
  GALLERY_FRAMEWORKS,
  galleryCase,
  type CaseId,
  type GalleryFramework,
} from '../apps/demo-kit/src/gallery/catalog';
import {
  WORKING_DAYS_INITIAL,
  workingDaysOptions,
  workingDaysTasks,
  workingSummary,
} from '../apps/demo-kit/src/gallery/cases/working-days';
import {
  CRITICAL_FLOAT_INITIAL,
  criticalFloatOptions,
  criticalFloatTasks,
  criticalSummary,
  type CriticalFloatState,
} from '../apps/demo-kit/src/gallery/cases/critical-float';

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

/** The cell of `id` in `column`. */
const cell = (chart: Locator, id: string, column: string) =>
  chart.locator(`.gantt-tl-cell[data-focus-key="cell:${id}:${column}"]`);

/** Keyboard move mode on `id`: focus its bar, Enter, → `steps` times, Enter. */
async function keyboardMove(page: Page, chart: Locator, id: string, steps: number): Promise<void> {
  await bar(chart, id).focus();
  await expect.poll(() => focusKey(chart)).toBe(`bar:${id}`);
  await page.keyboard.press('Enter');
  for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
}

/** The page's status line (`p.gs-case-status`). */
const statusOf = (page: Page) => page.locator('.gs-case p.gs-case-status');

/** What `criticalSummary` reads for `state` on the case's data at the frozen clock. */
const criticalAt = (state: CriticalFloatState) =>
  criticalSummary(criticalFloatTasks(NOW), criticalFloatOptions(state, NOW));

for (const fw of GALLERY_FRAMEWORKS) {
  test.describe(`gallery calendar cases · ${fw}`, () => {
    test('working-days: moving the last task stretches the plan, the status changes, its Duration stays', async ({
      page,
    }) => {
      const chart = await openCase(page, fw, 'working-days');
      const status = statusOf(page);
      const initial = workingSummary(workingDaysTasks(NOW), workingDaysOptions(WORKING_DAYS_INITIAL, NOW));
      expect(initial).toBe('16 working days over 25 calendar days');
      await expect(status).toHaveText(initial);
      const duration = cell(chart, 'snag-list', 'duration');
      await expect(duration).toHaveText('1 day');

      // One working step later: the plan's last end moves, so the extent (the status) grows by a day
      await keyboardMove(page, chart, 'snag-list', 1);
      await expect(status).toHaveText('17 working days over 26 calendar days');
      await expect(duration).toHaveText('1 day');
    });

    test('shift-calendar: "6h" typed in a Duration cell reads "6 hours"', async ({ page }) => {
      const chart = await openCase(page, fw, 'shift-calendar');
      const review = cell(chart, 'review', 'duration');
      await expect(review).toHaveText('4 hours');

      await review.focus();
      await page.keyboard.press('F2');
      await expect.poll(() => focusKey(chart)).toBe('editor:review:duration');
      await page.keyboard.type('6h');
      await page.keyboard.press('Enter');
      await expect(review).toHaveText('6 hours');
      await expect.poll(() => focusKey(chart)).toBe('cell:review:duration');
    });

    test('critical-float: Durations and Saturdays change the critical chain, the status is criticalSummary', async ({
      page,
    }) => {
      await openCase(page, fw, 'critical-float');
      const status = statusOf(page);
      const durations = (label: string) =>
        page
          .locator('.gs-case [aria-labelledby="critical-float-durations-label"] button')
          .filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) });
      const working = criticalAt(CRITICAL_FLOAT_INITIAL);
      const calendarDays = criticalAt({ durations: 'calendar', saturdays: false });
      const saturdays = criticalAt({ durations: 'working', saturdays: true });
      // The data is built so each switch changes the chain (the test is only worth it if so)
      expect(calendarDays).not.toBe(working);
      expect(saturdays).not.toBe(working);
      await expect(status).toHaveText(working);

      await durations('Calendar days').click();
      await expect(status).toHaveText(calendarDays);
      await durations('Working days').click();
      await expect(status).toHaveText(working);

      await page.getByRole('switch', { name: 'Work on Saturdays' }).check();
      await expect(status).toHaveText(saturdays);
    });
  });
}

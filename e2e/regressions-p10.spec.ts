// Browser checks for the package fixes of Gantry 2 phase 10 (waves 5 and 5b), each found on a
// gallery page and fixed in the packages:
// (a) `initialScroll: 'today'` centres today identically in Angular and the Web Component (Angular
//     measured its provisional panel width on the first render: off by half the growth);
// (b) a Web Component whose options arrive after it is connected (React, Svelte) still centres today
//     (a late `panel.width` used to slide the panel while `initialScroll` read the viewport);
// (c) Angular's lazy footer always shows a "Load more" button after the first page, like the Web
//     Component's (it used to be an invisible sentinel without `autoLoad`);
// (d) the Web Component's load-more footer is outside the treegrid (axe: aria-required-children);
// (e) a Web Component configured after connect does not announce "Zoom: …" on load (React, Svelte);
// (f) `nonWorkingTime.style: 'disabled'` paints the non-working bands in the `--gantt-border` grey.
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { test, expect, frames, PLAN } from './fixtures';
import { TARGETS } from '../playwright.config';

type Binding = 'vanilla' | 'angular';
const BINDINGS: readonly Binding[] = ['vanilla', 'angular'];
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** A gallery case page of the Web Component (`examples.html#/<id>`) or of the Angular site (`/examples/<id>`). */
function caseUrl(binding: Binding | 'react' | 'svelte' | 'vue', id: string): string {
  const port = TARGETS[binding].port;
  if (binding === 'angular') return `http://localhost:${port}/examples/${id}`;
  if (binding === 'vanilla') return `http://localhost:${port}/examples.html#/${id}`;
  return `http://localhost:${port}/#/examples/${id}`;
}

/** The case's first chart. */
function caseChart(page: Page): Locator {
  return page.locator('.gs-case').locator('gantry, gantry-element').first();
}

/** Today line x − scrollLeft − half the viewport width: 0 when today is centred (null: no today line). */
function todayOffset(chart: Locator): Promise<number | null> {
  return chart.evaluate(el => {
    const root = (el as HTMLElement).shadowRoot ?? el;
    const vp = root.querySelector<HTMLElement>('.gantry-canvas-viewport');
    const x = root.querySelector('line.gantt-today')?.getAttribute('x1');
    if (!vp || x === null || x === undefined) return null;
    return Number(x) - vp.scrollLeft - vp.clientWidth / 2;
  });
}

/** Today stays centred (±1 px), checked again two frames later (nothing slides afterwards). */
async function expectTodayCentred(page: Page, chart: Locator): Promise<void> {
  await expect.poll(async () => Math.abs((await todayOffset(chart)) ?? Infinity)).toBeLessThanOrEqual(1);
  await frames(page);
  expect(Math.abs((await todayOffset(chart)) ?? Infinity)).toBeLessThanOrEqual(1);
}

// ── (a) initialScroll centres today in both bindings ─────────────────────────

for (const binding of BINDINGS) {
  test(`(a) initialScroll 'today' centres today · ${binding} · non-working case`, async ({ page }) => {
    await page.goto(caseUrl(binding, 'non-working'));
    const chart = caseChart(page);
    await expect(chart.locator('.gantt-bars-layer > [data-task-id]').first()).toBeVisible();
    await expectTodayCentred(page, chart);
  });
}

// ── (b) Web Component: options assigned after the element is connected ───────

// Before the first render only: `initialScroll` runs once, on the first render (both bindings), so
// a panel width assigned frames later moves the panel without scrolling again.
for (const when of ['in the same task', 'a microtask later'] as const) {
  test(`(b) Web Component with options assigned after append (${when}) centres today`, async ({ page }) => {
    await page.goto(`http://localhost:${TARGETS.vanilla.port}/`);
    await expect(page.locator('gantry-element')).toBeVisible();
    await page.evaluate(
      async ([tasks, later]) => {
        const el = document.createElement('gantry-element') as HTMLElement & Record<string, unknown>;
        el.id = 'late-options';
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
        document.querySelector('gantry-element')!.replaceWith(el);
        // Connected first, configured after, as the React and Svelte wrappers do
        if (later === 'a microtask later') await Promise.resolve();
        el['tasks'] = tasks.map(t => ({ ...t, start: new Date(t.start), end: new Date(t.end) }));
        el['options'] = { viewMode: 'Day', panel: { width: 600 }, initialScroll: 'today' };
      },
      [PLAN, when] as const,
    );
    const chart = page.locator('#late-options');
    await expect(chart.locator('.gantt-bars-layer > [data-task-id]').first()).toBeVisible();
    await expect.poll(() => chart.locator('.gantry-panel').evaluate(p => p.getBoundingClientRect().width)).toBe(600);
    await expectTodayCentred(page, chart);
  });
}

// ── (c) and (d) the lazy case's load-more footer ─────────────────────────────

for (const binding of BINDINGS) {
  test(`(c) a visible Load more button after the first page · ${binding} · lazy case`, async ({ page }) => {
    await page.goto(caseUrl(binding, 'lazy'));
    const chart = caseChart(page);
    const hint = page.locator('.gs-case-hint');
    await expect(hint).toHaveText(/^25 of 200 tasks loaded/, { timeout: 10_000 });
    const button = chart.getByRole('button', { name: 'Load more' });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    // Keyboard users can load the next page
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(hint).toHaveText(/^50 of 200 tasks loaded/, { timeout: 10_000 });
  });
}

/** The lazy footer and its Load more button as drawn: sizes and the styles that make them differ. */
async function loadMoreLook(page: Page, binding: Binding) {
  await page.goto(caseUrl(binding, 'lazy'));
  const chart = caseChart(page);
  await expect(chart.getByRole('button', { name: 'Load more' })).toBeVisible({ timeout: 10_000 });
  return chart.evaluate(el => {
    const root = (el as HTMLElement).shadowRoot ?? el;
    const footer = root.querySelector('.gantt-tl-load-more')!;
    const button = footer.querySelector('.gantt-load-more-btn')!;
    const f = getComputedStyle(footer);
    const b = getComputedStyle(button);
    const fr = footer.getBoundingClientRect();
    const br = button.getBoundingClientRect();
    return {
      footer: { height: Math.round(fr.height), borderTop: f.borderTopWidth, padding: f.padding },
      button: {
        width: Math.round(br.width),
        height: Math.round(br.height),
        fontSize: b.fontSize,
        padding: b.padding,
        background: b.backgroundColor,
      },
    };
  });
}

// Package fix (parity + WCAG 2.5.8, found by this spec, fixed in phase 10 step 7.1): the footer's
// Load more button was a compact 79 × 22 px button in the Web Component and a full-width one in
// Angular. Both now draw Angular's look (packages/vanilla/src/styles/tasklist.css.ts and
// packages/angular/src/lib/datasource/gantt-load-more.component.ts): a footer with a top border,
// 8 / 12 px padding and the panel background; a full-width button the toolbar's control size tall
// (`--gantry-control-size`), in --gantt-font-size, transparent.
test('(c) the Load more footer looks the same in both bindings · lazy case', async ({ page }) => {
  const vanilla = await loadMoreLook(page, 'vanilla');
  const angular = await loadMoreLook(page, 'angular');
  expect(angular).toEqual(vanilla);
  // At least the 24 px target size (the default density's 32 px control)
  expect(vanilla.button.height).toBe(32);
  expect(vanilla.footer).toMatchObject({ borderTop: '1px', padding: '8px 12px' });
});

test('(d) Web Component lazy case: the load-more footer is outside the treegrid; no aria-required-children', async ({
  page,
}) => {
  await page.goto(caseUrl('vanilla', 'lazy'));
  const chart = caseChart(page);
  await expect(chart.getByRole('button', { name: 'Load more' })).toBeVisible({ timeout: 10_000 });
  const footer = await chart.evaluate(el => {
    const f = el.shadowRoot!.querySelector('.gantt-tl-load-more');
    return f
      ? { inTreegrid: f.closest('[role="treegrid"]') !== null, inPanel: f.closest('.gantry-panel') !== null }
      : null;
  });
  expect(footer).toEqual({ inTreegrid: false, inPanel: true });
  const { violations, passes } = await new AxeBuilder({ page })
    .withTags(WCAG)
    .include('.gs-case gantry-element')
    .analyze();
  const required = violations.filter(v => v.id === 'aria-required-children');
  expect(required.map(v => v.nodes.map(n => n.target.join(' ')).join(' | '))).toEqual([]);
  // The rule did run inside the shadow root: the treegrid passed it
  const checked = passes.find(p => p.id === 'aria-required-children')?.nodes.map(n => JSON.stringify(n.target)) ?? [];
  expect(checked.some(t => t.includes('treegrid') || t.includes('gantt-tasklist'))).toBe(true);
});

// ── (e) no zoom announcement on load ─────────────────────────────────────────

for (const fw of ['react', 'svelte'] as const) {
  test(`(e) no announcement on load · ${fw} · keyboard case`, async ({ page }) => {
    await page.goto(caseUrl(fw, 'keyboard'));
    const chart = caseChart(page);
    await expect(chart.locator('.gantt-bars-layer > [data-task-id]').first()).toBeVisible();
    // The announcer is debounced: give a late "Zoom: …" time to arrive
    await page.waitForTimeout(1_000);
    await frames(page);
    await expect(chart.locator('.gantt-sr-live')).toHaveText('');
  });
}

// ── (f) nonWorkingTime.style 'disabled' ──────────────────────────────────────

/** The computed fill of the first band of `kind`, and `--gantt-border` resolved to a colour in the chart. */
function bandAndBorder(chart: Locator, kind: string): Promise<{ fill: string | null; border: string }> {
  return chart.evaluate((el, k) => {
    const root = (el as HTMLElement).shadowRoot ?? el;
    const band = root.querySelector(`.gantt-band--${k}`);
    // A probe inside the chart resolves the custom property where the bands read it
    const parent = (el as HTMLElement).shadowRoot ? root.querySelector('.gantry-wrapper')! : el;
    const probe = document.createElement('span');
    probe.style.setProperty('color', 'var(--gantt-border)');
    parent.append(probe);
    const border = getComputedStyle(probe).color;
    probe.remove();
    return { fill: band ? getComputedStyle(band).fill : null, border };
  }, kind);
}

for (const binding of BINDINGS) {
  test(`(f) 'disabled' paints the non-working bands with --gantt-border · ${binding}`, async ({ page }) => {
    await page.goto(caseUrl(binding, 'non-working'));
    const chart = caseChart(page);
    await expect(chart.locator('.gantt-band--weekend').first()).toBeAttached();
    const shaded = await bandAndBorder(chart, 'weekend');
    expect(shaded.fill).not.toBe(shaded.border);

    await page.locator('.gs-case').getByRole('button', { name: 'Disabled', exact: true }).click();
    for (const kind of ['weekend', 'holiday']) {
      await expect
        .poll(
          async () => {
            const { fill, border } = await bandAndBorder(chart, kind);
            return fill === border ? 'border' : `${fill} ≠ ${border}`;
          },
          { message: kind },
        )
        .toBe('border');
    }
  });
}

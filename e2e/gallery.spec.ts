// The examples gallery in all five frameworks (Gantry 2 phase 10, D18–D23):
// - every case page meets its ready contract (`GALLERY_CASES[].ready` of demo-kit's catalog): that
//   many charts inside `.gs-case`, each painted with bars, or the first one showing its state; one h1
//   (the case title); no console error (the `pageErrors` fixture);
// - each gallery index and one case page per framework: no axe violation outside the charts (their
//   inside is a11y.spec.ts's), the code tabs and the Shared data tab, the theme switch reaching every
//   chart, no horizontal page scroll on a phone;
// - the Vite apps: hash routes on a static host (React, Vue and Svelte `#/examples[/<id>]`, the Web
//   Component `examples.html#/<id>`), home pages unchanged at `/` with a nav link to the gallery,
//   navigation that moves focus to the content, and skip and category links that keep the route.
// Pages: the Angular site on its port (`/examples/<id>`) and each Vite app on its own (the same
// builds the deployed site serves under /wc/, /react/, /vue/ and /svelte/).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { TARGETS } from '../playwright.config';
import {
  GALLERY_CASES,
  GALLERY_CATEGORIES,
  GALLERY_FRAMEWORKS,
  GALLERY_FRAMEWORK_LABELS,
  galleryCase,
  type CaseId,
  type GalleryCase,
  type GalleryFramework,
} from '../apps/demo-kit/src/gallery/catalog';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CHARTS = 'gantry, gantry-element';
const origin = (port: number) => `http://localhost:${port}`;

interface GalleryPages {
  index: string;
  case: (id: CaseId) => string;
  /** The Vite apps: their own page at `/` and its h1 (the Angular site is site.spec.ts's) */
  home?: { url: string; h1: string };
}

const PAGES: Record<GalleryFramework, GalleryPages> = {
  angular: {
    index: `${origin(TARGETS.angular.port)}/examples`,
    case: id => `${origin(TARGETS.angular.port)}/examples/${id}`,
  },
  vanilla: {
    index: `${origin(TARGETS.vanilla.port)}/examples.html`,
    case: id => `${origin(TARGETS.vanilla.port)}/examples.html#/${id}`,
    home: { url: `${origin(TARGETS.vanilla.port)}/`, h1: 'Try every option' },
  },
  react: {
    index: `${origin(TARGETS.react.port)}/#/examples`,
    case: id => `${origin(TARGETS.react.port)}/#/examples/${id}`,
    home: { url: `${origin(TARGETS.react.port)}/`, h1: 'Gantry in React' },
  },
  vue: {
    index: `${origin(TARGETS.vue.port)}/#/examples`,
    case: id => `${origin(TARGETS.vue.port)}/#/examples/${id}`,
    home: { url: `${origin(TARGETS.vue.port)}/`, h1: 'Gantry in Vue' },
  },
  svelte: {
    index: `${origin(TARGETS.svelte.port)}/#/examples`,
    case: id => `${origin(TARGETS.svelte.port)}/#/examples/${id}`,
    home: { url: `${origin(TARGETS.svelte.port)}/`, h1: 'Gantry in Svelte' },
  },
};

const VITE_APPS = GALLERY_FRAMEWORKS.filter(fw => fw !== 'angular');

/** A data source answers late (`lazy`) and 10 000 rows take a moment (`large`) */
const READY_TIMEOUT = 15_000;

/** The case's charts are on screen: `ready.charts` of them in `.gs-case`, painted with bars or showing `ready.state`. */
async function expectReady(page: Page, c: GalleryCase): Promise<void> {
  const charts = page.locator('.gs-case').locator(CHARTS);
  await expect(charts).toHaveCount(c.ready.charts, { timeout: READY_TIMEOUT });
  if (c.ready.state) {
    await expect(charts.first().locator(`.gantt-state--${c.ready.state}`)).toBeVisible({ timeout: READY_TIMEOUT });
    return;
  }
  for (let i = 0; i < c.ready.charts; i++) {
    await expect(charts.nth(i).locator('.gantt-bars-layer > [data-task-id]').first()).toBeVisible({
      timeout: READY_TIMEOUT,
    });
  }
}

async function openCase(page: Page, fw: GalleryFramework, id: CaseId): Promise<void> {
  await page.goto(PAGES[fw].case(id));
  await expect(page.locator('h1')).toHaveText(galleryCase(id).title);
  await expectReady(page, galleryCase(id));
}

async function axeOutsideCharts(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).exclude(CHARTS).analyze();
  return violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** What the page focuses: its id, or its text when it has none. */
function focusedId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.id || document.activeElement?.textContent?.trim() || null);
}

// ── Every case in every framework ─────────────────────────────────────────────

for (const fw of GALLERY_FRAMEWORKS) {
  test.describe(`gallery cases · ${fw}`, () => {
    for (const c of GALLERY_CASES) {
      test(`${c.id}: ready (${c.ready.state ?? `${c.ready.charts} chart(s) with bars`}), one h1, no errors`, async ({
        page,
      }) => {
        await page.goto(PAGES[fw].case(c.id));
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('h1')).toHaveText(c.title);
        await expectReady(page, c);
      });
    }
  });
}

// ── Index, case page, code, theme and phone width in every framework ──────────

for (const fw of GALLERY_FRAMEWORKS) {
  test.describe(`gallery pages · ${fw}`, () => {
    test('index: one h1, a card per case, no axe violations outside the charts', async ({ page }) => {
      await page.goto(PAGES[fw].index);
      await expect(page.locator('h1')).toHaveCount(1);
      const cards = page.locator('.gs-gallery-card-title a');
      await expect(cards).toHaveCount(GALLERY_CASES.length);
      // Every card links the case in each framework (sr-only prefix + label)
      for (const label of Object.values(GALLERY_FRAMEWORK_LABELS)) {
        await expect(page.locator('.gs-gallery-link', { hasText: label })).toHaveCount(GALLERY_CASES.length);
      }
      expect(await axeOutsideCharts(page)).toEqual([]);
    });

    test('case page: no axe violations outside the charts; framework links, code and Shared data tabs', async ({
      page,
    }) => {
      await openCase(page, fw, 'tree');
      expect(await axeOutsideCharts(page)).toEqual([]);

      // The same case in each framework; this one is the current page
      const live = page.getByRole('navigation', { name: 'This example in every framework' }).getByRole('link');
      await expect(live).toHaveCount(GALLERY_FRAMEWORKS.length);
      await expect(live.and(page.locator('[aria-current="page"]'))).toHaveText(GALLERY_FRAMEWORK_LABELS[fw]);

      // The code opens on this framework's tab; Shared data shows the case's shared module
      const own = page.getByRole('tab', { name: GALLERY_FRAMEWORK_LABELS[fw], exact: true });
      await expect(own).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.gs-tabs [role="tab"][tabindex="0"]')).toHaveCount(1);
      const panel = page.locator('#case-code-panel');
      await expect(panel.locator('.gs-code, .gs-case-hint').first()).toBeVisible();
      await page.getByRole('tab', { name: 'Shared data' }).click();
      await expect(page.getByRole('tab', { name: 'Shared data' })).toHaveAttribute('aria-selected', 'true');
      await expect(panel.locator('.gs-code-head > span:first-child')).toHaveText(['demo-kit/gallery/cases/tree.ts']);
      await expect(panel.locator('pre')).toContainText('TREE_OPTIONS');
    });

    test('the theme switch reaches every chart of a case', async ({ page }) => {
      await openCase(page, fw, 'multi-pipeline');
      const toggle = page.getByRole('button', { name: 'Dark theme' });
      const dark = (await toggle.getAttribute('aria-pressed')) !== 'true';
      await toggle.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', dark ? 'dark' : 'light');
      const charts = page.locator('.gs-case').locator(CHARTS);
      for (let i = 0; i < (await charts.count()); i++) {
        await expect
          .poll(() =>
            charts
              .nth(i)
              .evaluate(el =>
                el.localName === 'gantry' ? el.classList.contains('gantry-dark') : el.matches(':state(dark)'),
              ),
          )
          .toBe(dark);
      }
    });

    test('phone width: no horizontal page scroll on the index and a case', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(PAGES[fw].index);
      await expect(page.locator('.gs-gallery-card').first()).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await openCase(page, fw, 'multi-pipeline');
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

// ── The Vite apps: hash routes, home page, focus, skip and category links ─────

for (const fw of VITE_APPS) {
  const pages = PAGES[fw];
  const home = pages.home!;

  test.describe(`gallery routes · ${fw}`, () => {
    test('home stays at / with a nav link to the gallery; the gallery links home', async ({ page }) => {
      await page.goto(home.url);
      await expect(page.locator('h1')).toHaveText(home.h1);
      const nav = page.getByRole('navigation', { name: 'Primary' });
      await nav.getByRole('link', { name: 'Examples' }).click();
      await expect(page.locator('h1')).toHaveText('Examples');
      await expect(page.locator('.gs-gallery-card')).toHaveCount(GALLERY_CASES.length);
      await expect(nav.getByRole('link', { name: 'Examples' })).toHaveAttribute('aria-current', 'page');
      await nav.getByRole('link', { name: fw === 'vanilla' ? 'Playground' : 'Home' }).click();
      await expect(page.locator('h1')).toHaveText(home.h1);
    });

    test('a card opens its case with focus on the content; previous, next and All examples', async ({ page }) => {
      await page.goto(pages.index);
      await page.locator('.gs-gallery-card-title a', { hasText: galleryCase('tree').title }).click();
      await expect(page.locator('h1')).toHaveText(galleryCase('tree').title);
      await expect(page.locator('#main')).toBeFocused();
      await expect(page).toHaveTitle(new RegExp(`^${galleryCase('tree').title} · Examples`));
      await expect(
        page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Examples' }),
      ).toHaveAttribute('aria-current', 'true');
      await expectReady(page, galleryCase('tree'));

      await page.locator('.gs-case-pager-link--next').click();
      await expect(page.locator('h1')).toHaveText(galleryCase('only-parents').title);
      await expectReady(page, galleryCase('only-parents'));
      await page.goBack();
      await expect(page.locator('h1')).toHaveText(galleryCase('tree').title);

      await page.getByRole('link', { name: 'All examples' }).click();
      await expect(page.locator('h1')).toHaveText('Examples');
      await expect(page.locator('#main')).toBeFocused();
    });

    test('the skip link and the category links keep the route', async ({ page }) => {
      await openCase(page, fw, 'tree');
      const url = page.url();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#main')).toBeFocused();
      expect(page.url()).toBe(url);
      await expect(page.locator('h1')).toHaveText(galleryCase('tree').title);

      await page.goto(pages.index);
      const indexUrl = page.url();
      await page.getByRole('navigation', { name: 'Gallery categories' }).getByRole('link').nth(3).click();
      expect(page.url()).toBe(indexUrl);
      expect(await focusedId(page)).toBe(`gallery-${GALLERY_CATEGORIES[3].id}-title`);
      await expect(page.locator('h1')).toHaveText('Examples');
    });
  });
}

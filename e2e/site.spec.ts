// The demo site around the charts (apps/demo-kit look): every page loads without errors, has one
// h1, the right nav item, a working skip link and theme switch, no axe violations outside the
// charts (a11y.spec.ts covers their inside) and no horizontal scroll on a phone.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { TARGETS } from '../playwright.config';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CHARTS = 'gantry, gantry-element';
const SITE = `http://localhost:${TARGETS.angular.port}`;

/** Angular site routes and the nav item each one marks: its own page (`page`) or its section (`true`). */
const ROUTES: readonly { path: string; nav: string; current: 'page' | 'true' }[] = [
  { path: '/', nav: 'Home', current: 'page' },
  { path: '/playground', nav: 'Playground', current: 'page' },
  { path: '/examples', nav: 'Examples', current: 'page' },
  { path: '/theming', nav: 'Theming', current: 'page' },
  { path: '/frameworks', nav: 'Frameworks', current: 'page' },
  { path: '/api', nav: 'API', current: 'page' },
  { path: '/roadmap', nav: 'Examples', current: 'true' },
  { path: '/demo', nav: 'Examples', current: 'true' },
  { path: '/lazy', nav: 'Examples', current: 'true' },
  { path: '/custom-bar', nav: 'Examples', current: 'true' },
];

/** The other demo apps: one page each, same shell without the site nav. */
const APPS: readonly { name: string; url: string }[] = [
  { name: 'vanilla', url: `http://localhost:${TARGETS.vanilla.port}/` },
  { name: 'react', url: `http://localhost:${TARGETS.react.port}/` },
  { name: 'vue', url: `http://localhost:${TARGETS.vue.port}/` },
  { name: 'svelte', url: `http://localhost:${TARGETS.svelte.port}/` },
];

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('h1')).toHaveCount(1);
  // The page's charts are on screen (they paint their rows on the next frames)
  const charts = page.locator(CHARTS);
  if ((await charts.count()) > 0) await expect(charts.first()).toBeVisible();
}

async function axeOutsideCharts(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).exclude(CHARTS).analyze();
  return violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** The header toggle switches `<html data-theme>`, its pressed state and every chart on the page. */
async function checkThemeToggle(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Dark theme' });
  const before = await toggle.getAttribute('aria-pressed');
  await toggle.click();
  const dark = before !== 'true';
  await expect(toggle).toHaveAttribute('aria-pressed', String(dark));
  await expect(page.locator('html')).toHaveAttribute('data-theme', dark ? 'dark' : 'light');
  const charts = page.locator(CHARTS);
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
  // The choice is remembered
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', dark ? 'dark' : 'light');
}

async function checkSkipLink(page: Page): Promise<void> {
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
}

test.describe('site (Angular showcase)', () => {
  for (const r of ROUTES) {
    test(`${r.path}: one h1, current nav item, no axe violations outside the charts`, async ({ page }) => {
      await open(page, `${SITE}${r.path}`);
      const current = page.getByRole('navigation', { name: 'Primary' }).locator('[aria-current]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText(r.nav);
      await expect(current).toHaveAttribute('aria-current', r.current);
      expect(await axeOutsideCharts(page)).toEqual([]);
    });
  }

  test('dark theme: no axe violations outside the charts on the main pages', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    for (const path of ['/', '/playground', '/theming', '/api']) {
      await open(page, `${SITE}${path}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      expect(await axeOutsideCharts(page), path).toEqual([]);
    }
  });

  test('skip link and theme switch', async ({ page }) => {
    await open(page, `${SITE}/`);
    await checkSkipLink(page);
    await checkThemeToggle(page);
  });

  test('nav moves focus to the new page', async ({ page }) => {
    await open(page, `${SITE}/`);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'API' }).click();
    await expect(page).toHaveURL(/\/api$/);
    await expect(page.locator('#main')).toBeFocused();
    await expect(page).toHaveTitle(/API/);
  });

  test('tabs: one tab stop; arrow keys, Home and End select and focus', async ({ page }) => {
    await open(page, `${SITE}/frameworks`);
    const tabs = page.getByRole('tablist', { name: 'Framework' }).getByRole('tab');
    const selected = async (i: number) => {
      await expect(tabs.nth(i)).toBeFocused();
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
      await expect(tabs.nth(i)).toHaveAttribute('tabindex', '0');
      await expect(tabs.nth(i)).toHaveAttribute('aria-controls', 'fw-panel');
    };
    const last = (await tabs.count()) - 1;
    await expect(tabs.and(page.locator('[tabindex="0"]'))).toHaveCount(1);
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await selected(1);
    await expect(page).toHaveURL(/[?&]f=js\b/);
    await expect(tabs.first()).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('End');
    await selected(last);
    await page.keyboard.press('ArrowRight');
    await selected(0);
    await page.keyboard.press('ArrowLeft');
    await selected(last);
    await page.keyboard.press('Home');
    await selected(0);
    await expect(page.locator('#fw-panel')).toHaveAttribute('aria-labelledby', 'fw-tab-html');

    // The install block's package-manager tabs share the pattern
    const pm = page.getByRole('tablist', { name: 'Package manager' });
    await pm.getByRole('tab', { selected: true }).focus();
    await page.keyboard.press('End');
    const bun = pm.getByRole('tab', { name: 'bun', exact: true });
    await expect(bun).toBeFocused();
    await expect(bun).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'bun install command' })).toContainText('bun add @gantryjs/');
  });

  test('phone width: no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const r of ROUTES) {
      await open(page, `${SITE}${r.path}`);
      expect(await horizontalOverflow(page), r.path).toBeLessThanOrEqual(0);
    }
  });
});

for (const app of APPS) {
  test.describe(`${app.name} demo`, () => {
    test('one h1, skip link, theme switch, no axe violations outside the chart', async ({ page }) => {
      await open(page, app.url);
      expect(await axeOutsideCharts(page)).toEqual([]);
      await checkSkipLink(page);
      await checkThemeToggle(page);
    });

    test('phone width: no horizontal page scroll', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, app.url);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

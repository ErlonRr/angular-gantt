// Screenshot baselines. They are rendered in the Playwright container (same fonts and Chromium
// as CI): `pnpm e2e:update` regenerates them, `pnpm e2e:visual` / CI compare against them.
import { test, expect } from './fixtures';
import { TARGETS } from '../playwright.config';

test.skip(!process.env['GANTRY_E2E_VISUAL'], 'screenshot baselines run in the Playwright container: pnpm e2e:visual');

const VIEW_MODES = ['Hour', 'Day', 'Week', 'Month', 'Quarter', 'Year'] as const;

/**
 * Every baseline is the chart in this box at the top left of the page, whatever the demo page
 * around it looks like: a redesign of the page doesn't touch the baselines, a change of the chart
 * does. The rule is in the page before its scripts run, so the chart is born at this size (a
 * resize after the first render would move its scroll position) and sits on whole pixels.
 */
const BOX_CSS =
  'gantry-element, gantry { position: fixed !important; top: 0 !important; left: 0 !important; ' +
  'z-index: 100 !important; width: 1100px !important; height: 640px !important; }';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(css => {
    const add = () => {
      const style = document.createElement('style');
      style.textContent = css;
      (document.head ?? document.documentElement).append(style);
    };
    if (document.documentElement) add();
    else {
      new MutationObserver((_, observer) => {
        if (!document.documentElement) return;
        observer.disconnect();
        add();
      }).observe(document, { childList: true });
    }
  }, BOX_CSS);
});

test.describe('Web Component', () => {
  test.beforeEach(async ({ chart }) => {
    await chart.open(`http://localhost:${TARGETS.vanilla.port}/`);
  });

  for (const viewMode of VIEW_MODES) {
    test(`${viewMode} view`, async ({ chart }) => {
      await chart.host().evaluate((el, vm) => {
        const g = el as HTMLElement & { options: object; darkMode: boolean };
        g.darkMode = false;
        g.options = { viewMode: vm, initialScroll: 'today' };
      }, viewMode);
      await chart.page.waitForTimeout(200);
      await expect(chart.host()).toHaveScreenshot(`vanilla-${viewMode.toLowerCase()}.png`);
    });
  }

  test('dark theme', async ({ chart }) => {
    await chart.host().evaluate(el => {
      const g = el as HTMLElement & { options: object; darkMode: boolean };
      g.darkMode = true;
      g.options = { viewMode: 'Month' };
    });
    await chart.page.waitForTimeout(200);
    await expect(chart.host()).toHaveScreenshot('vanilla-dark.png');
  });

  test('table view', async ({ chart }) => {
    await chart.host().evaluate(el => {
      const g = el as HTMLElement & { options: object; darkMode: boolean };
      g.darkMode = false;
      g.options = { view: 'table', baseline: true };
    });
    await chart.page.waitForTimeout(500);
    await expect(chart.host()).toHaveScreenshot('vanilla-table.png');
  });
});

test('Angular showcase roadmap', async ({ chart }) => {
  await chart.open(`http://localhost:${TARGETS.angular.port}/roadmap`);
  await chart.page.waitForTimeout(300);
  await expect(chart.host()).toHaveScreenshot('angular-roadmap.png');
});

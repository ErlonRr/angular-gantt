// Screenshot baselines. They are rendered in the Playwright container (same fonts and Chromium
// as CI): `pnpm e2e:update` regenerates them, `pnpm e2e:visual` / CI compare against them.
import { test, expect } from './fixtures';
import { TARGETS } from '../playwright.config';

test.skip(!process.env['GANTRY_E2E_VISUAL'], 'screenshot baselines run in the Playwright container: pnpm e2e:visual');

const VIEW_MODES = ['Hour', 'Day', 'Week', 'Month', 'Quarter', 'Year'] as const;

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

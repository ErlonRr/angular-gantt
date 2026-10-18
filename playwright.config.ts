import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for every binding. Each target serves its production build
 * (run `pnpm build` first — `pnpm e2e:full` does both); servers already running
 * on these ports (e.g. `pnpm qa:serve start`) are reused locally.
 */
export const TARGETS = {
  vanilla: { port: 4171, dir: 'apps/demo-vanilla' },
  react: { port: 4172, dir: 'apps/demo-react' },
  vue: { port: 4175, dir: 'apps/demo-vue' },
  svelte: { port: 4174, dir: 'apps/demo-svelte' },
  angular: { port: 4180, dir: '.' },
} as const;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  use: {
    locale: 'en-US',
    timezoneId: 'Europe/Rome',
    viewport: { width: 1400, height: 820 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 820 } } }],
  webServer: Object.entries(TARGETS).map(([name, t]) => ({
    command:
      name === 'angular'
        ? `npx vite preview --outDir dist/gantry-demo/browser --port ${t.port} --strictPort`
        : `npx vite preview --port ${t.port} --strictPort`,
    cwd: t.dir,
    url: `http://localhost:${t.port}/`,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  })),
});

import { defineConfig } from 'vitest/config';

// Two projects:
//  - core:    framework-free logic (gantt-math / gantt-data / gantt-cpm / i18n
//             formatters) in plain Node — fast, no DOM.
//  - vanilla: the <gantry-element> Web Component in happy-dom.
// Workspace packages resolve to their TypeScript sources via the
// `@gantry/source` export condition, so no package build is needed.
export default defineConfig({
  resolve: { conditions: ['@gantry/source'] },
  ssr: { resolve: { conditions: ['@gantry/source'] } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'core', include: ['packages/core/src/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: { name: 'vanilla', include: ['packages/vanilla/src/**/*.test.ts'], environment: 'happy-dom' },
      },
    ],
  },
});

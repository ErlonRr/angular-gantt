import { defineConfig, defaultClientConditions } from 'vite';

export default defineConfig({
  // Relative asset URLs: the site serves this app under /wc/ (scripts/compose-site.mjs)
  base: './',
  // Resolve @gantryjs/* workspace packages from source (see their "exports"),
  // so the demo hot-reloads library changes without a package build.
  resolve: { conditions: ['@gantryjs/source', ...defaultClientConditions] },
  // The playground, the examples gallery, the performance page (e2e/perf.spec.ts) and the strict
  // CSP page (e2e/csp.spec.ts)
  build: {
    rolldownOptions: {
      input: { main: 'index.html', examples: 'examples.html', perf: 'perf.html', csp: 'csp.html' },
    },
  },
});

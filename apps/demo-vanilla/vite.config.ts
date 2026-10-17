import { defineConfig, defaultClientConditions } from 'vite';

export default defineConfig({
  // Resolve @gantry/* workspace packages from source (see their "exports"),
  // so the demo hot-reloads library changes without a package build.
  resolve: { conditions: ['@gantry/source', ...defaultClientConditions] },
  // The playground, the performance page (e2e/perf.spec.ts) and the strict CSP page (e2e/csp.spec.ts)
  build: { rolldownOptions: { input: { main: 'index.html', perf: 'perf.html', csp: 'csp.html' } } },
});

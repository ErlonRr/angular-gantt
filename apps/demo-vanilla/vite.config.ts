import { defineConfig, defaultClientConditions } from 'vite';

export default defineConfig({
  // Resolve @gantry/* workspace packages from source (see their "exports"),
  // so the demo hot-reloads library changes without a package build.
  resolve: { conditions: ['@gantry/source', ...defaultClientConditions] },
});

import { defineConfig, defaultClientConditions } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  plugins: [svelte()],
  // Resolve @gantry/* workspace packages from source (see their "exports"),
  // so the demo hot-reloads library changes without a package build.
  resolve: { conditions: ['@gantry/source', ...defaultClientConditions], dedupe: ['svelte'] },
});

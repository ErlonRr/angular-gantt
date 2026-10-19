import { defineConfig, defaultClientConditions } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  // Relative asset URLs: the site serves this app under /svelte/ (scripts/compose-site.mjs)
  base: './',
  plugins: [svelte()],
  // Resolve @gantryjs/* workspace packages from source (see their "exports"),
  // so the demo hot-reloads library changes without a package build.
  resolve: { conditions: ['@gantryjs/source', ...defaultClientConditions], dedupe: ['svelte'] },
});

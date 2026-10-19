import { defineConfig, defaultClientConditions } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  // Relative asset URLs: the site serves this app under /vue/ (scripts/compose-site.mjs)
  base: './',
  plugins: [vue()],
  // Resolve @gantryjs/* workspace packages from source (see their "exports"),
  // so the demo hot-reloads library changes without a package build.
  resolve: { conditions: ['@gantryjs/source', ...defaultClientConditions], dedupe: ['vue'] },
});

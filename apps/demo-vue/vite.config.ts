import { defineConfig, defaultClientConditions } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  // Resolve @gantry/* workspace packages from source (see their "exports"),
  // so the demo hot-reloads library changes without a package build.
  resolve: { conditions: ['@gantry/source', ...defaultClientConditions], dedupe: ['vue'] },
});

import { defineConfig, defaultClientConditions } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  // Relative asset URLs: the site serves this app under /react/ (scripts/compose-site.mjs)
  base: './',
  plugins: [react()],
  // Resolve @gantryjs/* workspace packages from source (see their "exports"),
  // so the demo hot-reloads library changes without a package build.
  resolve: { conditions: ['@gantryjs/source', ...defaultClientConditions], dedupe: ['react', 'react-dom'] },
});

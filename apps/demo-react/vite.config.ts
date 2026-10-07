import { defineConfig, defaultClientConditions } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // Resolve @gantry/* workspace packages from source (see their "exports"),
  // so the demo hot-reloads library changes without a package build.
  resolve: { conditions: ['@gantry/source', ...defaultClientConditions], dedupe: ['react', 'react-dom'] },
});

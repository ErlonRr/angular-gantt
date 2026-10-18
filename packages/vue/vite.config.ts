import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rolldownOptions: {
      external: ['vue', /^@gantryjs\//],
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'], exclude: ['src/**/__tests__/**'], bundleTypes: true })],
});

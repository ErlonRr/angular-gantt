import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        demo: resolve(import.meta.dirname, 'src/demo.ts'),
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    sourcemap: true,
    // One file per module (not one bundle), so a consumer's bundler keeps what isn't imported out of
    // its entry: <gantry-element> loads the export code (export/*) only on its first export
    rolldownOptions: {
      output: { preserveModules: true, preserveModulesRoot: 'src' },
    },
  },
  plugins: [dts({ include: ['src'], exclude: ['src/**/__tests__/**'], bundleTypes: true })],
});

import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'GantrySvelte',
      fileName: (format) => `svelte.${format}.js`
    },
    rollupOptions: {
      external: ['svelte', '@gantry/vanilla', '@gantry/core'],
      output: {
        globals: {
          svelte: 'Svelte',
          '@gantry/vanilla': 'GantryVanilla',
          '@gantry/core': 'GantryCore'
        }
      }
    }
  },
  plugins: [svelte(), dts({ insertTypesEntry: true })]
});

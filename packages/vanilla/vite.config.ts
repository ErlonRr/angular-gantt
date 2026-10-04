import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Gantry',
      fileName: (format) => `gantry.${format}.js`
    },
    rollupOptions: {
      external: ['@gantry/core'],
      output: {
        globals: {
          '@gantry/core': 'GantryCore'
        }
      }
    }
  },
  plugins: [dts({ insertTypesEntry: true })]
});

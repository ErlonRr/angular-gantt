import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'GantryReact',
      fileName: (format) => `react.${format}.js`
    },
    rollupOptions: {
      external: ['react', '@gantry/vanilla', '@gantry/core'],
      output: {
        globals: {
          react: 'React',
          '@gantry/vanilla': 'GantryVanilla',
          '@gantry/core': 'GantryCore'
        }
      }
    }
  },
  plugins: [dts({ insertTypesEntry: true })]
});

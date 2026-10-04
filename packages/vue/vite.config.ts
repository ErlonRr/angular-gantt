import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'GantryVue',
      fileName: (format) => `vue.${format}.js`
    },
    rollupOptions: {
      external: ['vue', '@gantry/vanilla', '@gantry/core'],
      output: {
        globals: {
          vue: 'Vue',
          '@gantry/vanilla': 'GantryVanilla',
          '@gantry/core': 'GantryCore'
        }
      }
    }
  },
  plugins: [vue(), dts({ insertTypesEntry: true })]
});

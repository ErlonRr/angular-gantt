import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        demo:  resolve(__dirname, 'src/demo.ts'),
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      external: [/^dayjs/],
    },
    sourcemap: true,
  },
  plugins: [dts({ include: ['src'], exclude: ['src/**/__tests__/**'], rollupTypes: true })],
});

#!/usr/bin/env node
// What `import '@gantryjs/vanilla'` costs a user: the esbuild-minified, tree-shaken ESM bundle of
// the Web Component and the parts of @gantryjs/core it reaches, built from the TypeScript sources
// (`@gantryjs/source` condition, so no `pnpm build` is needed), gzipped at level 9.
//
//   node scripts/size.mjs              → prints `vanilla+core: NN.N KB gz`
//   node scripts/size.mjs --max 30     → also exits 1 when the bundle is over 30 KB gz
//
// esbuild comes from the Angular toolchain (hoisted node_modules).
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const maxAt = args.indexOf('--max');
const max = maxAt >= 0 ? Number(args[maxAt + 1]) : null;
if (max !== null && !(max > 0)) {
  console.error('usage: node scripts/size.mjs [--max <kb>]');
  process.exit(2);
}

const result = await build({
  stdin: {
    contents: "import '@gantryjs/vanilla';",
    // A workspace package that depends on @gantryjs/vanilla, so the bare import resolves
    resolveDir: fileURLToPath(new URL('../apps/demo-vanilla', import.meta.url)),
    loader: 'js',
  },
  conditions: ['@gantryjs/source'],
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  logLevel: 'warning',
});

const code = result.outputFiles[0].contents;
const kb = gzipSync(code, { level: 9 }).length / 1024;
console.log(`vanilla+core: ${kb.toFixed(1)} KB gz`);
if (max !== null && kb > max) {
  console.error(`over budget: ${kb.toFixed(1)} KB gz > ${max} KB gz`);
  process.exit(1);
}

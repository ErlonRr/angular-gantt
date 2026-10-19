#!/usr/bin/env node
// What `import '@gantryjs/vanilla'` costs a user: the minified, tree-shaken ESM build of the Web
// Component and the parts of @gantryjs/core it reaches, built from the TypeScript sources
// (`@gantryjs/source` condition, so no `pnpm build` is needed), each file gzipped at level 9.
//
// The build splits code as Vite does (rolldown, the bundler the packages and the demos build
// with): what `import()` loads on demand (the export code, `export/run.ts`, with the core
// modules only it uses) is a lazy chunk. The entry cost is the entry chunk plus the chunks it
// imports statically, which is what the budget checks; each lazy chunk (with the chunks only it
// needs) is printed apart. (esbuild would put the core modules the lazy chunk uses into a chunk
// the entry loads, because the element's index re-exports all of @gantryjs/core.)
//
//   node scripts/size.mjs              → `vanilla+core: NN.N KB gz` (the entry), then the lazy chunks
//   node scripts/size.mjs --max 30     → also exits 1 when the entry is over 30 KB gz
//
// rolldown comes from Vite (hoisted node_modules). Nothing is written to disk.
import { rolldown } from 'rolldown';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const maxAt = args.indexOf('--max');
const max = maxAt >= 0 ? Number(args[maxAt + 1]) : null;
if (max !== null && !(max > 0)) {
  console.error('usage: node scripts/size.mjs [--max <kb>]');
  process.exit(2);
}

const root = fileURLToPath(new URL('..', import.meta.url));
// A virtual module in a workspace package that depends on @gantryjs/vanilla, so the bare import resolves
const ENTRY = join(root, 'apps/demo-vanilla/gantry-size-entry.js');
const bundle = await rolldown({
  input: ENTRY,
  cwd: root,
  platform: 'browser',
  resolve: { conditionNames: ['@gantryjs/source', 'import', 'module', 'browser', 'default'] },
  logLevel: 'warn',
  plugins: [
    {
      name: 'gantry-size-entry',
      resolveId: id => (id === ENTRY ? id : null),
      load: id => (id === ENTRY ? "import '@gantryjs/vanilla';" : null),
    },
  ],
});
const { output } = await bundle.generate({ format: 'es', minify: true });
await bundle.close();

const chunks = new Map(output.filter(o => o.type === 'chunk').map(c => [c.fileName, c]));
const gz = new Map([...chunks].map(([name, c]) => [name, gzipSync(c.code, { level: 9 }).length]));

/** `start` and every chunk it imports statically, transitively. */
function staticClosure(start) {
  const seen = new Set();
  const visit = name => {
    if (seen.has(name) || !chunks.has(name)) return;
    seen.add(name);
    for (const dep of chunks.get(name).imports) visit(dep);
  };
  visit(start);
  return seen;
}
const kbOf = names => [...names].reduce((sum, n) => sum + (gz.get(n) ?? 0), 0) / 1024;

const entry = [...chunks.values()].find(c => c.isEntry);
if (!entry) {
  console.error('size: no entry chunk in the build');
  process.exit(2);
}
const loaded = staticClosure(entry.fileName);
const kb = kbOf(loaded);
console.log(`vanilla+core: ${kb.toFixed(1)} KB gz`);

// Lazy chunks: each dynamically imported chunk with what only it needs
for (const c of chunks.values()) {
  if (!c.isDynamicEntry || loaded.has(c.fileName)) continue;
  const own = [...staticClosure(c.fileName)].filter(n => !loaded.has(n));
  const name = (c.facadeModuleId ?? c.name).replace(/^.*\/src\//, '').replace(/\.ts$/, '');
  console.log(`  lazy ${name}: ${kbOf(own).toFixed(1)} KB gz (loaded on first use)`);
}

if (max !== null && kb > max) {
  console.error(`over budget: ${kb.toFixed(1)} KB gz > ${max} KB gz`);
  process.exit(1);
}

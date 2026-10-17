import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const SVELTE_SERVER = 'svelte-server:';

/**
 * `import('svelte-server:../Gantry.svelte')` (relative to the importer): that component compiled
 * for the server, so a client test can render it with `svelte/server` and then hydrate the markup
 * (the svelte project compiles `.svelte` files for the client).
 */
const svelteServerBuild = (): Plugin => {
  // A virtual module named `….js` (the svelte plugin compiles only ids ending in `.svelte`)
  const virtual = (file: string) => `\0${SVELTE_SERVER}${file.replace(/\.svelte$/, '')}.js`;
  const source = (id: string) =>
    id.startsWith(`\0${SVELTE_SERVER}`) ? `${id.slice(SVELTE_SERVER.length + 1, -'.js'.length)}.svelte` : null;
  return {
    name: 'gantry:svelte-server-build',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer) return null;
      // The compiled module's own imports resolve as from the component file
      const from = source(importer);
      if (from) return this.resolve(id, from, { skipSelf: true });
      return id.startsWith(SVELTE_SERVER) ? virtual(resolve(dirname(importer), id.slice(SVELTE_SERVER.length))) : null;
    },
    async load(id) {
      const filename = source(id);
      if (!filename) return null;
      const { compile } = await import('svelte/compiler');
      const { js } = compile(await readFile(filename, 'utf8'), { filename, generate: 'server', runes: true });
      return { code: js.code, map: js.map, moduleType: 'js' };
    },
  };
};

// Projects:
//  - core:    framework-free logic (render model, timeline math, formatter, CPM, state and
//             interaction helpers) in plain Node — fast, no DOM.
//  - vanilla: the <gantry-element> Web Component in happy-dom.
//  - react / vue / svelte: the framework wrappers in happy-dom (SSR specs switch to the node
//             environment with a `// @vitest-environment node` comment).
//  - demo-kit: the demo apps' shared playground model, API reference and theme switch (happy-dom).
// Workspace packages resolve to their TypeScript sources via the
// `@gantry/source` export condition, so no package build is needed.
export default defineConfig({
  resolve: { conditions: ['@gantry/source'] },
  ssr: { resolve: { conditions: ['@gantry/source'] } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'core', include: ['packages/core/src/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: { name: 'vanilla', include: ['packages/vanilla/src/**/*.test.ts'], environment: 'happy-dom' },
      },
      {
        extends: true,
        test: { name: 'react', include: ['packages/react/src/**/*.test.{ts,tsx}'], environment: 'happy-dom' },
      },
      {
        extends: true,
        test: { name: 'vue', include: ['packages/vue/src/**/*.test.ts'], environment: 'happy-dom' },
      },
      {
        // Svelte resolves its client build only with the `browser` condition (its server build has no `mount`)
        extends: true,
        plugins: [svelteServerBuild(), svelte({ configFile: false, compilerOptions: { runes: true } })],
        resolve: { conditions: ['@gantry/source', 'browser'] },
        test: { name: 'svelte', include: ['packages/svelte/src/**/*.test.ts'], environment: 'happy-dom' },
      },
      {
        extends: true,
        test: { name: 'demo-kit', include: ['apps/demo-kit/src/**/*.test.ts'], environment: 'happy-dom' },
      },
    ],
  },
});

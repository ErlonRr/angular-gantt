// Custom Elements Manifest (`custom-elements.json`) for <gantry-element>: `pnpm cem` writes it,
// `pnpm cem:check` fails when it is stale (CI). The element's attributes, events, CSS parts,
// CSS custom properties and custom states are JSDoc tags on the class (`src/gantry.element.ts`);
// properties and methods come from its accessors and public methods.
// `src/__tests__/manifest.test.ts` checks the result against the property table, the event
// table and `themeToCss()`.

/** Lifecycle callbacks the analyzer does not already drop (it denies the other four). */
const LIFECYCLE = new Set(['connectedMoveCallback']);

/** Keeps the public surface only: no `#private` members, no lifecycle callbacks. */
function publicSurfaceOnly() {
  return {
    name: 'gantry-public-surface',
    moduleLinkPhase({ moduleDoc }) {
      for (const decl of moduleDoc.declarations ?? []) {
        if (decl.kind !== 'class') continue;
        decl.members = decl.members?.filter(m => m.privacy !== 'private' && !LIFECYCLE.has(m.name));
      }
    },
  };
}

/** The package ships one bundle (`dist/index.js`), not the sources: point the module paths at it. */
function publishedPaths() {
  const BUNDLE = 'dist/index.js';
  return {
    name: 'gantry-published-paths',
    packageLinkPhase({ customElementsManifest }) {
      for (const mod of customElementsManifest.modules) {
        mod.path = BUNDLE;
        for (const exp of mod.exports ?? []) if (exp.declaration?.module) exp.declaration.module = BUNDLE;
      }
    },
  };
}

export default {
  globs: ['src/gantry.element.ts'],
  outdir: '.',
  // `customElements` is declared in package.json by hand
  packagejson: false,
  plugins: [publicSurfaceOnly(), publishedPaths()],
};

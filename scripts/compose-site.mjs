#!/usr/bin/env node
// Composes the deployed site: the four Vite demo apps go under the Angular site's output, so one
// static deploy serves them all from the same origin (the gallery's "Open live" links).
//
//   node scripts/compose-site.mjs [--site <dir>] [--allow-missing]
//
//   apps/demo-vanilla/dist  → <site>/wc/       (the playground, examples.html, perf.html, csp.html)
//   apps/demo-react/dist    → <site>/react/
//   apps/demo-vue/dist      → <site>/vue/
//   apps/demo-svelte/dist   → <site>/svelte/
//
// <site> defaults to dist/gantry-demo/browser (`ng build gantry-demo`). Run it after building the
// site and the demos (`pnpm build` and `pnpm build:site` do). A missing demo build is an error, or
// is skipped with --allow-missing. The demos must be built with Vite `base: './'` to load their
// assets from a subpath: a page that loads `/assets/…` from the site root is reported.

import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Demo app → its path on the site (`DEMO_BASE` in apps/demo-kit/src/site.ts). */
export const DEMOS = [
  { app: 'demo-vanilla', base: 'wc' },
  { app: 'demo-react', base: 'react' },
  { app: 'demo-vue', base: 'vue' },
  { app: 'demo-svelte', base: 'svelte' },
];

/** Root-relative `src` / `href` values of an HTML page (`/assets/x.js`, not `//cdn…` or `./x`). */
export function rootRelativeRefs(html) {
  return [...html.matchAll(/\b(?:src|href)="(\/(?!\/)[^"]*)"/g)].map(m => m[1]);
}

/**
 * Copies every built demo under `site`. Returns what it did: `copied` and `skipped` bases, and
 * `problems` (fatal) and `warnings` messages.
 */
export function composeSite({ root = ROOT, site = join(root, 'dist/gantry-demo/browser'), allowMissing = false } = {}) {
  const copied = [];
  const skipped = [];
  const problems = [];
  const warnings = [];
  if (!existsSync(join(site, 'index.html'))) {
    problems.push(`${site}/index.html is missing: build the site first (pnpm build:app)`);
    return { copied, skipped, problems, warnings };
  }
  for (const { app, base } of DEMOS) {
    const dist = join(root, 'apps', app, 'dist');
    if (!existsSync(join(dist, 'index.html'))) {
      if (allowMissing) skipped.push(base);
      else problems.push(`apps/${app}/dist is missing: build it first (pnpm build:demos)`);
      continue;
    }
    for (const page of readdirSync(dist).filter(f => f.endsWith('.html'))) {
      const refs = rootRelativeRefs(readFileSync(join(dist, page), 'utf8'));
      if (refs.length) {
        warnings.push(
          `apps/${app}/dist/${page} loads ${refs[0]} from the site root: under /${base}/ it needs Vite \`base: './'\``,
        );
      }
    }
    const target = join(site, base);
    rmSync(target, { recursive: true, force: true });
    cpSync(dist, target, { recursive: true });
    copied.push(base);
  }
  return { copied, skipped, problems, warnings };
}

function main(argv) {
  let site;
  let allowMissing = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--allow-missing') allowMissing = true;
    else if (argv[i] === '--site' && argv[i + 1]) site = resolve(argv[++i]);
    else {
      console.error(`compose-site: unknown argument ${argv[i]} (use --site <dir> and/or --allow-missing)`);
      return 2;
    }
  }
  const { copied, skipped, problems, warnings } = composeSite({ ...(site ? { site } : {}), allowMissing });
  for (const w of warnings) console.warn(`! ${w}`);
  for (const p of problems) console.error(`✗ ${p}`);
  if (copied.length) console.log(`✓ composed the site: ${copied.map(b => `/${b}/`).join(' ')}`);
  if (skipped.length) console.log(`  not built, skipped: ${skipped.map(b => `/${b}/`).join(' ')}`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}

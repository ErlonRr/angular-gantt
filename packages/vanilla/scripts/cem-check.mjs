#!/usr/bin/env node
// Fails when the committed Custom Elements Manifest is stale: regenerates it in memory with the
// package's config (`custom-elements-manifest.config.mjs`) and compares it with
// `custom-elements.json`. CI runs it; `pnpm --filter @gantry/vanilla cem` rewrites the file.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cli } from '@custom-elements-manifest/analyzer/cli.js';

const FILE = 'custom-elements.json';
const cwd = fileURLToPath(new URL('..', import.meta.url));

// Same text the analyzer writes (`cem analyze`)
const manifest = await cli({ argv: ['analyze', '--quiet'], cwd, noWrite: true });
const fresh = `${JSON.stringify(manifest, null, 2)}\n`;

let committed = '';
try {
  committed = readFileSync(new URL(`../${FILE}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
} catch {
  // missing: stale
}

if (fresh === committed) {
  console.log(`${FILE} is up to date`);
} else {
  const want = fresh.split('\n');
  const have = committed.split('\n');
  let line = want.findIndex((text, i) => text !== have[i]);
  if (line < 0) line = want.length; // the committed file is longer
  console.error(`${FILE} is stale: run \`pnpm --filter @gantry/vanilla cem\` and commit the result.`);
  console.error(`first difference at line ${line + 1}:`);
  console.error(`- ${have[line] ?? '(end of file)'}\n+ ${want[line] ?? '(end of file)'}`);
  process.exit(1);
}

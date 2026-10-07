// Rewrites `workspace:` ranges in a built package.json (e.g. dist/ngx-gantry)
// to real semver ranges. ng-packagr copies the manifest verbatim, and npm
// can't publish `workspace:` protocol versions.
//
// Usage: node scripts/resolve-workspace-deps.mjs dist/ngx-gantry/package.json
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('Usage: resolve-workspace-deps.mjs <package.json>');

const root = resolve(import.meta.dirname, '..');
const versions = {};
for (const dir of ['packages', 'projects']) {
  for (const name of readdirSync(join(root, dir))) {
    const file = join(root, dir, name, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    versions[pkg.name] = pkg.version;
  }
}

const manifest = JSON.parse(readFileSync(target, 'utf8'));
for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
    if (!range.startsWith('workspace:')) continue;
    const version = versions[dep];
    if (!version) throw new Error(`Unknown workspace package ${dep}`);
    const spec = range.slice('workspace:'.length);
    manifest[field][dep] = spec === '*' ? version : spec === '^' || spec === '~' ? spec + version : spec;
  }
}
writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Resolved workspace deps in ${target}`);

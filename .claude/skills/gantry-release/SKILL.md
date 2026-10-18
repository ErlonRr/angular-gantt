---
name: gantry-release
description: Prepare a Gantry release — verify everything, version with Changesets, update the changelogs and the README "Recent Releases" accordions, inspect the npm tarballs, and only on explicit request commit, tag and publish. Run manually with /gantry-release.
disable-model-invocation: true
argument-hint: "[notes, e.g. 'patch only']"
---

# Prepare a Gantry release

Notes from the user: $ARGUMENTS

Current state:

!`git status --short | head -20; echo "---"; git log --oneline -5; echo "---"; npx changeset status 2>&1 | grep -E "info|warn|error" | head -20 || true`

Work through the phases; **stop after phase 3** and summarise. Phase 4 needs the user's
explicit "go" for each step (commit, tag, push, publish).

## Versioning policy

- `patch` (x.y.Z) routine fixes · `minor` (x.Y.0) features · `major` (X.0.0) breaking changes
  (renamed/removed options or outputs, changed defaults that alter output, changed public
  component inputs). All `@gantryjs/*` packages, Angular included, are versioned together
  (Changesets `fixed` group).
- Tags are `vX.Y.Z`.
- The `@gantryjs` npm org belongs to the user (`@gantry` is someone else's). The Angular package was
  `ngx-gantry` up to 1.0.1; it is now `@gantryjs/angular` and `ngx-gantry` only gets a deprecation notice.
- Gantry 2.0 is in Changesets pre mode (`.changeset/pre.json`, tag `next`): releases are `2.0.0-next.N`
  on the `next` dist-tag. Run `changeset pre exit` only for the stable 2.0.0.

## 1. Verify (all must pass)

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm test:tz
pnpm build                                   # packages → @gantryjs/angular → showcase → demos
pnpm e2e                                     # Playwright on every binding (serves the builds above)
```

## 2. Version

```bash
pnpm version-packages        # = changeset version: bumps versions, writes packages/*/CHANGELOG.md
```

- Root `CHANGELOG.md` (Keep a Changelog): move `## [Unreleased]` into `## [X.Y.Z] — YYYY-MM-DD`
  (today), leave an empty `## [Unreleased]` on top.
- `README.md` **and** `packages/angular/README.md`: in the `<details><summary><b>Recent Releases`
  accordion, add the new version at the top (3–6 bullets, bold lead-in like the existing
  entries) and keep only the last 5 releases.

## 3. Inspect what npm will receive

```bash
for p in packages/*; do (cd "$p" && pnpm pack --pack-destination "$TMPDIR/gantry-packs"); done
(cd packages/angular && pnpm pack --pack-destination "$TMPDIR/gantry-packs")   # from dist/gantryjs-angular
for t in "$TMPDIR"/gantry-packs/gantryjs-*.tgz; do npx -y publint@0.3 --strict "$t"; done
for t in "$TMPDIR"/gantry-packs/gantryjs-{core,vanilla,react,vue}-*.tgz; do npx -y @arethetypeswrong/cli@0.18 "$t" --profile esm-only; done
```

Check: tarballs hold only `dist/`, `README.md`, `LICENSE`, `package.json`; no `workspace:`
ranges left (`tar -xzOf <tgz> package/package.json`); versions match the changesets.

**Stop here.** Summarise: new versions, changelog highlights, verification results, anything odd.

## 4. Ship (only when the user says so, step by step)

1. Commit: `git commit -am "chore(release): vX.Y.Z"` (one line, no body).
2. Tag: `git tag vX.Y.Z`.
3. Push: `git push && git push --tags` — preferred: CI (`.github/workflows/release.yml`,
   changesets/action) publishes with provenance using the `NPM_TOKEN` secret. It starts only
   after the `CI` workflow succeeds on `main` (`workflow_run`), so a red build never publishes.
4. Manual publish only if the user explicitly asks: `pnpm release` (needs `npm login` and 2FA).

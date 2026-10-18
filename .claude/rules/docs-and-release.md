---
paths:
  - 'README.md'
  - 'CHANGELOG.md'
  - 'packages/*/README.md'
  - '.changeset/**'
  - 'apps/**'
---

# Docs, demos and release notes

- The root README "Configuration" section is the single reference for options (all
  bindings share them). Package READMEs link to it with absolute GitHub URLs (npm renders
  READMEs outside the repo, so relative links break).
- Every user-facing change gets a `.changeset/*.md` (the `@gantryjs/*` packages are versioned
  together; `ngx-gantry` independently) and a line under `## [Unreleased]` in `CHANGELOG.md`.
- New option → add a control to `PLAYGROUND_SECTIONS` and map it in `playgroundOptions()`
  (`apps/demo-kit/src/playground.ts`): the vanilla playground and the site's `/playground` both
  render it, and its code tabs print it for every framework.
- Demo apps are private and must typecheck: `pnpm --filter demo-<name> typecheck`. They share
  `demo-kit` (look, theme switch, links, icons, playground and API models): use its `gs-` classes,
  never page-wide element selectors.
- On release, keep the "Recent Releases" `<details>` accordion in `README.md` and
  `packages/angular/README.md` to the last 5 releases (see the `/gantry-release` skill).

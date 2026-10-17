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
- Every user-facing change gets a `.changeset/*.md` (the `@gantry/*` packages are versioned
  together; `ngx-gantry` independently) and a line under `## [Unreleased]` in `CHANGELOG.md`.
- New option → add a control to the playground (`apps/demo-vanilla/src/main.ts`) so it can be tried live.
- Demo apps are private and must typecheck: `pnpm --filter demo-<name> typecheck`.
- On release, keep the "Recent Releases" `<details>` accordion in `README.md` and
  `packages/angular/README.md` to the last 5 releases (see the `/gantry-release` skill).

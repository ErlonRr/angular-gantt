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
- Every user-facing change gets a `.changeset/*.md` (all `@gantryjs/*` packages, Angular included,
  are versioned together) and a line under `## [Unreleased]` in `CHANGELOG.md`.
- New option → add a control to `PLAYGROUND_SECTIONS` and map it in `playgroundOptions()`
  (`apps/demo-kit/src/playground.ts`): the vanilla playground and the site's `/playground` both
  render it, and its code tabs print it for every framework.
- Demo apps are private and must typecheck: `pnpm --filter demo-<name> typecheck`. They share
  `demo-kit` (look, theme switch, links, icons, playground and API models): use its `gs-` classes,
  never page-wide element selectors.
- The examples gallery (`apps/demo-kit/src/gallery/`): `catalog.ts` lists the cases (id, title, summary, tags,
  ready contract, framework notes), `cases/<id>.ts` holds each case's shared data, options and choice lists, and
  every framework has one file per case (Angular `apps/demo-angular/src/app/gallery/cases/<id>/<id>-example.component.ts`
  and its `cases.ts` entry; WC `apps/demo-vanilla/src/gallery/cases/<id>/<id>.ts` exporting `mount(host)`; React / Vue /
  Svelte `apps/demo-<fw>/src/gallery/cases/<id>/<Pascal>Example.{tsx,vue,svelte}`), with the same controls and
  labels in all five. A new feature adds or extends a case in all five frameworks. After adding or changing case
  files run `pnpm gallery:sources` (regenerates the code tabs' sources); CI runs `pnpm gallery:check`. A difference
  between frameworks the user can notice goes into `framework-notes.ts` (shown under "Known differences").
- On release, keep the "Recent Releases" `<details>` accordion in `README.md` and
  `packages/angular/README.md` to the last 5 releases (see the `/gantry-release` skill).

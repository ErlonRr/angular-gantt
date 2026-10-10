---
name: gantry-visual-qa
description: Check Gantry in a real browser with Playwright — serve the production builds (Angular showcase, Web Component playground, React, Vue, Svelte), run the e2e checks (console errors, header and row alignment, scroll sync, drag, panel collapse, table view, cross-binding parity, screenshots) and inspect the screenshots. Use after rendering or UI changes, before calling such work done, or when a visual bug is reported.
argument-hint: "[test filter, e.g. vanilla · angular-lazy · parity]"
---

# Visual QA in a real browser

Filter: $ARGUMENTS (everything when empty). Unit tests can't see pixels; this can. Run it before
saying UI work is done, and attach the evidence (results + screenshots you looked at).

## 1. Build and run

```bash
pnpm build                      # the e2e suite serves production builds
pnpm e2e                        # all specs (Chromium)    ·   pnpm e2e:full = build + e2e
pnpm e2e -g vanilla             # one page / spec by title ·   pnpm e2e e2e/qa.spec.ts
```

Playwright starts `vite preview` on the fixed ports below, or reuses servers already running
there (`pnpm qa:serve start <targets>` builds and serves them; `pnpm qa:serve stop` stops them).
If Chromium is missing: `npx playwright install chromium`.

| Target | URL | Notes |
|---|---|---|
| vanilla | http://localhost:4171 | options playground (`<gantry-element>`), tested with 60 extra rows |
| react / vue / svelte | :4172 / :4175 / :4174 | wrapper demos |
| angular | http://localhost:4180 | showcase: `/roadmap` · `/demo` · `/lazy` (120 tasks) · `/custom-bar` |

The clock is frozen (`e2e/fixtures.ts` → `NOW`), locale `en-US`, time zone `Europe/Rome`, and
every test fails on a console error or page error.

- A configuration: `GANTRY_E2E_OPTIONS='{"viewMode":"Day","bar":{"height":"80%"}}' pnpm e2e e2e/qa.spec.ts`
  merges it into every Web Component target, so bindings can be compared.
- Phone size: add a project or run with `--project` after adding a mobile viewport in `playwright.config.ts`.

## 2. Look at the screenshots

`test-results/e2e/shots/<page>-{initial,after-drag,table}.png` — open them with the Read tool; the
checks don't catch everything. Failures also leave a trace (`npx playwright show-trace …`) and the
HTML report (`playwright-report/`, CI artifact). Look for: clipped or overlapping header labels;
period delimiters on month/year boundaries; bars starting exactly on their day cell; weekend /
holiday / off-hours bands; arrows entering bar edges; labels inside bars or cleanly beside them;
today marker and current-period highlight; dark mode contrast.

Screenshot baselines (`e2e/__screenshots__/`, spec `e2e/visual.spec.ts`: every zoom level, dark,
table view, Angular roadmap) are rendered in the Playwright container so they match CI:
`pnpm e2e:visual` compares, `pnpm e2e:update` regenerates (Docker or Podman; container results land
in `test-results/container/`). On the host the visual spec is skipped — never update baselines there.
After an intended visual change, regenerate and look at every changed PNG before keeping it.

## 3. When a check fails

| Test | Usually means | Look at |
|---|---|---|
| renders | crash or empty data | console errors in the output, `render()` / template |
| headers same height | task-list header ≠ timeline header | header `box-sizing`, `headerHeight` / `subHeaderHeight` |
| rows line up | panel rows offset from canvas rows | row height incl. borders, header height, scroll services |
| drags | bar didn't move or ghost stayed | hit-testing (`visual.handles`), `DragSession`, pointer capture |
| panel | width not restored | `panelWidthPx` / view state, splitter toggle, width transitions on load |
| table view | panel not full width | view switch, panel width for `view: 'table'` |
| parity | a binding draws bars elsewhere | the binding computes instead of painting the core model |

Fix, rebuild what changed (`pnpm build`, or the one app), re-run the failing test with `-g`.

Report per page: pass/fail per test, the screenshots you inspected and what you saw.

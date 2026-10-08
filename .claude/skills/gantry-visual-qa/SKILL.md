---
name: gantry-visual-qa
description: Check Gantry in a real browser — build and serve the demos (Angular showcase, Web Component playground, React, Vue, Svelte), run the automated checks (console errors, header and row alignment, scroll sync, drag, panel collapse, table view) and inspect screenshots. Use after rendering or UI changes, before calling such work done, or when a visual bug is reported.
argument-hint: "[targets: vanilla react vue svelte angular]"
---

# Visual QA in a real browser

Targets: $ARGUMENTS (all when empty). Unit tests can't see pixels; this can. Run it before saying UI
work is done, and attach the evidence (check results + screenshots you looked at).

## 1. Serve production builds

```bash
bash scripts/qa/serve.sh start vanilla angular      # or: start (all) · status · stop
```

| Target | URL | Notes |
|---|---|---|
| vanilla | http://localhost:4171 | options playground (`<gantry-element>`) |
| react / vue / svelte | :4172 / :4173 / :4174 | wrapper demos |
| angular | http://localhost:4180 | showcase: `/` roadmap · `/demo` · `/lazy` (120 tasks) · `/custom-bar` |

Build logs land in `$TMPDIR/gantry-qa-serve/<target>.build.log`.

## 2. Run the checks

```bash
node scripts/qa/qa.mjs --url http://localhost:4171 --name vanilla --rows 60
node scripts/qa/qa.mjs --url http://localhost:4180/lazy --name angular
```

- `--rows N` (Web Component) appends N tasks so virtual scrolling and scroll sync are exercised.
- `--options '{"viewMode":"Day","bar":{"height":"80%"}}'` (Web Component) tests a configuration;
  run the **same** options against vanilla and a wrapper demo to compare bindings.
- `--skip drag,panel,table,scroll` · `--viewport 390x844` for a phone-sized check.
- The script prints a JSON report and exits 1 on any failed check or console error.
  It auto-detects Chrome / Chromium / Firefox; set `GANTRY_QA_BROWSER` to override.

## 3. Look at the screenshots

Open the PNGs listed in `screenshots` with the Read tool — the checks don't catch everything.
Look for: clipped or overlapping header labels; period delimiters on month/year boundaries;
bars starting exactly on their day cell; weekend / holiday / off-hours bands where expected;
arrows entering bar edges (not cutting through bars); labels inside bars or cleanly beside
them; today marker and current-period highlight; dark mode contrast.

## 4. When a check fails

| Check | Usually means | Look at |
|---|---|---|
| `render` | crash or empty data | console errors in the report, `render()` / template |
| `headerHeight` | task-list header ≠ timeline header | header `box-sizing`, `headerHeight` / `subHeaderHeight` handling |
| `rowAlignment` | panel rows offset from canvas rows | row height incl. borders (`box-sizing: border-box`), header height |
| `scrollSync` | panes scroll apart | scroll services, wheel forwarding, bottom scrollbar padding |
| `drag` | bar didn't move or ghost stayed | hit-testing (`visual.handles`), `DragSession`, pointer capture |
| `panelToggle` | width not restored | `panelWidthPx` / view state, splitter toggle |
| `tableView` | panel not full width | view switch, panel width for `view: 'table'` |

Fix, rebuild only what changed (`bash scripts/qa/serve.sh stop` then `start <target>`), re-run.

## 5. Clean up

```bash
bash scripts/qa/serve.sh stop
```

Report per target: pass/fail of each check, the screenshots you inspected and what you saw.

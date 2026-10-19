---
'@gantryjs/core': major
'@gantryjs/vanilla': major
'@gantryjs/angular': major
---

**Theming through CSS variables.** Every colour of the render model is now a `Paint`: a CSS colour
value that is either a theme token (`var(--gantt-*)`) or an explicit task / option colour passed
through as is. Both renderers apply paints as CSS properties, and the theme reaches the pixels only
through custom properties. The resolved config no longer carries the theme.

### `@gantryjs/core` (breaking)

- `resolveConfig(options, theme, i18n)` becomes `resolveConfig(options?, i18n?, metrics?)`, where
  `metrics` is `Partial<ThemeMetrics>` (pass `themeMetrics(theme)`; only `barRadius` is read, as the
  default `bar.radius`). `ResolvedGanttConfig.theme` is removed.
- The resolved-colour fields are replaced by paints:

  | Removed                                             | Replacement                                                                  |
  | --------------------------------------------------- | ---------------------------------------------------------------------------- |
  | `BarVisual.fill`, `.label.color`, `.progress.color` | `BarVisual.paint.{body,label,progress}`, plus `BarVisual.tone`               |
  | `ArrowVisual.color`                                 | `ArrowVisual.paint`                                                          |
  | `TimeBand.color`                                    | `TimeBand.paint` (bands merge by kind and paint)                             |
  | `ResolvedLine.color`                                | `ResolvedLine.paint`                                                         |
  | `LegendItem.color`                                  | `LegendItem.paint`                                                           |
  | `CellVisual.dotColor`                               | `CellVisual.dotPaint`                                                        |
  | `statusColor(status, theme)`                        | `statusPaint(status)`                                                        |
  | `TooltipModel.colors`, `TooltipColors`              | `TooltipModel.critical` + `TooltipModel.paint.progress` (chrome: CSS tokens) |

- No more theme inputs: `buildTooltipModel`'s `config` has no `theme`, `buildLegend` takes no
  `theme`, `computeCellVisual(col, row, ctx)` drops its fourth argument, and `computeTimeBands`
  reads no `cfg.theme`. `computeBarVisual` takes `fontPx` and `barTextColor` (the label colour on an
  explicit `task.barColor`, default `'#FFFFFF'`) from `themeMetrics(theme)`.
- Bar labels on theme fills use the contrast tokens `--gantt-bar-text-on-bar`,
  `--gantt-bar-text-on-milestone` and `--gantt-bar-text-on-critical`
  (`readableOn(fill, barTextColor)`). A page-CSS override of `--gantt-bar`, `--gantt-milestone` or
  `--gantt-critical` must also set the matching token, or use `setTheme()`.
- Custom renderers: get a concrete colour with `resolvePaint(paint, theme)` (it accepts the bar
  context's `ctx.theme`).
- `annotationPaint()` gives `isToday` annotations the today colour (the Web Component used to ignore
  `isToday`; Angular already drew them in the today colour), so the line, its region and its legend
  swatch agree in both renderers.
- New label `dragDelta(amount, unit)` (`'+3d'` / `'-2h'`), deprecated in the same release: the drag
  readout chip shows the move instead. Like the other new `GanttLabels` members, only objects typed as
  a full `GanttLabels` need it; `options.labels` stays partial.
- New exports: `Paint`, `ThemeColorKey`, `themeVar`, `isThemeVar`, `resolvePaint`, `PAINTS`,
  `rowPaint`, `annotationPaint`, `statusPaint`, `themeToCss`, `CONTRAST_CSS_VARS`, `ThemeMetrics`,
  `themeMetrics`, `sameThemeMetrics`, `BarTone`, `BarPaint`, `TooltipPaint`, `headerCellBorder`,
  `buildArrowIndex` (`ArrowIndex`, `ArrowLink`), `computeDragGhostVisual` (`GhostVisual`,
  `GhostLabel`), `DRAG_SOURCE_OPACITY`, `quantizeNow`, `todayX`, `periodNext`,
  `VIEWPORT_FALLBACK_HEIGHT`.

```ts
// before
const cfg = resolveConfig(options, theme, i18n);
bar.setAttribute('fill', visual.fill);
// after
const cfg = resolveConfig(options, i18n, themeMetrics(theme));
bar.style.setProperty('fill', visual.paint.body); // or resolvePaint(visual.paint.body, theme)
```

### `@gantryjs/vanilla`

- The theme variables live in a `:host` stylesheet inside the shadow root instead of the host's
  inline style: page CSS on `gantry-element` overrides them, and a string `style` attribute (for
  example Svelte's `style=`) or `setAttribute('style', …)` no longer wipes them.
- With `darkMode: 'auto'`, an OS colour-scheme flip re-renders the chart at once.
- Colours are set through the CSSOM, never as presentation attributes or style text, so a task
  colour such as `'red;background:url(x)'` can no longer inject CSS.
- Custom `renderBar`: `ctx.visual.fill`, `ctx.visual.label.color` and `ctx.visual.progress.color`
  are gone; `ctx.visual.paint.{body,label,progress}` may be `var()` strings — apply them as style
  properties or resolve them with `resolvePaint(paint, ctx.theme)`. `ctx.theme` is the element's
  resolved theme.
- The built-in bar a custom `renderBar` gets from `renderDefault()` paints with the `--gantt-*`
  variables, so it needs them in scope (inside the element or on an ancestor). The low-level painters
  (`paintBar`, `GanttCanvasProps`, `GanttTaskListProps`, …) are no longer exported (see the engine
  changeset).
- `@gantryjs/react`, `@gantryjs/vue` and `@gantryjs/svelte` follow in the same release (fixed version
  group); no API change there.

### `@gantryjs/angular` (breaking)

`@gantryjs/angular` re-exports `@gantryjs/core`, so every core change above reaches Angular users. In
particular, **custom bars** registered with `provideGanttBar()` that read `ctx.visual.fill`,
`ctx.visual.label.color` or `ctx.visual.progress.color` must switch to `ctx.visual.paint.body` /
`.label` / `.progress`: bind them as styles (`[style.fill]="ctx.visual.paint.body"`) or resolve them
to colours with `resolvePaint(paint, ctx.theme)`. Code calling `resolveConfig`, `statusColor` or
reading `TooltipModel.colors` migrates as described in the `@gantryjs/core` section.

- Paints are bound through `[style.fill]` / `[style.stroke]` / `[style.background-color]`. Page CSS
  that targeted SVG `fill` / `stroke` presentation attributes no longer applies; restyle through the
  `--gantt-*` tokens.
- The theme service also writes the contrast tokens (`themeToCss`).
- Header cell borders come from core (`headerCellBorder`).
- The chart's resolved theme reaches custom bars as `ctx.theme`; the `resolveConfig` call site
  passes the theme metrics, so a colour-only theme change re-renders no geometry.
- The task list, load-more footer and drag preview are painted with the chart's `--gantt-*` tokens
  (their `theme` inputs are gone in `@gantryjs/angular`, where these components are internal).

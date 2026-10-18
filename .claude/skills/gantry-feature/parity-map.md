# Parity map: where each concern lives

| Concern                                  | Core (computes)                                | Web Component (paints)                      | Angular (paints)                            |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Option defaults                          | `render/config.ts` `resolveConfig`             | element `reconfigure()`                     | `gantry.component.ts` `cfg` computed        |
| Header tiers, week formats, zoom presets | `render/scales.ts`                             | `header/gantt-header.component.ts`          | `header/gantt-header.component.ts`          |
| Range, delimiters, bands, today, `toX`   | `render/timeline.ts` `buildTimeline`           | `layout/gantt-layout.service.ts` `timeline` | `layout/gantt-layout.service.ts` `timeline` |
| Row geometry                             | `render/timeline.ts` `computeRowGeometries`    | layout service `rowGeometries`              | layout service `rowGeometries`              |
| Bars, milestones, group bars, labels     | `render/bars.ts` `computeBarVisual`            | `paint/bars.ts`                             | `bars/builtin-bar.ts` (+ 3 thin components) |
| Dependency arrows                        | `render/arrows.ts` `computeArrowVisual`        | `paint/arrows.ts`                           | `arrows/gantt-arrow.component.ts`           |
| Drag / resize math                       | `render/drag.ts` `DragSession`                 | `drag/gantt-drag.service.ts`                | `drag/gantt-drag.service.ts`                |
| Theme palettes, CSS vars                 | `render/theme.ts`                              | `services/gantt-theme.service.ts`           | `services/gantt-theme.service.ts`           |
| Columns, sort comparator                 | `gantt-data.ts`                                | `columns/…`, `tasklist/…`                   | `columns/…`, `tasklist/…`                   |
| Panel, splitter, views, state            | `types.ts` (`GanttPanelOptions`, `GanttState`) | `gantry.element.ts`                         | `gantry.component.ts`                       |
| Toolbar                                  | `types.ts` (`GanttToolbarOptions`)             | `annotations/gantt-toolbar.component.ts`    | `annotations/gantt-toolbar.component.ts`    |
| Public surface                           | `src/index.ts`                                 | `src/types.ts`, `src/index.ts`              | `src/public-api.ts`                         |

Wrappers: `packages/react/src/index.tsx` and `packages/vue/src/Gantry.ts` derive props and
events from `GANTRY_PROPERTIES` / `GANTRY_EVENTS`; `packages/svelte/src/Gantry.svelte` lists
them explicitly.

Tests: core → `packages/core/src/__tests__/` (Node), Web Component →
`packages/vanilla/src/__tests__/` (happy-dom). Angular has no unit tests yet — cover its
behaviour with the Playwright suite (`e2e/`, `pnpm e2e`).

---
'@gantryjs/core': major
---

**UX and accessibility models.** Every binding now paints its keyboard, touch, zoom, tooltip, toolbar, chart-state and marker-lane behaviour from `@gantryjs/core`.

**Breaking**

- `BarVisual.handles` is `{ left: BarHandle; right: BarHandle } | null` instead of `[x1, x2]` tuples. Each handle is a `hit` rect (`bar.handles.hitSize` wide, default 24 px, centred on the edge, reaching at most a third of the bar inward, inside the row, never overlapping the other) and a `grip` pill. Handles exist on resizable task bars from 12 px wide (`HANDLE_MIN_BAR_WIDTH`); `RESIZE_HANDLE_PX` is gone. Custom renderers that read the tuples must switch.
- `ArrowVisual` gains the required `dash` (`'5 3' | null`) and `lagLabel.fontPx`, so objects built by hand need them (`computeArrowVisual` takes an optional `fontPx`, default 12).
- Default labels: `viewSplit` / `viewTable` / `viewChart` are `'Table and chart'` / `'Table only'` / `'Chart only'`, and `announceEditStart` drops its Up/Down progress sentence. New `GanttLabels` members (only objects typed as a full `GanttLabels` need them; `options.labels` stays partial): `ariaBars`, `ariaTask`, `ariaMilestone`, `ariaGroup`, `ariaBarRole`, `ariaZoomLevels`, `ariaViews`, `fitToScreen`, `emptyState`, `errorTitle`, `dragReadout`.
- `LightTheme.milestoneColor` is `#7C3AED` (white labels 5.7:1; `LegacyLightTheme` keeps `#8B5CF6`). New theme key `focusRing` (`--gantt-focus-ring`, last in `THEME_CSS_VARS`, so `themeToCss()` writes 43 properties).
- The built-in date and duration columns are as wide as their default or as their text needs, whichever is wider (`dateColumnWidth`, `durationColumnWidth`, a `fontPx` argument for `buildBuiltinColumns`; English is unchanged), and a header cell clipped by the range edge shows no label when it is narrower than that label (`ScaleCell.partial`, `partialLabelHidden`).

**New options**, with their `resolveConfig()` defaults: `keyboard.characterShortcuts` (`true`), `tooltip: { trigger: 'auto', showDelay: 320, hideDelay: 120, render }`, `legend.position` (`'bottom'`), `markers.lane` (`'auto'`), `bar.handles.hitSize` (24) and `toolbar.fit` (`true`). New types `RetryEvent` and `GanttTooltipRenderContext`; `GanttFlatRow` gains the optional `posInSet`, `setSize` and `parentIndex`.

**New models**

- Keyboard and accessibility: row-first `navigateGrid` with a header row (`ROW_FOCUS`, `HEADER_ROW`), `navigateTimeline` / `panScrollLeft`, `rovingIndex` / `tabStopIndex`, `keySelectionModifiers`, `createAnnouncer` (250 ms debounce, the last message wins), `barRoleDescription`; `resolveKey` honours `keyboard.characterShortcuts`.
- Pointer: `hitTestBar`, `BarVisual.focusRect` / `hitBox`, the gesture machine (`gestureKind`, `startGesture` / `moveGesture` / `longPressGesture` / `cancelGesture` / `endGesture`; `DRAG_THRESHOLD_PX` 3, `LONG_PRESS_MS` 350, `TOUCH_SLOP_PX` 8) and `autoScrollDelta` (`AUTO_SCROLL_EDGE` 32, `AUTO_SCROLL_MAX_STEP` 18).
- Zoom: `wheelZoom` / `pinchZoomSteps`, `fitZoomLevel` / `fitScrollLeft`, and `anchoredScrollLeft`, which keeps the date under the pointer (`zoomAnchorScroll` is deprecated); `computeHorizontalWindow` takes an optional `fallbackWidth`.
- Tooltip and drag readout: `placeTooltip` (below the bar, flipped above at the bottom edge), the `initialTooltipState` / `reduceTooltip` / `tooltipVisibleId` machine (hover delay, focus, tap, the pointer resting on the tooltip, dismissal, `tooltip.trigger`), `formatDragReadout` / `placeDragReadout` / `dragReadoutWidth`; `DragPreview` gains `start` / `end`.
- Toolbar, states, legend and markers: `buildToolbar` / `TOOLBAR_ICONS` / `toolbarTabStop` / `toolbarFocusMove` / `zoomLevelLabel`, `resolveChartState` / `skeletonRows`, `legendPlacement`, `computeMarkerLane` / `markerLaneShown` (`MARKER_LANE_HEIGHT` 18; lane labels in the theme text colour, no lane in the table view), `computeAnnotationVisuals`, `HATCH_PATTERN` and `ARROW_DASH`.
- Focus and scrolling: `FOCUS_RING_MARGIN` (4: how far a bar's focus ring reaches outside its box) and `timelineScrollPadding(headerHeight)` (the timeline's scroll padding, so a bar scrolled into view shows its whole ring), `gridTabStop` / `sameGridSpot` / `GridFocusSpot` (the task list's one tab stop, the first header cell without rows), `createScrollMirror` (the panes' vertical scroll sync, ignoring the echo of its own writes), `bodyHeight` and `pageRowCount` (the body under the header, a keyboard page).

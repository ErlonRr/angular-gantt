---
'ngx-gantry': minor
---

`GanttDragPreviewComponent` paints the drag ghost computed by `@gantry/core` (`computeDragGhostVisual`), the same model the
Web Component uses. New inputs `geometry`, `config`, `timeline` and `fontPx`; `barHeight`, `radius` and `unit` are deprecated
and ignored (`theme` already was). `<gantry>` passes them for you; a component used on its own must bind the new inputs.

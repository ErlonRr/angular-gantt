---
'@gantryjs/vanilla': minor
---

`<gantry-element>` shows the resource view: the new `resources` property (people and teams), `options.rows: 'resources'` and the toolbar's rows toggle (`toolbar.rowsToggle`) give one row per resource, team and Unassigned with its daily load against its capacity (`g.gantt-load`, the part above it hatched with the new `--gantt-overallocated` CSS property), a tooltip with the day's load and tasks (mouse and pen), the Resources, Capacity and Peak load columns, the exports, and an editable Resources cell. `getState()` and `state-change` always carry `rows`. Tasks mode (`rows` unset) draws and exports exactly as before.

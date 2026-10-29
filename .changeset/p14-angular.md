---
'@gantryjs/angular': minor
---

Resource view in the Angular chart: the new `resources` input (people and teams), `options.rows: 'resources'` and the toolbar's rows toggle (`toolbar.rowsToggle`) show one row per resource, team and Unassigned with its daily load against its capacity (`g.gantt-load`), the part above it hatched, a tooltip with the day's load and tasks, the Resources, Capacity and Peak load columns, the exports and an editable Resources cell; `getState()` / `setState()` carry `rows`. Tasks mode (`rows` unset) draws and exports exactly as before.

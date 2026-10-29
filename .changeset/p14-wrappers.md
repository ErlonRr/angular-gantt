---
'@gantryjs/react': minor
'@gantryjs/vue': minor
'@gantryjs/svelte': minor
---

The wrappers forward the new `resources` property of `<gantry-element>` (React derives it, Vue and Svelte list it and copy the array one level, like `tasks` and `annotations`): with `options.rows: 'resources'` the chart shows one row per resource with its daily load against its capacity.

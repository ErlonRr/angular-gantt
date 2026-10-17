---
'@gantry/core': minor
'@gantry/vanilla': minor
'ngx-gantry': minor
---

`ViewMode`, `DependencyType` and `TaskType` are now `as const` objects with a same-name union type (no TS enums): `ViewMode.Week` reads the same and plain strings are accepted. Optional properties of the public types accept `undefined` explicitly, so projects using `exactOptionalPropertyTypes` can pass `undefined`. `ngx-gantry` declares `"type": "module"`. Task-list rows can be focused and selected with Enter / Space.

New `GanttThemeOverrides` type for `options.theme`, `setTheme()` and `patchTheme()`: any token may be `undefined` (keeps the built-in value).

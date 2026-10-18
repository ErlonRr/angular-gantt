---
'@gantryjs/core': patch
'@gantryjs/vanilla': patch
'@gantryjs/angular': patch
---

Bug fixes: tasks with a `null`, empty, unknown or cyclic `parentId` no longer disappear and a task without `end` no longer breaks the date columns (new `normalizeTasks()`); the critical path reads dates like the bars (`endDateMode: 'inclusive'` counts the last day, hour-level tasks use fractional days); column sorting is linear-time.

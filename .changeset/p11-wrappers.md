---
'@gantryjs/react': minor
'@gantryjs/vue': minor
'@gantryjs/svelte': minor
---

**Editing events in every wrapper**: seven new callbacks receive the `<gantry-element>` event `detail`: `onBeforeChange`, `onTasksChange`, `onTaskUpdated`, `onTaskProgressChanged`, `onDependencyCreated`, `onDependencyDeleted` and `onHistoryChange` (Vue: `@before-change`, `@tasks-change`, `@task-updated`, `@task-progress-changed`, `@dependency-created`, `@dependency-deleted`, `@history-change`). `onBeforeChange` runs synchronously, so calling `detail.preventDefault()` there vetoes the change. `onTasksChange` gives the tasks after the change (in controlled mode, the proposed ones with `applied: false`), ready to put back in state: `setTasks(detail.tasks)` in React, `tasks.value = detail.tasks` in Vue, `tasks = detail.tasks` in Svelte (use `$state.raw` for large plans). Svelte destructures the seven names, so they never reach the element as attributes.

---
'@gantryjs/react': minor
'@gantryjs/vue': minor
'@gantryjs/svelte': minor
---

**Synchronised charts in every wrapper**: the `syncGroup` prop takes a group from `createGanttSyncGroup()` (re-exported from `@gantryjs/core`; default `null`). It is passed to `<gantry-element>` as it is, never copied. React forwards it through the element's property table. Vue declares it after `errorMessage` and unwraps a group kept in a `ref` or `reactive` with `toRaw`. Svelte passes it by identity: keep the group in a plain `const` or in `$state.raw`.

**Vue `#empty` slot**: `<template #empty>…</template>` is rendered as a `<div slot="empty">` inside the element (the empty-state content), before the default slot, on the server too. A `<div slot="empty">` in the default slot still works. The slots are typed (`SlotsType`), so Volar knows `empty` and `default`.

---
'@gantryjs/react': minor
'@gantryjs/vue': minor
'@gantryjs/svelte': minor
---

**Export events in every wrapper**: `onBeforeExport` and `onExport` (Vue: `@before-export`, `@export`) receive the `<gantry-element>` event `detail` for every `download()` and `print()`, from the API or the toolbar's export menu. `onBeforeExport` runs synchronously, so `detail.preventDefault()` there cancels the file or the print (upload it yourself instead); `onExport` then gets the format, file name, size in bytes and, for a print, the page count. The export methods are async methods of the element: `await ref.current?.download('svg')` in React, `await chart.value?.element?.exportCsv()` in Vue, `bind:element` in Svelte. Svelte destructures both names, so they never reach the element as attributes.

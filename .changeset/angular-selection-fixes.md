---
'@gantryjs/core': patch
'@gantryjs/vanilla': patch
'ngx-gantry': patch
---

Angular: bars follow their rows after collapse / sort, `selectionChange` is emitted for every selection (task list, keyboard, API), Ctrl/Cmd+A selects all visible rows and honours `enableSelection` / `multiSelect`. Shortcuts are ignored while typing in inputs or `contenteditable` cells. The resolved config gains `selection: { enabled, multi }`.

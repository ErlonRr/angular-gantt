---
'@gantryjs/vanilla': patch
'ngx-gantry': patch
---

Web Component: focus stays on toolbar buttons, sort headers and collapse toggles across re-renders; bands and vertical grid lines are built once per timeline instead of on every scroll frame (Angular draws them full height too, so scrolling no longer rewrites them); a pending state save is written on disconnect and the data source re-syncs on reconnect.

---
'@gantryjs/angular': patch
---

Header cells and non-working bands are tracked by position, like the Web Component's keyed layers, and grid lines by index: a rebuilt timeline (new tasks, a zoom, a loaded page) patches them in place instead of re-creating every node, and development builds no longer warn with NG0956.

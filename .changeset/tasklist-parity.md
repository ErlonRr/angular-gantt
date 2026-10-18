---
'@gantryjs/vanilla': patch
'ngx-gantry': patch
---

**One task-list markup for both renderers.** `<gantry-element>` and `<gantry>` render the task list
with the same elements, classes and colours:

- Every inner span has a class: the header label `gantt-tl-ellipsis`, the sort icon
  `gantt-tl-sort-icon` (`gantt-tl-sort-icon--active` on the sorted column), and the name cell
  `span.gantt-tl-name` > `button.gantt-collapse-btn` | `span.gantt-tl-indent` · `span.gantt-tl-icon` ·
  `span.gantt-tl-ellipsis`. Text colours, sizes and weights are stylesheet rules on the theme tokens:
  header labels and group names `--gantt-text` (groups 600), leaf names and cell texts
  `--gantt-text-sec`, sort and task icons `--gantt-text-muted` (an active sort icon `--gantt-text`).
  Only a task's `barColor` stays an inline colour, on its icon.
- The column resize handle lies inside its header cell (`right: 0`): all 6 px can be grabbed (the
  header cell clipped half of it before).
- `@gantryjs/vanilla`: cell texts use the secondary text colour (`--gantt-text-sec`, was `--gantt-text`),
  the collapse toggle is a 24 × 24 px target (WCAG 2.5.8; it was 20 px wide) and leaf names are
  indented to match (4 px more), and rows with children get the class `gantt-tl-row--group`, as in Angular.
- `ngx-gantry`: the toolbar group that holds `[ganttToolbar]` content has the classes
  `gantt-tb-slot gantt-tb-group` (in that order; was `gantt-tb-group gantt-tb-slot`), and the task-list
  `grid-template-columns` comes from `columnsGridTemplate()` in `@gantryjs/core`.

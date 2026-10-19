# @gantryjs/react

The free, full-featured **Gantry Gantt chart for React** 18 and 19: drag & resize,
dependencies, critical path, baselines, virtual scrolling, sorting, lazy loading,
theming and i18n. MIT licensed.

A thin binding over the [`<gantry-element>`](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla) Web Component.

## Install

```bash
npm i @gantryjs/react
```

## Usage

```tsx
import { useRef, useState } from 'react';
import { Gantry, ViewMode, type GantryElement, type GanttTask } from '@gantryjs/react';

export function Roadmap() {
  const gantt = useRef<GantryElement>(null);
  const [tasks, setTasks] = useState<GanttTask[]>([
    { id: 'a', name: 'Design', start: new Date('2026-01-05'), end: new Date('2026-01-20'), progress: 60 },
  ]);

  return (
    <div style={{ height: 500 }}>
      <button onClick={() => gantt.current?.scrollToToday()}>Today</button>
      <Gantry
        ref={gantt}
        tasks={tasks}
        options={{ viewMode: ViewMode.Week, criticalPath: true }}
        darkMode="auto"
        onTaskDragged={e =>
          setTasks(ts => ts.map(t => (t.id === e.taskId ? { ...t, start: e.newStart, end: e.newEnd } : t)))
        }
        onSelectionChange={e => console.log(e.selectedIds)}
      />
    </div>
  );
}
```

- **Props** — every [`<gantry-element>` property](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#properties): `tasks`, `columns`,
  `options`, `annotations`, `darkMode`, `showToolbar`, `enableDrag`, `enableResize`,
  `tooltipEnabled`, `showLegend`, `dataSource`, `renderBar`, `loading`, `errorMessage`,
  `syncGroup`, plus `className` / `style` / any HTML attribute.
- **Callbacks** receive the event detail: `onTaskDragged`, `onTaskResized`,
  `onSelectionChange`, `onRowClick`, `onRowDblClick`, `onViewModeChange`, `onStateChange`,
  `onLoadError`, `onRetry`.
- **Children** go into the element's light DOM, where its slots pick them up:
  `<div slot="empty">…</div>` replaces the empty-state text (`labels.emptyState`).
- **Ref** — the underlying `GantryElement`, with its [methods](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#methods). It is attached once the
  props are set, so a callback ref can call `scrollToTask()` right away.
- **Size** — the element fills its container (`display: block; width: 100%; height: 100%`, from
  its own `:host` style); a `className` or `style` overrides that. The wrapper adds no inline
  style of its own.

### Loading, error and empty states

```tsx
<Gantry
  tasks={tasks}
  loading={isLoading}
  errorMessage={error ? 'Couldn’t load the plan' : null}
  onRetry={() => refetch()}
>
  <div slot="empty">No tasks yet: add one to start.</div>
</Gantry>
```

`loading` shows the loading state and `errorMessage` the error state, whose Retry button fires
`onRetry`: `{ source: 'error' }` for the `errorMessage` state (load again yourself), `{ source:
'dataSource' }` after a failed first `dataSource` page (the element also calls
`dataSource.retry()`). The `slot="empty"` child replaces the text shown when there are no tasks.

### Synchronised charts

```tsx
import { useState } from 'react';
import { Gantry, createGanttSyncGroup, type GanttTask } from '@gantryjs/react';

export function Portfolio({ design, build }: { design: GanttTask[]; build: GanttTask[] }) {
  // One group for the component's lifetime: a new group on every render would re-join the charts
  const [group] = useState(() => createGanttSyncGroup());
  return (
    <>
      <Gantry tasks={design} syncGroup={group} />
      <Gantry tasks={build} syncGroup={group} showToolbar={false} />
    </>
  );
}
```

Charts given the same `syncGroup` share one timeline: the date range (the union of their plans),
the zoom level, the horizontal scroll and the task-list width. `createGanttSyncGroup({ zoom,
scroll, range, panel })` turns parts off (each is `true` by default). The group reaches the
element as it is, never copied: keep it stable (`useState(() => …)`, `useMemo` or a module
constant). `syncGroup={null}`, or leaving the prop out once it was set, takes the chart out of
the group.

### Options and behaviour

`options` takes every `GanttOptions` field, documented once for every binding in
[Configuration](https://github.com/ErlonRr/gantryjs#configuration): among them the
[toolbar, legend and marker lane](https://github.com/ErlonRr/gantryjs#toolbar-legend-and-markers), the
[tooltip](https://github.com/ErlonRr/gantryjs#tooltip) (`tooltip.render` returns a string or a DOM node, not a React element) and
`keyboard.characterShortcuts`. Keyboard navigation and move mode, touch gestures, zoom gestures,
screen-reader semantics and forced colors behave as in every Gantry binding: see
[Keyboard and focus](https://github.com/ErlonRr/gantryjs#keyboard-and-focus), [Touch and pointer](https://github.com/ErlonRr/gantryjs#touch-and-pointer),
[Zoom](https://github.com/ErlonRr/gantryjs#zoom), [Screen readers](https://github.com/ErlonRr/gantryjs#screen-readers) and [Forced colors](https://github.com/ErlonRr/gantryjs#forced-colors).
`gantt.current?.fitToScreen()` zooms to the finest level that shows every task.

### How props reach the chart

- Props are set as element properties in layout effects, before the chart paints its first
  frame: it never shows its defaults first.
- Your objects are passed through as they are (`ref.current.tasks === tasks`): nothing is
  cloned. Props are compared by reference, so pass a new array or object to update — mutating
  one in place changes nothing. Keep `dataSource`, `renderBar` and `columns` stable across
  renders (`useMemo`, `useCallback`, state): a new `dataSource` object starts a new data
  source, and a new `renderBar` re-renders the bars. `options` can be an inline object: the
  element ignores one equal to the previous.
- Setting a prop back to `undefined` (or leaving it out) restores the element's default, e.g.
  `showToolbar={compact ? false : undefined}`. A prop that was never set is not written.
- Callbacks may change on every render: the latest one is called, without re-adding listeners.
  Events fired while the chart applies its first props (such as `onViewModeChange` for
  `options.viewMode`, or `onLoadError` for a data source that already failed) are delivered,
  and so is the `onStateChange` the element still fires as it unmounts (a pending state save);
  the listeners come off right after. StrictMode and `<Activity>` never leave a listener twice.
- `className` is set as the `class` attribute (also in React 18, which would otherwise write a
  `classname` attribute on a custom element).

### Server-side rendering

`renderToString` / streaming render the `<gantry-element>` tag with your class, style,
attributes and children (no inline style of its own, so the markup needs no `'unsafe-inline'`
style policy), without touching DOM APIs or warning about layout effects; the chart renders in
the browser once the element is defined and the component hydrates.

Until then the element's own `:host` style (which makes it fill its container) doesn't apply, so
the server markup takes no room. Reserve the chart's box with one rule in your stylesheet:

```css
gantry-element:not(:defined) {
  display: block;
  width: 100%;
  height: 100%;
}
```

All `@gantryjs/core` types and helpers (`ViewMode`, `GanttTask`, `computeCriticalPath`, …)
are re-exported.

## License

MIT

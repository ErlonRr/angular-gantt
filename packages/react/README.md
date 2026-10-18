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

- **Props** — every [`<gantry-element>` property](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#properties): `tasks`, `options`,
  `columns`, `annotations`, `darkMode`, `showToolbar`, `enableDrag`, `enableResize`,
  `tooltipEnabled`, `showLegend`, `dataSource`, `renderBar`, plus `className` / `style` / any HTML attribute.
- **Callbacks** receive the event detail: `onTaskDragged`, `onTaskResized`,
  `onSelectionChange`, `onRowClick`, `onRowDblClick`, `onViewModeChange`, `onStateChange`,
  `onLoadError`.
- **Ref** — the underlying `GantryElement`, with its [methods](https://github.com/ErlonRr/gantryjs/tree/main/packages/vanilla#methods). It is attached once the
  props are set, so a callback ref can call `scrollToTask()` right away.

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

`renderToString` / streaming render an empty `<gantry-element>` with its class, style and
attributes, without touching DOM APIs or warning about layout effects; the chart renders in the
browser once the element is defined and the component hydrates.

All `@gantryjs/core` types and helpers (`ViewMode`, `GanttTask`, `computeCriticalPath`, …)
are re-exported.

## License

MIT

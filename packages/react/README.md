# @gantry/react

The free, full-featured **Gantry Gantt chart for React** 18 and 19: drag & resize,
dependencies, critical path, baselines, virtual scrolling, sorting, lazy loading,
theming and i18n. MIT licensed.

A thin binding over the [`<gantry-element>`](https://github.com/ErlonRr/angular-gantt/tree/main/packages/vanilla) Web Component.

## Install

```bash
npm i @gantry/react
```

## Usage

```tsx
import { useRef, useState } from 'react';
import { Gantry, ViewMode, type GantryElement, type GanttTask } from '@gantry/react';

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

- **Props** — every [`<gantry-element>` property](https://github.com/ErlonRr/angular-gantt/tree/main/packages/vanilla#properties): `tasks`, `options`,
  `columns`, `annotations`, `darkMode`, `showToolbar`, `enableDrag`, `enableResize`,
  `tooltipEnabled`, `showLegend`, `dataSource`, `renderBar`, plus `className` / `style` / any HTML attribute.
- **Callbacks** receive the event detail: `onTaskDragged`, `onTaskResized`,
  `onSelectionChange`, `onRowClick`, `onRowDblClick`, `onViewModeChange`.
- **Ref** — the underlying `GantryElement`, with its [methods](https://github.com/ErlonRr/angular-gantt/tree/main/packages/vanilla#methods).

Props are compared by reference: pass a new array/object to update (memoise `options`
with `useMemo` to avoid needless re-renders). SSR-safe: the element only renders in the browser.

All `@gantry/core` types and helpers (`ViewMode`, `GanttTask`, `computeCriticalPath`, …)
are re-exported.

## License

MIT

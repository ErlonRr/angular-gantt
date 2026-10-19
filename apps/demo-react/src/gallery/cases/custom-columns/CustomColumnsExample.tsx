// Custom cells: a column's `cellTemplate` is a function that returns a DOM node (cells.ts) for each
// row, not a React element. The shared columns keep their label, width and sort rule. COLUMNS is a
// module constant, so it stays the same object across renders (a new array rebuilds the task list).
import { useState } from 'react';
import { Gantry, type ColumnDef } from '@gantryjs/react';
import { CUSTOM_COLUMNS, CUSTOM_COLUMNS_OPTIONS, customColumnsTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';
import { CELL_TEMPLATES } from './cells';
import './custom-columns.css';

const COLUMNS: ColumnDef[] = CUSTOM_COLUMNS.map(column => ({ ...column, cellTemplate: CELL_TEMPLATES[column.key] }));

export default function CustomColumnsExample() {
  const darkMode = useDarkMode();
  const [tasks] = useState(() => customColumnsTasks(new Date()));

  return (
    <div className="gs-case">
      <Gantry
        className="gs-chart gs-case-chart"
        tasks={tasks}
        columns={COLUMNS}
        options={CUSTOM_COLUMNS_OPTIONS}
        darkMode={darkMode}
      />
      <p className="gs-case-hint">
        Owner, Priority and Progress are cell templates; the Owner and Priority headers sort.
      </p>
    </div>
  );
}

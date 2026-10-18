// ─────────────────────────────────────────────────────────────
//  Type-level tests (checked by `tsc -p src/__tests__/tsconfig.json` and Vitest's typecheck-free run)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { ViewMode, TaskType, type DependencyType, type GanttOptions, type GanttTask } from '../types';

describe('as-const objects', () => {
  it('members work as values and as types, like the former enums', () => {
    const week: ViewMode.Week = ViewMode.Week;
    interface MilestoneTask extends GanttTask {
      type: TaskType.Milestone;
    }
    const m: MilestoneTask = {
      id: 'm',
      name: 'M',
      start: new Date(2026, 0, 1),
      end: new Date(2026, 0, 1),
      type: TaskType.Milestone,
    };
    const fs: DependencyType.FS = 'FS';
    expect([week, m.type, fs]).toEqual(['Week', 'milestone', 'FS']);
    expect(Object.values(ViewMode)).toEqual(['Hour', 'Day', 'Week', 'Month', 'Quarter', 'Year']);
  });

  it('options accept explicit undefined (exactOptionalPropertyTypes-friendly)', () => {
    const o: GanttOptions = {
      viewMode: undefined,
      highlightTime: undefined,
      bar: { progress: undefined, label: undefined },
      theme: { weekendBg: undefined, barColor: undefined },
      scales: [{ unit: 'day', className: undefined }],
      nonWorkingTime: { intensiveHours: [{ start: 10, end: 12, color: undefined }] },
    };
    expect(o.viewMode).toBeUndefined();
  });
});

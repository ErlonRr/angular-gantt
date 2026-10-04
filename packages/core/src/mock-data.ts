import { GanttTask, GanttAnnotation, TaskType, DependencyType } from './types';

const d = (iso: string) => new Date(iso);

export const DEMO_TASKS: GanttTask[] = [
  {
    id: 'p1', name: 'Project Alpha', type: TaskType.Group,
    start: d('2026-01-05'), end: d('2026-05-30'),
    progress: 48, barColor: '#6366F1',
  },
  {
    id: 'p1-a', name: 'Discovery', parentId: 'p1',
    start: d('2026-01-05'), end: d('2026-01-31'), progress: 100,
    baseline: { start: d('2026-01-05'), end: d('2026-02-07') },
  },
  {
    id: 'p1-b', name: 'Architecture', parentId: 'p1',
    start: d('2026-01-20'), end: d('2026-02-20'), progress: 90,
    dependency: 'p1-a',
    baseline: { start: d('2026-01-25'), end: d('2026-02-25') },
  },
  {
    id: 'p1-b1', name: 'Backend', parentId: 'p1-b',
    start: d('2026-02-10'), end: d('2026-03-20'), progress: 65,
    dependency: 'p1-b',
  },
  {
    id: 'p1-b2', name: 'Frontend', parentId: 'p1-b',
    start: d('2026-02-20'), end: d('2026-04-01'), progress: 30,
    dependency: { taskId: 'p1-b', type: DependencyType.SS, lag: 10 },
  },
  {
    id: 'p1-c', name: 'QA & Testing', parentId: 'p1',
    start: d('2026-03-25'), end: d('2026-04-25'), progress: 0,
    dependency: [
      { taskId: 'p1-b1', type: DependencyType.FS },
      { taskId: 'p1-b2', type: DependencyType.FS },
    ],
  },
  {
    id: 'ms-p1', name: 'v1.0 Release', parentId: 'p1',
    type: TaskType.Milestone,
    start: d('2026-05-15'), end: d('2026-05-15'),
    progress: 0, dependency: 'p1-c', barColor: '#F59E0B',
  },
  {
    id: 'p2', name: 'Project Beta', type: TaskType.Group,
    start: d('2026-03-01'), end: d('2026-07-31'),
    progress: 22, barColor: '#10B981',
  },
  {
    id: 'p2-a', name: 'Research', parentId: 'p2',
    start: d('2026-03-01'), end: d('2026-03-31'), progress: 100,
  },
  {
    id: 'p2-b', name: 'Prototype', parentId: 'p2',
    start: d('2026-04-01'), end: d('2026-05-15'), progress: 45,
    dependency: 'p2-a',
    baseline: { start: d('2026-04-01'), end: d('2026-05-01') },
  },
  {
    id: 'p2-c', name: 'User testing', parentId: 'p2',
    start: d('2026-05-10'), end: d('2026-06-10'), progress: 5,
    dependency: 'p2-b',
  },
  {
    id: 'ms-p2', name: 'Beta launch', parentId: 'p2',
    type: TaskType.Milestone,
    start: d('2026-07-15'), end: d('2026-07-15'),
    progress: 0, dependency: 'p2-c', barColor: '#10B981',
  },
];

export const DEMO_ANNOTATIONS: GanttAnnotation[] = [
  {
    x1:    d('2026-03-02'),
    x2:    d('2026-03-06'),
    color: '#8B5CF6',
    opacity: 0.07,
    label: { text: 'Code freeze', color: '#8B5CF6', fontWeight: '600' },
  },
  {
    x1:    d('2026-04-20'),
    color: '#EF4444',
    label: { text: 'Board review', color: '#EF4444' },
  },
];

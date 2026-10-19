/**
 * The examples gallery: every case, its category and what the e2e smoke test waits for.
 *
 * The same cases exist in all five frameworks (Angular on the site, the Web Component, React, Vue
 * and Svelte in their demo apps), each written in that framework's own idiom over the shared data
 * and options of `demo-kit/gallery` (`cases/<id>.ts`).
 *
 * No imports: the e2e suite reads this file directly.
 */

/** Every case id, in gallery order (by category, then as listed). */
export const CASE_IDS = [
  'states',
  'lazy',
  'tree',
  'only-parents',
  'only-parents-styled',
  'styles',
  'dependencies',
  'milestones-baselines',
  'non-working',
  'week-numbering',
  'multi-pipeline',
  'custom-bars',
  'custom-columns',
  'tooltip',
  'theming',
  'i18n',
  'responsive',
  'density',
  'large',
  'keyboard',
] as const;

export type CaseId = (typeof CASE_IDS)[number];

export type GalleryCategory =
  'data' | 'structure' | 'scheduling' | 'multiple' | 'custom' | 'locale' | 'layout' | 'scale';

export interface GalleryCategoryInfo {
  id: GalleryCategory;
  label: string;
  summary: string;
}

/** The categories, in gallery order. */
export const GALLERY_CATEGORIES: readonly GalleryCategoryInfo[] = [
  {
    id: 'data',
    label: 'Data and states',
    summary: 'Loading, empty and error states, and tasks that arrive page by page.',
  },
  {
    id: 'structure',
    label: 'Structure and styles',
    summary: 'Task trees, parents that roll up their children, and the style cascade.',
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    summary: 'Dependencies, milestones, baselines, non-working time and week numbers.',
  },
  {
    id: 'multiple',
    label: 'Several charts',
    summary: 'Charts that share one timeline: range, zoom, scroll and task-list width.',
  },
  {
    id: 'custom',
    label: 'Custom content',
    summary: 'Your own bars, cells, tooltip and theme.',
  },
  {
    id: 'locale',
    label: 'Languages',
    summary: 'Month names, date formats and every UI string in another language.',
  },
  {
    id: 'layout',
    label: 'Layout',
    summary: 'Narrow containers, density and the layout CSS variables.',
  },
  {
    id: 'scale',
    label: 'Scale and keyboard',
    summary: 'Ten thousand rows, and the whole chart from the keyboard.',
  },
];

/** The five frameworks of the gallery, in tab order. */
export const GALLERY_FRAMEWORKS = ['angular', 'vanilla', 'react', 'vue', 'svelte'] as const;

export type GalleryFramework = (typeof GALLERY_FRAMEWORKS)[number];

export const GALLERY_FRAMEWORK_LABELS: Readonly<Record<GalleryFramework, string>> = {
  angular: 'Angular',
  vanilla: 'Web Component',
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
};

/** Ids of the known framework differences (`framework-notes.ts`). */
export type NoteId =
  | 'tasks-input'
  | 'view-mode-event'
  | 'row-click-payload'
  | 'empty-content'
  | 'custom-bars'
  | 'custom-cells'
  | 'custom-tooltip'
  | 'styling-hooks'
  | 'theme-tokens'
  | 'forced-colors'
  | 'rtl-keys'
  | 'data-source'
  | 'ssr'
  | 'toolbar-slot'
  | 'methods'
  | 'array-updates'
  | 'responsive-first-frame';

/**
 * When a case page is ready (the e2e smoke test): `charts` charts inside `.gs-case`, each painted;
 * with `state`, the first chart shows that state instead of rows.
 */
export interface GalleryReady {
  charts: number;
  state?: 'empty' | 'loading' | 'error';
}

export interface GalleryCase {
  id: CaseId;
  /** The page's h1 and the card title */
  title: string;
  /** One or two sentences: the card text and the lead of the case page */
  summary: string;
  category: GalleryCategory;
  /** The options and APIs the case is about */
  tags: readonly string[];
  ready: GalleryReady;
  /** Framework differences this case runs into (`FRAMEWORK_NOTES`) */
  notes: readonly NoteId[];
  /** Shows a feature that is new in this release */
  isNew?: true;
}

export const GALLERY_CASES: readonly GalleryCase[] = [
  // ── Data and states ───────────────────────────────────────
  {
    id: 'states',
    title: 'Loading, empty and error',
    summary:
      'Switch the chart between its tasks, an empty state with your own content, the loading skeleton and the error state with Retry.',
    category: 'data',
    tags: ['loading', 'errorMessage', 'retry', 'empty content'],
    ready: { charts: 1, state: 'empty' },
    notes: ['empty-content'],
  },
  {
    id: 'lazy',
    title: 'Lazy loading',
    summary:
      'Tasks arrive page by page from a slow fake API. Make it fail to see the automatic retries, then the Retry button.',
    category: 'data',
    tags: ['dataSource', 'GanttDataSource', 'fetcher', 'retry()'],
    ready: { charts: 1 },
    notes: ['data-source'],
  },

  // ── Structure and styles ──────────────────────────────────
  {
    id: 'tree',
    title: 'Task tree',
    summary:
      'Three levels of parents and children. Expand and collapse rows one by one or all at once; hovering a row highlights it in both panes.',
    category: 'structure',
    tags: ['parentId', 'collapseAll()', 'expandAll()', 'viewModeChange'],
    ready: { charts: 1 },
    notes: ['view-mode-event', 'methods'],
  },
  {
    id: 'only-parents',
    title: 'Only parents',
    summary: 'Every parent starts collapsed and rolls up the progress and the dates of its children.',
    category: 'structure',
    tags: ['rollup', 'groupBar.collapsed', 'expandAll()'],
    ready: { charts: 1 },
    notes: ['methods'],
    isNew: true,
  },
  {
    id: 'only-parents-styled',
    title: 'Parents coloured by their children',
    summary:
      'Collapsed parents painted with the summary status of their children, with a colour from a callback, or as segments in the colours of the children.',
    category: 'structure',
    tags: ['rollup.color', 'rollup.segments', 'statusPaint'],
    ready: { charts: 1 },
    notes: [],
    isNew: true,
  },
  {
    id: 'styles',
    title: 'Task styles',
    summary:
      'Default styles by kind, parent, level and rule, under the style of each task, with the order in which they apply.',
    category: 'structure',
    tags: ['styles', 'task.style', 'styles.rule', 'styles.levels'],
    ready: { charts: 1 },
    notes: [],
    isNew: true,
  },

  // ── Scheduling ────────────────────────────────────────────
  {
    id: 'dependencies',
    title: 'Dependencies',
    summary: 'The four link types with lag and lead, the critical path, and orthogonal or straight arrows.',
    category: 'scheduling',
    tags: ['dependency', 'criticalPath', 'arrows.routing'],
    ready: { charts: 1 },
    notes: [],
  },
  {
    id: 'milestones-baselines',
    title: 'Milestones and baselines',
    summary: 'Milestones in three shapes, and baseline bars that show the planned dates under the actual ones.',
    category: 'scheduling',
    tags: ['TaskType.Milestone', 'milestone.shape', 'baseline'],
    ready: { charts: 1 },
    notes: [],
  },
  {
    id: 'non-working',
    title: 'Non-working time',
    summary: 'Weekends and holidays shaded, hatched or greyed out, and working hours on the hour scale.',
    category: 'scheduling',
    tags: ['nonWorkingTime', 'holidays', 'workingHours'],
    ready: { charts: 1 },
    notes: [],
  },
  {
    id: 'week-numbering',
    title: 'Week numbering',
    summary: 'ISO, US or the locale’s own week numbers, with weeks that start on Monday, Sunday or Saturday.',
    category: 'scheduling',
    tags: ['weekNumbering', 'weekStart', 'WEEK_FORMATS'],
    ready: { charts: 1 },
    notes: [],
    isNew: true,
  },

  // ── Several charts ────────────────────────────────────────
  {
    id: 'multi-pipeline',
    title: 'Synchronised charts',
    summary:
      'Three pipelines on one timeline. Zoom, scroll or resize the task list in one chart and the others follow.',
    category: 'multiple',
    tags: ['syncGroup', 'createGanttSyncGroup()'],
    ready: { charts: 3 },
    notes: [],
    isNew: true,
  },

  // ── Custom content ────────────────────────────────────────
  {
    id: 'custom-bars',
    title: 'Custom bars',
    summary: 'Bars drawn by your own code: an Angular component, or the SVG element that renderBar returns elsewhere.',
    category: 'custom',
    tags: ['barType', 'renderBar', 'provideGanttBar'],
    ready: { charts: 1 },
    notes: ['custom-bars', 'forced-colors'],
  },
  {
    id: 'custom-columns',
    title: 'Custom columns',
    summary: 'Task-list cells from templates: an owner avatar, a priority badge and a progress meter.',
    category: 'custom',
    tags: ['columns', 'cellTemplate', 'ganttColumn'],
    ready: { charts: 1 },
    notes: ['custom-cells'],
  },
  {
    id: 'tooltip',
    title: 'Custom tooltip',
    summary: 'Tooltip content of your own, opened on hover, on keyboard focus, or both.',
    category: 'custom',
    tags: ['tooltip.render', 'tooltip.trigger', 'ganttTooltip'],
    ready: { charts: 1 },
    notes: ['custom-tooltip'],
  },
  {
    id: 'theming',
    title: 'Theming',
    summary: 'Theme presets, dark mode, CSS custom properties and the styling hooks of each binding.',
    category: 'custom',
    tags: ['theme', 'darkMode', '--gantt-*', '::part'],
    ready: { charts: 1 },
    notes: ['styling-hooks', 'theme-tokens', 'forced-colors'],
  },

  // ── Languages ─────────────────────────────────────────────
  {
    id: 'i18n',
    title: 'Languages and formats',
    summary: 'Month and day names from Intl, date formats and every UI string, in four languages.',
    category: 'locale',
    tags: ['locale', 'labels', 'formats'],
    ready: { charts: 1 },
    notes: ['rtl-keys'],
  },

  // ── Layout ────────────────────────────────────────────────
  {
    id: 'responsive',
    title: 'Responsive',
    summary:
      'Narrow the container: below the breakpoint the chart shows the timeline alone, and the toolbar moves its controls into a More menu.',
    category: 'layout',
    tags: ['responsive', 'toolbar.overflow', 'toolbar.panelToggle'],
    ready: { charts: 1 },
    notes: ['responsive-first-frame'],
    isNew: true,
  },
  {
    id: 'density',
    title: 'Density',
    summary:
      'Compact, normal and comfortable rows, header and toolbar, with page content lined up on the read-only layout variables.',
    category: 'layout',
    tags: ['density', '--gantt-row-height', '--gantt-bar-height'],
    ready: { charts: 1 },
    notes: [],
    isNew: true,
  },

  // ── Scale and keyboard ────────────────────────────────────
  {
    id: 'large',
    title: 'Ten thousand rows',
    summary: '10,000 tasks in a tree, virtualised in both panes: only the rows in view are in the DOM.',
    category: 'scale',
    tags: ['virtual scrolling', 'rowHeight', '$state.raw'],
    ready: { charts: 1 },
    notes: ['toolbar-slot', 'array-updates'],
  },
  {
    id: 'keyboard',
    title: 'Keyboard',
    summary: 'Every action from the keyboard, with the key map and the announcements a screen reader hears.',
    category: 'scale',
    tags: ['keyboard', 'move mode', 'aria-live'],
    ready: { charts: 1 },
    notes: ['rtl-keys'],
  },
];

/** Whether `id` is a gallery case id. */
export function isCaseId(id: string | null | undefined): id is CaseId {
  return (CASE_IDS as readonly (string | null | undefined)[]).includes(id);
}

/** The case `id` (throws for an unknown id: check with `isCaseId` first). */
export function galleryCase(id: CaseId): GalleryCase {
  const found = GALLERY_CASES.find(c => c.id === id);
  if (!found) throw new Error(`Unknown gallery case: ${id}`);
  return found;
}

/** The cases of each category, in gallery order (categories without cases are left out). */
export function casesByCategory(): { category: GalleryCategoryInfo; cases: GalleryCase[] }[] {
  return GALLERY_CATEGORIES.map(category => ({
    category,
    cases: GALLERY_CASES.filter(c => c.category === category.id),
  })).filter(group => group.cases.length > 0);
}

/** The cases before and after `id` in gallery order (`null` at either end). */
export function caseNeighbours(id: CaseId): { previous: GalleryCase | null; next: GalleryCase | null } {
  const i = GALLERY_CASES.findIndex(c => c.id === id);
  return { previous: GALLERY_CASES[i - 1] ?? null, next: GALLERY_CASES[i + 1] ?? null };
}

/** The category of a case. */
export function categoryOf(id: CaseId): GalleryCategoryInfo {
  const { category } = galleryCase(id);
  return GALLERY_CATEGORIES.find(c => c.id === category)!;
}

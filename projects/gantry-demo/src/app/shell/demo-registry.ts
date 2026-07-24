// ─────────────────────────────────────────────────────────────
//  gantry-demo · shell/demo-registry.ts
//
//  Single list of demos surfaced in the IDE-style sidebar.
//  Add a demo here + a matching route in app.routes.ts — the
//  sidebar picks it up automatically (grouped by category).
// ─────────────────────────────────────────────────────────────

export interface DemoEntry {
  /** Route path (without leading slash) */
  path:        string;
  /** Sidebar label */
  label:       string;
  /** One-line description shown under the label */
  description: string;
  /** Glyph shown in the leading badge */
  icon:        string;
  /** Grouping bucket */
  category:    DemoCategory;
}

export type DemoCategory = 'Showcase' | 'Core' | 'Performance' | 'Extensibility';

/** Category display order in the sidebar */
export const DEMO_CATEGORY_ORDER: DemoCategory[] = ['Showcase', 'Core', 'Performance', 'Extensibility'];

export const DEMOS: DemoEntry[] = [
  {
    path:        'roadmap',
    label:       'Product roadmap',
    description: 'Squads · milestones · custom columns',
    icon:        '★',
    category:    'Showcase',
  },
  {
    path:        'demo',
    label:       'Project board',
    description: 'Dependencies · baseline · critical path',
    icon:        '▦',
    category:    'Core',
  },
  {
    path:        'lazy',
    label:       'Lazy load',
    description: '120 tasks · paginated datasource',
    icon:        '⚡',
    category:    'Performance',
  },
  {
    path:        'custom-bar',
    label:       'Custom bars',
    description: 'Bar registry · custom epic bars',
    icon:        '◆',
    category:    'Extensibility',
  },
];

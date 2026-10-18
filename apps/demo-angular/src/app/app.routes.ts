import { type Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home-page.component').then(m => m.HomePageComponent),
    title: 'Gantry — a Gantt chart for every framework',
  },
  {
    path: 'playground',
    loadComponent: () => import('./pages/playground/playground-page.component').then(m => m.PlaygroundPageComponent),
    title: 'Playground — Gantry',
  },
  {
    path: 'examples',
    loadComponent: () => import('./pages/examples/examples-page.component').then(m => m.ExamplesPageComponent),
    title: 'Examples — Gantry',
  },
  {
    path: 'theming',
    loadComponent: () => import('./pages/theming/theming-page.component').then(m => m.ThemingPageComponent),
    title: 'Theming — Gantry',
  },
  {
    path: 'frameworks',
    loadComponent: () => import('./pages/frameworks/frameworks-page.component').then(m => m.FrameworksPageComponent),
    title: 'Frameworks — Gantry',
  },
  {
    path: 'api',
    loadComponent: () => import('./pages/api/api-page.component').then(m => m.ApiPageComponent),
    title: 'API — Gantry',
  },

  // Example pages (listed on /examples; e2e/qa.spec.ts and e2e/visual.spec.ts open them by path)
  {
    path: 'roadmap',
    loadComponent: () => import('./roadmap/roadmap.component').then(m => m.RoadmapComponent),
    title: 'Product roadmap — Gantry examples',
  },
  {
    path: 'demo',
    loadComponent: () => import('./gantt-demo/gantt-demo.component').then(m => m.GanttDemoComponent),
    title: 'Project board — Gantry examples',
  },
  {
    path: 'lazy',
    loadComponent: () => import('./gantt-lazy/gantt-lazy.component').then(m => m.GanttLazyComponent),
    title: 'Lazy loading — Gantry examples',
  },
  {
    path: 'custom-bar',
    loadComponent: () => import('./gantt-custom/gantt-custom.component').then(m => m.GanttCustomComponent),
    title: 'Custom bars — Gantry examples',
  },

  // Test-only: renders `window.__GANTRY_FIXTURE__` (e2e/paint.spec.ts, e2e/a11y.spec.ts); not in the nav
  {
    path: 'fixture',
    loadComponent: () => import('./fixture/fixture.component').then(m => m.FixtureComponent),
    title: 'Gantry fixture',
  },
  { path: '**', redirectTo: '' },
];

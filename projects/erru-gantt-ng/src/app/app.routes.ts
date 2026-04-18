import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'demo', pathMatch: 'full' },
  {
    path: 'demo',
    loadComponent: () =>
      import('./gantt-demo/gantt-demo.component').then(m => m.GanttDemoComponent),
    title: 'Gantt Demo',
  },
  {
    path: 'lazy',
    loadComponent: () =>
      import('./gantt-lazy/gantt-lazy.component').then(m => m.GanttLazyComponent),
    title: 'Gantt Lazy Load',
  },
  {
    path: 'custom-bar',
    loadComponent: () =>
      import('./gantt-custom/gantt-custom.component').then(m => m.GanttCustomComponent),
    title: 'Gantt Custom Bar',
  },
  { path: '**', redirectTo: 'demo' },
];

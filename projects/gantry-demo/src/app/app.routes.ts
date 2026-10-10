import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'roadmap', pathMatch: 'full' },
  {
    path: 'roadmap',
    loadComponent: () => import('./roadmap/roadmap.component').then(m => m.RoadmapComponent),
    title: 'Product Roadmap — Gantry',
  },
  {
    path: 'demo',
    loadComponent: () => import('./gantt-demo/gantt-demo.component').then(m => m.GanttDemoComponent),
    title: 'Gantt Demo',
  },
  {
    path: 'lazy',
    loadComponent: () => import('./gantt-lazy/gantt-lazy.component').then(m => m.GanttLazyComponent),
    title: 'Gantt Lazy Load',
  },
  {
    path: 'custom-bar',
    loadComponent: () => import('./gantt-custom/gantt-custom.component').then(m => m.GanttCustomComponent),
    title: 'Gantt Custom Bar',
  },
  { path: '**', redirectTo: 'roadmap' },
];

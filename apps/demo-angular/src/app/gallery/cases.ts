// The Angular component of each gallery case, loaded on demand by /examples/:id: a case's own
// component lives in ./cases/<id>/<id>-example.component.ts. The record lists every `CaseId`, so a
// new case in the catalog doesn't compile until its component is here.

import type { Type } from '@angular/core';
import type { CaseId } from 'demo-kit/gallery/catalog';

export type CaseLoader = () => Promise<Type<unknown>>;

export const CASE_COMPONENTS: Readonly<Record<CaseId, CaseLoader>> = {
  states: () => import('./cases/states/states-example.component').then(m => m.StatesExampleComponent),
  lazy: () => import('./cases/lazy/lazy-example.component').then(m => m.LazyExampleComponent),
  tree: () => import('./cases/tree/tree-example.component').then(m => m.TreeExampleComponent),
  'only-parents': () =>
    import('./cases/only-parents/only-parents-example.component').then(m => m.OnlyParentsExampleComponent),
  'only-parents-styled': () =>
    import('./cases/only-parents-styled/only-parents-styled-example.component').then(
      m => m.OnlyParentsStyledExampleComponent,
    ),
  styles: () => import('./cases/styles/styles-example.component').then(m => m.StylesExampleComponent),
  dependencies: () =>
    import('./cases/dependencies/dependencies-example.component').then(m => m.DependenciesExampleComponent),
  'milestones-baselines': () =>
    import('./cases/milestones-baselines/milestones-baselines-example.component').then(
      m => m.MilestonesBaselinesExampleComponent,
    ),
  'non-working': () =>
    import('./cases/non-working/non-working-example.component').then(m => m.NonWorkingExampleComponent),
  'week-numbering': () =>
    import('./cases/week-numbering/week-numbering-example.component').then(m => m.WeekNumberingExampleComponent),
  'multi-pipeline': () =>
    import('./cases/multi-pipeline/multi-pipeline-example.component').then(m => m.MultiPipelineExampleComponent),
  'custom-bars': () =>
    import('./cases/custom-bars/custom-bars-example.component').then(m => m.CustomBarsExampleComponent),
  'custom-columns': () =>
    import('./cases/custom-columns/custom-columns-example.component').then(m => m.CustomColumnsExampleComponent),
  tooltip: () => import('./cases/tooltip/tooltip-example.component').then(m => m.TooltipExampleComponent),
  theming: () => import('./cases/theming/theming-example.component').then(m => m.ThemingExampleComponent),
  i18n: () => import('./cases/i18n/i18n-example.component').then(m => m.I18nExampleComponent),
  responsive: () => import('./cases/responsive/responsive-example.component').then(m => m.ResponsiveExampleComponent),
  density: () => import('./cases/density/density-example.component').then(m => m.DensityExampleComponent),
  large: () => import('./cases/large/large-example.component').then(m => m.LargeExampleComponent),
  keyboard: () => import('./cases/keyboard/keyboard-example.component').then(m => m.KeyboardExampleComponent),
};

// ─────────────────────────────────────────────────────────────
//  gantry · provide.ts
//
//  Optional setup. A <gantry> needs no provider (built-in bars, English
//  labels, light theme); `provideGantt()` sets defaults for every chart
//  below the level it is provided at:
//
//    bootstrapApplication(App, { providers: [provideGantt({ locale: 'it', darkMode: 'auto' })] });
//    { path: 'plan', providers: [provideGantt({ labels: { legend: 'Legend' } }, withBars(epic))] }
//    @Component({ providers: [provideGantt({ theme: { todayColor: '#0F766E' } })], … })
//
//  Each level merges its config over the level above (`mergeGanttConfig`);
//  two `provideGantt` at the same level: the last one wins.
// ─────────────────────────────────────────────────────────────

import { inject, type Provider } from '@angular/core';

import { GANTT_GLOBAL_CONFIG, mergeGanttConfig, type GanttGlobalConfig } from './global-config';
import { provideGanttBar, type GanttBarDef } from './bar-registry';

export { GANTT_GLOBAL_CONFIG, mergeGanttConfig, type GanttGlobalConfig };

/** An optional feature of `provideGantt(config, ...features)`, e.g. `withBars(...)`. */
export interface GanttFeature {
  /** Which feature (one kind today: `'bars'`) */
  readonly ɵkind: 'bars';
  readonly ɵproviders: Provider[];
}

/** Bar components for `provideGantt(config, withBars(...))`: same as `provideGanttBar(...defs)` at that level. */
export function withBars(...defs: GanttBarDef[]): GanttFeature {
  return { ɵkind: 'bars', ɵproviders: provideGanttBar(...defs) };
}

/**
 * Defaults for every `<gantry>` below this injector level: application (`bootstrapApplication`),
 * route or component `providers`. Merged per key over the level above (`theme`, `labels`, `formats`);
 * a chart's `options` and inputs still win.
 */
export function provideGantt(config: GanttGlobalConfig = {}, ...features: GanttFeature[]): Provider[] {
  return [
    {
      provide: GANTT_GLOBAL_CONFIG,
      useFactory: () => mergeGanttConfig(inject(GANTT_GLOBAL_CONFIG, { skipSelf: true, optional: true }) ?? {}, config),
    },
    ...features.flatMap(feature => feature.ɵproviders),
  ];
}

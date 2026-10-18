// ─────────────────────────────────────────────────────────────
//  gantry · bar-registry.ts
//
//  Custom bar components, resolved per <gantry> through the injector
//  hierarchy:
//
//    bootstrapApplication(App, { providers: [provideGanttBar({ type: 'epic', component: EpicBar })] });
//    { path: 'plan', providers: [provideGanttBar(…)] }            // route
//    @Component({ providers: [provideGanttBar(…)] })              // one page / one chart
//
//  Every level that calls `provideGanttBar` adds its defs (multi token
//  GANTT_BAR_DEF, read with `self`) and a GANTT_BAR_SCOPE linked to the
//  scope of the level above (`skipSelf`). A multi token alone can't do it:
//  a level that provides it hides its parents' values.
//
//  GanttBarRegistry is provided by the canvas, so every chart has its
//  own: built-in bars first, then the scopes from the outermost to the
//  innermost level (the nearest definition of a type wins).
// ─────────────────────────────────────────────────────────────

import { inject, Injectable, InjectionToken, type Provider, type Type } from '@angular/core';

import { GanttBarBase } from './bars/bar-base';
import { BUILTIN_BARS, FALLBACK_BAR } from './bars/builtin-defs';

export { GanttBarBase };

// ─── Registry entry ───────────────────────────────────────────

export interface GanttBarDef {
  /** Key used in `GanttTask.barType` — e.g. 'task', 'milestone', 'group', 'sprint' */
  type: string;
  /** A component extending `GanttBarBase` */
  component: Type<GanttBarBase>;
}

// ─── Tokens (one value per injector level) ────────────────────

/** The bar definitions provided at one injector level (multi; read with `self`). */
export const GANTT_BAR_DEF = new InjectionToken<readonly GanttBarDef[]>('GANTT_BAR_DEF');

/** One injector level's bar definitions, linked to the level above. */
export interface GanttBarScope {
  readonly defs: readonly GanttBarDef[];
  readonly parent: GanttBarScope | null;
}

/** The nearest level that called `provideGanttBar` (its `parent` chain reaches the application). */
export const GANTT_BAR_SCOPE = new InjectionToken<GanttBarScope>('GANTT_BAR_SCOPE');

function barScopeFactory(): GanttBarScope {
  return {
    defs: inject(GANTT_BAR_DEF, { self: true, optional: true }) ?? [],
    parent: inject(GANTT_BAR_SCOPE, { skipSelf: true, optional: true }),
  };
}

// ─── Public helper ────────────────────────────────────────────

/**
 * Provide custom bar components (or override a built-in type) for every chart below this level:
 * `bootstrapApplication` / route / component `providers`. The nearest level that defines a type wins.
 *
 * @example
 * @Component({ providers: [provideGanttBar({ type: 'epic', component: EpicBar })], … })
 */
export function provideGanttBar(...defs: GanttBarDef[]): Provider[] {
  for (const def of defs) {
    if (!def?.type || !def.component) {
      throw new Error('[provideGanttBar] Invalid bar definition: `type` and `component` are required.');
    }
  }
  return [
    ...defs.map(def => ({ provide: GANTT_BAR_DEF, useValue: def, multi: true })),
    { provide: GANTT_BAR_SCOPE, useFactory: barScopeFactory },
  ];
}

// ─── Registry (one per <gantry>) ──────────────────────────────

@Injectable()
export class GanttBarRegistry {
  private readonly map = new Map<string, Type<GanttBarBase>>();

  constructor() {
    const scopes: GanttBarScope[] = [];
    for (let s = inject(GANTT_BAR_SCOPE, { optional: true }); s; s = s.parent) scopes.unshift(s);
    for (const def of BUILTIN_BARS) this.map.set(def.type, def.component);
    for (const scope of scopes) for (const def of scope.defs) this.map.set(def.type, def.component);
  }

  /** The component for a bar type; unknown types fall back to the 'task' bar. */
  resolve(type: string): Type<GanttBarBase> {
    return this.map.get(type) ?? this.map.get('task') ?? FALLBACK_BAR;
  }

  has(type: string): boolean {
    return this.map.has(type);
  }

  /** Every type this chart resolves (debugging) */
  registeredTypes(): string[] {
    return [...this.map.keys()];
  }
}

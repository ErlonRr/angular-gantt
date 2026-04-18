// ─────────────────────────────────────────────────────────────
//  ngx-gantt · bar-registry.ts
//
//  The Bar Registry is the extension point that lets consumers
//  plug in custom bar components without touching library code.
//
//  Usage:
//    // Built-in (auto-registered in GanttModule.forRoot)
//    provideGanttBar({ type: 'task',      component: GanttTaskBarComponent })
//    provideGanttBar({ type: 'milestone', component: GanttMilestoneComponent })
//
//    // Custom — in bootstrapApplication providers or a Feature module
//    provideGanttBar({ type: 'sprint', component: SprintBarComponent })
//
//  The GanttCanvasComponent resolves the component to render per row via:
//    registry.resolve(row.barType)   → Type<GanttBarBase>
// ─────────────────────────────────────────────────────────────

import {
  inject,
  InjectionToken,
  Type,
  EnvironmentProviders,
  makeEnvironmentProviders,
  Injectable,
} from '@angular/core';

import { GanttBarContext } from './types';

// ─── Bar component contract ───────────────────────────────────

/**
 * Every bar component MUST extend this abstract class
 * so the registry can verify the contract at registration time.
 *
 * Inputs are declared in concrete subclasses with Angular 20+
 * signal-based input() API.
 */
export abstract class GanttBarBase {
  /** Implemented by concrete components */
  abstract readonly context: GanttBarContext;
}

// ─── Registry entry ───────────────────────────────────────────

export interface GanttBarDef {
  /** Key used in GanttTask.barType — e.g. 'task', 'milestone', 'sprint' */
  type:      string;
  component: Type<GanttBarBase>;
}

// ─── Multi-provider token ─────────────────────────────────────

export const GANTT_BAR_DEF = new InjectionToken<GanttBarDef[]>(
  'GANTT_BAR_DEF',
  { providedIn: 'root', factory: () => [] },
);

// ─── Registry service ─────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class GanttBarRegistry {
  private readonly _map = new Map<string, Type<GanttBarBase>>();

  constructor() {
    // Auto-populate from multi-token at construction time
    const defs = inject(GANTT_BAR_DEF, { optional: true }) ?? [];
    for (const def of defs) {
      this.register(def);
    }
  }

  /** Register (or overwrite) a bar type at runtime */
  register(def: GanttBarDef): void {
    if (!def.type || !def.component) {
      throw new Error(`[GanttBarRegistry] Invalid def: type and component are required.`);
    }
    this._map.set(def.type, def.component);
  }

  /**
   * Resolve a component for the given bar type.
   * Falls back to 'task' if the type is not registered.
   * Throws only if 'task' itself is missing (broken setup).
   */
  resolve(type: string): Type<GanttBarBase> {
    const cmp = this._map.get(type) ?? this._map.get('task');
    if (!cmp) {
      throw new Error(
        `[GanttBarRegistry] No component for bar type '${type}' and no 'task' fallback registered. ` +
        `Did you call GanttModule.forRoot() or provideGantt()?`
      );
    }
    return cmp;
  }

  has(type: string): boolean {
    return this._map.has(type);
  }

  /** Returns all registered type keys (useful for debugging) */
  registeredTypes(): string[] {
    return [...this._map.keys()];
  }
}

// ─── Public helper ────────────────────────────────────────────

/**
 * Provide a custom (or override a built-in) bar component.
 *
 * @example
 * bootstrapApplication(AppComponent, {
 *   providers: [
 *     provideGantt(),
 *     provideGanttBar({ type: 'sprint', component: SprintBarComponent }),
 *   ]
 * });
 */
export function provideGanttBar(def: GanttBarDef): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: GANTT_BAR_DEF, useValue: def, multi: true },
  ]);
}

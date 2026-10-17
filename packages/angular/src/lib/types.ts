// ─────────────────────────────────────────────────────────────
//  gantry · types.ts
//  Domain types live in @gantry/core (framework-free, shared with
//  the Web Component and React / Vue / Svelte bindings).
//  Only Angular-specific refinements are declared here.
// ─────────────────────────────────────────────────────────────

import type { TemplateRef } from '@angular/core';
import type { ColumnDef as CoreColumnDef, ColumnCellContext } from '@gantry/core';

export * from '@gantry/core';

/** Column definition whose `cellTemplate` is an Angular `<ng-template ganttColumn>`. */
export type ColumnDef = CoreColumnDef<TemplateRef<ColumnCellContext>>;

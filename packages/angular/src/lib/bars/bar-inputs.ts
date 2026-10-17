// ─────────────────────────────────────────────────────────────
//  gantry · bars/bar-inputs.ts
//  Shared input contract for all bar components.
//  Every bar component receives a GanttBarContext via input().
// ─────────────────────────────────────────────────────────────

import { input, type InputSignal } from '@angular/core';
import { type GanttBarContext } from '../types';

/**
 * Mixin-style base that declares the shared signal inputs.
 * Use as a regular base class — Angular 20 supports inheritance
 * of signal inputs as long as the subclass does not redeclare them.
 */
export abstract class GanttBarInputs {
  /** Full rendering context passed by GanttCanvasComponent */
  readonly ctx: InputSignal<GanttBarContext> = input.required<GanttBarContext>();
}

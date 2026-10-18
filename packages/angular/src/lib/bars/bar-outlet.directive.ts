// ─────────────────────────────────────────────────────────────
//  gantry · bars/bar-outlet.directive.ts
//
//  Renders one bar component inside the chart's <svg>, directly in the
//  bars layer (`g.gantt-bars-layer > g[data-task-id]`, like the Web
//  Component). Used on an <ng-container> in the canvas' `@for`.
//
//  A host created from a component selector lands in the HTML namespace
//  inside SVG (angular#10404, #46190) and is not painted, so the outlet
//  creates the bar's <g> host in the SVG namespace itself (Renderer2) and
//  hands it to createComponent({ hostElement }), whatever the bar's
//  selector. The host view goes into the container's ViewContainerRef:
//  Angular inserts the host before the container's anchor comment, moves
//  it with its `@for` row when rows reorder, checks it with the canvas and
//  removes it with the row. The row context reaches the bar's `ctx` input
//  through inputBinding (a signal: no setInput, no effect per change).
//
//  The outlet stamps the host of every bar, built-in or custom, with the
//  Web Component's attributes (the bar is an option of the svg listbox):
//
//    g[data-task-id][data-bar-type][data-focus-key=bar:<id>]
//     [role=option][aria-label][aria-roledescription][aria-selected]
//     [aria-posinset][aria-setsize]
//     [tabindex]            from `ganttBarOutletTabStop` (none while null)
//     [aria-describedby]    the tooltip's id while that bar's tooltip is open
//
//  (`taskAccessibleName` and `barRoleDescription` from core). The listbox
//  is flat: `aria-posinset` / `aria-setsize` are the row's place among
//  every visible row (`visibleIndex + 1` of the visible row count); the
//  task-list rows tell the tree. The roving `tabindex` comes from
//  `GanttBarFocusService.tabStop` (the timeline's one tab stop, D5). Only
//  changed attributes are written. It also dims the bar being dragged
//  with an `opacity` style (DRAG_SOURCE_OPACITY), restoring only an
//  opacity it set itself.
// ─────────────────────────────────────────────────────────────

import {
  DestroyRef,
  Directive,
  EnvironmentInjector,
  Injector,
  Renderer2,
  ViewContainerRef,
  computed,
  createComponent,
  effect,
  inject,
  input,
  inputBinding,
  untracked,
  type ComponentRef,
  type Type,
} from '@angular/core';
import { DRAG_SOURCE_OPACITY, barRoleDescription, taskAccessibleName } from '@gantryjs/core';

import { type GanttBarContext } from '../types';
import { type GanttBarBase } from './bar-base';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttTooltipState } from '../tooltip/tooltip-state';

/** Attribute name → value (`null`: the attribute is absent) */
type HostAttrs = Readonly<Record<string, string | null>>;

@Directive({ selector: '[ganttBarOutlet]' })
export class GanttBarOutletDirective {
  /** Bar component of the row (`GanttBarRegistry.resolve(row.barType)`) */
  readonly ganttBarOutlet = input.required<Type<GanttBarBase>>();
  /** The row's context, bound to the bar's `ctx` input */
  readonly ganttBarOutletCtx = input.required<GanttBarContext>();
  /** The row's bar is being dragged or resized: dimmed to DRAG_SOURCE_OPACITY */
  readonly ganttBarOutletDimmed = input(false);
  /** Roving tab stop: `true` → `tabindex=0`, `false` → `-1`, `null` → no `tabindex` (`GanttBarFocusService.tabStop`) */
  readonly ganttBarOutletTabStop = input<boolean | null>(null);
  /** The row is selected: `aria-selected` */
  readonly ganttBarOutletSelected = input(false);

  private readonly renderer = inject(Renderer2);
  private readonly container = inject(ViewContainerRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly elementInjector = inject(Injector);
  /** Optional: an outlet outside `<gantry>` (tests) reads the English labels and has no tooltip */
  private readonly i18n = inject(GanttI18nService, { optional: true });
  private readonly tooltip = inject(GanttTooltipState, { optional: true });
  /** The chart's layout graph (absent outside a chart): the visible row count of `aria-setsize` */
  private readonly layout = inject(GanttLayoutService, { optional: true });

  /** Attributes from the row and the labels (recomputed only when the context or the labels change) */
  private readonly rowAttrs = computed<HostAttrs>(() => {
    const { row, isCritical, showBaseline } = this.ganttBarOutletCtx();
    const labels = this.i18n?.labels();
    const id = row.task.id;
    return {
      'data-task-id': id,
      'data-bar-type': row.barType,
      'data-focus-key': `bar:${id}`,
      role: 'option',
      'aria-label': taskAccessibleName(row, {
        labels,
        locale: this.i18n?.locale(),
        critical: isCritical,
        baseline: showBaseline && !!row.task.baseline,
      }),
      'aria-roledescription': barRoleDescription(row, labels),
    };
  });

  /** The bar's place in the flat listbox: among every visible row (O1 of Gantry 2 phase 9) */
  private readonly positionAttrs = computed<HostAttrs>(() => {
    const index = this.ganttBarOutletCtx().row.visibleIndex;
    const count = this.layout?.rowCount();
    const indexed = Number.isInteger(index);
    return {
      'aria-posinset': indexed ? String(index + 1) : null,
      'aria-setsize': indexed && count !== undefined ? String(count) : null,
    };
  });

  /** Attributes of the interaction state (selection, tab stop, open tooltip) */
  private readonly stateAttrs = computed<HostAttrs>(() => {
    const tabStop = this.ganttBarOutletTabStop();
    const described = this.tooltip?.describedBy();
    return {
      'aria-selected': String(this.ganttBarOutletSelected()),
      tabindex: tabStop === null ? null : tabStop ? '0' : '-1',
      'aria-describedby': described && described.taskId === this.ganttBarOutletCtx().row.task.id ? described.id : null,
    };
  });

  private ref: ComponentRef<GanttBarBase> | null = null;
  private host: Element | null = null;
  /** This outlet wrote the host's `opacity` */
  private dimmed = false;
  /** Attribute values written on the current host */
  private written = new Map<string, string | null>();

  constructor() {
    // Whitelisted effects (creating bar components): the first tracks the component type only
    effect(() => {
      const type = this.ganttBarOutlet();
      untracked(() => this.mount(type));
    });
    effect(() => {
      const dim = this.ganttBarOutletDimmed();
      untracked(() => this.dim(dim));
    });
    // The host's attributes (rendered on the server too): only the changed ones are written
    effect(() => {
      const attrs = { ...this.rowAttrs(), ...this.positionAttrs(), ...this.stateAttrs() };
      untracked(() => this.stamp(attrs));
    });
    inject(DestroyRef).onDestroy(() => this.unmount());
  }

  private mount(type: Type<GanttBarBase>): void {
    this.unmount();
    const host = this.renderer.createElement('g', 'svg') as Element;
    const ref = createComponent(type, {
      hostElement: host,
      environmentInjector: this.environmentInjector,
      elementInjector: this.elementInjector,
      bindings: [inputBinding('ctx', this.ganttBarOutletCtx)],
    });
    this.container.insert(ref.hostView);
    this.ref = ref;
    this.host = host;
    this.dimmed = false;
    // After the component's static host attributes: the outlet's role and names win
    this.written = new Map();
    this.stamp({ ...this.rowAttrs(), ...this.positionAttrs(), ...this.stateAttrs() });
    this.dim(this.ganttBarOutletDimmed());
  }

  /** Writes the attributes of `attrs` that differ from the host's (`null` removes one). */
  private stamp(attrs: HostAttrs): void {
    const host = this.host;
    if (!host) return;
    for (const [name, value] of Object.entries(attrs)) {
      if (this.written.has(name) && this.written.get(name) === value) continue;
      this.written.set(name, value);
      if (value === null) this.renderer.removeAttribute(host, name);
      else this.renderer.setAttribute(host, name, value);
    }
  }

  private dim(dim: boolean): void {
    const host = this.host;
    if (!host || dim === this.dimmed) return;
    this.dimmed = dim;
    if (dim) this.renderer.setStyle(host, 'opacity', String(DRAG_SOURCE_OPACITY));
    else this.renderer.removeStyle(host, 'opacity');
  }

  private unmount(): void {
    const ref = this.ref;
    this.ref = null;
    this.host = null;
    // Destroying the view removes it from the container and its host from the DOM
    ref?.destroy();
  }
}

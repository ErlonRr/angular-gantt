// ─────────────────────────────────────────────────────────────
//  ngx-gantt · arrows/gantt-arrow.component.ts
//
//  Renders a single dependency arrow between two tasks.
//
//  Routing rules (L-bend, never diagonal):
//
//  FS  Finish→Start:   exit from right of FROM, enter left of TO
//  FF  Finish→Finish:  exit from right of FROM, enter right of TO
//  SS  Start→Start:    exit from left  of FROM, enter left  of TO
//  SF  Start→Finish:   exit from left  of FROM, enter right of TO
//
//  The vertical segment always travels outside both bars
//  (offset by OFFSET_X) to avoid cutting through other rows.
//
//  Path shape for FS:
//
//    FROM bar ──►──┐
//                  │  (vertical segment at x = FROM.barX + barWidth + OFFSET)
//                  └──►── TO bar
//
//  Lag > 0 shifts the path OFFSET_X further right.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  NO_ERRORS_SCHEMA,
} from '@angular/core';
import { RowGeometry, DependencyType } from '../types';

/** Horizontal clearance from bar edge to the vertical segment */
const OFFSET_X = 12;
/** Arrowhead size in px */
const ARROW_SIZE = 6;

interface Point { x: number; y: number; }

@Component({
  selector: 'g[ganttArrow]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA],
  host: {
    '[attr.data-from]': 'fromGeo().row.task.id',
    '[attr.data-to]':   'toGeo().row.task.id',
    '[attr.data-type]': 'depType()',
    'style': 'pointer-events: none;',
  },
  template: `
    <defs>
      <!-- Arrowhead marker — reused across all arrows in the SVG defs.
           Each arrow uses a unique id to allow per-arrow colour. -->
      <marker
        [attr.id]="markerId()"
        viewBox="0 0 10 10"
        refX="8" refY="5"
        markerWidth="5" markerHeight="5"
        orient="auto-start-reverse"
      >
        <path
          d="M1 1 L8 5 L1 9"
          fill="none"
          [attr.stroke]="arrowColor()"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </marker>
    </defs>

    <!-- Main path -->
    <path
      class="gantt-arrow-path"
      [attr.d]="pathD()"
      fill="none"
      [attr.stroke]="arrowColor()"
      [attr.stroke-width]="strokeWidth()"
      [attr.stroke-dasharray]="lag() > 0 ? '5 3' : null"
      [attr.marker-end]="'url(#' + markerId() + ')'"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <!-- Lag label (shown only if lag != 0) -->
    @if (lag() !== 0) {
      <text
        [attr.x]="lagLabelPos().x"
        [attr.y]="lagLabelPos().y"
        [attr.fill]="arrowColor()"
        font-size="9"
        text-anchor="middle"
        dominant-baseline="central"
        style="user-select: none;"
      >{{ lagLabel() }}</text>
    }

    <!-- Origin dot -->
    <circle
      [attr.cx]="exitPoint().x"
      [attr.cy]="exitPoint().y"
      r="2.5"
      [attr.fill]="arrowColor()"
    />
  `,
  styles: [`
    .gantt-arrow-path {
      opacity: 0.75;
      transition: opacity 0.12s, stroke-width 0.12s;
    }
    .gantt-arrow-path:hover {
      opacity: 1;
      stroke-width: 2 !important;
    }
  `],
})
export class GanttArrowComponent {
  // ── Inputs ───────────────────────────────────────────────────
  readonly fromGeo   = input.required<RowGeometry>();
  readonly toGeo     = input.required<RowGeometry>();
  readonly depType   = input<DependencyType>(DependencyType.FS);
  readonly lag       = input<number>(0);
  readonly color     = input<string>('');
  readonly isCritical = input<boolean>(false);
  readonly defaultColor = input<string>('#3B82F6');

  // ── Derived ──────────────────────────────────────────────────
  protected readonly arrowColor = computed(() =>
    this.isCritical() ? '#EF4444' : (this.color() || this.defaultColor())
  );
  protected readonly strokeWidth = computed(() =>
    this.isCritical() ? 1.5 : 1.2
  );
  protected readonly markerId = computed(() =>
    `gantt-arrow-${this.fromGeo().row.task.id}-${this.toGeo().row.task.id}`
  );

  // ── Exit / Entry points ───────────────────────────────────────

  protected readonly exitPoint = computed<Point>(() => {
    const from = this.fromGeo();
    const rowMidY = from.y + from.height / 2;
    const type = this.depType();

    if (type === DependencyType.FS || type === DependencyType.FF) {
      // Exit from the right edge of FROM bar
      return { x: from.barX + from.barWidth, y: rowMidY };
    } else {
      // Exit from the left edge of FROM bar (SS, SF)
      return { x: from.barX, y: rowMidY };
    }
  });

  protected readonly entryPoint = computed<Point>(() => {
    const to   = this.toGeo();
    const rowMidY = to.y + to.height / 2;
    const type = this.depType();

    if (type === DependencyType.FS || type === DependencyType.SS) {
      // Enter from the left edge of TO bar
      return { x: to.barX, y: rowMidY };
    } else {
      // Enter from the right edge of TO bar (FF, SF)
      return { x: to.barX + to.barWidth, y: rowMidY };
    }
  });

  // ── Path builder ─────────────────────────────────────────────

  protected readonly pathD = computed<string>(() => {
    const exit  = this.exitPoint();
    const entry = this.entryPoint();
    const type  = this.depType();
    const lag   = this.lag();

    // Horizontal gap between exit and vertical segment
    const hGap = OFFSET_X + Math.max(lag, 0) * 2;

    const fromRight = type === DependencyType.FS || type === DependencyType.FF;
    const toRight   = type === DependencyType.FF || type === DependencyType.SF;

    // X of the vertical segment
    const vx = fromRight
      ? exit.x  + hGap
      : exit.x  - hGap;

    // Entry side adjustment (arrow tip offset)
    const entryX = toRight
      ? entry.x + ARROW_SIZE
      : entry.x - ARROW_SIZE;

    /*
     * L-bend path with 4 segments:
     *   exit → (vx, exit.y) → (vx, entry.y) → entry
     *
     * If the vertical segment would overlap the entry point
     * (e.g. exit.x > entry.x for FS), we add an extra U-turn.
     */

    const needsUTurn =
      (fromRight  && vx > entryX - OFFSET_X) ||
      (!fromRight && vx < entryX + OFFSET_X);

    if (!needsUTurn) {
      // Simple L-bend
      return [
        `M ${exit.x} ${exit.y}`,
        `H ${vx}`,
        `V ${entry.y}`,
        `H ${entryX}`,
      ].join(' ');
    } else {
      // U-turn: go past the bar, drop down/up, come back
      const uTurnX = fromRight
        ? Math.max(exit.x, entry.x) + OFFSET_X * 2
        : Math.min(exit.x, entry.x) - OFFSET_X * 2;

      // Mid Y between the two rows (to avoid crossing bars)
      const midY = (exit.y + entry.y) / 2;

      return [
        `M ${exit.x}  ${exit.y}`,
        `H ${uTurnX}`,
        `V ${midY}`,
        `H ${entryX}`,
        `V ${entry.y}`,
        `H ${entryX}`,
      ].join(' ');
    }
  });

  // ── Lag label ─────────────────────────────────────────────────

  protected readonly lagLabel = computed(() => {
    const l = this.lag();
    if (l === 0) return '';
    return l > 0 ? `+${l}d` : `${l}d`;
  });

  protected readonly lagLabelPos = computed<Point>(() => {
    const exit  = this.exitPoint();
    const entry = this.entryPoint();
    return {
      x: (exit.x + entry.x) / 2,
      y: (exit.y + entry.y) / 2 - 8,
    };
  });
}

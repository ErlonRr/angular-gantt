/**
 * @file gantt-canvas.component.ts
 * Timeline body painter. Everything it draws comes from the core render model:
 * non-working bands, period delimiters, rows, annotations, today, dependency
 * arrows and bars. Only rows inside the virtual-scroll window are rendered; the
 * SVG keeps the full height so the viewport scrolls natively.
 */

import {
  RowGeometry, GanttAnnotation, GanttBarContext, GanttDependency, GanttLabels,
  DependencyType, computeBarVisual, computeArrowVisual, cssPx,
  type BarVisual, type TimelineModel, type ResolvedGanttConfig,
} from '@gantry/core';
import { BaseComponent } from '../core/base-component';
import { svgEl, paintBar, paintArrow } from '../paint';
import type { DragPreview } from '../drag/gantt-drag.service';

/**
 * Custom bar renderer. Return an SVG element to replace the built-in bar, or
 * `null`/`undefined` to fall back to `renderDefault()`. `ctx.visual` holds the
 * computed geometry (position, size, label placement).
 */
export type GanttBarRenderer = (
  ctx: GanttBarContext,
  renderDefault: () => SVGElement,
) => SVGElement | null | undefined;

export interface GanttCanvasProps {
  timeline:          TimelineModel;
  config:            ResolvedGanttConfig;
  labels:            GanttLabels;
  visibleGeometries: RowGeometry[];
  allGeometries:     RowGeometry[];
  /** Vertical pixel range currently rendered */
  windowTop:         number;
  windowBottom:      number;
  totalHeight:       number;
  annotations:       GanttAnnotation[];
  criticalIds:       Set<string>;
  selectedIds:       Set<string>;
  enableDrag:        boolean;
  enableResize:      boolean;
  dragPreview:       DragPreview | null;
  renderBar?:        GanttBarRenderer;
}

export class GanttCanvasComponent extends BaseComponent<GanttCanvasProps> {
  /** Bar visuals of the last render, by task id (used for hit-testing) */
  visuals = new Map<string, BarVisual>();

  constructor(container: HTMLElement, props: GanttCanvasProps) {
    super(container, props);
    this.render();
  }

  render(): void {
    const p = this.props;
    const { timeline: tl, config: cfg, windowTop, windowBottom, totalHeight } = p;
    const theme = cfg.theme;
    const fontPx = cssPx(theme.fontSize, 13) - 1;
    const width = tl.totalWidth;
    const winH = Math.max(0, windowBottom - windowTop);

    this.element.style.cssText = `width:${width}px;height:${totalHeight}px;position:relative;`;
    const svg = svgEl('svg', { width, height: totalHeight, role: 'list', 'aria-label': p.labels.ariaChart });
    svg.style.display = 'block';
    svg.style.overflow = 'visible';

    // Hatch pattern for `nonWorkingTime.style: 'hatch'`
    const nwStyle = cfg.nonWorking?.style ?? 'shade';
    if (nwStyle === 'hatch') {
      const defs = svgEl('defs');
      const pattern = svgEl('pattern', {
        id: 'gantt-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
      });
      pattern.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: theme.textMuted, 'stroke-width': 1.5, 'stroke-opacity': 0.35 }));
      defs.appendChild(pattern);
      svg.appendChild(defs);
    }

    // 1. Rows (zebra / row colour / selection)
    const rowsGroup = svgEl('g', { class: 'gantt-rows', 'aria-hidden': 'true' });
    for (const geo of p.visibleGeometries) {
      const task = geo.row.task;
      rowsGroup.appendChild(svgEl('rect', {
        x: 0, y: geo.y, width, height: geo.height,
        fill: p.selectedIds.has(task.id)
          ? theme.selectionBg
          : task.rowColor ?? (geo.row.visibleIndex % 2 === 0 ? theme.rowBg : theme.rowBgAlt),
      }));
    }
    svg.appendChild(rowsGroup);

    // 2. Non-working time
    const bandsGroup = svgEl('g', { class: 'gantt-bands', 'aria-hidden': 'true', 'pointer-events': 'none' });
    for (const band of tl.bands) {
      const rect = svgEl('rect', {
        class: `gantt-band gantt-band--${band.kind}${band.className ? ` ${band.className}` : ''}`,
        x: band.x, y: windowTop, width: band.width, height: winH,
        fill: band.color,
      });
      bandsGroup.appendChild(rect);
      if (nwStyle === 'hatch' && band.kind !== 'intensive') {
        bandsGroup.appendChild(svgEl('rect', { x: band.x, y: windowTop, width: band.width, height: winH, fill: 'url(#gantt-hatch)' }));
      }
    }
    svg.appendChild(bandsGroup);

    // 3. Grid: minor lines, row separators, period delimiters
    const grid = svgEl('g', { class: 'gantt-grid', 'aria-hidden': 'true', 'pointer-events': 'none' });
    const vline = (x: number, style: { color: string; width: number; dash?: string }, cls: string) =>
      grid.appendChild(svgEl('line', {
        class: cls, x1: x, y1: windowTop, x2: x, y2: windowBottom,
        stroke: style.color, 'stroke-width': style.width, 'stroke-dasharray': style.dash,
        'shape-rendering': 'crispEdges',
      }));
    if (cfg.gridLines.minor) for (const x of tl.minorLines) vline(x + 0.5, cfg.gridLines.minor, 'gantt-grid-minor');
    const hz = cfg.gridLines.horizontal;
    if (hz) {
      for (const geo of p.visibleGeometries) {
        const y = geo.y + geo.height - 0.5;
        grid.appendChild(svgEl('line', {
          class: 'gantt-grid-row', x1: 0, y1: y, x2: width, y2: y,
          stroke: hz.color, 'stroke-width': hz.width, 'stroke-dasharray': hz.dash, 'shape-rendering': 'crispEdges',
        }));
      }
    }
    if (cfg.gridLines.major) for (const x of tl.majorLines) vline(x + 0.5, cfg.gridLines.major, 'gantt-grid-major');
    svg.appendChild(grid);

    // 4. Annotations (labels go on top of the bars, see below)
    const annotationLabels = svgEl('g', { class: 'gantt-annotation-labels', 'aria-hidden': 'true', 'pointer-events': 'none' });
    svg.appendChild(this.paintAnnotations(fontPx, annotationLabels));

    // 5. Today
    if (tl.todayX >= 0) {
      svg.appendChild(svgEl('line', {
        class: 'gantt-today', x1: tl.todayX, y1: windowTop, x2: tl.todayX, y2: windowBottom,
        stroke: theme.todayColor, 'stroke-width': 2, 'pointer-events': 'none',
      }));
    }

    // 6. Bars (computed first: arrows attach to their edges)
    this.visuals = new Map();
    const visualFor = (geo: RowGeometry) => {
      let v = this.visuals.get(geo.row.task.id);
      if (!v) {
        const task = geo.row.task;
        v = computeBarVisual({
          geo, cfg, toX: tl.toX, fontPx,
          isCritical: p.criticalIds.has(task.id),
          resizable: p.enableDrag && p.enableResize && task.draggable !== false,
        });
        this.visuals.set(task.id, v);
      }
      return v;
    };
    const visibleIds = new Set(p.visibleGeometries.map(g => g.row.task.id));

    // 7. Dependency arrows crossing the rendered window
    const arrows = svgEl('g', { class: 'gantt-arrows', 'aria-hidden': 'true', 'pointer-events': 'none' });
    const geoById = new Map(p.allGeometries.map(g => [g.row.task.id, g]));
    for (const geo of p.allGeometries) {
      for (const dep of normalizeDeps(geo.row.task.dependency)) {
        const fromGeo = geoById.get(dep.taskId);
        if (!fromGeo) continue;
        const top = Math.min(fromGeo.y, geo.y);
        const bottom = Math.max(fromGeo.y, geo.y) + geo.height;
        if (bottom < windowTop || top > windowBottom) continue;
        const critical = p.criticalIds.has(dep.taskId) && p.criticalIds.has(geo.row.task.id);
        const a = computeArrowVisual(
          visualFor(fromGeo), visualFor(geo), { type: dep.type ?? DependencyType.FS, lag: dep.lag },
          cfg, { fromTop: fromGeo.y, fromBottom: fromGeo.y + fromGeo.height }, critical,
        );
        arrows.appendChild(paintArrow(a, fontPx));
      }
    }
    svg.appendChild(arrows);

    const bars = svgEl('g', { class: 'gantt-bars-layer' });
    for (const geo of p.visibleGeometries) {
      if (!visibleIds.has(geo.row.task.id)) continue;
      const task = geo.row.task;
      const v = visualFor(geo);
      const draggable = p.enableDrag && task.draggable !== false;
      const selected = p.selectedIds.has(task.id);
      const ctx: GanttBarContext = {
        row: geo.row,
        geometry: geo,
        theme,
        layoutParams: { origin: tl.start, pxPerDay: tl.pxPerDay, rowHeight: cfg.rowHeight },
        isCritical: p.criticalIds.has(task.id),
        isSelected: selected,
        draggable,
        enableResize: !!v.handles,
        showBaseline: cfg.baseline,
        visual: v,
      };
      const renderDefault = () => paintBar(v, { theme, fontPx, selected, className: task.className });
      const bar = p.renderBar?.(ctx, renderDefault) ?? renderDefault();

      bar.setAttribute('data-task-id', task.id);
      bar.setAttribute('data-bar-type', geo.row.barType);
      bar.setAttribute('role', 'listitem');
      bar.setAttribute('aria-label', ariaLabel(geo.row.barType, task.name, task.progress ?? 0, cfg.baseline && !!task.baseline));
      if (draggable) bar.classList.add('gantt-bar-draggable');
      if (p.dragPreview?.taskId === task.id) bar.setAttribute('opacity', '0.35');
      bars.appendChild(bar);
    }
    svg.appendChild(bars);
    svg.appendChild(annotationLabels);

    // 8. Drag ghost
    const dp = p.dragPreview;
    if (dp) {
      const v = this.visuals.get(dp.taskId);
      const h = v?.height ?? dp.height * 0.6;
      svg.appendChild(svgEl('rect', {
        class: 'gantt-drag-preview',
        x: dp.x, y: dp.y + (dp.height - h) / 2, width: dp.width, height: h,
        rx: v?.rx ?? cfg.bar.radius, fill: theme.barColor, 'fill-opacity': 0.22,
        stroke: theme.barColor, 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'pointer-events': 'none',
      }));
    }

    this.element.replaceChildren(svg);
  }

  private paintAnnotations(fontPx: number, labels: SVGGElement): SVGGElement {
    const { timeline: tl, config: cfg, annotations, windowTop, windowBottom } = this.props;
    const g = svgEl('g', { class: 'gantt-annotations', 'aria-hidden': 'true', 'pointer-events': 'none' });
    for (const ann of annotations) {
      const x1 = tl.toX(ann.x1);
      const color = ann.color ?? cfg.theme.arrowColor;
      if (ann.x2) {
        g.appendChild(svgEl('rect', {
          x: x1, y: windowTop, width: tl.toX(ann.x2) - x1, height: windowBottom - windowTop,
          fill: color, opacity: ann.opacity ?? 0.08,
        }));
      }
      g.appendChild(svgEl('line', {
        x1, y1: windowTop, x2: x1, y2: windowBottom,
        stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '5 3', opacity: 0.8,
      }));
      if (ann.label) {
        const t = svgEl('text', {
          x: x1 + 6, y: windowTop + 14,
          fill: ann.label.color ?? color,
          'font-size': ann.label.fontSize ?? fontPx - 1,
          'font-weight': ann.label.fontWeight ?? 600,
        });
        t.textContent = ann.label.text;
        labels.appendChild(t);
      }
    }
    return g;
  }
}

function ariaLabel(barType: string, name: string, progress: number, baseline: boolean): string {
  if (barType === 'milestone') return `${name}, milestone`;
  return `${name}, ${progress}% complete${baseline ? ', planned baseline shown' : ''}`;
}

function normalizeDeps(dep: string | GanttDependency | GanttDependency[] | undefined): GanttDependency[] {
  if (!dep) return [];
  if (typeof dep === 'string') return [{ taskId: dep }];
  return Array.isArray(dep) ? dep : [dep];
}

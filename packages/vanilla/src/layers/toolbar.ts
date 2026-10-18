/**
 * @file toolbar.ts
 * Toolbar region: zoom, zoom-level pills, "today" and the split / table / chart view switch, each
 * part configurable through `options.toolbar`. Built once and patched in place: a paint updates
 * texts, titles and `aria-pressed`, attaches the configured groups in their fixed order and keys
 * the zoom-level pills by level name, so the buttons keep their nodes (and keyboard focus)
 * across zooms, view switches and option changes. The whole toolbar is detached while hidden
 * (`showToolbar = false`, `toolbar: false`) and re-attached as is.
 *
 *   div.gantt-toolbar[role=toolbar]
 *     div.gantt-tb-group                               − +
 *     div.gantt-tb-group.gantt-tb-pills                zoom levels
 *     div.gantt-tb-group                               ◎ today
 *     div.gantt-tb-group.gantt-tb-pills.gantt-tb-views split · table · chart
 *
 * One delegated click listener runs the action of the button clicked.
 */

import type { GanttView, GanttZoomLevel } from '@gantryjs/core';
import { h } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setAttr, setText } from '../dom/patch';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';

const VIEWS: readonly GanttView[] = ['split', 'table', 'chart'];

export function createToolbarLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom, host } = ctx;
  /** What each button does when clicked */
  const actions = new WeakMap<Element, () => void>();

  const button = (cls: string, focusKey: string, action: () => void): HTMLButtonElement => {
    const b = h('button', { class: cls, attrs: { type: 'button' }, dataset: { focusKey } });
    actions.set(b, action);
    return b;
  };
  const label = (b: HTMLButtonElement, text: string, title: string = text): void => {
    setText(b, text);
    setAttr(b, 'title', title);
    setAttr(b, 'aria-label', title);
  };

  const zoomOut = button('gantt-tb-btn', 'zoom-out', () => host.zoomOut());
  const zoomIn = button('gantt-tb-btn', 'zoom-in', () => host.zoomIn());
  const zoomGroup = h('div', { class: 'gantt-tb-group' }, zoomOut, zoomIn);
  const pillsGroup = h('div', { class: 'gantt-tb-group gantt-tb-pills' });
  const today = button('gantt-tb-btn gantt-tb-today', 'today', () => host.scrollToToday());
  const todayGroup = h('div', { class: 'gantt-tb-group' }, today);
  const viewButtons = VIEWS.map(v => button('gantt-tb-pill', `view:${v}`, () => host.setView(v)));
  const viewsGroup = h('div', { class: 'gantt-tb-group gantt-tb-pills gantt-tb-views' }, ...viewButtons);
  const bar = h('div', {
    class: 'gantt-toolbar',
    attrs: { role: 'toolbar' },
    on: {
      click: e => {
        const b = (e.target as Element).closest('button');
        if (b) actions.get(b)?.();
      },
    },
  });
  /** Groups attached to the bar, in order */
  let shown: readonly HTMLElement[] = [];

  const createPill = (level: GanttZoomLevel): HTMLButtonElement =>
    button('gantt-tb-pill', `zoom:${level.name}`, () => host.setViewMode(level.name));

  return {
    paint() {
      const cfg = G.config();
      const toolbar = cfg.toolbar;
      const on = I.showToolbar() && toolbar !== false;
      // Buttons that move or go away lose focus: the focus-restore region gives it back
      ctx.focus.capture();
      showNode(dom.toolbarContainer, bar, on);
      if (!on) return;

      const viewMode = G.viewMode();
      const view = I.viewOverride();
      const { labels } = G.i18n();
      setAttr(bar, 'aria-label', labels.ariaToolbar);

      const groups = [
        toolbar.zoom && zoomGroup,
        toolbar.viewModes !== false && toolbar.viewModes.length > 0 && pillsGroup,
        toolbar.today && todayGroup,
        toolbar.viewToggle && viewsGroup,
      ].filter((g): g is HTMLDivElement => g !== false);
      if (groups.length !== shown.length || groups.some((g, i) => g !== shown[i])) {
        bar.replaceChildren(...groups);
        shown = groups;
      }

      label(zoomOut, '−', labels.zoomOut);
      label(zoomIn, '+', labels.zoomIn);

      // Zoom-level pills, by level name (a name with no zoom level is skipped)
      const names = toolbar.viewModes === false ? [] : toolbar.viewModes;
      const levels = names.flatMap(name => cfg.zoomLevels.filter(l => l.name === name).slice(0, 1));
      const seen = new Map<string, number>();
      reconcile(
        pillsGroup,
        levels,
        l => {
          const n = seen.get(l.name) ?? 0;
          seen.set(l.name, n + 1);
          return n ? `${l.name}#${n}` : l.name;
        },
        createPill,
        (b, level) => {
          label(b, level.label ?? (labels.viewModes as Record<string, string>)[level.name] ?? level.name);
          setAttr(b, 'aria-pressed', String(level.name === viewMode));
        },
      );

      label(today, `◎ ${labels.todayButton}`, labels.todayButton);

      const viewLabels: Record<GanttView, string> = {
        split: labels.viewSplit,
        table: labels.viewTable,
        chart: labels.viewChart,
      };
      VIEWS.forEach((v, i) => {
        const b = viewButtons[i]!;
        label(b, viewLabels[v]);
        setAttr(b, 'aria-pressed', String(v === view));
      });
    },
  };
}

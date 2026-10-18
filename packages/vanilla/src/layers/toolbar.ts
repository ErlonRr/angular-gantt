/**
 * @file toolbar.ts
 * Toolbar region: core `buildToolbar()` painted as is (the same groups, controls, classes, roles
 * and names as Angular's toolbar), configurable through `options.toolbar`. The whole toolbar is
 * detached while hidden (`showToolbar = false`, `toolbar: false`) and re-attached as is.
 *
 *   div.gantt-toolbar[role=toolbar][aria-label]
 *     div.gantt-tb-group                     button.gantt-tb-btn ×3 (zoom out, zoom in, fit)
 *                                              > svg.gantt-tb-icon[aria-hidden] > path…
 *     div.gantt-tb-group.gantt-tb-pills[role=radiogroup][aria-label]
 *                                            button.gantt-tb-pill[role=radio][aria-checked] (text)
 *     div.gantt-tb-group                     button.gantt-tb-btn.gantt-tb-today
 *                                              > svg.gantt-tb-icon + span.gantt-tb-label
 *     div.gantt-tb-group.gantt-tb-pills.gantt-tb-views[role=radiogroup][aria-label]
 *                                            button.gantt-tb-pill[role=radio][aria-checked][aria-label][title]
 *                                              > svg.gantt-tb-icon
 *     <!--legend-->                          the groups sit before this marker
 *     div.gantt-legend.gantt-legend--toolbar (`legend.position: 'toolbar'`: attached by the legend region)
 *
 * Patched in place: groups are keyed by `ToolbarGroup.key` and buttons by `ToolbarItem.focusKey`
 * (`data-focus-key`: `zoom-out`, `zoom-in`, `fit`, `zoom:<level>`, `today`, `view:<view>`), so a
 * control keeps its node, and keyboard focus, across zooms, view switches and option changes.
 *
 * Keyboard (WAI-ARIA toolbar, D7): the built-in controls are one roving set with one tab stop
 * (`tabindex=0` on core `toolbarTabStop`: the control focused last while it is shown, else the
 * first); ←/→ move and wrap, Home/End go to the ends (core `toolbarFocusMove`; the arrows swap
 * in RTL). Moving focus never presses a control: a radio is checked by Space / Enter / click
 * (the button's native activation), so arrowing over the zoom levels does not re-zoom.
 *
 * One delegated click listener runs the action of the control clicked.
 */

import {
  buildToolbar,
  resolveKey,
  toolbarFocusMove,
  toolbarItems,
  toolbarTabStop,
  type Command,
  type MoveCommand,
  type ToolbarAction,
  type ToolbarGroup,
  type ToolbarIcon,
  type ToolbarItem,
} from '@gantryjs/core';
import { signal } from '../reactive';
import { h } from '../dom/h';
import { toolbarIcon } from '../dom/icons';
import { reconcile } from '../dom/keyed';
import { setAttr, setText } from '../dom/patch';
import type { Layer, LayerContext } from './context';
import { showNode, type Skeleton } from './skeleton';

/** A control's inner nodes and its current action. */
interface ButtonParts {
  icon: ToolbarIcon | null;
  svg: SVGSVGElement | null;
  /** `span.gantt-tb-label`: the text of a control that also has an icon */
  label: HTMLSpanElement | null;
  /** The text of a text-only control (a zoom level) */
  text: Text | null;
  action: ToolbarAction;
}

/** Each chart's toolbar element, by its skeleton (read by the legend region). */
const toolbars = new WeakMap<Skeleton, HTMLElement>();

/**
 * The toolbar element (`div.gantt-toolbar`) of the chart built on `dom`: the legend region
 * appends the legend at its end in the `'toolbar'` placement. Attached to `dom.toolbarContainer`
 * while the toolbar shows.
 */
export function toolbarElement(dom: Skeleton): HTMLElement | undefined {
  return toolbars.get(dom);
}

const isMove = (command: Command | null): command is MoveCommand => command?.startsWith('move.') === true;

export function createToolbarLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom, host } = ctx;
  const parts = new WeakMap<Element, ButtonParts>();
  /**
   * `data-focus-key` of the control focused last: the roving tab stop while it is shown. Local
   * UI state of this region, written by its own `focusin` listener.
   */
  const lastFocus = signal<string | null>(null);
  /** The controls painted last, in roving order (keyboard handler) */
  let items: readonly ToolbarItem[] = [];
  // Nodes by key, kept while a group or control is turned off: it comes back as the same node
  const groupNodes = new Map<string, HTMLElement>();
  const buttonNodes = new Map<string, HTMLButtonElement>();

  const run = (action: ToolbarAction): void => {
    switch (action.type) {
      case 'zoomOut':
        return host.zoomOut();
      case 'zoomIn':
        return host.zoomIn();
      case 'fit':
        return host.fitToScreen();
      case 'today':
        return host.scrollToToday();
      case 'zoomLevel':
        return host.setViewMode(action.level);
      case 'view':
        return host.setView(action.view);
    }
  };

  /** The built-in control `target` is in (the legend in the toolbar holds none). */
  const controlOf = (target: EventTarget | null): HTMLButtonElement | null => {
    const b = (target as Element | null)?.closest?.('button') ?? null;
    return b && parts.has(b) ? b : null;
  };

  const end = document.createComment('legend');
  const bar = h(
    'div',
    {
      class: 'gantt-toolbar',
      attrs: { role: 'toolbar' },
      on: {
        click: e => {
          const b = controlOf(e.target);
          if (b) run(parts.get(b)!.action);
        },
        keydown: e => {
          if (e.defaultPrevented) return;
          const b = controlOf(e.target);
          const key = b?.dataset['focusKey'];
          if (!key) return;
          const command = resolveKey(e, 'toolbar', { rtl: getComputedStyle(bar).direction === 'rtl' });
          if (!isMove(command)) return;
          const next = toolbarFocusMove(items, key, command);
          const target = next === null ? undefined : buttonNodes.get(next);
          if (!target) return;
          // Handled here: the element's shortcuts (and the grid / timeline keys) skip a prevented key
          e.preventDefault();
          target.focus();
        },
        focusin: e => {
          const key = controlOf(e.target)?.dataset['focusKey'];
          if (key) lastFocus.set(key);
        },
      },
    },
    end,
  );
  toolbars.set(dom, bar);

  const detach = (el: Element): void => el.remove();

  const createButton = (item: ToolbarItem): HTMLButtonElement => {
    let b = buttonNodes.get(item.focusKey);
    if (!b) {
      b = h('button', { attrs: { type: 'button' }, dataset: { focusKey: item.focusKey } });
      parts.set(b, { icon: null, svg: null, label: null, text: null, action: item.action });
      buttonNodes.set(item.focusKey, b);
    }
    return b;
  };
  const createGroup = (group: ToolbarGroup): HTMLElement => {
    let el = groupNodes.get(group.key);
    if (!el) groupNodes.set(group.key, (el = h('div')));
    return el;
  };

  /** Icon first, then the text: in `span.gantt-tb-label` after an icon, else the button's own text. */
  const updateContent = (b: HTMLButtonElement, p: ButtonParts, item: ToolbarItem): void => {
    if (p.icon !== item.icon) {
      p.svg?.remove();
      p.icon = item.icon;
      p.svg = item.icon ? toolbarIcon(item.icon) : null;
      if (p.svg) b.prepend(p.svg);
    }
    const labelled = item.text !== null && item.icon !== null;
    const plain = item.text !== null && item.icon === null;
    if (labelled) p.label ??= h('span', { class: 'gantt-tb-label' });
    if (plain) p.text ??= document.createTextNode('');
    if (p.label) showNode(b, p.label, labelled);
    if (p.text) showNode(b, p.text, plain);
    if (item.text !== null) setText((labelled ? p.label : p.text)!, item.text);
  };

  const updateButton = (b: HTMLButtonElement, item: ToolbarItem, tabStop: string | null): void => {
    const p = parts.get(b)!;
    p.action = item.action;
    setAttr(b, 'class', item.className);
    setAttr(b, 'role', item.role);
    setAttr(b, 'aria-checked', item.checked === null ? null : String(item.checked));
    setAttr(b, 'aria-label', item.ariaLabel);
    setAttr(b, 'title', item.title);
    setAttr(b, 'tabindex', item.focusKey === tabStop ? 0 : -1);
    updateContent(b, p, item);
  };

  const updateGroup = (el: HTMLElement, group: ToolbarGroup, tabStop: string | null): void => {
    setAttr(el, 'class', group.className);
    setAttr(el, 'role', group.role);
    setAttr(el, 'aria-label', group.ariaLabel);
    reconcile(
      el,
      group.items,
      item => item.focusKey,
      createButton,
      (b, item) => updateButton(b, item, tabStop),
      null,
      detach,
    );
  };

  return {
    paint() {
      const cfg = G.config();
      const toolbar = cfg.toolbar;
      const on = I.showToolbar() && toolbar !== false;
      // Controls that go away lose focus: the focus-restore region gives it back
      ctx.focus.capture();
      showNode(dom.toolbarContainer, bar, on);
      if (!on) return;

      const { labels } = G.i18n();
      setAttr(bar, 'aria-label', labels.ariaToolbar);
      const groups = buildToolbar({
        toolbar,
        zoomLevels: cfg.zoomLevels,
        labels,
        viewMode: G.viewMode(),
        view: I.viewOverride(),
      });
      items = toolbarItems(groups);
      const tabStop = toolbarTabStop(items, lastFocus());
      reconcile(
        bar,
        groups,
        group => group.key,
        createGroup,
        (el, group) => updateGroup(el, group, tabStop),
        end,
        detach,
      );
    },
  };
}

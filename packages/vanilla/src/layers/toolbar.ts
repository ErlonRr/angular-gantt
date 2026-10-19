/**
 * @file toolbar.ts
 * Toolbar region: core `buildToolbar()` fitted to the chart's width by core `layoutToolbar()` and
 * painted as is (the same groups, controls, classes, roles and names as Angular's toolbar),
 * configurable through `options.toolbar`. The whole toolbar is detached while hidden
 * (`showToolbar = false`, `toolbar: false`) and re-attached as is.
 *
 *   div.gantt-toolbar[role=toolbar][aria-label]
 *     div.gantt-tb-group.gantt-tb-panel-group   button.gantt-tb-btn.gantt-tb-panel[aria-pressed]   (`panelToggle`)
 *     div.gantt-tb-group                     button.gantt-tb-btn ×3 (zoom out, zoom in, fit)
 *                                              > svg.gantt-tb-icon[aria-hidden] > path…
 *     div.gantt-tb-group.gantt-tb-pills[role=radiogroup][aria-label]
 *                                            button.gantt-tb-pill[role=radio][aria-checked] (text)
 *     div.gantt-tb-group                     button.gantt-tb-btn.gantt-tb-today
 *                                              > svg.gantt-tb-icon + span.gantt-tb-label
 *     div.gantt-tb-group.gantt-tb-pills.gantt-tb-views[role=radiogroup][aria-label]
 *                                            button.gantt-tb-pill[role=radio][aria-checked][aria-label][title]
 *                                              > svg.gantt-tb-icon
 *     div.gantt-tb-group.gantt-tb-more-group button.gantt-tb-btn.gantt-tb-more[aria-haspopup=menu][aria-expanded]
 *                                              (while some groups don't fit; `aria-controls` while open)
 *     div.gantt-tb-menu[role=menu][id][aria-label]                                     (while open)
 *       div.gantt-tb-menu-group[role=group][aria-label]
 *         button.gantt-tb-menu-item[role=menuitemradio|menuitem][aria-checked][tabindex=-1]
 *           > svg.gantt-tb-icon? + span.gantt-tb-label
 *     <!--legend-->                          the groups and the menu sit before this marker
 *     div.gantt-legend.gantt-legend--toolbar (`legend.position: 'toolbar'`: attached by the legend region)
 *
 * Patched in place: groups are keyed by `ToolbarGroup.key` and buttons by `ToolbarItem.focusKey`
 * (`data-focus-key`: `panel`, `zoom-out`, `zoom-in`, `fit`, `zoom:<level>`, `today`,
 * `view:<view>`, `more`), menu sections by their group key and menu items by `menu:<key>`, so a
 * control keeps its node, and keyboard focus, across zooms, view switches and option changes.
 * The panel toggle, the More button and the menu are attached only while shown (D26): at a width
 * where everything fits, without `panelToggle`, the toolbar is the Phase 9 toolbar.
 *
 * Overflow (D3): the width the groups get is the chart's (`mainW`, measured by the
 * ResizeObserver), less the legend's when it sits in the toolbar (measured by this layer's own
 * observer while `legend.position` is `'toolbar'`; a legend too wide to share the line even with
 * the shortest toolbar wraps onto its own line and takes nothing). The layout is a computed with
 * a structural cut-off, so a resize re-paints the toolbar only when the controls change.
 * `toolbar.overflow: 'wrap'` never builds the menu (the groups wrap, as before).
 *
 * Keyboard (WAI-ARIA toolbar, D7): the built-in controls, More included, are one roving set with
 * one tab stop (`tabindex=0` on core `toolbarTabStop`: the control focused last while it is
 * shown, else the first); ←/→ move and wrap, Home/End go to the ends (core `toolbarFocusMove`;
 * the arrows swap in RTL). Moving focus never presses a control: a radio is checked by Space /
 * Enter / click (the button's native activation), so arrowing over the zoom levels does not
 * re-zoom.
 *
 * The More menu (WAI-ARIA menu button, core `reduceMenu` / `toolbarMenuKey`): click, Enter or
 * Space on More toggles it (opening on the checked item, else the first), ↓ opens it on that
 * item and ↑ on the last; inside, ↑/↓ wrap, Home/End go to the ends, Enter / Space / click run
 * the item's action and close it back to More, Esc closes it back to More (and never reaches the
 * chart's own Esc), Tab closes it and moves on, a press outside the menu and More closes it
 * (a document `pointerdown` listener, only while open), and so does a change of the chart's width
 * (`closeToolbarMenu`, from the narrow-width switch) and the toolbar going away (`showToolbar =
 * false`, `toolbar: false`: `closeToolbarMenu` from the element's setters, so it comes back closed,
 * as Angular's re-created toolbar does). Its items are not in the roving set: while
 * one holds focus, More is the toolbar's tab stop. A focused More or menu item a paint removes
 * hands focus to the toolbar's tab stop.
 *
 * One delegated click listener runs the action of the control or menu item clicked.
 */

import {
  buildToolbar,
  estimateToolbarWidth,
  layoutToolbar,
  reduceMenu,
  resolveKey,
  toolbarFocusMove,
  toolbarItems,
  toolbarMenuChecked,
  toolbarMenuItems,
  toolbarMenuKey,
  toolbarTabStop,
  type Command,
  type GanttLabels,
  type MoveCommand,
  type ResolvedGanttConfig,
  type ResolvedToolbar,
  type ToolbarAction,
  type ToolbarGroup,
  type ToolbarIcon,
  type ToolbarItem,
  type ToolbarLayout,
  type ToolbarMenuEvent,
  type ToolbarMenuItem,
  type ToolbarMenuSection,
} from '@gantryjs/core';
import { computed, signal } from '../reactive';
import { h } from '../dom/h';
import { toolbarIcon } from '../dom/icons';
import { reconcile } from '../dom/keyed';
import { setAttr, setText } from '../dom/patch';
import { structuralEqual } from '../engine/inputs';
import type { Layer, LayerContext } from './context';
import { focusKeyOf } from './focus-restore';
import { showNode, type Skeleton } from './skeleton';

/** A control's inner nodes and its current action. */
interface ButtonParts {
  icon: ToolbarIcon | null;
  svg: SVGSVGElement | null;
  /** `span.gantt-tb-label`: the text of a control that also has an icon (always, in a menu item) */
  label: HTMLSpanElement | null;
  /** The text of a text-only control (a zoom level) */
  text: Text | null;
  action: ToolbarAction;
}

/** What the toolbar paints: `null` while it is hidden. */
interface ToolbarModel {
  /** `aria-label` of the toolbar */
  readonly label: string;
  /** `aria-label` of the More menu */
  readonly more: string;
  /** The legend sits in the toolbar (`legend.position: 'toolbar'`): its width is observed */
  readonly legend: boolean;
  readonly layout: ToolbarLayout;
}

/** `id` of the More menu (`aria-controls` of More); unique in the element's shadow root. */
const MENU_ID = 'gantt-tb-menu';

/** The toolbar's column gap (`.gantt-toolbar { gap: 6px 10px }`): between the last group and the legend. */
const LEGEND_GAP = 10;

/** Each chart's toolbar element, by its skeleton (read by the legend region). */
const toolbars = new WeakMap<Skeleton, HTMLElement>();
/** Each chart's "close the More menu" (on a width change, and when the toolbar is hidden). */
const menuClosers = new WeakMap<Skeleton, () => void>();

/**
 * The toolbar element (`div.gantt-toolbar`) of the chart built on `dom`: the legend region
 * appends the legend at its end in the `'toolbar'` placement. Attached to `dom.toolbarContainer`
 * while the toolbar shows.
 */
export function toolbarElement(dom: Skeleton): HTMLElement | undefined {
  return toolbars.get(dom);
}

/**
 * Closes the More menu of the chart built on `dom`, if open (the chart's width changed: the
 * controls may move; the toolbar is hidden: its open state and its document listener go). Focus
 * is left alone; a focused item the next paint removes hands focus to the toolbar's tab stop.
 */
export function closeToolbarMenu(dom: Skeleton): void {
  menuClosers.get(dom)?.();
}

const isMove = (command: Command | null): command is MoveCommand => command?.startsWith('move.') === true;

/**
 * `layoutToolbar` for a chart `main` px wide with a legend of `legendW` px in the toolbar (`0`:
 * none): the legend's width and the gap before it are taken from the groups', unless even the
 * shortest toolbar can't share the line with it (it wraps onto its own line: the groups get the
 * whole width).
 */
function fitToolbar(
  groups: readonly ToolbarGroup[],
  cfg: ResolvedGanttConfig,
  toolbar: ResolvedToolbar,
  labels: Pick<GanttLabels, 'more'>,
  main: number,
  legendW: number,
  menuOpen: boolean,
): ToolbarLayout {
  const input = { groups, controlSize: cfg.controlSize, overflow: toolbar.overflow, labels, menuOpen };
  const legend = legendW > 0 ? legendW + LEGEND_GAP : 0;
  const layout = layoutToolbar({ ...input, width: main - legend });
  if (legend > 0 && main > 0 && estimateToolbarWidth(layout.groups, input) > main - legend) {
    return layoutToolbar({ ...input, width: main });
  }
  return layout;
}

export function createToolbarLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom, host, shadow } = ctx;
  const parts = new WeakMap<Element, ButtonParts>();
  const menuParts = new WeakMap<Element, ButtonParts>();
  /**
   * `data-focus-key` of the control focused last: the roving tab stop while it is shown (More
   * while a menu item holds focus). Local UI state of this region, written by its own `focusin`
   * listener.
   */
  const lastFocus = signal<string | null>(null);
  /** Border-box width of the legend while it sits in the toolbar, else 0 (this layer's observer) */
  const legendW = signal(0);
  /** The controls painted last, in roving order (keyboard handler) */
  let items: readonly ToolbarItem[] = [];
  /** The More menu's items of the last paint, in display order (`reduceMenu`'s count and indexes) */
  let menuItems: readonly ToolbarMenuItem[] = [];
  /** Index of the menu's active item (`reduceMenu`); the open state is `inputs.menuOpen` */
  let active = -1;
  // Nodes by key, kept while a group or control is turned off: it comes back as the same node
  const groupNodes = new Map<string, HTMLElement>();
  const buttonNodes = new Map<string, HTMLButtonElement>();
  const sectionNodes = new Map<string, HTMLElement>();
  const menuNodes = new Map<string, HTMLButtonElement>();

  const model = computed<ToolbarModel | null>(
    () => {
      const cfg = G.config();
      const toolbar = cfg.toolbar;
      if (!I.showToolbar() || toolbar === false) return null;
      const { labels } = G.i18n();
      const groups = buildToolbar({
        toolbar,
        zoomLevels: cfg.zoomLevels,
        labels,
        viewMode: G.viewMode(),
        view: I.viewOverride(),
      });
      const legend = cfg.legend.position === 'toolbar';
      const layout = fitToolbar(groups, cfg, toolbar, labels, I.mainW(), legend ? legendW() : 0, I.menuOpen());
      return { label: labels.ariaToolbar, more: labels.more, legend, layout };
    },
    { equals: structuralEqual },
  );

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
      case 'togglePanel':
        return host.togglePanel();
      case 'menu':
        // The More button: its menu (see `dispatch`)
        return;
    }
  };

  /** The built-in control `target` is in (the legend in the toolbar and the menu hold none). */
  const controlOf = (target: EventTarget | null): HTMLButtonElement | null => {
    const b = (target as Element | null)?.closest?.('button') ?? null;
    return b && parts.has(b) ? b : null;
  };
  /** The menu item `target` is in. */
  const menuItemOf = (target: EventTarget | null): HTMLButtonElement | null => {
    const b = (target as Element | null)?.closest?.('button') ?? null;
    return b && menuParts.has(b) ? b : null;
  };

  const end = document.createComment('legend');
  const menu = h('div', { class: 'gantt-tb-menu', attrs: { role: 'menu', id: MENU_ID } });

  // ── The More menu's state ────────────────────────────────
  /** Document the outside-press listener is registered on, while the menu is open */
  let outsideDoc: Document | null = null;
  const onOutside = (e: Event): void => {
    const path = e.composedPath();
    const more = buttonNodes.get('more');
    if (path.includes(menu) || (more !== undefined && path.includes(more))) return;
    dispatch({ type: 'close', reason: 'outside' });
  };
  const setOpen = (open: boolean): void => {
    I.menuOpen.set(open);
    if (open && !outsideDoc) {
      outsideDoc = host.ownerDocument;
      outsideDoc.addEventListener('pointerdown', onOutside, { capture: true });
    } else if (!open && outsideDoc) {
      outsideDoc.removeEventListener('pointerdown', onOutside, { capture: true });
      outsideDoc = null;
    }
  };
  /** Runs `event` through core `reduceMenu` and moves focus where it says. */
  const dispatch = (event: ToolbarMenuEvent): void => {
    const { state, focus } = reduceMenu({ open: I.menuOpen.peek(), active }, event, menuItems.length);
    active = state.active;
    setOpen(state.open);
    if (focus === 'item') {
      const key = menuItems[state.active]?.focusKey;
      if (key === undefined) return;
      const node = menuNodes.get(key);
      // Painted already (a move inside the open menu): focus it now; else once the flush mounts it
      if (node?.isConnected && menu.isConnected) node.focus();
      else ctx.focus.request(key);
    } else if (focus === 'button') {
      buttonNodes.get('more')?.focus();
    }
  };
  menuClosers.set(dom, () => {
    if (!I.menuOpen.peek()) return;
    active = -1;
    setOpen(false);
  });

  const bar = h(
    'div',
    {
      class: 'gantt-toolbar',
      attrs: { role: 'toolbar' },
      on: {
        click: e => {
          const item = menuItemOf(e.target);
          if (item) {
            // Run the item's action, then close back to More
            run(menuParts.get(item)!.action);
            dispatch({ type: 'select' });
            return;
          }
          const b = controlOf(e.target);
          if (!b) return;
          const { action } = parts.get(b)!;
          if (action.type === 'menu') dispatch({ type: 'open', via: 'click', checked: toolbarMenuChecked(menuItems) });
          else run(action);
        },
        keydown: e => {
          if (e.defaultPrevented) return;
          // The menu's keys come first; each is handled here (prevented: the element's shortcuts,
          // Esc's clearSelection included, skip a prevented key), but Tab moves focus on
          if (menuItemOf(e.target)) {
            const event = toolbarMenuKey(e, 'menu');
            if (!event) return;
            if (event.type !== 'close' || event.reason !== 'tab') e.preventDefault();
            dispatch(event);
            return;
          }
          const b = controlOf(e.target);
          const key = b?.dataset['focusKey'];
          if (!key) return;
          if (key === 'more') {
            let event = toolbarMenuKey(e, 'button');
            if (event?.type === 'open') event = { ...event, checked: toolbarMenuChecked(menuItems) };
            else if (!event && I.menuOpen.peek()) {
              // More itself holding focus with its menu open: Esc and Tab close it too
              const close = toolbarMenuKey(e, 'menu');
              if (close?.type === 'close') event = close;
            }
            if (event) {
              if (event.type !== 'close' || event.reason !== 'tab') e.preventDefault();
              dispatch(event);
              return;
            }
          }
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
          const item = menuItemOf(e.target);
          if (item) {
            // The menu's items are not tab stops: More stands for them in the roving set
            lastFocus.set('more');
            const key = item.dataset['focusKey'];
            dispatch({ type: 'focus', index: menuItems.findIndex(i => i.focusKey === key) });
            return;
          }
          const key = controlOf(e.target)?.dataset['focusKey'];
          if (key) lastFocus.set(key);
        },
      },
    },
    menu,
    end,
  );
  // Built detached (D26): attached while open
  menu.remove();
  toolbars.set(dom, bar);

  // ── The legend's width while it sits in the toolbar ──────
  let legendObserver: ResizeObserver | null = null;
  /** Observe the legend while it may sit in the toolbar (its observer reports 0 while it is elsewhere). */
  const watchLegend = (on: boolean): void => {
    if (on === (legendObserver !== null)) return;
    if (!on) {
      legendObserver!.disconnect();
      legendObserver = null;
      return;
    }
    const Observer = host.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) return;
    // A measurement, outside the flush: what the layout reads next
    legendObserver = new Observer(() => legendW.set(dom.legend.parentNode === bar ? dom.legend.offsetWidth : 0));
    legendObserver.observe(dom.legend);
  };

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

  /** The icon, first, in its own place (replaced when it changes). */
  const updateIcon = (b: HTMLButtonElement, p: ButtonParts, icon: ToolbarIcon | null): void => {
    if (p.icon === icon) return;
    p.svg?.remove();
    p.icon = icon;
    p.svg = icon ? toolbarIcon(icon) : null;
    if (p.svg) b.prepend(p.svg);
  };

  /** Icon first, then the text: in `span.gantt-tb-label` after an icon, else the button's own text. */
  const updateContent = (b: HTMLButtonElement, p: ButtonParts, item: ToolbarItem): void => {
    updateIcon(b, p, item.icon);
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
    setAttr(b, 'aria-pressed', item.pressed === null ? null : String(item.pressed));
    setAttr(b, 'aria-haspopup', item.haspopup);
    setAttr(b, 'aria-expanded', item.expanded === null ? null : String(item.expanded));
    // Points at the menu only while it exists
    setAttr(b, 'aria-controls', item.expanded === true ? MENU_ID : null);
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

  // ── Menu nodes ───────────────────────────────────────────
  const createMenuItem = (item: ToolbarMenuItem): HTMLButtonElement => {
    let b = menuNodes.get(item.focusKey);
    if (!b) {
      const label = h('span', { class: 'gantt-tb-label' });
      b = h('button', { attrs: { type: 'button', tabindex: -1 }, dataset: { focusKey: item.focusKey } }, label);
      menuParts.set(b, { icon: null, svg: null, label, text: null, action: item.action });
      menuNodes.set(item.focusKey, b);
    }
    return b;
  };
  const updateMenuItem = (b: HTMLButtonElement, item: ToolbarMenuItem): void => {
    const p = menuParts.get(b)!;
    p.action = item.action;
    setAttr(b, 'class', item.className);
    setAttr(b, 'role', item.role);
    setAttr(b, 'aria-checked', item.checked === null ? null : String(item.checked));
    updateIcon(b, p, item.icon);
    setText(p.label!, item.text);
  };
  const createSection = (section: ToolbarMenuSection): HTMLElement => {
    let el = sectionNodes.get(section.key);
    if (!el) sectionNodes.set(section.key, (el = h('div', { attrs: { role: 'group' } })));
    return el;
  };
  const updateSection = (el: HTMLElement, section: ToolbarMenuSection): void => {
    setAttr(el, 'class', section.className);
    setAttr(el, 'aria-label', section.ariaLabel);
    reconcile(el, section.items, item => item.focusKey, createMenuItem, updateMenuItem, null, detach);
  };

  return {
    paint() {
      const m = model();
      const open = m !== null && I.menuOpen() && m.layout.menu !== null;
      items = m ? toolbarItems(m.layout.groups) : [];
      menuItems = m ? toolbarMenuItems(m.layout.menu) : [];
      const tabStop = toolbarTabStop(items, lastFocus());

      // Controls that go away lose focus: the focus-restore region gives it back. A focused More
      // or menu item going away (the menu closed by a resize, everything fits again) hands it to
      // the toolbar's tab stop instead of the timeline
      const focused = focusKeyOf(shadow.activeElement);
      const gone =
        focused !== null &&
        (focused === 'more' || focused.startsWith('menu:')) &&
        !items.some(i => i.focusKey === focused) &&
        !(open && menuItems.some(i => i.focusKey === focused));
      if (gone && tabStop !== null) ctx.focus.request(tabStop);
      else ctx.focus.capture();

      showNode(dom.toolbarContainer, bar, m !== null);
      watchLegend(m?.legend === true);
      if (!m) return;

      setAttr(bar, 'aria-label', m.label);
      // The menu first (right after the groups), so the groups stay contiguous before their anchor
      showNode(bar, menu, open, end);
      reconcile(
        bar,
        m.layout.groups,
        group => group.key,
        createGroup,
        (el, group) => updateGroup(el, group, tabStop),
        open ? menu : end,
        detach,
      );
      if (open) {
        setAttr(menu, 'aria-label', m.more);
        reconcile(menu, m.layout.menu!, section => section.key, createSection, updateSection, null, detach);
      }
    },
    disconnect() {
      // A reconnected chart starts with its menu closed and observes its legend again
      if (I.menuOpen.peek()) {
        active = -1;
        setOpen(false);
      }
      watchLegend(false);
    },
  };
}

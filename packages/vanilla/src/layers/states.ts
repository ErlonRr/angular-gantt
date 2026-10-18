/**
 * @file states.ts
 * States region: the box that covers the chart body while it is not ready (`graph.chartState`,
 * core `resolveChartState`: loading with no rows, the consumer's `errorMessage` or a failed first
 * data-source page, no rows at all). Flushed after the task list.
 *
 *   div.gantt-state.gantt-state--loading|--error|--empty[part=state]   `dom.stateBox`: the last
 *                                                                       child of `.gantry-main`,
 *                                                                       attached while
 *                                                                       `kind !== 'ready'` (D27)
 *     loading → div.gantt-skeleton[aria-hidden] > div.gantt-skeleton-row
 *                 > span.gantt-skeleton-name + span.gantt-skeleton-bar        (core `skeletonRows`)
 *               + span.gantt-state-message   `labels.loading`, visually hidden (assistive text)
 *     error   → div.gantt-state-box[role=alert]
 *                 > p.gantt-state-title + p.gantt-state-message
 *                 + button.gantt-state-retry[data-focus-key=retry]
 *     empty   → div.gantt-state-box > slot[name=empty] (fallback: p.gantt-state-message)
 *
 * The box sits from the header height down (`--gantry-header-h`, `styles/states.css.ts`), so
 * both headers stay visible. The skeleton's rows and blocks are placed through the CSSOM from
 * core `skeletonRows` (no block in the panel in the chart view, none in the timeline in the
 * table view); its shimmer stops under `prefers-reduced-motion`.
 *
 * Retry emits `retry` (`ctx.emit('retry', { source })`: `'error'` for `chartState.retry ===
 * 'event'`, `'dataSource'` otherwise) and, for a data source, calls `dataSource.retry()`. The
 * error box is the alert (the engine leaves `.gantt-sr-alert` empty in the error state, as
 * Angular). The host's `aria-busy` (`chartState.busy`) is the host region's; the task-list footer
 * shows only while `chartState.footer` (task-list region).
 */

import { bodyHeight, skeletonRows, type SkeletonBlock, type SkeletonRow } from '@gantryjs/core';
import { h } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setStyleProp, setText, toggleClass } from '../dom/patch';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';

/** A skeleton row's blocks. */
interface RowParts {
  readonly name: HTMLElement;
  readonly bar: HTMLElement;
}

const KINDS = ['loading', 'error', 'empty'] as const;

export function createStatesLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom } = ctx;
  const box = dom.stateBox;

  // ── Loading: placeholder rows ─────────────────────────
  const skeleton = h('div', { class: 'gantt-skeleton', attrs: { 'aria-hidden': 'true' } });
  // The skeleton is decoration: its text for assistive technologies, visually hidden
  const loadingMessage = h('span', { class: 'gantt-state-message' });
  const rowParts = new WeakMap<Element, RowParts>();
  const createRow = (): HTMLElement => {
    const row = h('div', { class: 'gantt-skeleton-row' });
    rowParts.set(row, {
      name: h('span', { class: 'gantt-skeleton-name' }),
      bar: h('span', { class: 'gantt-skeleton-bar' }),
    });
    return row;
  };
  const place = (el: HTMLElement, block: SkeletonBlock): void => {
    setStyleProp(el, 'left', `${block.x}px`);
    setStyleProp(el, 'top', `${block.y}px`);
    setStyleProp(el, 'width', `${block.width}px`);
    setStyleProp(el, 'height', `${block.height}px`);
  };
  const updateRow = (row: HTMLElement, r: SkeletonRow): void => {
    const { name, bar } = rowParts.get(row)!;
    setStyleProp(row, 'top', `${r.y}px`);
    setStyleProp(row, 'height', `${r.height}px`);
    // Name first, then bar; a block with no room is left out
    showNode(row, name, r.name !== null, row.firstChild === name ? name.nextSibling : row.firstChild);
    showNode(row, bar, r.bar !== null);
    if (r.name) place(name, r.name);
    if (r.bar) place(bar, r.bar);
  };

  // ── Error: title, message, Retry ──────────────────────
  const onRetry = (): void => {
    const retry = G.chartState.peek().retry;
    if (retry === null) return;
    ctx.emit('retry', { source: retry === 'event' ? 'error' : 'dataSource' });
    if (retry === 'dataSource') void I.dataSource.peek()?.retry();
  };
  const title = h('p', { class: 'gantt-state-title' });
  const message = h('p', { class: 'gantt-state-message' });
  const retryButton = h('button', {
    class: 'gantt-state-retry',
    attrs: { type: 'button' },
    dataset: { focusKey: 'retry' },
    on: { click: onRetry },
  });
  const errorBox = h('div', { class: 'gantt-state-box', attrs: { role: 'alert' } }, title, message);

  // ── Empty: the consumer's slotted content, else the message ──
  const emptyMessage = h('p', { class: 'gantt-state-message' });
  const emptyBox = h('div', { class: 'gantt-state-box' }, h('slot', { attrs: { name: 'empty' } }, emptyMessage));

  return {
    paint() {
      const state = G.chartState();
      // Retry may hold focus: the focus-restore region moves it when the box goes away
      ctx.focus.capture();
      showNode(dom.main, box, state.kind !== 'ready');
      if (state.kind === 'ready') return;

      for (const kind of KINDS) toggleClass(box, `gantt-state--${kind}`, kind === state.kind);
      const content =
        state.kind === 'loading' ? [skeleton, loadingMessage] : [state.kind === 'error' ? errorBox : emptyBox];
      if (box.childNodes.length !== content.length || content.some((node, i) => box.childNodes[i] !== node)) {
        box.replaceChildren(...content);
      }

      if (state.kind === 'loading') {
        const view = I.viewOverride();
        setText(loadingMessage, state.message ?? '');
        const rows = skeletonRows({
          viewportHeight: bodyHeight(I.canvasH(), G.headerHeight()),
          rowHeight: G.config().rowHeight,
          panelWidth: view === 'chart' ? 0 : G.panelPx(),
          timelineWidth: view === 'table' ? 0 : I.canvasW(),
        });
        reconcile(skeleton, rows, r => String(r.key), createRow, updateRow);
      } else if (state.kind === 'error') {
        setText(title, state.title ?? '');
        setText(message, state.message ?? '');
        setText(retryButton, G.i18n().labels.retry);
        showNode(errorBox, retryButton, state.retry !== null);
      } else {
        setText(emptyMessage, state.message ?? '');
      }
    },
  };
}

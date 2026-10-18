/**
 * @file states.css.ts
 * The chart states over the body (div.gantt-state, layers/states.ts): the loading skeleton (its
 * shimmer off under reduced motion), the error box with its Retry button and the empty box.
 * Positioned from the header height down (--gantry-header-h, written on the wrapper by the host
 * region), so both headers stay visible; opaque, so nothing of the chart shows through.
 */

export const STATES_CSS = `
    /* ── Chart states (loading · error · empty) ─────────── */
    .gantt-state {
      position: absolute; left: 0; right: 0; bottom: 0; top: var(--gantry-header-h, 0px); z-index: 13;
      overflow: hidden; background: var(--gantt-bg); color: var(--gantt-text);
    }
    .gantt-state--error, .gantt-state--empty {
      display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 24px;
    }
    .gantt-state-box { display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: 420px; text-align: center; }
    .gantt-state-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--gantt-text); }
    .gantt-state-message { margin: 0; font-size: 13px; color: var(--gantt-text-sec); }
    /* Loading: the skeleton is decoration; its text is for assistive technologies only */
    .gantt-state--loading .gantt-state-message {
      position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;
    }
    .gantt-state-retry {
      box-sizing: border-box; min-width: 32px; min-height: 32px; margin-top: 10px; padding: 0 14px;
      font: inherit; font-size: 12px; cursor: pointer; border-radius: 6px;
      border: 1px solid var(--gantt-border); background: var(--gantt-panel-bg); color: var(--gantt-text);
    }
    .gantt-state-retry:hover { border-color: var(--gantt-text-muted); }
    .gantt-state-retry:focus-visible { outline: 2px solid var(--gantt-focus-ring); outline-offset: 2px; }

    /* Loading: placeholder rows, placed through the CSSOM from the core skeleton model */
    .gantt-skeleton { position: absolute; inset: 0; }
    .gantt-skeleton-row { position: absolute; left: 0; right: 0; box-sizing: border-box; border-bottom: 1px solid var(--gantt-grid-line); }
    .gantt-skeleton-name, .gantt-skeleton-bar {
      position: absolute; border-radius: 4px;
      background-color: color-mix(in srgb, var(--gantt-text-muted) 18%, transparent);
      background-image: linear-gradient(90deg, transparent, color-mix(in srgb, var(--gantt-bg) 60%, transparent), transparent);
      background-size: 200% 100%; background-repeat: no-repeat;
      animation: gantt-skeleton-shimmer 1.6s ease-in-out infinite;
    }
    @keyframes gantt-skeleton-shimmer { from { background-position: 150% 0; } to { background-position: -50% 0; } }

    @media (prefers-reduced-motion: reduce) {
      .gantt-skeleton-name, .gantt-skeleton-bar { animation: none; background-image: none; }
    }
`;

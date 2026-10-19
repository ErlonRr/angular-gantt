// Pane widths don't animate before the chart settles (Gantry 2 phase 10): `.gantry-main.is-settling`
// (no width transition) stays until a frame after the first render, so options assigned after the
// element connected (React, Svelte) don't slide the panel while `initialScroll` reads the viewport.
// A reconnect settles again.
import { describe, it, expect, afterEach } from 'vitest';
import type { GanttTask } from '@gantryjs/core';
import type { GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const TASKS: GanttTask[] = [{ id: 'a', name: 'A', start: new Date(2026, 1, 2), end: new Date(2026, 1, 20) }];

let el: GantryElement | null = null;
const main = () => el!.shadowRoot!.querySelector('.gantry-main')!;
const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));

afterEach(() => {
  el?.remove();
  el = null;
});

describe('pane transitions while settling', () => {
  it('stay off until a frame after the first render, and again after a reconnect', async () => {
    el = document.createElement('gantry-element');
    document.body.appendChild(el);
    el.tasks = TASKS;
    el.options = { panel: { width: 420 } };
    expect(main().classList.contains('is-settling')).toBe(true);
    getEngine(el).flushSync();
    expect(main().classList.contains('is-settling')).toBe(true);
    await frame();
    await frame();
    expect(main().classList.contains('is-settling')).toBe(false);

    el.remove();
    expect(main().classList.contains('is-settling')).toBe(true);
    document.body.appendChild(el);
    getEngine(el).flushSync();
    await frame();
    await frame();
    expect(main().classList.contains('is-settling')).toBe(false);
  });
});

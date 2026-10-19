// What the consumer sets before the chart first paints is the announcement baseline (as in Angular):
// the React and Svelte wrappers assign their props after the element connected, so a zoom level or a
// selection set that way must not be read out on page load. Changes after the first render are.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ANNOUNCE_DEBOUNCE, ViewMode, type GanttTask } from '@gantryjs/core';
import type { GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const TASKS: GanttTask[] = [{ id: 'a', name: 'A', start: new Date(2026, 1, 2), end: new Date(2026, 1, 20) }];

let el: GantryElement | null = null;
const live = () => el!.shadowRoot!.querySelector('.gantt-sr-live')!.textContent ?? '';

afterEach(() => {
  el?.remove();
  el = null;
  vi.useRealTimers();
});

describe('announcement baseline', () => {
  it('options assigned after connecting, before the first render, are not announced', () => {
    vi.useFakeTimers();
    el = document.createElement('gantry-element');
    el.style.height = '400px';
    document.body.appendChild(el);
    el.tasks = TASKS;
    el.options = { initialScroll: false, showToday: false, viewMode: ViewMode.Week };
    getEngine(el).flushSync();
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    expect(live().trim()).toBe('');

    // After the first render a change is read out
    el.zoomIn();
    getEngine(el).flushSync();
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
    expect(live()).toMatch(/\S/);
  });
});

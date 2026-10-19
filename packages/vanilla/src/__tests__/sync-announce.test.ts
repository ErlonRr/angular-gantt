// A sync group's zoom is announced once: by the chart the user zoomed. The other members still
// show the level, emit `view-mode-change` and save their state, but their live regions stay quiet
// (with N charts a screen reader would otherwise hear the same zoom N times).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ANNOUNCE_DEBOUNCE, createGanttSyncGroup, ViewMode, type GanttTask } from '@gantryjs/core';
import type { GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const TASKS: GanttTask[] = [{ id: 'a', name: 'A', start: new Date(2026, 1, 2), end: new Date(2026, 1, 20) }];

const charts: GantryElement[] = [];

function chart(group: ReturnType<typeof createGanttSyncGroup>): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, {
    tasks: TASKS,
    options: { initialScroll: false, showToday: false, viewMode: ViewMode.Week },
    syncGroup: group,
  });
  document.body.appendChild(el);
  charts.push(el);
  getEngine(el).flushSync();
  return el;
}

const live = (el: GantryElement) => el.shadowRoot!.querySelector('.gantt-sr-live')!.textContent ?? '';

afterEach(() => {
  for (const el of charts.splice(0)) el.remove();
  vi.useRealTimers();
});

describe('sync group: zoom announcements', () => {
  it('announces the zoom in the chart the user zoomed only; the others follow quietly', () => {
    vi.useFakeTimers();
    const group = createGanttSyncGroup();
    const a = chart(group);
    const b = chart(group);
    const changes: string[] = [];
    b.addEventListener('view-mode-change', () => changes.push('b'));

    a.zoomIn();
    getEngine(a).flushSync();
    getEngine(b).flushSync();
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);

    expect(getEngine(b).graph.viewMode.peek()).toBe(getEngine(a).graph.viewMode.peek());
    expect(getEngine(a).graph.viewMode.peek()).not.toBe(ViewMode.Week);
    expect(live(a)).toMatch(/\S/);
    expect(live(b).trim()).toBe('');
    // The follower still reports its own change
    expect(changes).toEqual(['b']);
  });
});

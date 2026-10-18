// Auto-scroll near the viewport edges while dragging (D13).
import { describe, it, expect } from 'vitest';
import { AUTO_SCROLL_EDGE, AUTO_SCROLL_MAX_STEP, autoScrollDelta } from '../index';

describe('autoScrollDelta', () => {
  it('uses the roadmap values', () => {
    expect(AUTO_SCROLL_EDGE).toBe(32);
    expect(AUTO_SCROLL_MAX_STEP).toBe(18);
  });

  it('does not scroll away from the edges', () => {
    expect(autoScrollDelta(500, 0, 1000)).toBe(0);
    expect(autoScrollDelta(32, 0, 1000)).toBe(0);
    expect(autoScrollDelta(968, 0, 1000)).toBe(0);
  });

  it('scrolls back near the start and forward near the end', () => {
    expect(autoScrollDelta(20, 0, 1000)).toBeLessThan(0);
    expect(autoScrollDelta(980, 0, 1000)).toBeGreaterThan(0);
  });

  it('speeds up linearly towards the edge, from 1 px to the maximum', () => {
    expect(autoScrollDelta(31.9, 0, 1000)).toBe(-1);
    expect(autoScrollDelta(16, 0, 1000)).toBe(-9);
    expect(autoScrollDelta(0, 0, 1000)).toBe(-AUTO_SCROLL_MAX_STEP);
    expect(autoScrollDelta(968.1, 0, 1000)).toBe(1);
    expect(autoScrollDelta(984, 0, 1000)).toBe(9);
    expect(autoScrollDelta(1000, 0, 1000)).toBe(AUTO_SCROLL_MAX_STEP);
    const steps = [30, 25, 20, 15, 10, 5, 0].map(p => -autoScrollDelta(p, 0, 1000));
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it('stays at the maximum past the viewport', () => {
    expect(autoScrollDelta(-200, 0, 1000)).toBe(-18);
    expect(autoScrollDelta(1300, 0, 1000)).toBe(18);
  });

  it('works in any coordinates (e.g. a viewport box in client px)', () => {
    expect(autoScrollDelta(310, 300, 900)).toBe(autoScrollDelta(10, 0, 600));
    expect(autoScrollDelta(890, 300, 900)).toBe(autoScrollDelta(590, 0, 600));
    expect(autoScrollDelta(600, 300, 900)).toBe(0);
  });

  it('honours a custom edge and maximum', () => {
    expect(autoScrollDelta(0, 0, 1000, 64, 40)).toBe(-40);
    expect(autoScrollDelta(32, 0, 1000, 64, 40)).toBe(-20);
    expect(autoScrollDelta(40, 0, 1000, 32, 40)).toBe(0);
  });

  it('splits a viewport narrower than two zones between them', () => {
    expect(autoScrollDelta(10, 0, 40)).toBeLessThan(0);
    expect(autoScrollDelta(30, 0, 40)).toBeGreaterThan(0);
    expect(autoScrollDelta(20, 0, 40)).toBe(0);
  });

  it('never scrolls for an empty viewport or a non-positive edge or maximum', () => {
    expect(autoScrollDelta(0, 0, 0)).toBe(0);
    expect(autoScrollDelta(5, 10, 0)).toBe(0);
    expect(autoScrollDelta(0, 0, 1000, 0)).toBe(0);
    expect(autoScrollDelta(0, 0, 1000, 32, 0)).toBe(0);
    expect(autoScrollDelta(Number.NaN, 0, 1000)).toBe(0);
  });
});

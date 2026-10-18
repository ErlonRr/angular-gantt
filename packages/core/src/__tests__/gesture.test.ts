// Pointer gesture machine (D13): mouse drag threshold, touch / pen long-press, pan, release.
import { describe, it, expect } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
  TOUCH_SLOP_PX,
  cancelGesture,
  endGesture,
  gestureKind,
  longPressGesture,
  moveGesture,
  startGesture,
  type GestureState,
} from '../index';

const press = (pointerType: string, time = 1000): GestureState => startGesture({ pointerType, x: 100, y: 50, time });

describe('gesture constants', () => {
  it('match the roadmap values', () => {
    expect(DRAG_THRESHOLD_PX).toBe(3);
    expect(LONG_PRESS_MS).toBe(350);
    expect(TOUCH_SLOP_PX).toBe(8);
  });
});

describe('gestureKind', () => {
  it('long-presses touch and pen; mouse, empty and unknown pointer types drag after a move', () => {
    expect(gestureKind('touch')).toBe('touch');
    expect(gestureKind('pen')).toBe('touch');
    expect(gestureKind('mouse')).toBe('mouse');
    expect(gestureKind('')).toBe('mouse');
    expect(gestureKind('stylus-x')).toBe('mouse');
  });
});

describe('startGesture', () => {
  it('starts pending at the press position', () => {
    expect(press('mouse')).toEqual({
      kind: 'mouse',
      phase: 'pending',
      startX: 100,
      startY: 50,
      x: 100,
      y: 50,
      startTime: 1000,
    });
    expect(startGesture({ pointerType: '', x: 1, y: 2 }).startTime).toBe(0);
  });
});

describe('mouse gestures', () => {
  it('stay pending below the threshold and drag from it on', () => {
    const s = press('mouse');
    const small = moveGesture(s, 102, 51);
    expect(small.phase).toBe('pending');
    expect(small).toMatchObject({ x: 102, y: 51, startX: 100, startY: 50 });
    expect(moveGesture(s, 100 + DRAG_THRESHOLD_PX, 50).phase).toBe('dragging');
    // Euclidean distance: 2.2 px on both axes is 3.1 px away, 2 px on both is 2.8 px
    expect(moveGesture(s, 102.2, 52.2).phase).toBe('dragging');
    expect(moveGesture(s, 102, 52).phase).toBe('pending');
    expect(moveGesture(s, 100, 50 - 3).phase).toBe('dragging');
  });

  it('keep dragging once started, even back at the start', () => {
    const dragging = moveGesture(press('mouse'), 110, 50);
    const back = moveGesture(dragging, 100, 50);
    expect(back.phase).toBe('dragging');
    expect(back.x).toBe(100);
  });

  it('ignore the long-press timer', () => {
    const s = press('mouse');
    expect(longPressGesture(s)).toBe(s);
    expect(longPressGesture(s, 5000)).toBe(s);
  });

  it('end as a click without a drag and as a drop after one', () => {
    expect(endGesture(press('mouse'))).toBe('click');
    expect(endGesture(moveGesture(press('mouse'), 102, 50))).toBe('click');
    expect(endGesture(moveGesture(press('mouse'), 120, 50))).toBe('drop');
  });

  it('never pan', () => {
    expect(moveGesture(press('mouse'), 200, 200).phase).toBe('dragging');
  });
});

describe('touch and pen gestures', () => {
  it('drag after a long press inside the slop', () => {
    for (const type of ['touch', 'pen']) {
      const s = moveGesture(press(type), 100 + TOUCH_SLOP_PX, 50);
      expect(s.phase).toBe('pending');
      const held = longPressGesture(s, 1000 + LONG_PRESS_MS);
      expect(held.phase).toBe('dragging');
      // Moving now drags (no pan)
      const moved = moveGesture(held, 300, 50);
      expect(moved.phase).toBe('dragging');
      expect(endGesture(moved)).toBe('drop');
    }
  });

  it('accept the timer without a time, and ignore a timer that fired early', () => {
    expect(longPressGesture(press('touch')).phase).toBe('dragging');
    const s = press('touch');
    expect(longPressGesture(s, 1000 + LONG_PRESS_MS - 1)).toBe(s);
  });

  it('pan when they move beyond the slop before the long press', () => {
    const s = moveGesture(press('touch'), 100, 50 + TOUCH_SLOP_PX + 1);
    expect(s.phase).toBe('panning');
    // Panning is final: the timer and later moves change nothing
    expect(longPressGesture(s, 99_999)).toBe(s);
    expect(moveGesture(s, 100, 50)).toBe(s);
    expect(endGesture(s)).toBe('none');
  });

  it('do not drag on the mouse threshold', () => {
    expect(moveGesture(press('touch'), 100 + DRAG_THRESHOLD_PX + 1, 50).phase).toBe('pending');
  });

  it('end as a tap without a long press or a pan', () => {
    expect(endGesture(press('touch'))).toBe('tap');
    expect(endGesture(moveGesture(press('pen'), 104, 52))).toBe('tap');
  });
});

describe('cancelGesture', () => {
  it('finishes the gesture: nothing changes it any more and the release is none', () => {
    const dragging = moveGesture(press('mouse'), 120, 50);
    const done = cancelGesture(dragging);
    expect(done.phase).toBe('done');
    expect(moveGesture(done, 0, 0)).toBe(done);
    expect(longPressGesture(cancelGesture(press('touch')))).toMatchObject({ phase: 'done' });
    expect(endGesture(done)).toBe('none');
    expect(cancelGesture(done)).toBe(done);
  });
});

describe('purity', () => {
  it('never mutates the state it gets', () => {
    const s = Object.freeze(press('touch'));
    expect(() => moveGesture(s, 120, 50)).not.toThrow();
    expect(() => longPressGesture(s)).not.toThrow();
    expect(() => cancelGesture(s)).not.toThrow();
    expect(s.phase).toBe('pending');
  });
});

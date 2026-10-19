// ─────────────────────────────────────────────────────────────
//  Tests — interaction/announce.ts (live-region sentences)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ANNOUNCE_LABELS,
  announceAmount,
  announceKeyboardEdit,
  announceMove,
  announceProgress,
  announceResize,
  announceSelection,
  announceZoom,
  resolveAnnounceLabels,
} from '../interaction/announce';
import type { KeyboardEditEvent } from '../interaction/keyboard-edit';

const day = (m: number, d: number) => new Date(2026, m, d);

describe('announce', () => {
  it('selection count', () => {
    expect(announceSelection(0)).toBe('Selection cleared');
    expect(announceSelection(1)).toBe('1 task selected');
    expect(announceSelection(4)).toBe('4 tasks selected');
  });

  it('moves and resizes in days or hours', () => {
    expect(announceMove({ daysMoved: 3 }, 'Backend')).toBe('Backend moved 3 days later');
    expect(announceMove({ daysMoved: -1 }, 'Backend')).toBe('Backend moved 1 day earlier');
    expect(announceMove({ daysMoved: 2 / 24 }, 'Deploy')).toBe('Deploy moved 2 hours later');
    expect(announceResize({ handle: 'right', daysDelta: 2 }, 'Backend')).toBe('Backend end moved 2 days later');
    expect(announceResize({ handle: 'left', daysDelta: -1 }, 'Backend')).toBe('Backend start moved 1 day earlier');
    expect(announceAmount(-5 / 24)).toEqual({ amount: -5, unit: 'hour' });
  });

  it('uses the given unit instead of guessing it', () => {
    expect(announceAmount(1, 'hour')).toEqual({ amount: 24, unit: 'hour' });
    expect(announceAmount(25 / 24, 'hour')).toEqual({ amount: 25, unit: 'hour' });
    expect(announceAmount(2.0000000001, 'day')).toEqual({ amount: 2, unit: 'day' });
    expect(announceAmount(-0.01, 'day')).toEqual({ amount: 0, unit: 'day' });
    expect(announceMove({ daysMoved: 1 }, 'Deploy', undefined, 'hour')).toBe('Deploy moved 24 hours later');
    expect(announceResize({ handle: 'left', daysDelta: -1 / 24 }, 'Deploy', undefined, 'hour')).toBe(
      'Deploy start moved 1 hour earlier',
    );
  });

  it('progress and zoom', () => {
    expect(announceProgress(64.6, 'Backend')).toBe('Backend 65% complete');
    expect(announceZoom('Week')).toBe('Zoom: Week');
  });

  it('every sentence is translatable', () => {
    const it_ = {
      announceSelection: (n: number) => `${n} selezionate`,
      announceZoom: (l: string) => `Zoom: ${l.toLowerCase()}`,
    };
    expect(announceSelection(2, it_)).toBe('2 selezionate');
    expect(announceZoom('Settimana', it_)).toBe('Zoom: settimana');
    expect(resolveAnnounceLabels()).toBe(DEFAULT_ANNOUNCE_LABELS);
    expect(resolveAnnounceLabels(it_).announceProgress('X', 5)).toBe('X 5% complete');
    expect(DEFAULT_ANNOUNCE_LABELS.announceEditStart('Backend')).toMatch(/^Editing Backend\./);
    expect(DEFAULT_ANNOUNCE_LABELS.announceLinkCreated('A', 'B')).toBe('Linked A to B');
  });

  it('keyboard-edit commits', () => {
    const base = { taskId: 'a', oldStart: day(2, 10), oldEnd: day(2, 14) };
    const drag: KeyboardEditEvent = {
      kind: 'drag',
      event: { ...base, newStart: day(2, 12), newEnd: day(2, 16), daysMoved: 2 },
    };
    const resize: KeyboardEditEvent = {
      kind: 'resize',
      event: { ...base, edge: 'end', handle: 'right', newStart: day(2, 12), newEnd: day(2, 19), daysDelta: 3 },
    };
    const progress: KeyboardEditEvent = { kind: 'progress', event: { taskId: 'a', oldProgress: 40, newProgress: 45 } };
    expect(announceKeyboardEdit([], 'Backend')).toBe('Backend unchanged');
    expect(announceKeyboardEdit([drag], 'Backend')).toBe('Backend moved 2 days later');
    expect(announceKeyboardEdit([resize], 'Backend')).toBe('Backend end moved 3 days later');
    expect(announceKeyboardEdit([drag, resize, progress], 'Backend')).toBe(
      'Backend start moved 2 days later. Backend end moved 5 days later. Backend 45% complete',
    );

    // hour scale: +7 h move, +17 h resize — one unit for the whole sentence
    const hDrag: KeyboardEditEvent = { kind: 'drag', event: { ...drag.event, daysMoved: 7 / 24 } };
    const hResize: KeyboardEditEvent = {
      kind: 'resize',
      event: { ...base, edge: 'end', handle: 'right', newStart: day(2, 12), newEnd: day(2, 19), daysDelta: 17 / 24 },
    };
    expect(announceKeyboardEdit([hDrag, hResize], 'X', undefined, 'hour')).toBe(
      'X start moved 7 hours later. X end moved 24 hours later',
    );
    expect(announceKeyboardEdit([hDrag, hResize], 'X')).toBe('X start moved 7 hours later. X end moved 24 hours later');
  });
});

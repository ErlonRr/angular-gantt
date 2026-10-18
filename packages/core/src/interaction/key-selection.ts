// ─────────────────────────────────────────────────────────────
//  gantry · interaction/key-selection.ts
//  Selection modifiers of the keyboard commands, so a key goes
//  through the same `selectionClick` reducer as a pointer click:
//
//    Space        (toggle.select)  multi-select: toggle the row (as Ctrl + click)
//                                  single-select: select it (as a click)
//    Ctrl+Space   (toggle.select)  the same
//    Shift+Space  (toggle.extend)  range from the anchor (as Shift + click)
//    Enter        (activate)       select only this row (as a click)
// ─────────────────────────────────────────────────────────────

import type { SelectionModifierSource } from '../state/selection';
import type { Command } from './keymap';

/** The keymap commands that select a row or bar. */
export type KeySelectionCommand = Extract<Command, 'toggle.select' | 'toggle.extend' | 'activate'>;

/** `cmd` selects (Space, Shift+Space, Ctrl+Space, Enter). */
export function isKeySelectionCommand(cmd: Command | null): cmd is KeySelectionCommand {
  return cmd === 'toggle.select' || cmd === 'toggle.extend' || cmd === 'activate';
}

/**
 * The click modifiers that make `selectionClick` / `handleClick` do what `cmd` means, given the
 * policy's `multi` flag: pass the result where a binding passes a pointer event.
 */
export function keySelectionModifiers(cmd: KeySelectionCommand, multi: boolean): SelectionModifierSource {
  return {
    ctrlKey: multi && cmd === 'toggle.select',
    metaKey: false,
    shiftKey: multi && cmd === 'toggle.extend',
  };
}

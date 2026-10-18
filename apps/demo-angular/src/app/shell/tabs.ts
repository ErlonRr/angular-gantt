import { Directive, ElementRef, computed, contentChildren, forwardRef, inject, input, output } from '@angular/core';

/** Keys that move between the tabs of a horizontal tab list: the index they go to, or `null`. */
function targetIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * A WAI-ARIA tab list with automatic activation: one tab stop (the selected tab), ←/→ move to the
 * previous / next tab and select it (wrapping), Home / End go to the first / last one.
 *
 * ```html
 * <div class="gs-tabs" [appTabList]="tab()" tabPanel="code-panel" aria-label="Framework" (tabSelect)="tab.set($event)">
 *   @for (t of tabs; track t.id) {
 *     <button type="button" class="gs-tab" [appTab]="t.id" [id]="'tab-' + t.id">{{ t.label }}</button>
 *   }
 * </div>
 * <div id="code-panel" role="tabpanel" [attr.aria-labelledby]="'tab-' + tab()">…</div>
 * ```
 *
 * The page owns the selection: the list shows `appTabList` and asks for a change through
 * `tabSelect` (a click or a key), so a page can keep it in a service, the URL or storage.
 */
@Directive({
  selector: '[appTabList]',
  host: {
    role: 'tablist',
    '(keydown)': 'onKey($event)',
  },
})
export class TabListDirective<T> {
  /** The value of the selected tab. */
  readonly selected = input.required<T>({ alias: 'appTabList' });
  /** Id of the tab panel: the selected tab's `aria-controls`. */
  readonly tabPanel = input<string | null>(null);
  /** A tab was clicked or reached with the keyboard: select its value. */
  readonly tabSelect = output<T>();

  private readonly tabs = contentChildren<TabDirective<T>>(
    forwardRef(() => TabDirective),
    { descendants: true },
  );

  /**
   * Asks for `value` (a click or a key). Always emits: two keys pressed within one frame would
   * otherwise compare with a selection the page has not rendered yet.
   */
  select(value: T): void {
    this.tabSelect.emit(value);
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tabs = this.tabs();
    const from = tabs.findIndex(t => t.contains(e.target));
    const next = targetIndex(e.key, from < 0 ? tabs.findIndex(t => t.isSelected()) : from, tabs.length);
    const tab = next === null ? undefined : tabs[next];
    if (!tab) return;
    e.preventDefault();
    this.select(tab.value());
    tab.focus();
  }
}

/** A tab of an `[appTabList]`: `role=tab`, `aria-selected`, roving `tabindex` and `aria-controls`. */
@Directive({
  selector: '[appTab]',
  host: {
    role: 'tab',
    '[attr.aria-selected]': 'isSelected()',
    '[attr.aria-controls]': 'isSelected() ? list.tabPanel() : null',
    '[attr.tabindex]': 'isSelected() ? 0 : -1',
    '(click)': 'list.select(value())',
  },
})
export class TabDirective<T> {
  /** The value `tabSelect` emits for this tab. */
  readonly value = input.required<T>({ alias: 'appTab' });

  protected readonly list = inject<TabListDirective<T>>(TabListDirective);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly isSelected = computed(() => this.value() === this.list.selected());

  contains(node: EventTarget | null): boolean {
    return node instanceof Node && this.el.nativeElement.contains(node);
  }

  focus(): void {
    this.el.nativeElement.focus();
  }
}

/** Both directives, for a component's `imports`. */
export const TABS = [TabListDirective, TabDirective] as const;

import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { IconComponent } from './icon.component';

/** "Copy" button for code on a dark block (`.gs-copy`); says "Copied" for a moment and announces it. */
@Component({
  selector: 'app-copy-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { style: 'display: contents' },
  template: `
    <button type="button" class="gs-copy" [attr.aria-label]="label()" (click)="copy()">
      <app-icon [name]="copied() ? 'check' : 'copy'" />
      <span aria-hidden="true">{{ copied() ? 'Copied' : 'Copy' }}</span>
    </button>
    <span class="gs-sr-only" role="status">{{ status() }}</span>
  `,
})
export class CopyButtonComponent {
  readonly text = input.required<string>();
  /** Accessible name ("Copy the install command"). */
  readonly label = input('Copy');

  protected readonly copied = signal(false);
  protected readonly status = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected copy(): void {
    const done = (copied: boolean) => {
      this.copied.set(copied);
      this.status.set(copied ? 'Copied to the clipboard' : 'Copy failed: select the text and copy it');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.copied.set(false);
        this.status.set('');
      }, 1600);
    };
    if (!navigator.clipboard) return done(false);
    navigator.clipboard.writeText(this.text()).then(
      () => done(true),
      () => done(false),
    );
  }
}

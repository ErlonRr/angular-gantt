// The whole chart from the keyboard: the key map next to it, and an echo of what the chart's polite
// live region (`.gantt-sr-live`, `aria-live`) tells screen readers: selection, zoom, loading.
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { GantryComponent } from '@gantryjs/angular';
import { KEYBOARD_KEYS, KEYBOARD_LIVE_SELECTOR, KEYBOARD_OPTIONS, keyboardTasks } from 'demo-kit/gallery';
import { AppThemeService } from '../../../shell/app-theme.service';

@Component({
  selector: 'app-keyboard-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="gs-case">
      <gantry #chart class="gs-chart gs-case-chart" [series]="tasks" [options]="options" [darkMode]="dark()" />
      <!-- A plain paragraph, not a live region: screen readers already hear the chart's own -->
      <p class="gs-case-hint">
        Announced: {{ announced() || 'nothing yet. Tab into the chart, then select a row or zoom.' }}
      </p>
      <dl class="gs-case-keys">
        @for (k of keys; track $index) {
          <dt>
            @for (key of k.keys; track key) {
              <kbd class="gs-kbd">{{ key }}</kbd>
            }
          </dt>
          <dd>{{ k.area }}: {{ k.action }}</dd>
        }
      </dl>
    </div>
  `,
})
export class KeyboardExampleComponent {
  protected readonly dark = inject(AppThemeService).isDark;
  protected readonly options = KEYBOARD_OPTIONS;
  protected readonly keys = KEYBOARD_KEYS;
  protected readonly tasks = keyboardTasks(new Date());

  private readonly chart = viewChild.required<string, ElementRef<HTMLElement>>('chart', { read: ElementRef });
  protected readonly announced = signal('');

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Browser only, once the chart is in the DOM: watch the text of its live region
    afterNextRender(() => {
      const live = this.chart().nativeElement.querySelector(KEYBOARD_LIVE_SELECTOR);
      if (!live) return;
      const observer = new MutationObserver(() => {
        const text = live.textContent?.trim();
        if (text) this.announced.set(text);
      });
      observer.observe(live, { childList: true, characterData: true, subtree: true });
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}

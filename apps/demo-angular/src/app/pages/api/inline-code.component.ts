import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Text with Markdown code spans: `like this` becomes `<code class="gs-code-inline">`. Split on
 * backticks into text and code segments (no HTML parsing), for the manifest's descriptions and
 * the bullets of the Frameworks page.
 */
@Component({
  selector: 'app-inline-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (s of segments(); track $index) {
      @if (s.code) {
        <code class="gs-code-inline">{{ s.text }}</code>
      } @else {
        <ng-container>{{ s.text }}</ng-container>
      }
    }
  `,
})
export class InlineCodeComponent {
  readonly text = input.required<string>();

  protected readonly segments = computed(() =>
    this.text()
      .split('`')
      .map((text, i) => ({ text, code: i % 2 === 1 }))
      .filter(s => s.text !== ''),
  );
}

import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { CopyButtonComponent } from './copy-button.component';

/** A dark code block (`.gs-code`) with its file name and a Copy button. */
@Component({
  selector: 'app-code-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CopyButtonComponent],
  template: `
    <div class="gs-code" [class.gs-code--scroll]="scroll()">
      <div class="gs-code-head">
        <span>{{ file() }}</span>
        <app-copy-button [text]="code()" [label]="'Copy ' + file()" />
      </div>
      <pre tabindex="0" [attr.aria-label]="file() + ' code'"><code>{{ code() }}</code></pre>
    </div>
  `,
})
export class CodeBlockComponent {
  readonly code = input.required<string>();
  /** File name or language shown in the header ("main.ts"); not `title`, which would also be a tooltip on the host. */
  readonly file = input('code');
  /** Caps the height (scrolls inside). */
  readonly scroll = input(false, { transform: booleanAttribute });
}

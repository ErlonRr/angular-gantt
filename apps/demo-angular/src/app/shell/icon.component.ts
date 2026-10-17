import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICONS, type IconName } from 'demo-kit/icons';

/** A site icon (`demo-kit/icons`), decorative: label the control that holds it. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <svg
      aria-hidden="true"
      focusable="false"
      [attr.viewBox]="icon().viewBox"
      [attr.fill]="icon().fill ? 'currentColor' : 'none'"
      [attr.stroke]="icon().fill ? null : 'currentColor'"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      @for (d of icon().paths; track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  protected readonly icon = computed(() => ICONS[this.name()]);
}

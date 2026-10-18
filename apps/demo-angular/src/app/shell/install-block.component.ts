import { ChangeDetectionStrategy, Component, Injectable, computed, inject, input, signal } from '@angular/core';
import { PACKAGE_MANAGERS, installCommand, type PackageManager } from 'demo-kit/site';
import { CopyButtonComponent } from './copy-button.component';

const PM_KEY = 'gantry-site-pm';

/** The package manager the visitor picked, shared by every install block and remembered. */
@Injectable({ providedIn: 'root' })
export class PackageManagerService {
  private readonly _pm = signal<PackageManager>(this.load());
  readonly pm = this._pm.asReadonly();

  set(pm: PackageManager): void {
    this._pm.set(pm);
    try {
      localStorage.setItem(PM_KEY, pm);
    } catch {
      // Storage blocked: the choice lasts for this page
    }
  }

  private load(): PackageManager {
    try {
      const v = localStorage.getItem(PM_KEY);
      return (PACKAGE_MANAGERS as readonly string[]).includes(v ?? '') ? (v as PackageManager) : 'pnpm';
    } catch {
      return 'pnpm';
    }
  }
}

/** pnpm / npm / yarn / bun tabs over the install command, with a Copy button. */
@Component({
  selector: 'app-install-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CopyButtonComponent],
  template: `
    <div class="gs-install">
      <div class="gs-pm-tabs" role="tablist" aria-label="Package manager">
        @for (pm of managers; track pm) {
          <button
            type="button"
            role="tab"
            class="gs-pm-tab"
            [attr.aria-selected]="pm === pms.pm()"
            [attr.tabindex]="pm === pms.pm() ? 0 : -1"
            (click)="pms.set(pm)"
            (keydown)="onKey($event)"
          >
            {{ pm }}
          </button>
        }
      </div>
      <div class="gs-cmd" role="tabpanel" [attr.aria-label]="pms.pm() + ' install command'">
        <code><span class="gs-cmd-prompt">$ </span>{{ command() }}</code>
        <app-copy-button [text]="command()" label="Copy the install command" />
      </div>
    </div>
  `,
})
export class InstallBlockComponent {
  /** Package to install (`@gantry/vanilla`, `ngx-gantry`…). */
  readonly pkg = input.required<string>();

  protected readonly pms = inject(PackageManagerService);
  protected readonly managers = PACKAGE_MANAGERS;
  protected readonly command = computed(() => installCommand(this.pms.pm(), this.pkg()));

  /** Arrow keys, Home and End move between the tabs (WAI-ARIA tabs pattern). */
  protected onKey(e: KeyboardEvent): void {
    const i = this.managers.indexOf(this.pms.pm());
    const n = this.managers.length;
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    this.pms.set(this.managers[next]);
    const tabs = (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs?.[next]?.focus();
  }
}

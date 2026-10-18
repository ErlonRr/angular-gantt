import { ChangeDetectionStrategy, Component, Injectable, computed, inject, input, signal } from '@angular/core';
import { PACKAGE_MANAGERS, installCommand, type PackageManager } from 'demo-kit/site';
import { CopyButtonComponent } from './copy-button.component';
import { TABS } from './tabs';

const PM_KEY = 'gantry-site-pm';
/** Numbers the install blocks of a page: their panel ids must be unique. */
let nextBlock = 0;

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
  imports: [CopyButtonComponent, TABS],
  template: `
    <div class="gs-install">
      <div
        class="gs-pm-tabs"
        aria-label="Package manager"
        [appTabList]="pms.pm()"
        [tabPanel]="panelId"
        (tabSelect)="pms.set($event)"
      >
        @for (pm of managers; track pm) {
          <button type="button" class="gs-pm-tab" [appTab]="pm">{{ pm }}</button>
        }
      </div>
      <div class="gs-cmd" role="tabpanel" [id]="panelId" [attr.aria-label]="pms.pm() + ' install command'">
        <code><span class="gs-cmd-prompt">$ </span>{{ command() }}</code>
        <app-copy-button [text]="command()" label="Copy the install command" />
      </div>
    </div>
  `,
})
export class InstallBlockComponent {
  /** Package to install (`@gantryjs/vanilla`, `@gantryjs/angular`…). */
  readonly pkg = input.required<string>();

  protected readonly pms = inject(PackageManagerService);
  protected readonly managers = PACKAGE_MANAGERS;
  protected readonly command = computed(() => installCommand(this.pms.pm(), this.pkg()));
  protected readonly panelId = `gs-install-${nextBlock++}`;
}

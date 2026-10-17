// ─────────────────────────────────────────────────────────────
//  gantry-demo · shell/demo-frame.component.ts
//
//  The "semi-Storybook" content frame: a top bar (install + links)
//  above the live demo, and a collapsible Usage panel below it that
//  shows the active demo's blurb + copy-pasteable code snippet.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { demoForUrl, INSTALL_CMD, REPO_URL, NPM_URL, DOCS_URL } from './demo-registry';

@Component({
  selector: 'app-demo-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <!-- ── Top bar: install + links ─────────────────────────── -->
    <div class="topbar">
      <div class="crumb">
        @if (active(); as d) {
          <span class="cat">{{ d.category }}</span>
          <span class="sep">/</span>
          <b>{{ d.label }}</b>
        }
      </div>
      <div class="actions">
        <button class="install" type="button" (click)="copy(INSTALL, 'install')" [title]="'Copy: ' + INSTALL">
          <span class="mono">{{ INSTALL }}</span>
          <span class="cp">{{ copied() === 'install' ? '✓' : '⧉' }}</span>
        </button>
        <a [href]="NPM" target="_blank" rel="noopener">npm</a>
        <a [href]="REPO" target="_blank" rel="noopener">GitHub</a>
        <a [href]="DOCS" target="_blank" rel="noopener">Docs</a>
      </div>
    </div>

    <!-- ── Live preview ─────────────────────────────────────── -->
    <div class="preview">
      <router-outlet />
    </div>

    <!-- ── Usage panel ──────────────────────────────────────── -->
    @if (active(); as d) {
      <div class="usage" [class.open]="showCode()">
        <div class="usage-head">
          <button class="toggle" type="button" (click)="showCode.set(!showCode())">
            <span class="chev">{{ showCode() ? '▾' : '▸' }}</span> &lt;/&gt; Usage
          </button>
          <span class="blurb">{{ d.blurb }}</span>
          @if (showCode()) {
            <button class="copy" type="button" (click)="copy(d.usage, 'code')">
              {{ copied() === 'code' ? '✓ Copied' : 'Copy' }}
            </button>
          }
        </div>
        @if (showCode()) {
          <pre class="code"><code>{{ d.usage }}</code></pre>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        height: 100%;
        overflow: hidden;
      }

      /* Top bar */
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 14px;
        flex-shrink: 0;
        background: hsl(var(--card));
        border-bottom: 1px solid hsl(var(--border));
      }
      .crumb {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        min-width: 0;
      }
      .crumb .cat {
        font-family: var(--app-font-mono);
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: hsl(var(--primary));
      }
      .crumb .sep {
        color: hsl(var(--muted-fg));
      }
      .crumb b {
        color: hsl(var(--fg));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .install {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px 4px 10px;
        border-radius: var(--app-radius-sm);
        background: hsl(var(--muted));
        border: 1px solid hsl(var(--border));
        color: hsl(var(--fg));
        cursor: pointer;
      }
      .install .mono {
        font-family: var(--app-font-mono);
        font-size: 12px;
      }
      .install .cp {
        color: hsl(var(--muted-fg));
        font-size: 12px;
      }
      .install:hover {
        background: hsl(var(--accent));
      }
      .actions a {
        font-size: 12px;
        font-weight: 600;
        text-decoration: none;
        color: hsl(var(--muted-fg));
        padding: 4px 6px;
        border-radius: var(--app-radius-sm);
      }
      .actions a:hover {
        color: hsl(var(--fg));
        background: hsl(var(--accent));
      }

      /* Preview */
      .preview {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      /* Usage panel */
      .usage {
        flex-shrink: 0;
        border-top: 1px solid hsl(var(--border));
        background: hsl(var(--card));
        display: flex;
        flex-direction: column;
        max-height: 42vh;
      }
      .usage-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 7px 14px;
      }
      .toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        font-family: var(--app-font-mono);
        font-size: 12px;
        font-weight: 700;
        background: transparent;
        border: none;
        cursor: pointer;
        color: hsl(var(--fg));
      }
      .toggle .chev {
        color: hsl(var(--muted-fg));
      }
      .blurb {
        flex: 1;
        min-width: 0;
        font-size: 12px;
        color: hsl(var(--muted-fg));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .copy {
        flex-shrink: 0;
        padding: 3px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        border-radius: var(--app-radius-sm);
        border: 1px solid hsl(var(--border));
        background: hsl(var(--muted));
        color: hsl(var(--fg));
      }
      .copy:hover {
        background: hsl(var(--accent));
      }
      .code {
        margin: 0;
        padding: 12px 16px 16px;
        overflow: auto;
        font-family: var(--app-font-mono);
        font-size: 12px;
        line-height: 1.55;
        color: hsl(var(--fg));
        background: hsl(var(--bg));
        border-top: 1px solid hsl(var(--border));
      }
      .code code {
        white-space: pre;
      }
    `,
  ],
})
export class DemoFrameComponent {
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly active = computed(() => demoForUrl(this.url()));
  protected readonly showCode = signal(true);
  protected readonly copied = signal<string | null>(null);

  protected readonly INSTALL = INSTALL_CMD;
  protected readonly REPO = REPO_URL;
  protected readonly NPM = NPM_URL;
  protected readonly DOCS = DOCS_URL;

  protected copy(text: string, key: string): void {
    void navigator.clipboard?.writeText(text).then(() => {
      this.copied.set(key);
      setTimeout(() => this.copied.set(null), 1500);
    });
  }
}

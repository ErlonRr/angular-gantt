// ─────────────────────────────────────────────────────────────
//  gantry-demo · shell/demo-sidebar.component.ts
//
//  VS-Code-flavoured explorer sidebar: brand header, demos grouped
//  by category, and a theme toggle pinned to the bottom.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { AppThemeService } from './app-theme.service';
import { DEMOS, DEMO_CATEGORY_ORDER, DemoEntry, DemoCategory } from './demo-registry';

interface DemoGroup {
  category: DemoCategory;
  items:    DemoEntry[];
}

@Component({
  selector: 'app-demo-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <div class="brand">
      <span class="brand-mark">G</span>
      <span class="brand-text">
        <b>Gantry</b>
        <small>Angular Gantt · demos</small>
      </span>
    </div>

    <nav class="nav">
      @for (group of groups(); track group.category) {
        <div class="group">
          <div class="group-label">// {{ group.category.toLowerCase() }}</div>
          @for (demo of group.items; track demo.path) {
            <a
              class="item app-hover-lift"
              [routerLink]="'/' + demo.path"
              routerLinkActive="item--active"
            >
              <span class="item-icon">{{ demo.icon }}</span>
              <span class="item-body">
                <span class="item-label">{{ demo.label }}</span>
                <span class="item-desc">{{ demo.description }}</span>
              </span>
            </a>
          }
        </div>
      }
    </nav>

    <div class="footer">
      <button class="theme-btn" type="button" (click)="theme.cycle()"
              [attr.aria-label]="'Theme: ' + theme.label()">
        <span class="theme-icon">{{ theme.isDark() ? '🌙' : '☀' }}</span>
        <span>Theme: {{ theme.label() }}</span>
      </button>
      <div class="stack-badge">Zoneless · Signals · zero RxJS</div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 244px;
      flex-shrink: 0;
      height: 100%;
      background: hsl(var(--card));
      border-right: 1px solid hsl(var(--border));
      font-family: var(--app-font-sans);
      overflow: hidden;
    }

    /* ── Brand ── */
    .brand {
      display: flex; align-items: center; gap: 10px;
      padding: 16px 16px 14px;
      border-bottom: 1px solid hsl(var(--border));
      flex-shrink: 0;
    }
    .brand-mark {
      display: inline-flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border-radius: var(--app-radius-md);
      background: hsl(var(--primary)); color: hsl(var(--primary-fg));
      font-family: var(--app-font-mono); font-size: 12px; font-weight: 700;
      letter-spacing: -0.5px;
    }
    .brand-text { display: flex; flex-direction: column; line-height: 1.25; }
    .brand-text b { font-size: 14px; color: hsl(var(--fg)); }
    .brand-text small { font-size: 10.5px; color: hsl(var(--muted-fg)); }

    /* ── Nav ── */
    .nav { flex: 1; overflow-y: auto; padding: 8px; }
    .group { margin-bottom: 14px; }
    .group-label {
      font-family: var(--app-font-mono);
      font-size: 10.5px; font-weight: 600;
      color: hsl(var(--muted-fg));
      padding: 4px 8px 6px;
      letter-spacing: 0.3px;
    }

    .item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; margin-bottom: 3px;
      border-radius: var(--app-radius-md);
      text-decoration: none;
      border: 1px solid transparent;
      cursor: pointer;
    }
    .item:hover { background: hsl(var(--accent)); }
    .item--active {
      background: hsl(var(--primary) / 0.12);
      border-color: hsl(var(--primary) / 0.35);
    }
    .item-icon {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; flex-shrink: 0;
      border-radius: var(--app-radius-sm);
      background: hsl(var(--muted));
      color: hsl(var(--muted-fg));
      font-size: 13px;
    }
    .item--active .item-icon { background: hsl(var(--primary)); color: hsl(var(--primary-fg)); }
    .item-body { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
    .item-label { font-size: 13px; font-weight: 600; color: hsl(var(--fg)); }
    .item-desc {
      font-size: 10.5px; color: hsl(var(--muted-fg));
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* ── Footer ── */
    .footer {
      flex-shrink: 0; padding: 10px;
      border-top: 1px solid hsl(var(--border));
      display: flex; flex-direction: column; gap: 8px;
    }
    .theme-btn {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 7px 10px;
      border-radius: var(--app-radius-md);
      border: 1px solid hsl(var(--border));
      background: hsl(var(--muted));
      color: hsl(var(--fg));
      font-family: var(--app-font-sans); font-size: 12.5px; font-weight: 500;
      cursor: pointer;
      transition: background-color 0.12s ease;
    }
    .theme-btn:hover { background: hsl(var(--accent)); }
    .theme-btn:focus-visible {
      outline: 2px solid hsl(var(--ring)); outline-offset: 2px;
    }
    .theme-icon { font-size: 13px; }
    .stack-badge {
      font-family: var(--app-font-mono);
      font-size: 9.5px; color: hsl(var(--muted-fg));
      text-align: center; letter-spacing: 0.2px;
    }
  `],
})
export class DemoSidebarComponent {
  protected readonly theme = inject(AppThemeService);

  protected readonly groups = computed<DemoGroup[]>(() =>
    DEMO_CATEGORY_ORDER
      .map(category => ({
        category,
        items: DEMOS.filter(d => d.category === category),
      }))
      .filter(g => g.items.length > 0),
  );
}

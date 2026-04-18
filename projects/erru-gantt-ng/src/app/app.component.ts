import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="shell-nav">
      <span class="shell-brand">erru-gantt-ng</span>
      <nav>
        <a routerLink="/demo"       routerLinkActive="active">Demo</a>
        <a routerLink="/lazy"       routerLinkActive="active">Lazy Load</a>
        <a routerLink="/custom-bar" routerLinkActive="active">Custom Bar</a>
      </nav>
      <span class="shell-badge">Angular 20 · Zoneless · Signals</span>
    </header>
    <main class="shell-content">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    .shell-nav {
      display: flex; align-items: center; gap: 20px;
      padding: 0 16px; height: 44px; flex-shrink: 0;
      background: #0f172a; border-bottom: 1px solid #1e293b;
    }
    .shell-brand { font-weight: 700; font-size: 14px; color: #60a5fa; letter-spacing: .5px; }
    .shell-badge { margin-left: auto; font-size: 11px; color: #475569; }
    nav { display: flex; gap: 4px; }
    nav a {
      padding: 4px 12px; border-radius: 4px;
      color: #94a3b8; font-size: 13px; text-decoration: none;
      transition: color .1s, background .1s;
    }
    nav a:hover  { color: #e2e8f0; background: #1e293b; }
    nav a.active { color: #f1f5f9; background: #1e3a5f; }
    .shell-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
  `],
})
export class AppComponent {}

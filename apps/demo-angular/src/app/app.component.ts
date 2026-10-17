import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DemoSidebarComponent } from './shell/demo-sidebar.component';
import { DemoFrameComponent } from './shell/demo-frame.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DemoSidebarComponent, DemoFrameComponent],
  template: `
    <app-demo-sidebar />
    <app-demo-frame class="ide-content" />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: row;
        height: 100vh;
        width: 100vw;
        overflow: hidden;
        background: hsl(var(--bg));
        color: hsl(var(--fg));
      }
      .ide-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
    `,
  ],
})
export class AppComponent {}

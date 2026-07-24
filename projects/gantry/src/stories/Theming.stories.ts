import type { Meta, StoryObj } from '@storybook/angular';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  GantryComponent, GanttTask, GanttTheme, GanttThemeService,
  TaskType, ViewMode, LightTheme, DarkTheme,
} from '../public-api';

const d = (iso: string) => new Date(iso);

const TASKS: GanttTask[] = [
  { id: 'p1', name: 'Alpha', type: TaskType.Group, start: d('2026-01-01'), end: d('2026-06-30'), progress: 55, barColor: '#6366F1' },
  { id: 'a1', name: 'Phase 1', parentId: 'p1', start: d('2026-01-01'), end: d('2026-03-01'), progress: 100, baseline: { start: d('2026-01-01'), end: d('2026-03-15') } },
  { id: 'a2', name: 'Phase 2', parentId: 'p1', start: d('2026-03-01'), end: d('2026-05-01'), progress: 40, dependency: 'a1' },
  { id: 'a3', name: 'Phase 3', parentId: 'p1', start: d('2026-05-01'), end: d('2026-06-30'), progress: 0,  dependency: 'a2' },
  { id: 'ms', name: 'Launch',  parentId: 'p1', type: TaskType.Milestone, start: d('2026-06-28'), end: d('2026-06-28'), barColor: '#F59E0B', dependency: 'a3' },
];

@Component({
  selector: 'story-theme',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div style="display:flex;align-items:center;gap:12px;padding:8px 14px;
                background:#0f172a;border-bottom:1px solid #1e293b;flex-shrink:0">
      <span style="font-size:13px;font-weight:600;color:#60a5fa">Theme</span>
      <button (click)="mode.set('light')"
        [style.background]="mode()==='light' ? '#3b82f6' : '#1e293b'"
        style="padding:3px 10px;border:1px solid #334155;border-radius:4px;color:#f1f5f9;cursor:pointer;font-size:12px">
        Light
      </button>
      <button (click)="mode.set('dark')"
        [style.background]="mode()==='dark' ? '#3b82f6' : '#1e293b'"
        style="padding:3px 10px;border:1px solid #334155;border-radius:4px;color:#f1f5f9;cursor:pointer;font-size:12px">
        Dark
      </button>
      <button (click)="mode.set('auto')"
        [style.background]="mode()==='auto' ? '#3b82f6' : '#1e293b'"
        style="padding:3px 10px;border:1px solid #334155;border-radius:4px;color:#f1f5f9;cursor:pointer;font-size:12px">
        Auto (OS)
      </button>

      <span style="margin-left:auto;font-size:11px;color:#475569">
        Custom bar color patch:
      </span>
      <input type="color" [value]="barColor()"
        (input)="onBarColor($event)"
        style="width:32px;height:26px;border:1px solid #334155;border-radius:4px;background:transparent;cursor:pointer;padding:1px">
    </div>

    <gantry
      [style.height]="'calc(100vh - 44px)'"
      [series]="tasks"
      [options]="{ viewMode: 'Month', rowHeight: 36, baseline: true, criticalPath: false, showToday: true }"
      [darkMode]="mode()"
      [showToolbar]="true"
    />
  `,
})
class ThemeStoryComponent {
  readonly tasks    = TASKS;
  readonly mode     = signal<boolean | 'auto'>(false);
  readonly barColor = signal('#3B82F6');

  constructor(private themeSvc: GanttThemeService) {}

  onBarColor(e: Event) {
    const color = (e.target as HTMLInputElement).value;
    this.barColor.set(color);
    this.themeSvc.patchTheme({ barColor: color });
  }
}

const meta: Meta<ThemeStoryComponent> = {
  title:     'gantry/Theming',
  component:  ThemeStoryComponent,
  tags:      ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
**GanttThemeService** — live theme switching without re-mounting.

- \`darkMode: false | true | 'auto'\`
- \`patchTheme(partial)\` — override individual tokens at runtime
- \`setCustomTheme(full)\` — replace entire theme
- CSS custom properties injected on the host element
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<ThemeStoryComponent>;

export const LiveThemeSwitch: Story = {
  name: 'Live dark / light / auto toggle',
};

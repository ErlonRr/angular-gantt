import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GantryComponent, ViewMode, type GanttOptions } from 'ngx-gantry';
import { contrastRatio, cssPx, readableOn, resolveTheme, type GanttThemeOverrides } from '@gantryjs/core';
import { createDemoData } from '@gantryjs/core/demo';
import { AppThemeService } from '../../shell/app-theme.service';
import { CodeBlockComponent } from '../../shell/code-block.component';
import { IconComponent } from '../../shell/icon.component';
import {
  COLOR_FIELDS,
  PRESETS,
  RANGE_FIELDS,
  type BoardMode,
  type ColorField,
  type ModeOverrides,
  type RangeField,
  type ThemeKey,
  type ThemePreset,
} from './theme-tokens';
import { cssVarOf, themeCss, themeSource } from './theme-code';

type Board = 'page' | BoardMode;
type CodeTab = 'ts' | 'css';

const NO_EDITS: ModeOverrides = { light: {}, dark: {} };
const CODE_TABS: readonly { id: CodeTab; label: string; file: string }[] = [
  { id: 'ts', label: 'options.theme', file: 'theme.ts' },
  { id: 'css', label: 'CSS', file: 'theme.css' },
];

/** Ratio rounded down to one decimal, so the figure never reads better than the grade. */
function ratioText(ratio: number): string {
  return (Math.floor(ratio * 10) / 10).toFixed(1);
}

/**
 * /theming: presets and token fields over a live `<gantry>`, with the contrast of the bar label and
 * the code of the theme (`options.theme` for both modes, or page CSS for `<gantry-element>`).
 */
@Component({
  selector: 'app-theming-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent, CodeBlockComponent, IconComponent],
  template: `
    <div class="gs-page-head">
      <div>
        <p class="gs-eyebrow">Theming</p>
        <h1 class="gs-title">Theme with CSS custom properties</h1>
        <p class="gs-lead">
          The theme reaches the chart only through <code class="gs-code-inline">--gantt-*</code> custom properties. Set
          them with <code class="gs-code-inline">options.theme</code> or
          <code class="gs-code-inline">setTheme()</code> in every binding, or as page CSS on
          <code class="gs-code-inline">gantry-element</code>. Angular's
          <code class="gs-code-inline">&lt;gantry&gt;</code>
          binds them inline, so use the theme API there.
        </p>
      </div>
    </div>

    <div class="gs-split gs-split--start">
      <section class="gs-card gs-sticky" aria-labelledby="th-tokens">
        <div class="gs-card-head">
          <h2 class="gs-card-title" id="th-tokens">Tokens</h2>
          <button type="button" class="gs-btn gs-btn--sm" (click)="reset()">
            <app-icon name="reset" />
            Reset
          </button>
        </div>
        <div class="gs-scroll">
          <div class="gs-form-section">
            <h3 class="gs-form-title" id="th-presets">Presets</h3>
            <div class="th-chips" role="group" aria-labelledby="th-presets">
              @for (p of presets; track p.id) {
                <button
                  type="button"
                  class="gs-chip"
                  [attr.aria-pressed]="p.id === preset().id"
                  (click)="applyPreset(p)"
                >
                  {{ p.label }}
                </button>
              }
            </div>
            <p class="gs-hint th-note">
              Default is the built-in light and dark theme. Every preset has a light and a dark set, and keeps bar
              labels at 4.5:1 or more.
            </p>
          </div>

          <div class="gs-form-section">
            <h3 class="gs-form-title">Colours</h3>
            <p class="gs-hint th-lead">
              You are editing the {{ mode() }} board. Switch Board to tune the
              {{ mode() === 'dark' ? 'light' : 'dark' }}
              one.
            </p>
            @for (f of colorFields; track f.key) {
              <div class="gs-field">
                <label class="gs-label" [for]="'th-' + f.key">{{ f.label }}</label>
                <div class="th-row">
                  <input
                    type="color"
                    class="gs-color"
                    [id]="'th-' + f.key"
                    [value]="hex(shown()[f.key])"
                    [attr.aria-describedby]="'th-' + f.key + '-hint'"
                    (input)="setColor(f, color.value)"
                    #color
                  />
                  <p class="gs-hint" [id]="'th-' + f.key + '-hint'">
                    <code class="gs-code-inline">{{ varOf(f.key) }}</code>
                    {{ f.hint }}
                  </p>
                </div>
              </div>
            }
          </div>

          <div class="gs-form-section">
            <h3 class="gs-form-title">Metrics</h3>
            @for (r of rangeFields; track r.key) {
              <div class="gs-field">
                <div class="gs-field-row">
                  <label class="gs-label" [for]="'th-' + r.key">{{ r.label }}</label>
                  <output class="gs-value" [attr.for]="'th-' + r.key">{{ px(r.key) }}px</output>
                </div>
                <input
                  type="range"
                  class="gs-range"
                  [id]="'th-' + r.key"
                  [min]="r.min"
                  [max]="r.max"
                  [value]="px(r.key)"
                  [attr.aria-valuetext]="px(r.key) + ' pixels'"
                  [attr.aria-describedby]="'th-' + r.key + '-hint'"
                  (input)="setMetric(r, +range.value)"
                  #range
                />
                <p class="gs-hint" [id]="'th-' + r.key + '-hint'">
                  <code class="gs-code-inline">{{ varOf(r.key) }}</code>
                  {{ r.hint }}
                </p>
              </div>
            }
          </div>
        </div>
      </section>

      <div class="gs-stack">
        <section class="gs-card" aria-labelledby="th-preview">
          <div class="gs-card-head">
            <h2 class="gs-card-title" id="th-preview">Preview</h2>
            <div class="gs-toolbar">
              <span class="gs-label" id="th-board">Board</span>
              <div class="gs-seg" role="group" aria-labelledby="th-board">
                @for (b of boards; track b.id) {
                  <button
                    type="button"
                    class="gs-seg-btn"
                    [attr.aria-pressed]="board() === b.id"
                    (click)="board.set(b.id)"
                  >
                    {{ b.label }}
                  </button>
                }
              </div>
            </div>
          </div>
          <gantry
            class="gs-chart"
            [series]="demo.tasks"
            [annotations]="demo.annotations"
            [options]="chartOptions()"
            [darkMode]="chartDark()"
          />
          <div class="gs-card-foot th-readout">
            <span
              class="th-swatch"
              aria-hidden="true"
              [style.background-color]="shown().barColor"
              [style.color]="barLabel()"
              >Aa</span
            >
            <span
              >Label on bar <strong>{{ labelRatio() }}:1</strong>
              {{ labelOk() ? (labelAaa() ? 'AAA' : 'AA') : 'below AA' }}</span
            >
            <span
              >Bar on rows <strong>{{ barRatio() }}:1</strong> {{ barOk() ? 'meets 3:1' : 'below 3:1' }}</span
            >
          </div>
        </section>

        <section class="gs-card" aria-labelledby="th-code">
          <div class="gs-card-head">
            <h2 class="gs-card-title" id="th-code">Code</h2>
            <p class="gs-hint">Only the tokens you changed.</p>
          </div>
          <div class="gs-card-body">
            <div class="gs-tabs" role="tablist" aria-label="Code format">
              @for (t of codeTabs; track t.id) {
                <button
                  type="button"
                  role="tab"
                  class="gs-tab"
                  aria-controls="th-code-panel"
                  [id]="'th-tab-' + t.id"
                  [attr.aria-selected]="t.id === codeTab()"
                  [tabIndex]="t.id === codeTab() ? 0 : -1"
                  (click)="codeTab.set(t.id)"
                  (keydown)="onTabKey($event)"
                >
                  {{ t.label }}
                </button>
              }
            </div>
            <div id="th-code-panel" role="tabpanel" [attr.aria-labelledby]="'th-tab-' + codeTab()">
              <app-code-block [code]="code()" [file]="codeFile()" scroll />
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: `
    .th-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .th-note {
      margin-top: 12px;
    }
    .th-lead {
      margin-bottom: 14px;
    }
    .th-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .th-row .gs-color {
      flex: none;
    }
    .th-row .gs-code-inline {
      display: block;
      width: fit-content;
      margin-bottom: 3px;
    }
    .gs-field .gs-hint .gs-code-inline {
      margin-right: 4px;
      font-size: 12px;
    }
    .gs-card-head .gs-hint {
      font-size: 14px;
    }
    .th-readout {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 18px;
    }
    .th-readout strong {
      color: var(--gs-text);
    }
    .th-swatch {
      display: inline-grid;
      place-items: center;
      width: 40px;
      height: 26px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 650;
    }
  `,
})
export class ThemingPageComponent {
  private readonly site = inject(AppThemeService);

  protected readonly presets = PRESETS;
  protected readonly colorFields = COLOR_FIELDS;
  protected readonly rangeFields = RANGE_FIELDS;
  protected readonly codeTabs = CODE_TABS;
  protected readonly boards: readonly { id: Board; label: string }[] = [
    { id: 'page', label: 'Page' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];
  protected readonly demo = createDemoData();

  protected readonly preset = signal<ThemePreset>(PRESETS[0]);
  /** Field edits per board, over the preset. */
  private readonly edits = signal<ModeOverrides>(NO_EDITS);
  /** Page = follow the site theme; Light / Dark force the chart's `darkMode`. */
  protected readonly board = signal<Board>('page');
  protected readonly codeTab = signal<CodeTab>('ts');

  protected readonly chartDark = computed(() =>
    this.board() === 'page' ? this.site.isDark() : this.board() === 'dark',
  );
  protected readonly mode = computed<BoardMode>(() => (this.chartDark() ? 'dark' : 'light'));

  private readonly lightOverrides = computed(() => this.overridesFor('light'));
  private readonly darkOverrides = computed(() => this.overridesFor('dark'));
  private readonly lightTheme = computed(() => resolveTheme(false, this.lightOverrides()));
  private readonly darkTheme = computed(() => resolveTheme(true, this.darkOverrides()));
  /** The resolved theme on the board. */
  protected readonly shown = computed(() => (this.chartDark() ? this.darkTheme() : this.lightTheme()));

  /** Critical path and baselines on, so their colours show. */
  protected readonly chartOptions = computed<GanttOptions>(() => ({
    viewMode: ViewMode.Week,
    criticalPath: true,
    baseline: true,
    theme: this.chartDark() ? this.darkOverrides() : this.lightOverrides(),
  }));

  // Contrast of the bar label (the colour the chart picks) and of the bar on the rows
  protected readonly barLabel = computed(() => readableOn(this.shown().barColor, this.shown().barTextColor));
  private readonly labelContrast = computed(() => contrastRatio(this.shown().barColor, this.barLabel()) ?? 0);
  protected readonly labelRatio = computed(() => ratioText(this.labelContrast()));
  protected readonly labelOk = computed(() => this.labelContrast() >= 4.5);
  protected readonly labelAaa = computed(() => this.labelContrast() >= 7);
  private readonly barContrast = computed(() => {
    const t = this.shown();
    return Math.min(contrastRatio(t.barColor, t.rowBg) ?? 0, contrastRatio(t.barColor, t.rowBgAlt) ?? 0);
  });
  protected readonly barRatio = computed(() => ratioText(this.barContrast()));
  protected readonly barOk = computed(() => this.barContrast() >= 3);

  protected readonly code = computed(() =>
    this.codeTab() === 'ts'
      ? themeSource(this.lightTheme(), this.darkTheme())
      : themeCss(this.lightTheme(), this.darkTheme()),
  );
  protected readonly codeFile = computed(() => CODE_TABS.find(t => t.id === this.codeTab())!.file);

  protected varOf(key: ThemeKey): string {
    return cssVarOf(key);
  }

  /** `<input type="color">` takes `#rrggbb` only. */
  protected hex(value: string): string {
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#000000';
  }

  protected px(key: RangeField['key']): number {
    return cssPx(this.shown()[key], 0);
  }

  protected applyPreset(p: ThemePreset): void {
    this.preset.set(p);
    this.edits.set(NO_EDITS);
  }

  protected reset(): void {
    this.applyPreset(PRESETS[0]);
  }

  protected setColor(field: ColorField, value: string): void {
    const patch: GanttThemeOverrides = {};
    for (const key of [field.key, ...(field.also ?? [])]) patch[key] = value.toUpperCase();
    this.edit(patch);
  }

  protected setMetric(field: RangeField, value: number): void {
    if (Number.isFinite(value)) this.edit({ [field.key]: `${value}px` });
  }

  /** Arrow keys, Home and End move between the tabs (WAI-ARIA tabs pattern). */
  protected onTabKey(e: KeyboardEvent): void {
    const i = CODE_TABS.findIndex(t => t.id === this.codeTab());
    const n = CODE_TABS.length;
    const keys: Record<string, number> = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    this.codeTab.set(CODE_TABS[next].id);
    (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  private overridesFor(mode: BoardMode): GanttThemeOverrides {
    return { ...this.preset()[mode], ...this.edits()[mode] };
  }

  /** Field edits go to the board on screen. */
  private edit(patch: GanttThemeOverrides): void {
    const mode = this.mode();
    this.edits.update(e => ({ ...e, [mode]: { ...e[mode], ...patch } }));
  }
}

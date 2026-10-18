import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GantryComponent,
  type GanttState,
  type SelectionChangeEvent,
  type TaskDragEvent,
  type TaskResizeEvent,
} from 'ngx-gantry';
import { createDemoData } from '@gantryjs/core/demo';
import {
  PLAYGROUND_DEFAULTS,
  PLAYGROUND_SECTIONS,
  changedKeys,
  decodeState,
  encodeState,
  playgroundCode,
  playgroundOptions,
  withValue,
  type PlaygroundControl,
  type PlaygroundKey,
} from 'demo-kit/playground';
import { FRAMEWORKS, type FrameworkId } from 'demo-kit/site';
import { AppThemeService } from '../../shell/app-theme.service';
import { CodeBlockComponent } from '../../shell/code-block.component';
import { IconComponent } from '../../shell/icon.component';

const TAB_KEY = 'gantry-site-code-tab';
const MAX_EVENTS = 50;
/** The file each framework's snippet would live in (the code block's title). */
const FILE_NAMES: Record<FrameworkId, string> = {
  html: 'index.html',
  js: 'main.js',
  angular: 'plan.component.ts',
  react: 'Plan.tsx',
  vue: 'Plan.vue',
  svelte: 'Plan.svelte',
};

interface LogEntry {
  id: number;
  time: string;
  name: string;
  detail: string;
}

function storedFramework(): FrameworkId {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return FRAMEWORKS.find(f => f.id === v)?.id ?? 'html';
  } catch {
    return 'html';
  }
}

/** `+3 days`, `-1 day`, `+0.25 days` (Hour zoom moves by parts of a day). */
function days(n: number): string {
  const v = Number(n.toFixed(2));
  return `${v > 0 ? '+' : ''}${v} ${Math.abs(v) === 1 ? 'day' : 'days'}`;
}

/**
 * /playground: every `demo-kit/playground` control next to a live `<gantry>`, the code it runs in
 * each framework, its events, and a `?setup=` link that restores the choices.
 */
@Component({
  selector: 'app-playground-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent, CodeBlockComponent, IconComponent],
  template: `
    <div class="gs-page-head">
      <div>
        <p class="gs-eyebrow">Playground</p>
        <h1 class="gs-title">Try every option</h1>
        <p class="gs-lead">
          Change an option and the chart updates at once. The code follows your choices in the syntax of your framework,
          and the link keeps this setup.
        </p>
      </div>
      <button type="button" class="gs-btn" (click)="copyLink()">
        <app-icon [name]="linkCopied() ? 'check' : 'link'" />
        {{ linkCopied() ? 'Copied' : 'Copy link' }}
      </button>
      <span class="gs-sr-only" role="status">{{ linkCopied() ? 'Link copied' : '' }}</span>
    </div>

    <div class="gs-split">
      <div class="gs-stack">
        <section class="gs-card" aria-labelledby="pg-preview">
          <div class="gs-card-head">
            <h2 class="gs-card-title" id="pg-preview">Preview</h2>
            <div class="gs-toolbar">
              <span class="gs-pill">Zoom: {{ state().viewMode }}</span>
              <button type="button" class="gs-btn gs-btn--sm" (click)="chart().scrollToToday()">
                <app-icon name="today" />
                Today
              </button>
            </div>
          </div>
          <gantry
            class="gs-chart pg-chart"
            [series]="demo.tasks"
            [annotations]="demo.annotations"
            [options]="options()"
            [viewMode]="state().viewMode"
            [darkMode]="theme.isDark()"
            showLegend
            (viewModeChange)="onViewMode($event)"
            (taskDragged)="onDragged($event)"
            (taskResized)="onResized($event)"
            (selectionChange)="onSelection($event)"
            (stateChange)="onState($event)"
          />
        </section>

        <section class="gs-card" aria-labelledby="pg-code">
          <div class="gs-card-head">
            <h2 class="gs-card-title" id="pg-code">Code</h2>
            <p class="gs-hint">What the preview runs.</p>
          </div>
          <div class="gs-card-body">
            <div class="gs-tabs" role="tablist" aria-label="Framework">
              @for (fw of frameworks; track fw.id) {
                <button
                  type="button"
                  role="tab"
                  class="gs-tab"
                  aria-controls="pg-code-panel"
                  [id]="'pg-tab-' + fw.id"
                  [attr.aria-selected]="fw.id === framework()"
                  [tabIndex]="fw.id === framework() ? 0 : -1"
                  (click)="setFramework(fw.id)"
                  (keydown)="onTabKey($event)"
                >
                  {{ fw.label }}
                </button>
              }
            </div>
            <div id="pg-code-panel" role="tabpanel" [attr.aria-labelledby]="'pg-tab-' + framework()">
              <app-code-block [code]="code()" [file]="fileName()" scroll />
            </div>
          </div>
        </section>

        <section class="gs-card" aria-labelledby="pg-events">
          <div class="gs-card-head">
            <h2 class="gs-card-title" id="pg-events">
              Events <span class="gs-count">{{ events().length }}</span>
            </h2>
            <button type="button" class="gs-btn gs-btn--sm" (click)="events.set([])">Clear</button>
          </div>
          <ul
            class="gs-log"
            aria-live="polite"
            aria-labelledby="pg-events"
            [attr.tabindex]="events().length ? 0 : null"
          >
            @for (e of events(); track e.id) {
              <li>
                <span class="gs-log-time">{{ e.time }}</span>
                <span class="gs-log-name">{{ e.name }}</span>
                <span class="gs-log-detail">{{ e.detail }}</span>
              </li>
            }
          </ul>
          @if (!events().length) {
            <p class="gs-empty">Drag a bar, select a row or zoom to see the events.</p>
          }
        </section>
      </div>

      <section class="gs-card gs-sticky" aria-labelledby="pg-options">
        <div class="gs-card-head">
          <h2 class="gs-card-title" id="pg-options">
            Options
            <span class="gs-count">{{ changed().length }}<span class="gs-sr-only"> changed</span></span>
          </h2>
          <button type="button" class="gs-btn gs-btn--sm" (click)="reset()">
            <app-icon name="reset" />
            Reset all
          </button>
        </div>
        <div class="gs-scroll">
          @for (section of sections; track section.title) {
            <div class="gs-form-section">
              <h3 class="gs-form-title">{{ section.title }}</h3>
              @for (c of section.controls; track c.key) {
                <div class="gs-field">
                  @if (c.kind === 'check') {
                    <label class="gs-switch">
                      <span>{{ c.label }}</span>
                      <input
                        type="checkbox"
                        role="switch"
                        [id]="'pg-' + c.key"
                        [attr.aria-describedby]="'pg-' + c.key + '-hint'"
                        [checked]="state()[c.key] === true"
                        (change)="set(c.key, check.checked)"
                        #check
                      />
                    </label>
                  } @else if (c.kind === 'range') {
                    <div class="gs-field-row">
                      <label class="gs-label" [for]="'pg-' + c.key">{{ c.label }}</label>
                      <output class="gs-value" [attr.for]="'pg-' + c.key">{{ state()[c.key] }}{{ c.unit }}</output>
                    </div>
                    <input
                      type="range"
                      class="gs-range"
                      [id]="'pg-' + c.key"
                      [min]="c.min"
                      [max]="c.max"
                      [step]="c.step ?? 1"
                      [value]="state()[c.key]"
                      [attr.aria-valuetext]="state()[c.key] + (c.unit ?? '')"
                      [attr.aria-describedby]="'pg-' + c.key + '-hint'"
                      (input)="set(c.key, +range.value)"
                      #range
                    />
                  } @else {
                    <label class="gs-label" [for]="'pg-' + c.key">{{ c.label }}</label>
                    <select
                      class="gs-select"
                      [id]="'pg-' + c.key"
                      [attr.aria-describedby]="'pg-' + c.key + '-hint'"
                      (change)="choose(c, select.value)"
                      #select
                    >
                      @for (choice of c.choices; track choice[0]) {
                        <option [value]="choice[0]" [selected]="state()[c.key] === choice[0]">{{ choice[1] }}</option>
                      }
                    </select>
                  }
                  <p class="gs-hint" [id]="'pg-' + c.key + '-hint'">
                    <code class="gs-code-inline">{{ c.option }}</code>
                    @if (c.hint) {
                      {{ c.hint }}
                    }
                  </p>
                </div>
              }
            </div>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    .pg-chart {
      height: 560px;
    }
    .gs-card-head .gs-hint {
      font-size: 14px;
    }
    .gs-field .gs-hint .gs-code-inline {
      margin-right: 4px;
      font-size: 12px;
    }
    @media (max-width: 640px) {
      .pg-chart {
        height: 500px;
      }
    }
  `,
})
export class PlaygroundPageComponent {
  protected readonly theme = inject(AppThemeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly doc = inject(DOCUMENT);

  protected readonly chart = viewChild.required(GantryComponent);

  protected readonly sections = PLAYGROUND_SECTIONS;
  protected readonly frameworks = FRAMEWORKS;
  /** The sample plan, moved so today sits inside it. */
  protected readonly demo = createDemoData();
  private readonly today = new Date();
  private readonly names = new Map(this.demo.tasks.map(t => [t.id, t.name]));

  protected readonly state = signal(decodeState(this.route.snapshot.queryParamMap.get('setup')));
  protected readonly options = computed(() => playgroundOptions(this.state(), this.today));
  protected readonly changed = computed(() => changedKeys(this.state()));

  protected readonly framework = signal<FrameworkId>(storedFramework());
  protected readonly code = computed(() => playgroundCode(this.state(), this.framework(), this.today));
  protected readonly fileName = computed(() => FILE_NAMES[this.framework()]);

  protected readonly events = signal<readonly LogEntry[]>([]);
  protected readonly linkCopied = signal(false);

  private nextId = 0;
  private lastView: GanttState['view'] = undefined;
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // The address keeps the setup. Location (not router.navigate): a navigation would move the
    // focus to <main> (the shell does that after every route change) while a control is in use
    effect(onCleanup => {
      const setup = encodeState(this.state());
      const timer = setTimeout(() => this.writeSetup(setup), 250);
      onCleanup(() => clearTimeout(timer));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  protected set(key: PlaygroundKey, value: unknown): void {
    this.state.update(s => withValue(s, key, value));
  }

  /** A `<select>` value is text: map it back to the choice (some are numbers). */
  protected choose(control: PlaygroundControl, value: string): void {
    if (control.kind !== 'select') return;
    const choice = control.choices.find(([v]) => String(v) === value);
    if (choice) this.set(control.key, choice[0]);
  }

  protected reset(): void {
    this.state.set({ ...PLAYGROUND_DEFAULTS });
  }

  protected setFramework(id: FrameworkId): void {
    this.framework.set(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      // Storage blocked: the choice lasts for this page
    }
  }

  /** Arrow keys, Home and End move between the tabs (WAI-ARIA tabs pattern). */
  protected onTabKey(e: KeyboardEvent): void {
    const ids = this.frameworks.map(f => f.id);
    const i = ids.indexOf(this.framework());
    const n = ids.length;
    const keys: Record<string, number> = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    this.setFramework(ids[next]);
    (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  protected copyLink(): void {
    const url = this.setupUrl(encodeState(this.state()));
    const copied = () => {
      this.linkCopied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.linkCopied.set(false), 1800);
    };
    // A refused write leaves the link in the address bar; nothing to announce but no error either
    navigator.clipboard?.writeText(url).then(copied, () => undefined);
  }

  // ── Chart events ──────────────────────────────────────────

  protected onViewMode(level: string | undefined): void {
    if (!level || level === this.state().viewMode) return;
    this.log('viewModeChange', `${this.state().viewMode} → ${level}`);
    this.set('viewMode', level);
  }

  protected onDragged(e: TaskDragEvent): void {
    this.log('taskDragged', `${this.name(e.taskId)} ${days(e.daysMoved)}`);
  }

  protected onResized(e: TaskResizeEvent): void {
    this.log('taskResized', `${this.name(e.taskId)} ${e.handle === 'left' ? 'start' : 'end'} ${days(e.daysDelta)}`);
  }

  protected onSelection(e: SelectionChangeEvent): void {
    const ids = e.selectedIds;
    const shown = ids.slice(0, 3).map(id => this.name(id));
    this.log(
      'selectionChange',
      ids.length ? `${ids.length} selected: ${shown.join(', ')}${ids.length > 3 ? '…' : ''}` : 'none selected',
    );
  }

  /** `stateChange` also reports panel widths and sorting: only a new view is worth a line. */
  protected onState(s: GanttState): void {
    const before = this.lastView ?? 'split';
    this.lastView = s.view;
    if (s.view && s.view !== before) this.log('stateChange', `view ${before} → ${s.view}`);
  }

  private name(id: string): string {
    return this.names.get(id) ?? id;
  }

  private log(name: string, detail: string): void {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const entry: LogEntry = { id: this.nextId++, time, name, detail };
    this.events.update(list => [entry, ...list].slice(0, MAX_EVENTS));
  }

  // ── Link ──────────────────────────────────────────────────

  private setupUrl(setup: string): string {
    const url = new URL(this.doc.location.href);
    if (setup) url.searchParams.set('setup', setup);
    else url.searchParams.delete('setup');
    return url.href;
  }

  private writeSetup(setup: string): void {
    const current = new URL(this.doc.location.href).searchParams.get('setup') ?? '';
    if (current === setup) return;
    const tree = this.router.createUrlTree([], { relativeTo: this.route, queryParams: { setup: setup || null } });
    // Keep the router's history state (navigationId): Back still restores the scroll position
    this.location.replaceState(this.router.serializeUrl(tree), '', this.location.getState());
  }
}

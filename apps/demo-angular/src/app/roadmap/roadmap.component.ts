// Example: a product roadmap for a fictional SaaS ("Nimbus"). Groups (squads), dependencies
// (FS / SS with lag), baselines, release milestones, progress, and custom panel columns (owner
// avatar, status badge) drawn by Angular templates through `cellTemplate`.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
  type TemplateRef,
} from '@angular/core';
import {
  GantryComponent,
  type GanttTask,
  type GanttFlatRow,
  type ColumnDef,
  type ColumnCellContext,
  type GanttLabels,
  TaskType,
  DependencyType,
  ViewMode,
  type GanttOptions,
} from '@gantryjs/angular';
import { anchorToToday } from '@gantryjs/core/demo';
import { AppThemeService } from '../shell/app-theme.service';
import { EXAMPLE_STYLES, ExampleHeadComponent, ExampleUsageComponent } from '../pages/examples/example-parts';

// ── Italian translation (partial override — the rest falls back to EN) ──
const IT_LABELS: Partial<GanttLabels> = {
  loading: 'Caricamento…',
  loadMore: 'Carica altro',
  allLoaded: n => `Tutte le ${n} attività caricate`,
  loadError: 'Impossibile caricare le attività',
  retry: 'Riprova',
  emptyState: 'Nessuna attività da mostrare',
  errorTitle: 'Impossibile mostrare il grafico',
  zoomIn: 'Ingrandisci',
  zoomOut: 'Riduci',
  fitToScreen: 'Adatta allo schermo',
  todayButton: 'Oggi',
  viewModes: {
    [ViewMode.Hour]: 'Ora',
    [ViewMode.Day]: 'Giorno',
    [ViewMode.Week]: 'Settimana',
    [ViewMode.Month]: 'Mese',
    [ViewMode.Quarter]: 'Trimestre',
    [ViewMode.Year]: 'Anno',
  },
  legend: 'Legenda',
  today: 'Oggi',
  annotation: 'Annotazione',
  ttStart: 'Inizio',
  ttEnd: 'Fine',
  ttDuration: 'Durata',
  ttProgress: 'Avanzamento',
  ttMilestone: 'Traguardo',
  quarterPrefix: 'T',
  halfPrefix: 'S',
  durationLessThanDay: '< 1 giorno',
  durationDay: '1 giorno',
  durationDays: n => `${n} giorni`,
  durationWeeks: w => `${w} sett`,
  durationWeeksDays: (w, d) => `${w} sett ${d}g`,
  colName: 'Attività',
  colStart: 'Inizio',
  colEnd: 'Fine',
  colDuration: 'Durata',
  colProgress: '%',
  colId: 'ID',
  colType: 'Tipo',
  colStatus: 'Stato',
  colPredecessors: 'Predecessori',
  colBaselineStart: 'Inizio previsto',
  colBaselineEnd: 'Fine prevista',
  colVariance: 'Scostamento',
  statusNotStarted: 'Non iniziata',
  statusInProgress: 'In corso',
  statusOverdue: 'In ritardo',
  statusDone: 'Completata',
  typeTask: 'Attività',
  typeMilestone: 'Traguardo',
  typeGroup: 'Gruppo',
  dependency: (name, type, lag) => {
    const t = ({ FS: 'FI', SS: 'II', FF: 'FF', SF: 'IF' } as Record<string, string>)[type] ?? type;
    return t === 'FI' && !lag ? name : `${name} (${t}${lag ? `${lag > 0 ? '+' : '−'}${Math.abs(lag)} g` : ''})`;
  },
  varianceDays: d => (d === 0 ? 'In linea' : `${d > 0 ? '+' : '−'}${Math.abs(d)} g`),
  ariaChart: 'Diagramma di Gantt',
  ariaTaskList: 'Elenco attività',
  ariaToolbar: 'Barra degli strumenti del grafico',
  ariaZoomLevels: 'Livello di zoom',
  ariaViews: 'Vista',
  ariaBars: 'Barre delle attività',
  ariaTask: 'barra attività',
  ariaMilestone: 'traguardo',
  ariaGroup: 'barra di riepilogo',
  viewSplit: 'Tabella e grafico',
  viewTable: 'Solo tabella',
  viewChart: 'Solo grafico',
  showPanel: 'Mostra elenco attività',
  hidePanel: 'Nascondi elenco attività',
  week: 'Settimana',
  weekPrefix: 'S',
  ariaExpand: n => `Espandi ${n}`,
  ariaCollapse: n => `Comprimi ${n}`,
};

// ── People ────────────────────────────────────────────────────
interface Owner {
  name: string;
  initials: string;
  color: string;
}
// White initials on these fills pass AA (≥ 5:1) in both themes
const OWNERS: Record<string, Owner> = {
  ale: { name: 'Alessia M.', initials: 'AM', color: '#4f46e5' },
  tom: { name: 'Tomás R.', initials: 'TR', color: '#047857' },
  kai: { name: 'Kai N.', initials: 'KN', color: '#be185d' },
  liv: { name: 'Liv B.', initials: 'LB', color: '#b45309' },
  sam: { name: 'Sam O.', initials: 'SO', color: '#0369a1' },
};

// ── Status ────────────────────────────────────────────────────
// Colours: the `st-<id>` classes below (light and dark pairs, AA contrast)
type StatusId = 'done' | 'on-track' | 'at-risk';
interface Status {
  id: StatusId;
  label: string;
  labelIt: string;
}
const STATUS: Record<StatusId, Status> = {
  done: { id: 'done', label: 'Done', labelIt: 'Completata' },
  'on-track': { id: 'on-track', label: 'On track', labelIt: 'In linea' },
  'at-risk': { id: 'at-risk', label: 'At risk', labelIt: 'A rischio' },
};

// ── Roadmap data ──────────────────────────────────────────────
const d = (iso: string) => new Date(iso);
type Meta = { ownerId: keyof typeof OWNERS; status: StatusId };
const m = (ownerId: keyof typeof OWNERS, status: StatusId): Meta => ({ ownerId, status });

const TASKS: GanttTask[] = [
  // ── Squad: Platform ──
  {
    id: 'plat',
    name: 'Platform',
    type: TaskType.Group,
    start: d('2026-01-05'),
    end: d('2026-07-15'),
    progress: 52,
    barColor: '#4f46e5',
    data: m('ale', 'on-track'),
  },
  {
    id: 'plat-1',
    name: 'Multi-region infra',
    parentId: 'plat',
    start: d('2026-01-05'),
    end: d('2026-02-27'),
    progress: 100,
    baseline: { start: d('2026-01-05'), end: d('2026-02-20') },
    data: m('tom', 'done'),
  },
  {
    id: 'plat-2',
    name: 'Zero-downtime deploys',
    parentId: 'plat',
    start: d('2026-02-16'),
    end: d('2026-04-10'),
    progress: 70,
    dependency: { taskId: 'plat-1', type: DependencyType.SS, lag: 10 },
    data: m('ale', 'on-track'),
  },
  {
    id: 'plat-3',
    name: 'Audit log & SSO',
    parentId: 'plat',
    start: d('2026-04-06'),
    end: d('2026-06-05'),
    progress: 25,
    dependency: 'plat-2',
    baseline: { start: d('2026-04-01'), end: d('2026-05-22') },
    data: m('sam', 'at-risk'),
  },
  {
    id: 'ms-plat',
    name: 'v2.0 — Platform GA',
    parentId: 'plat',
    type: TaskType.Milestone,
    start: d('2026-06-15'),
    end: d('2026-06-15'),
    dependency: 'plat-3',
    barColor: '#4f46e5',
    data: m('ale', 'on-track'),
  },

  // ── Squad: Growth ──
  {
    id: 'grow',
    name: 'Growth',
    type: TaskType.Group,
    start: d('2026-02-01'),
    end: d('2026-08-20'),
    progress: 34,
    barColor: '#be185d',
    data: m('kai', 'on-track'),
  },
  {
    id: 'grow-1',
    name: 'Onboarding revamp',
    parentId: 'grow',
    start: d('2026-02-01'),
    end: d('2026-03-20'),
    progress: 90,
    data: m('kai', 'done'),
  },
  {
    id: 'grow-2',
    name: 'Referral program',
    parentId: 'grow',
    start: d('2026-03-15'),
    end: d('2026-05-10'),
    progress: 45,
    dependency: 'grow-1',
    baseline: { start: d('2026-03-10'), end: d('2026-04-28') },
    data: m('liv', 'on-track'),
  },
  {
    id: 'grow-3',
    name: 'Pricing experiments',
    parentId: 'grow',
    start: d('2026-05-05'),
    end: d('2026-07-10'),
    progress: 5,
    dependency: { taskId: 'grow-2', type: DependencyType.FS, lag: -5 },
    data: m('kai', 'at-risk'),
  },
  {
    id: 'ms-grow',
    name: 'v2.1 — Growth launch',
    parentId: 'grow',
    type: TaskType.Milestone,
    start: d('2026-07-20'),
    end: d('2026-07-20'),
    dependency: 'grow-3',
    barColor: '#be185d',
    data: m('kai', 'on-track'),
  },

  // ── Squad: Mobile ──
  {
    id: 'mob',
    name: 'Mobile',
    type: TaskType.Group,
    start: d('2026-03-01'),
    end: d('2026-09-15'),
    progress: 20,
    barColor: '#0369a1',
    data: m('sam', 'on-track'),
  },
  {
    id: 'mob-1',
    name: 'React Native rewrite',
    parentId: 'mob',
    start: d('2026-03-01'),
    end: d('2026-05-30'),
    progress: 40,
    baseline: { start: d('2026-03-01'), end: d('2026-05-15') },
    data: m('sam', 'on-track'),
  },
  {
    id: 'mob-2',
    name: 'Offline sync',
    parentId: 'mob',
    start: d('2026-05-20'),
    end: d('2026-07-31'),
    progress: 0,
    dependency: 'mob-1',
    data: m('tom', 'on-track'),
  },
  {
    id: 'ms-mob',
    name: 'v3.0 — Mobile beta',
    parentId: 'mob',
    type: TaskType.Milestone,
    start: d('2026-08-31'),
    end: d('2026-08-31'),
    dependency: 'mob-2',
    barColor: '#0369a1',
    data: m('sam', 'on-track'),
  },
];

@Component({
  selector: 'app-roadmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent, ExampleHeadComponent, ExampleUsageComponent],
  template: `
    <header appExampleHead="roadmap"></header>

    <div class="gs-card">
      <div class="gs-card-head gs-toolbar">
        <p class="gs-card-title">Nimbus {{ planYears }}</p>
        <span class="gs-pill">{{ squads }} squads · {{ tasks.length }} rows</span>
        <span class="gs-spacer"></span>
        <ul class="rm-legend" aria-label="Status">
          @for (s of statuses; track s.id) {
            <li><span class="rm-dot" [class]="'st-' + s.id"></span>{{ lang() === 'it' ? s.labelIt : s.label }}</li>
          }
        </ul>
        <div class="gs-seg" role="group" aria-label="Chart language">
          <button type="button" class="gs-seg-btn" [attr.aria-pressed]="lang() === 'en'" (click)="lang.set('en')">
            English
          </button>
          <button
            type="button"
            class="gs-seg-btn"
            lang="it"
            [attr.aria-pressed]="lang() === 'it'"
            (click)="lang.set('it')"
          >
            Italiano
          </button>
        </div>
      </div>

      <!-- Custom panel cells (columns' cellTemplate) -->
      <ng-template #ownerCell let-row>
        @if (owner(row); as o) {
          <span class="rm-owner">
            <span class="rm-avatar" aria-hidden="true" [style.background-color]="o.color">{{ o.initials }}</span>
            <span class="rm-owner-name">{{ o.name }}</span>
          </span>
        }
      </ng-template>

      <ng-template #statusCell let-row>
        @if (status(row); as s) {
          <span class="rm-badge" [class]="'st-' + s.id">{{ lang() === 'it' ? s.labelIt : s.label }}</span>
        }
      </ng-template>

      <gantry
        class="gs-chart ex-chart"
        [series]="tasks"
        [columns]="columns()"
        [options]="opts()"
        [darkMode]="theme.isDark()"
        showToolbar
        enableDrag
        enableResize
        tooltipEnabled
        showLegend
      />
    </div>

    <app-example-usage path="roadmap" />
  `,
  styles: [
    EXAMPLE_STYLES,
    `
      /* Status colours: light / dark pairs (the page theme sets color-scheme), AA on their tints */
      .st-done {
        --st-fg: light-dark(#047857, #6ee7b7);
        --st-bg: light-dark(#d1fae5, rgb(16 185 129 / 0.16));
      }
      .st-on-track {
        --st-fg: light-dark(#4338ca, #a5b4fc);
        --st-bg: light-dark(#e0e7ff, rgb(99 102 241 / 0.2));
      }
      .st-at-risk {
        --st-fg: light-dark(#92400e, #fcd34d);
        --st-bg: light-dark(#fef3c7, rgb(245 158 11 / 0.16));
      }
      .rm-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 14px;
        margin: 0;
        padding: 0;
        list-style: none;
        color: var(--gs-muted);
        font-size: 14px;
      }
      .rm-legend li {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .rm-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--st-fg);
      }
      .rm-owner {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        max-width: 100%;
      }
      .rm-avatar {
        display: inline-grid;
        flex: none;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
      }
      .rm-owner-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .rm-badge {
        padding: 2px 9px;
        border-radius: 999px;
        background: var(--st-bg);
        color: var(--st-fg);
        font-size: 12px;
        font-weight: 650;
        white-space: nowrap;
      }
    `,
  ],
})
export class RoadmapComponent {
  protected readonly theme = inject(AppThemeService);

  /** The template plan moved so today sits about 40% into it */
  readonly tasks = anchorToToday(TASKS).tasks;
  /** "2026" or "2026–27", from the moved plan */
  protected readonly planYears = (() => {
    const years = this.tasks.flatMap(t => [t.start.getFullYear(), (t.end ?? t.start).getFullYear()]);
    const [a, b] = [Math.min(...years), Math.max(...years)];
    return a === b ? `${a}` : `${a}–${String(b).slice(-2)}`;
  })();

  private readonly ownerTpl = viewChild<TemplateRef<ColumnCellContext>>('ownerCell');
  private readonly statusTpl = viewChild<TemplateRef<ColumnCellContext>>('statusCell');

  protected readonly statuses = Object.values(STATUS);
  protected readonly squads = this.tasks.filter(t => t.type === TaskType.Group).length;

  /** UI language toggle (EN default). */
  readonly lang = signal<'en' | 'it'>('en');

  readonly opts = computed<GanttOptions>(() => ({
    viewMode: ViewMode.Month,
    rowHeight: 40,
    panelWidth: 440,
    baseline: true,
    showToday: true,
    criticalPath: false,
    // Split view: the three custom columns. Table view: those plus every built-in field.
    table: {
      columns: [
        'name',
        'owner',
        'status',
        'type',
        'start',
        'end',
        'duration',
        'progress',
        'predecessors',
        'baselineStart',
        'baselineEnd',
        'variance',
      ],
    },
    ...(this.lang() === 'it' ? { locale: 'it', labels: IT_LABELS, formats: { dateFormat: 'D MMM YYYY' } } : {}),
  }));

  /** Column set with rich custom cells — updates once the templates resolve. */
  readonly columns = computed<ColumnDef[]>(() => {
    const it = this.lang() === 'it';
    return [
      { key: 'name', label: it ? 'Iniziativa' : 'Initiative', width: 210, minWidth: 150 },
      { key: 'owner', label: it ? 'Responsabile' : 'Owner', width: 128, cellTemplate: this.ownerTpl() },
      { key: 'status', label: it ? 'Stato' : 'Status', width: 100, cellTemplate: this.statusTpl() },
    ];
  });

  protected owner(row: GanttFlatRow): Owner | null {
    const id = (row.task.data as Meta | undefined)?.ownerId;
    return id ? (OWNERS[id] ?? null) : null;
  }

  protected status(row: GanttFlatRow): Status | null {
    const s = (row.task.data as Meta | undefined)?.status;
    return s ? (STATUS[s] ?? null) : null;
  }
}

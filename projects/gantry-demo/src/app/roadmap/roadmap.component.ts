// ─────────────────────────────────────────────────────────────
//  gantry-demo · roadmap/roadmap.component.ts
//
//  Showcase demo: a product roadmap for a fictional SaaS ("Nimbus").
//  Exercises groups (squads), dependencies (FS/SS + lag), baselines,
//  release milestones, progress — and CUSTOM LEFT-PANEL COLUMNS
//  (Owner avatar + Status badge) rendered via `cellTemplate`.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild, TemplateRef } from '@angular/core';
import {
  GantryComponent,
  GanttTask,
  GanttFlatRow,
  ColumnDef,
  ColumnCellContext,
  GanttLabels,
  TaskType,
  DependencyType,
  ViewMode,
  GanttOptions,
} from 'ngx-gantry';
import 'dayjs/locale/it';
import { anchorToToday } from '@gantry/core/demo';
import { AppThemeService } from '../shell/app-theme.service';

// ── Italian translation (partial override — the rest falls back to EN) ──
const IT_LABELS: Partial<GanttLabels> = {
  loading: 'Caricamento…',
  loadMore: 'Carica altro',
  allLoaded: n => `Tutte le ${n} attività caricate`,
  loadError: 'Impossibile caricare le attività',
  retry: 'Riprova',
  zoomIn: 'Ingrandisci',
  zoomOut: 'Riduci',
  todayButton: 'Oggi',
  viewModes: {
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
  viewSplit: 'Gantt',
  viewTable: 'Tabella',
  viewChart: 'Grafico',
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
const OWNERS: Record<string, Owner> = {
  ale: { name: 'Alessia M.', initials: 'AM', color: '#6366F1' },
  tom: { name: 'Tomás R.', initials: 'TR', color: '#10B981' },
  kai: { name: 'Kai N.', initials: 'KN', color: '#EC4899' },
  liv: { name: 'Liv B.', initials: 'LB', color: '#F59E0B' },
  sam: { name: 'Sam O.', initials: 'SO', color: '#0EA5E9' },
};

// ── Status ────────────────────────────────────────────────────
type StatusId = 'done' | 'on-track' | 'at-risk';
interface Status {
  label: string;
  color: string;
  bg: string;
}
const STATUS: Record<StatusId, Status> = {
  done: { label: 'Done', color: '#059669', bg: 'rgba(16,185,129,0.15)' },
  'on-track': { label: 'On track', color: '#4f46e5', bg: 'rgba(99,102,241,0.15)' },
  'at-risk': { label: 'At risk', color: '#d97706', bg: 'rgba(245,158,11,0.16)' },
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
    barColor: '#6366F1',
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
    barColor: '#6366F1',
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
    barColor: '#EC4899',
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
    barColor: '#EC4899',
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
    barColor: '#0EA5E9',
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
    barColor: '#0EA5E9',
    data: m('sam', 'on-track'),
  },
];

@Component({
  selector: 'app-roadmap',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GantryComponent],
  template: `
    <div class="rm-bar app-dotted-grid">
      <div class="rm-head">
        <span class="rm-kicker">// showcase</span>
        <h1 class="rm-title">
          Nimbus — Product Roadmap <span>{{ planYears }}</span>
        </h1>
        <p class="rm-sub">3 squads · dependencies · baselines · release milestones · custom panel columns</p>
      </div>
      <div class="rm-legend">
        <span class="lg"><i class="dot" style="background:#059669"></i>Done</span>
        <span class="lg"><i class="dot" style="background:#4f46e5"></i>On track</span>
        <span class="lg"><i class="dot" style="background:#d97706"></i>At risk</span>
        <span class="rm-lang">
          <button type="button" [class.on]="lang() === 'en'" (click)="lang.set('en')">EN</button>
          <button type="button" [class.on]="lang() === 'it'" (click)="lang.set('it')">IT</button>
        </span>
      </div>
    </div>

    <!-- Custom left-panel column templates (rendered via cellTemplate) -->
    <ng-template #ownerCell let-row>
      @if (owner(row); as o) {
        <span class="cell-owner">
          <span class="avatar" [style.background]="o.color">{{ o.initials }}</span>
          <span class="owner-name">{{ o.name }}</span>
        </span>
      }
    </ng-template>

    <ng-template #statusCell let-row>
      @if (status(row); as s) {
        <span class="badge" [style.color]="s.color" [style.background]="s.bg">{{ s.label }}</span>
      }
    </ng-template>

    <gantry
      [series]="tasks"
      [columns]="columns()"
      [options]="opts()"
      [darkMode]="theme.mode()"
      [showToolbar]="true"
      [enableDrag]="true"
      [enableResize]="true"
      [tooltipEnabled]="true"
      [showLegend]="true"
    />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .rm-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 14px 20px;
        flex-shrink: 0;
        background: hsl(var(--card));
        border-bottom: 1px solid hsl(var(--border));
      }
      .rm-kicker {
        font-family: var(--app-font-mono);
        font-size: 11px;
        font-weight: 600;
        color: hsl(var(--primary));
        letter-spacing: 0.4px;
      }
      .rm-title {
        font-size: 19px;
        font-weight: 700;
        color: hsl(var(--fg));
        margin-top: 2px;
      }
      .rm-title span {
        color: hsl(var(--primary));
      }
      .rm-sub {
        font-size: 12px;
        color: hsl(var(--muted-fg));
        margin-top: 3px;
      }
      .rm-legend {
        display: flex;
        gap: 14px;
        align-items: center;
      }
      .rm-legend .lg {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11.5px;
        color: hsl(var(--muted-fg));
        font-weight: 500;
      }
      .rm-legend .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
      }
      .rm-lang {
        display: inline-flex;
        gap: 2px;
        margin-left: 6px;
      }
      .rm-lang button {
        padding: 2px 8px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid hsl(var(--border));
        background: hsl(var(--muted));
        color: hsl(var(--muted-fg));
        border-radius: var(--app-radius-sm);
      }
      .rm-lang button.on {
        background: hsl(var(--primary));
        border-color: hsl(var(--primary));
        color: hsl(var(--primary-fg));
      }

      /* Custom cells */
      .cell-owner {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        overflow: hidden;
        width: 100%;
      }
      .avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        flex-shrink: 0;
        border-radius: 50%;
        color: #fff;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: -0.3px;
      }
      .owner-name {
        font-size: 12px;
        color: hsl(var(--fg));
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .badge {
        padding: 2px 9px;
        border-radius: 999px;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.2px;
        white-space: nowrap;
      }

      gantry {
        flex: 1;
        min-height: 0;
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

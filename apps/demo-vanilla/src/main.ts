// The Web Component options playground. The controls edit a `PlaygroundState` (demo-kit's
// playground model, shared with the site's /playground page); the chart runs its options, the
// Code card prints them for each framework and `?setup=` keeps them in the link.
//
// e2e drives this page: its chart is the first <gantry-element>, and options, darkMode or tasks a
// test assigns stay put — the page re-assigns options only when a control changes (or the zoom
// changes while the chart still runs the playground's options), darkMode only when the site theme
// changes, and never tasks (the chart applies its own edits; `tasks-change` is only logged).
import 'demo-kit/site.css';
import './playground.css';
import '@gantryjs/vanilla';
import type { GanttOptions, GanttTask } from '@gantryjs/vanilla';
import { createDemoData } from '@gantryjs/core/demo';
import faviconUrl from 'demo-kit/favicon.svg?url';
import {
  PLAYGROUND_DEFAULTS,
  changedKeys,
  decodeState,
  editEventText,
  encodeState,
  exportEventText,
  playgroundCommand,
  playgroundOptions,
  playgroundResources,
  withPlaygroundResources,
  withValue,
  type PlaygroundEditEvent,
  type PlaygroundEditEvents,
  type PlaygroundExportEvent,
  type PlaygroundExportEvents,
  type PlaygroundState,
} from 'demo-kit/playground';
import { PACKAGES, SITE } from 'demo-kit/site';
import { initTheme, onThemeChange, toggleTheme, type SiteTheme } from 'demo-kit/theme';
import { codePanel } from './code-panel';
import { byId, drawIcon, drawIcons, h } from './dom';
import { eventLog } from './event-log';
import { copyButton } from './feedback';
import { buildOptionsForm } from './options-form';

const SETUP_PARAM = 'setup';

const gantt = document.querySelector('gantry-element')!;

// ── Shell: favicon, version, links, icons, theme ─────────────

document.head.append(h('link', { rel: 'icon', type: 'image/svg+xml', href: faviconUrl }));
byId('site-version').textContent = `v${SITE.version}`;
byId<HTMLAnchorElement>('site-repo').href = SITE.repoUrl;
byId('footer-meta').append(
  h('strong', {}, SITE.name),
  ` v${SITE.version} · ${SITE.license} · `,
  h('a', { href: SITE.repoUrl }, 'GitHub'),
  ' · ',
  h('a', { href: PACKAGES.vanilla.npmUrl }, 'npm'),
  ' · made by ',
  h('a', { href: SITE.authorUrl }, SITE.author),
);
byId('footer-tagline').textContent = SITE.tagline;
drawIcons(document.body);

const themeToggle = byId<HTMLButtonElement>('theme-toggle');
const showTheme = (theme: SiteTheme) => {
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
  drawIcon(themeToggle.querySelector('svg')!, theme === 'dark' ? 'sun' : 'moon');
  // The chart follows the site theme when it changes, never in between
  gantt.darkMode = theme === 'dark';
};
onThemeChange(showTheme);
themeToggle.addEventListener('click', () => toggleTheme());
initTheme();

// ── Chart ────────────────────────────────────────────────────

// The demo plan, moved so today sits about 40% into it
const demo = createDemoData();
gantt.tasks = withPlaygroundResources(demo.tasks);
gantt.resources = playgroundResources();
gantt.annotations = demo.annotations;
gantt.showLegend = true;

// ── State: controls → options, code and link ────────────────

let state: PlaygroundState = decodeState(new URLSearchParams(location.search).get(SETUP_PARAM));
/** The options object the page last gave the chart (to tell them from options a script assigned). */
let applied: GanttOptions | undefined;

const form = buildOptionsForm(byId('options'), (key, value) => setState(withValue(state, key, value)));
const code = codePanel(state);
const changedCount = byId('options-changed');

function applyOptions(): void {
  applied = playgroundOptions(state, new Date());
  gantt.options = applied;
}

/** Shows `state` everywhere but in the chart: controls, changed count, code and the link. */
function showState(): void {
  form.sync(state);
  changedCount.textContent = String(changedKeys(state).length);
  code.update(state);
  const url = new URL(location.href);
  const setup = encodeState(state);
  if (setup) url.searchParams.set(SETUP_PARAM, setup);
  else url.searchParams.delete(SETUP_PARAM);
  if (url.href !== location.href) history.replaceState(history.state, '', url);
}

function setState(next: PlaygroundState): void {
  if (next === state) return;
  const command = playgroundCommand(state, next);
  state = next;
  showState();
  applyOptions();
  if (command) gantt[command]();
}

byId('options-reset').addEventListener('click', () => setState({ ...PLAYGROUND_DEFAULTS }));
byId('today').addEventListener('click', () => gantt.scrollToToday());
copyButton(byId<HTMLButtonElement>('copy-link'), () => location.href, {
  icon: 'link',
  doneMessage: 'Link to this setup copied to the clipboard',
});

// ── Events ───────────────────────────────────────────────────

const log = eventLog();
const taskName = (id: string) => gantt.tasks.find((t: GanttTask) => t.id === id)?.name ?? id;
const days = (n: number) => `${n > 0 ? '+' : ''}${n} day${Math.abs(n) === 1 ? '' : 's'}`;

gantt.addEventListener('task-dragged', e => {
  log.add('task-dragged', `${taskName(e.detail.taskId)} · ${days(e.detail.daysMoved)}`);
});
gantt.addEventListener('task-resized', e => {
  log.add('task-resized', `${taskName(e.detail.taskId)} · ${e.detail.edge} ${days(e.detail.daysDelta)}`);
});
gantt.addEventListener('selection-change', e => {
  const ids = e.detail.selectedIds;
  log.add('selection-change', ids.length ? ids.map(taskName).join(', ') : 'none');
});
gantt.addEventListener('state-change', e => {
  const s = e.detail;
  const panel = s.panelCollapsed ? 'collapsed' : s.panelWidth != null ? `${Math.round(s.panelWidth)} px` : 'default';
  log.add('state-change', `view ${s.view ?? 'split'} · zoom ${s.viewMode ?? '—'} · panel ${panel}`);
});
// The toolbar, the + / − keys and a restored layout change the zoom: keep the Zoom control in step
gantt.addEventListener('view-mode-change', e => {
  log.add('view-mode-change', e.detail.viewMode);
  const next = withValue(state, 'viewMode', e.detail.viewMode);
  if (next.viewMode === state.viewMode) return; // same zoom, or a custom level the control lacks
  const runsOurOptions = gantt.options === applied;
  state = next;
  showState();
  // Re-derive the options (the week tiers belong to the Week zoom) unless a script replaced them
  if (runsOurOptions) applyOptions();
});

// Editing: every change (drag, keyboard, cell, link, undo…) goes through the chart's pipeline. The
// chart applies it itself, so `tasks-change` is only logged: the names above read the edited tasks
const logEdit = <K extends PlaygroundEditEvent>(event: K, detail: PlaygroundEditEvents[K]) =>
  log.add(event, editEventText(event, detail, taskName));
gantt.addEventListener('before-change', e => logEdit('before-change', e.detail));
gantt.addEventListener('task-progress-changed', e => logEdit('task-progress-changed', e.detail));
gantt.addEventListener('dependency-created', e => logEdit('dependency-created', e.detail));
gantt.addEventListener('dependency-deleted', e => logEdit('dependency-deleted', e.detail));
gantt.addEventListener('task-updated', e => logEdit('task-updated', e.detail));
gantt.addEventListener('tasks-change', e => logEdit('tasks-change', e.detail));
gantt.addEventListener('history-change', e => logEdit('history-change', e.detail));

// Export: a download or print from the toolbar's Export menu (`toolbar.export`) or a script
const logExport = <K extends PlaygroundExportEvent>(event: K, detail: PlaygroundExportEvents[K]) =>
  log.add(event, exportEventText(event, detail));
gantt.addEventListener('before-export', e => logExport('before-export', e.detail));
gantt.addEventListener('export', e => logExport('export', e.detail));

showState();
applyOptions();

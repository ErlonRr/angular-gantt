<script lang="ts">
  import {
    Gantry,
    ViewMode,
    type GantryElement,
    type GanttTask,
    type TaskDragEvent,
    type TaskResizeEvent,
  } from '@gantryjs/svelte';
  import { createDemoData } from '@gantryjs/core/demo';
  import { galleryHash } from 'demo-kit/gallery';
  import { PACKAGES, SITE } from 'demo-kit/site';
  import { getTheme, onThemeChange, toggleTheme } from 'demo-kit/theme';
  import Icon from './Icon.svelte';

  const PKG = PACKAGES.svelte;
  const VIEW_MODES = Object.values(ViewMode);

  let gantt = $state<GantryElement>();
  let mainEl = $state<HTMLElement>();
  // The demo plan is moved so today sits inside it
  const demo = createDemoData();
  // `$state.raw`: no proxy around every task; replacing the array re-renders the chart
  let tasks = $state.raw<GanttTask[]>(demo.tasks);
  let viewMode = $state<string>(ViewMode.Month);
  let baseline = $state(false);
  let criticalPath = $state(false);
  let status = $state('Drag or resize a bar, or select a row.');

  // The chart follows the site theme (initialised in main.ts)
  let theme = $state(getTheme());
  $effect(() => onThemeChange(t => (theme = t)));
  const dark = $derived(theme === 'dark');

  const options = $derived({ viewMode, baseline, criticalPath });

  function applyDates(e: TaskDragEvent | TaskResizeEvent) {
    tasks = tasks.map(t => (t.id === e.taskId ? { ...t, start: e.newStart, end: e.newEnd } : t));
  }

  /** The skip link moves focus to the content without touching the URL. */
  function skip(e: MouseEvent) {
    e.preventDefault();
    mainEl?.focus();
    mainEl?.scrollIntoView();
  }
</script>

<div class="gs-app">
  <a class="gs-skip" href="#main" onclick={skip}>Skip to content</a>
  <header class="gs-header">
    <div class="gs-container gs-header-inner">
      <div class="gs-brand">
        <span class="gs-logo" aria-hidden="true"></span>
        <span>{SITE.name}</span>
        <span class="gs-version">v{SITE.version}</span>
        <span class="gs-badge">Svelte</span>
      </div>
      <nav class="gs-nav" aria-label="Primary">
        <ul class="gs-nav-list">
          <li>
            <a class="gs-nav-link" href="#/" aria-current="page"><Icon name="home" /><span>Home</span></a>
          </li>
          <li>
            <a class="gs-nav-link" href={galleryHash()}><Icon name="examples" /><span>Examples</span></a>
          </li>
        </ul>
      </nav>
      <div class="gs-header-actions">
        <button type="button" class="gs-icon-btn" aria-label="Dark theme" aria-pressed={dark} onclick={toggleTheme}>
          <Icon name={dark ? 'sun' : 'moon'} />
        </button>
        <a class="gs-icon-btn" href={SITE.repoUrl} aria-label="Source code on GitHub">
          <Icon name="github" />
        </a>
      </div>
    </div>
  </header>

  <main id="main" bind:this={mainEl} class="gs-main fw-main" tabindex="-1">
    <div class="gs-container">
      <div class="gs-page-head fw-head">
        <div>
          <p class="gs-eyebrow">Svelte · {PKG.name}</p>
          <h1 class="gs-title">Gantry in Svelte</h1>
          <p class="gs-lead">
            Each prop is set only when it changes; <code class="gs-code-inline">bind:element</code> gives you the element.
          </p>
        </div>
      </div>

      <div class="gs-card fw-controls">
        <div class="gs-card-body gs-toolbar">
          <div class="gs-seg" role="group" aria-label="Chart features">
            <button type="button" class="gs-seg-btn" aria-pressed={baseline} onclick={() => (baseline = !baseline)}>
              Baseline
            </button>
            <button
              type="button"
              class="gs-seg-btn"
              aria-pressed={criticalPath}
              onclick={() => (criticalPath = !criticalPath)}
            >
              Critical path
            </button>
          </div>
          <div class="fw-zoom">
            <label class="gs-label" for="zoom">Zoom</label>
            <select id="zoom" class="gs-select" bind:value={viewMode}>
              {#each VIEW_MODES as v (v)}<option>{v}</option>{/each}
            </select>
          </div>
          <button type="button" class="gs-btn gs-btn--sm" onclick={() => gantt?.scrollToToday()}>
            <Icon name="today" />
            Today
          </button>
          <span class="gs-spacer"></span>
          <p class="gs-value fw-status" role="status" aria-live="polite">{status}</p>
        </div>
      </div>

      <div class="gs-card gs-app-chart">
        <Gantry
          bind:element={gantt}
          class="gs-chart"
          {tasks}
          annotations={demo.annotations}
          {options}
          darkMode={dark}
          showLegend
          onTaskDragged={e => {
            applyDates(e);
            status = `Moved ${e.taskId} by ${e.daysMoved} day(s)`;
          }}
          onTaskResized={e => {
            applyDates(e);
            status = `Resized ${e.taskId} (${e.handle}) by ${e.daysDelta} day(s)`;
          }}
          onSelectionChange={e => (status = `Selected: ${e.selectedIds.join(', ') || 'none'}`)}
          onViewModeChange={e => (viewMode = e.viewMode)}
        />
      </div>
    </div>
  </main>

  <footer class="gs-footer">
    <div class="gs-container">
      <p>
        <strong>{SITE.name}</strong> v{SITE.version} · {SITE.license} · <a href={SITE.repoUrl}>GitHub</a> ·
        <a href={PKG.npmUrl}>npm</a> · made by <a href={SITE.authorUrl}>{SITE.author}</a>
      </p>
      <p>{SITE.tagline}</p>
    </div>
  </footer>
</div>

<style>
  /* Page-local layout: the chart card (gs-app-chart) stays in the first viewport (1400 × 820) */
  .gs-main.fw-main {
    padding-top: 20px;
  }
  .gs-page-head.fw-head {
    margin-bottom: 20px;
  }
  .fw-controls {
    margin-bottom: 12px;
  }
  .fw-controls > .gs-card-body {
    padding-block: 12px;
  }
  .fw-zoom {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .fw-zoom > .gs-select {
    width: auto;
  }
  .fw-status {
    margin: 0;
  }
</style>

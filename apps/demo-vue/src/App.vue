<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, useTemplateRef } from 'vue';
import { Gantry, ViewMode, type GanttTask, type TaskDragEvent, type TaskResizeEvent } from '@gantry/vue';
import { createDemoData } from '@gantry/core/demo';
import { PACKAGES, SITE } from 'demo-kit/site';
import { getTheme, onThemeChange, toggleTheme, type SiteTheme } from 'demo-kit/theme';
import { Icon } from './Icon';

const PKG = PACKAGES.vue;
const VIEW_MODES = Object.values(ViewMode);

const gantt = shallowRef<InstanceType<typeof Gantry> | null>(null);
const mainEl = useTemplateRef<HTMLElement>('main');
// The demo plan is moved so today sits inside it
const demo = createDemoData();
const tasks = ref<GanttTask[]>(demo.tasks);
const viewMode = ref<string>(ViewMode.Month);
const baseline = ref(false);
const criticalPath = ref(false);
const status = ref('Drag or resize a bar, or select a row.');

// The chart follows the site theme (initialised in main.ts)
const theme = ref<SiteTheme>(getTheme());
onUnmounted(onThemeChange(t => (theme.value = t)));
const dark = computed(() => theme.value === 'dark');

const options = computed(() => ({
  viewMode: viewMode.value,
  baseline: baseline.value,
  criticalPath: criticalPath.value,
}));

function applyDates(e: TaskDragEvent | TaskResizeEvent) {
  const task = tasks.value.find(t => t.id === e.taskId);
  if (task) Object.assign(task, { start: e.newStart, end: e.newEnd });
}
function onDragged(e: TaskDragEvent) {
  applyDates(e);
  status.value = `Moved ${e.taskId} by ${e.daysMoved} day(s)`;
}
function onResized(e: TaskResizeEvent) {
  applyDates(e);
  status.value = `Resized ${e.taskId} (${e.handle}) by ${e.daysDelta} day(s)`;
}
/** The skip link moves focus to the content without touching the URL. */
function skip() {
  mainEl.value?.focus();
  mainEl.value?.scrollIntoView();
}
</script>

<template>
  <div class="gs-app">
    <a class="gs-skip" href="#main" @click.prevent="skip">Skip to content</a>
    <header class="gs-header">
      <div class="gs-container gs-header-inner">
        <div class="gs-brand">
          <span class="gs-logo" aria-hidden="true"></span>
          <span>{{ SITE.name }}</span>
          <span class="gs-version">v{{ SITE.version }}</span>
          <span class="gs-badge">Vue</span>
        </div>
        <div class="gs-header-actions">
          <button type="button" class="gs-icon-btn" aria-label="Dark theme" :aria-pressed="dark" @click="toggleTheme()">
            <Icon :name="dark ? 'sun' : 'moon'" />
          </button>
          <a class="gs-icon-btn" :href="SITE.repoUrl" aria-label="Source code on GitHub">
            <Icon name="github" />
          </a>
        </div>
      </div>
    </header>

    <main id="main" ref="main" class="gs-main fw-main" tabindex="-1">
      <div class="gs-container">
        <div class="gs-page-head fw-head">
          <div>
            <p class="gs-eyebrow">Vue · {{ PKG.name }}</p>
            <h1 class="gs-title">Gantry in Vue</h1>
            <p class="gs-lead">Props and listeners are set before Vue inserts the element: no flash of defaults.</p>
          </div>
        </div>

        <div class="gs-card fw-controls">
          <div class="gs-card-body gs-toolbar">
            <div class="gs-seg" role="group" aria-label="Chart features">
              <button type="button" class="gs-seg-btn" :aria-pressed="baseline" @click="baseline = !baseline">
                Baseline
              </button>
              <button
                type="button"
                class="gs-seg-btn"
                :aria-pressed="criticalPath"
                @click="criticalPath = !criticalPath"
              >
                Critical path
              </button>
            </div>
            <div class="fw-zoom">
              <label class="gs-label" for="zoom">Zoom</label>
              <select id="zoom" v-model="viewMode" class="gs-select">
                <option v-for="v in VIEW_MODES" :key="v">{{ v }}</option>
              </select>
            </div>
            <button type="button" class="gs-btn gs-btn--sm" @click="gantt?.element?.scrollToToday()">
              <Icon name="today" />
              Today
            </button>
            <span class="gs-spacer"></span>
            <p class="gs-value fw-status" role="status" aria-live="polite">{{ status }}</p>
          </div>
        </div>

        <div class="gs-card fw-chart-card">
          <Gantry
            ref="gantt"
            class="gs-chart"
            :tasks="tasks"
            :annotations="demo.annotations"
            :options="options"
            :dark-mode="dark"
            show-legend
            @task-dragged="onDragged"
            @task-resized="onResized"
            @selection-change="e => (status = `Selected: ${e.selectedIds.join(', ') || 'none'}`)"
            @view-mode-change="e => (viewMode = e.viewMode)"
          />
        </div>
      </div>
    </main>

    <footer class="gs-footer">
      <div class="gs-container">
        <p>
          <strong>{{ SITE.name }}</strong> v{{ SITE.version }} · {{ SITE.license }} ·
          <a :href="SITE.repoUrl">GitHub</a> · <a :href="PKG.npmUrl">npm</a> · made by
          <a :href="SITE.authorUrl">{{ SITE.author }}</a>
        </p>
        <p>{{ SITE.tagline }}</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Page-local layout: the chart stays in the first viewport (1400 × 820) */
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
.fw-chart-card {
  height: clamp(480px, calc(100vh - 300px), 760px);
}
</style>

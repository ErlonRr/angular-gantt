<!--
  The code of a case: this app's own files of the case (read with `?raw`) and the shared data and
  options (`demo-kit/gallery/cases/<id>.ts`, from the generated sources). A tab list with automatic
  activation: one tab stop, ←/→ and Home/End move and select.
-->
<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef } from 'vue';
import type { CaseId } from 'demo-kit/gallery';
import { CASE_SOURCES, type SourceFile } from 'demo-kit/gallery/sources';
import CodeBlock from './CodeBlock.vue';
import { ownSources } from './cases';
import { FRAMEWORK, FRAMEWORK_LABEL } from './links';

type Tab = typeof FRAMEWORK | 'shared';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: FRAMEWORK, label: FRAMEWORK_LABEL },
  { id: 'shared', label: 'Shared data' },
];

const props = defineProps<{ id: CaseId }>();

const tab = ref<Tab>(FRAMEWORK);
const loaded = shallowRef<{ own: SourceFile[]; shared: SourceFile[] } | 'error' | null>(null);

let live = true;
onUnmounted(() => (live = false));
Promise.all([ownSources(props.id), CASE_SOURCES[props.id]()]).then(
  ([own, sources]) => live && (loaded.value = { own, shared: sources.shared }),
  () => live && (loaded.value = 'error'),
);

const files = computed(() =>
  loaded.value && loaded.value !== 'error' ? (tab.value === 'shared' ? loaded.value.shared : loaded.value.own) : [],
);
const label = computed(() => TABS.find(t => t.id === tab.value)!.label);

function onKey(e: KeyboardEvent) {
  const from = TABS.findIndex(t => t.id === tab.value);
  const to = new Map([
    ['ArrowRight', from + 1],
    ['ArrowLeft', from - 1],
    ['Home', 0],
    ['End', TABS.length - 1],
  ]).get(e.key);
  if (to === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  const i = (to + TABS.length) % TABS.length;
  tab.value = TABS[i].id;
  (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]')[i]?.focus();
}
</script>

<template>
  <div class="gs-tabs" role="tablist" aria-label="Code" @keydown="onKey">
    <button
      v-for="t in TABS"
      :id="`case-tab-${t.id}`"
      :key="t.id"
      type="button"
      role="tab"
      class="gs-tab"
      :aria-selected="t.id === tab"
      :aria-controls="t.id === tab ? 'case-code-panel' : undefined"
      :tabindex="t.id === tab ? 0 : -1"
      @click="tab = t.id"
    >
      {{ t.label }}
    </button>
  </div>
  <!-- Without a code block (each one a tab stop) the panel itself is one -->
  <div
    id="case-code-panel"
    class="gs-stack"
    role="tabpanel"
    :aria-labelledby="`case-tab-${tab}`"
    :tabindex="files.length ? undefined : 0"
  >
    <p v-if="loaded === 'error'" class="gs-case-hint">The code could not be loaded. Reload the page to try again.</p>
    <p v-else-if="!loaded" class="gs-case-hint">Loading the code…</p>
    <template v-else-if="files.length">
      <CodeBlock v-for="f in files" :key="f.file" :file="f" />
    </template>
    <p v-else class="gs-case-hint">
      This example has no {{ label }} file yet: this page draws the shared data and options of the Shared data tab.
    </p>
  </div>
</template>

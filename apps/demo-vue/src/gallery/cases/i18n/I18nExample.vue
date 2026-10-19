<!--
  One chart in four languages: `locale` names the months and days (through Intl), `formats` sets
  the dates and `labels` every UI string. The chart's `lang` attribute tells screen readers.
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import { I18N_INITIAL, I18N_LOCALES, i18nOptions, i18nTasks } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const tasks = i18nTasks(new Date());
const locale = shallowRef(I18N_INITIAL);
const options = computed(() => i18nOptions(locale.value));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="i18n-language-label">Language</span>
        <div class="gs-seg" role="group" aria-labelledby="i18n-language-label">
          <button
            v-for="choice in I18N_LOCALES"
            :key="choice.value"
            type="button"
            class="gs-seg-btn"
            :lang="choice.value"
            :aria-pressed="locale === choice.value"
            @click="locale = choice.value"
          >
            {{ choice.label }}
          </button>
        </div>
      </div>
    </div>
    <Gantry class="gs-chart gs-case-chart" :lang="locale" :tasks="tasks" :options="options" :dark-mode="dark" />
    <p class="gs-case-hint">Task names are your data and stay as they are; every string of the chart changes.</p>
  </div>
</template>

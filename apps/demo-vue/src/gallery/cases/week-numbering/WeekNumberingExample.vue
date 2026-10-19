<!--
  Week numbers in the header: the numbering rule (`weekNumbering`: ISO, US or the locale's), the first
  day of the week (`weekStart`) and the `locale`, on two zoom levels of its own (`WEEK_FORMATS`).
-->
<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  WEEK_LOCALES,
  WEEK_NUMBERINGS,
  WEEK_NUMBERING_INITIAL,
  WEEK_STARTS,
  weekNumberingOptions,
  weekNumberingTasks,
  type WeekNumberingChoice,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const tasks = weekNumberingTasks(new Date());

// The three selects edit this object (`v-model` keeps the week starts as numbers)
const choice = reactive<WeekNumberingChoice>({ ...WEEK_NUMBERING_INITIAL });
// Its own zoom levels, `weekNumbering`, `weekStart` (unless "From the rule") and `locale`
const options = computed(() => weekNumberingOptions(choice));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <label for="week-numbering-numbering">Numbering</label>
        <select id="week-numbering-numbering" v-model="choice.numbering" class="gs-select">
          <option v-for="c in WEEK_NUMBERINGS" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>
      <div class="gs-case-control">
        <label for="week-numbering-week-start">Week starts on</label>
        <select id="week-numbering-week-start" v-model="choice.weekStart" class="gs-select">
          <option v-for="c in WEEK_STARTS" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>
      <div class="gs-case-control">
        <label for="week-numbering-locale">Locale</label>
        <select id="week-numbering-locale" v-model="choice.locale" class="gs-select">
          <option v-for="c in WEEK_LOCALES" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>
    </div>

    <Gantry class="gs-chart gs-case-chart" :tasks="tasks" :options="options" :dark-mode="dark" />
  </div>
</template>

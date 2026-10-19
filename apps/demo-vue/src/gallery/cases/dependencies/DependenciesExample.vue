<!--
  The four dependency types with lag and lead (`task.dependency`), the critical path
  (`criticalPath`) and orthogonal or straight arrows (`arrows.routing`).
-->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Gantry } from '@gantryjs/vue';
import {
  DEPENDENCIES_INITIAL,
  DEPENDENCIES_ROUTINGS,
  DEPENDENCY_LEGEND,
  dependenciesOptions,
  dependenciesTasks,
  type ArrowRouting,
} from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

const dark = useDarkMode();
const tasks = dependenciesTasks(new Date());

const routing = shallowRef<ArrowRouting>(DEPENDENCIES_INITIAL.routing);
const criticalPath = shallowRef(DEPENDENCIES_INITIAL.criticalPath);
const options = computed(() => dependenciesOptions(routing.value, criticalPath.value));
</script>

<template>
  <div class="gs-case">
    <div class="gs-case-controls">
      <div class="gs-case-control">
        <span id="dependencies-arrows-label">Arrows</span>
        <div class="gs-seg" role="group" aria-labelledby="dependencies-arrows-label">
          <button
            v-for="r in DEPENDENCIES_ROUTINGS"
            :key="r.value"
            type="button"
            class="gs-seg-btn"
            :aria-pressed="routing === r.value"
            @click="routing = r.value"
          >
            {{ r.label }}
          </button>
        </div>
      </div>
      <label class="gs-switch gs-case-control">
        <span>Critical path</span>
        <input v-model="criticalPath" type="checkbox" role="switch" />
      </label>
    </div>
    <Gantry class="gs-chart gs-case-chart" :tasks="tasks" :options="options" :dark-mode="dark" />
    <!-- The link types of this plan -->
    <dl class="gs-case-keys">
      <template v-for="link in DEPENDENCY_LEGEND" :key="link.type">
        <dt>
          <code class="gs-code-inline">{{ link.type }}</code> {{ link.label }}
        </dt>
        <dd>{{ link.example }}</dd>
      </template>
    </dl>
  </div>
</template>

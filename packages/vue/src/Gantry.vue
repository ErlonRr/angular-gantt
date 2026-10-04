<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import type { GanttTask, GanttOptions, ColumnDef } from '@gantry/core';
import '@gantry/vanilla';

const props = defineProps<{
  tasks: GanttTask[];
  columns?: ColumnDef[];
  options?: GanttOptions;
}>();

const emit = defineEmits<{
  (e: 'taskUpdated', task: GanttTask): void;
}>();

const gantryRef = ref<HTMLElement | null>(null);

watch(() => props.tasks, (newTasks) => {
  if (gantryRef.value) {
    (gantryRef.value as any).tasks = newTasks;
  }
}, { deep: true });

watch(() => props.columns, (newCols) => {
  if (gantryRef.value && newCols) {
    (gantryRef.value as any).columns = newCols;
  }
}, { deep: true });

watch(() => props.options, (newOptions) => {
  if (gantryRef.value && newOptions) {
    (gantryRef.value as any).options = newOptions;
  }
}, { deep: true });

const handleUpdate = (e: Event) => {
  const customEvent = e as CustomEvent<GanttTask>;
  emit('taskUpdated', customEvent.detail);
};

onMounted(() => {
  if (gantryRef.value) {
    (gantryRef.value as any).tasks = props.tasks;
    if (props.columns) {
      (gantryRef.value as any).columns = props.columns;
    }
    if (props.options) {
      (gantryRef.value as any).options = props.options;
    }
    gantryRef.value.addEventListener('taskUpdated', handleUpdate);
  }
});

onUnmounted(() => {
  if (gantryRef.value) {
    gantryRef.value.removeEventListener('taskUpdated', handleUpdate);
  }
});
</script>

<template>
  <gantry-element ref="gantryRef" style="width: 100%; height: 100%; display: block;"></gantry-element>
</template>

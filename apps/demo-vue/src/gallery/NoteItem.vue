<!-- One known framework difference (`FRAMEWORK_NOTES`): topic, bindings, text, what to do, until when. -->
<script setup lang="ts">
import { computed } from 'vue';
import { GALLERY_FRAMEWORKS, GALLERY_FRAMEWORK_LABELS, type FrameworkNote } from 'demo-kit/gallery';
import { InlineCode } from './InlineCode';

const props = defineProps<{ note: FrameworkNote }>();

const frameworks = computed(() =>
  props.note.frameworks.length === GALLERY_FRAMEWORKS.length
    ? 'All bindings'
    : props.note.frameworks.map(f => GALLERY_FRAMEWORK_LABELS[f]).join(', '),
);
</script>

<template>
  <li class="gs-case-note">
    <p class="gs-case-note-meta">
      <span class="gs-tag">{{ note.area }}</span>
      <span>{{ frameworks }}</span>
    </p>
    <p><InlineCode :text="note.text" /></p>
    <p v-if="note.workaround"><strong>What to do: </strong><InlineCode :text="note.workaround" /></p>
    <p v-if="note.until"><strong>Until</strong> {{ note.until }}.</p>
  </li>
</template>

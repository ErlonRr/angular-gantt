<!-- A dark code block with its file name and a Copy button that says "Copied" for a moment and announces it. -->
<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import type { SourceFile } from 'demo-kit/gallery/sources';
import { Icon } from '../Icon';

const props = defineProps<{ file: SourceFile }>();

const copied = ref(false);
const status = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
onUnmounted(() => clearTimeout(timer));

function done(ok: boolean) {
  copied.value = ok;
  status.value = ok ? 'Copied to the clipboard' : 'Copy failed: select the text and copy it';
  clearTimeout(timer);
  timer = setTimeout(() => {
    copied.value = false;
    status.value = '';
  }, 1600);
}

function copy() {
  if (!navigator.clipboard) return done(false);
  navigator.clipboard.writeText(props.file.code).then(
    () => done(true),
    () => done(false),
  );
}
</script>

<template>
  <div class="gs-code gs-code--scroll">
    <div class="gs-code-head">
      <span>{{ file.file }}</span>
      <button type="button" class="gs-copy" :aria-label="`Copy ${file.file}`" @click="copy">
        <Icon :name="copied ? 'check' : 'copy'" />
        <span aria-hidden="true">{{ copied ? 'Copied' : 'Copy' }}</span>
      </button>
      <span class="gs-sr-only" role="status">{{ status }}</span>
    </div>
    <pre tabindex="0" :aria-label="`${file.file} code`"><code>{{ file.code }}</code></pre>
  </div>
</template>

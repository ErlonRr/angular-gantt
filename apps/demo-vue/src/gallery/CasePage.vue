<!--
  `#/examples/<id>`: a gallery case. The live Vue example (the case's own component when it has one,
  else the generic renderer), the same case in the other frameworks, its code (this app's files and
  the shared data), the framework differences it runs into, and the previous and next cases. The
  page is keyed by the case: a new case starts fresh.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { caseNeighbours, categoryOf, galleryCase, galleryHash, notesForCase, type CaseId } from 'demo-kit/gallery';
import { Icon } from '../Icon';
import { CASE_COMPONENTS } from './cases';
import CodeTabs from './CodeTabs.vue';
import GenericCase from './GenericCase.vue';
import NoteItem from './NoteItem.vue';
import { FRAMEWORK_LABEL, caseLinks } from './links';

const props = defineProps<{ id: CaseId }>();

const info = computed(() => galleryCase(props.id));
const category = computed(() => categoryOf(props.id));
const notes = computed(() => notesForCase(props.id));
const neighbours = computed(() => caseNeighbours(props.id));
const links = computed(() => caseLinks(props.id));
const CaseComponent = computed(() => CASE_COMPONENTS[props.id]);
</script>

<template>
  <header class="gs-page-head">
    <div>
      <p class="gs-eyebrow">Example · {{ category.label }}</p>
      <h1 class="gs-title">{{ info.title }}</h1>
      <p class="gs-lead">{{ info.summary }}</p>
    </div>
    <a class="gs-btn gs-btn--sm" :href="galleryHash()">
      <span class="gl-back" aria-hidden="true"><Icon name="arrowRight" /></span>
      All examples
    </a>
  </header>

  <section aria-labelledby="case-live-title">
    <h2 id="case-live-title" class="gs-sr-only">Live example in {{ FRAMEWORK_LABEL }}</h2>
    <component :is="CaseComponent" v-if="CaseComponent" />
    <GenericCase v-else :id="id" />
    <nav class="gs-case-live" aria-label="This example in every framework">
      <p>Live in</p>
      <ul class="gs-gallery-links">
        <li v-for="link in links" :key="link.fw">
          <a class="gs-gallery-link" :href="link.href" :aria-current="link.current ? 'page' : undefined">{{
            link.label
          }}</a>
        </li>
      </ul>
    </nav>
    <ul class="gs-gallery-tags gl-tags" aria-label="Options and APIs">
      <li v-for="tag in info.tags" :key="tag" class="gs-tag">{{ tag }}</li>
    </ul>
  </section>

  <section class="gs-case-section" aria-labelledby="case-code-title">
    <h2 id="case-code-title" class="gs-h2">Code</h2>
    <CodeTabs :id="id" />
  </section>

  <section v-if="notes.length" class="gs-case-section" aria-labelledby="case-notes-title">
    <h2 id="case-notes-title" class="gs-h2">Framework differences</h2>
    <ul class="gs-case-notes">
      <NoteItem v-for="note in notes" :key="note.id" :note="note" />
    </ul>
  </section>

  <nav class="gs-case-pager" aria-label="More examples">
    <a v-if="neighbours.previous" class="gs-case-pager-link" :href="galleryHash(neighbours.previous.id)">
      <span>Previous</span>
      {{ neighbours.previous.title }}
    </a>
    <a
      v-if="neighbours.next"
      class="gs-case-pager-link gs-case-pager-link--next"
      :href="galleryHash(neighbours.next.id)"
    >
      <span>Next</span>
      {{ neighbours.next.title }}
    </a>
  </nav>
</template>

<style scoped>
.gl-back {
  display: inline-flex;
  transform: scaleX(-1);
}
.gl-tags {
  margin-top: 12px;
}
</style>

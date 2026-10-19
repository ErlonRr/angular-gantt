<!--
  The app's pages by the location hash (demo-kit's router): `#/examples` and `#/examples/<id>` are
  the gallery, anything else is the home page (App.vue, at `/`). In-page anchors such as `#main`
  are not routes and change nothing. The gallery loads when first shown.
-->
<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onUnmounted, shallowRef, watch } from 'vue';
import { currentGalleryRoute, onHashChange } from 'demo-kit/gallery';
import App from '../App.vue';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- `.vue` imports resolve through vue-tsc, not the TS project service
const GalleryPages = defineAsyncComponent(() => import('./GalleryPages.vue'));
const HOME_TITLE = document.title;

const route = shallowRef(currentGalleryRoute());
const navigated = shallowRef(false);
onUnmounted(
  onHashChange(next => {
    route.value = next;
    navigated.value = true;
  }),
);

const caseId = computed(() => (route.value.page === 'case' ? route.value.id : null));

// Back home: its title, the top of the page and focus on its content
watch(
  () => route.value.page === 'home',
  async home => {
    if (!home) return;
    document.title = HOME_TITLE;
    await nextTick();
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  },
);
</script>

<template>
  <App v-if="route.page === 'home'" />
  <GalleryPages v-else :case-id="caseId" :navigated="navigated" />
</template>

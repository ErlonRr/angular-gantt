<!--
  The gallery's pages, `#/examples` (the index) and `#/examples/<id>` (a case), in the site shell:
  skip link, header with the Home / Examples nav and the theme switch, footer. After a navigation
  the page starts at the top with focus on its content; the tab title names the page.
-->
<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from 'vue';
import { galleryCase, galleryHash, type CaseId } from 'demo-kit/gallery';
import { PACKAGES, SITE } from 'demo-kit/site';
import { toggleTheme } from 'demo-kit/theme';
import { Icon } from '../Icon';
import CasePage from './CasePage.vue';
import GalleryIndex from './GalleryIndex.vue';
import { FRAMEWORK_LABEL } from './links';
import { useDarkMode } from './site-theme';

const PKG = PACKAGES.vue;

const props = defineProps<{ caseId: CaseId | null; navigated: boolean }>();
const mainEl = useTemplateRef<HTMLElement>('main');
const dark = useDarkMode();

function show(focus: boolean) {
  document.title = `${props.caseId ? `${galleryCase(props.caseId).title} · ` : ''}Examples · Gantry ${FRAMEWORK_LABEL}`;
  if (!focus) return;
  window.scrollTo(0, 0);
  mainEl.value?.focus({ preventScroll: true });
}
onMounted(() => show(props.navigated));
watch(
  () => props.caseId,
  () => show(true),
  { flush: 'post' },
);

/** The skip link moves focus to the content without touching the URL (the hash is the route). */
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
        <a class="gs-brand" href="#/">
          <span class="gs-logo" aria-hidden="true"></span>
          <span>{{ SITE.name }}</span>
          <span class="gs-version">v{{ SITE.version }}</span>
          <span class="gs-badge">{{ FRAMEWORK_LABEL }}</span>
        </a>
        <nav class="gs-nav" aria-label="Primary">
          <ul class="gs-nav-list">
            <li>
              <a class="gs-nav-link" href="#/"><Icon name="home" /><span>Home</span></a>
            </li>
            <li>
              <a class="gs-nav-link" :href="galleryHash()" :aria-current="caseId ? 'true' : 'page'"
                ><Icon name="examples" /><span>Examples</span></a
              >
            </li>
          </ul>
        </nav>
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

    <main id="main" ref="main" class="gs-main" tabindex="-1">
      <div class="gs-container">
        <CasePage v-if="caseId" :id="caseId" :key="caseId" />
        <GalleryIndex v-else />
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

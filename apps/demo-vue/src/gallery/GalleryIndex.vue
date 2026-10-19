<!--
  `#/examples`: every case by category. A card's title opens the case in this app; its pills open
  the same case in each framework.
-->
<script setup lang="ts">
import { CASE_IDS, casesByCategory, galleryHash } from 'demo-kit/gallery';
import { PACKAGES, frameworkCaseUrl } from 'demo-kit/site';
import { FRAMEWORK_LABEL, caseLinks } from './links';

const groups = casesByCategory();
const siteGallery = frameworkCaseUrl('angular');

/** A jump to a category: scroll to it and focus its heading, without touching the URL (the hash is the route). */
function jump(category: string) {
  document.getElementById(`gallery-${category}`)?.scrollIntoView();
  document.getElementById(`gallery-${category}-title`)?.focus({ preventScroll: true });
}
</script>

<template>
  <div class="gs-page-head">
    <div>
      <p class="gs-eyebrow">Examples · {{ PACKAGES.vue.name }}</p>
      <h1 class="gs-title">Examples</h1>
      <p class="gs-lead">
        {{ CASE_IDS.length }} cases, each one written in {{ FRAMEWORK_LABEL }} over the shared data of the gallery, with
        its code and the framework differences it runs into. The
        <a class="gs-link" :href="siteGallery">Gantry site</a> shows every case in all five frameworks.
      </p>
    </div>
  </div>

  <nav aria-label="Gallery categories">
    <ul class="gs-gallery-cats">
      <li v-for="group in groups" :key="group.category.id">
        <a class="gs-gallery-cat-link" :href="`#gallery-${group.category.id}`" @click.prevent="jump(group.category.id)">
          {{ group.category.label }}
          <span class="gs-count" aria-hidden="true">{{ group.cases.length }}</span>
        </a>
      </li>
    </ul>
  </nav>

  <div class="gs-gallery">
    <section
      v-for="group in groups"
      :id="`gallery-${group.category.id}`"
      :key="group.category.id"
      class="gs-gallery-cat"
      :aria-labelledby="`gallery-${group.category.id}-title`"
    >
      <div class="gs-gallery-cat-head">
        <h2 :id="`gallery-${group.category.id}-title`" class="gs-h3" tabindex="-1">{{ group.category.label }}</h2>
        <p>{{ group.category.summary }}</p>
      </div>
      <ul class="gs-gallery-grid">
        <li v-for="c in group.cases" :key="c.id" class="gs-gallery-card">
          <h3 class="gs-gallery-card-title">
            <a :href="galleryHash(c.id)">{{ c.title }}</a>
            <span v-if="c.isNew" class="gs-badge">New</span>
          </h3>
          <p>{{ c.summary }}</p>
          <ul class="gs-gallery-links" :aria-label="`Open ${c.title} live`">
            <li v-for="link in caseLinks(c.id)" :key="link.fw">
              <a class="gs-gallery-link" :href="link.href"
                ><span class="gs-sr-only">{{ c.title }} in </span>{{ link.label }}</a
              >
            </li>
          </ul>
        </li>
      </ul>
    </section>
  </div>
</template>

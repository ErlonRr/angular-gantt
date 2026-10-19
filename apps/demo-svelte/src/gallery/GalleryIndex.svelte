<!--
  `#/examples`: every case by category. A card's title opens the case in this app; its pills open
  the same case in each framework.
-->
<script lang="ts">
  import { CASE_IDS, casesByCategory, galleryHash } from 'demo-kit/gallery';
  import { PACKAGES, frameworkCaseUrl } from 'demo-kit/site';
  import { FRAMEWORK_LABEL, caseLinks } from './links';

  const groups = casesByCategory();

  /** A jump to a category: scroll to it and focus its heading, without touching the URL (the hash is the route). */
  function jump(e: MouseEvent, category: string) {
    e.preventDefault();
    document.getElementById(`gallery-${category}`)?.scrollIntoView();
    document.getElementById(`gallery-${category}-title`)?.focus({ preventScroll: true });
  }
</script>

<div class="gs-page-head">
  <div>
    <p class="gs-eyebrow">Examples · {PACKAGES.svelte.name}</p>
    <h1 class="gs-title">Examples</h1>
    <p class="gs-lead">
      {CASE_IDS.length} cases, each one written in {FRAMEWORK_LABEL} over the shared data of the gallery, with its code and
      the framework differences it runs into. The
      <a class="gs-link" href={frameworkCaseUrl('angular')}>Gantry site</a> shows every case in all five frameworks.
    </p>
  </div>
</div>

<nav aria-label="Gallery categories">
  <ul class="gs-gallery-cats">
    {#each groups as group (group.category.id)}
      <li>
        <a class="gs-gallery-cat-link" href="#gallery-{group.category.id}" onclick={e => jump(e, group.category.id)}>
          {group.category.label}
          <span class="gs-count" aria-hidden="true">{group.cases.length}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>

<div class="gs-gallery">
  {#each groups as group (group.category.id)}
    <section
      class="gs-gallery-cat"
      id="gallery-{group.category.id}"
      aria-labelledby="gallery-{group.category.id}-title"
    >
      <div class="gs-gallery-cat-head">
        <h2 class="gs-h3" id="gallery-{group.category.id}-title" tabindex="-1">{group.category.label}</h2>
        <p>{group.category.summary}</p>
      </div>
      <ul class="gs-gallery-grid">
        {#each group.cases as c (c.id)}
          <li class="gs-gallery-card">
            <h3 class="gs-gallery-card-title">
              <a href={galleryHash(c.id)}>{c.title}</a>
              {#if c.isNew}<span class="gs-badge">New</span>{/if}
            </h3>
            <p>{c.summary}</p>
            <ul class="gs-gallery-links" aria-label="Open {c.title} live">
              {#each caseLinks(c.id) as link (link.fw)}
                <li>
                  <a class="gs-gallery-link" href={link.href}
                    ><span class="gs-sr-only">{c.title} in </span>{link.label}</a
                  >
                </li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<!--
  `#/examples/<id>`: a gallery case. The live Svelte example (the case's own component when it has
  one, else the generic renderer), the same case in the other frameworks, its code (this app's files
  and the shared data), the framework differences it runs into, and the previous and next cases.
-->
<script lang="ts">
  import { caseNeighbours, categoryOf, galleryCase, galleryHash, notesForCase, type CaseId } from 'demo-kit/gallery';
  import Icon from '../Icon.svelte';
  import { CASE_COMPONENTS } from './cases';
  import CodeTabs from './CodeTabs.svelte';
  import GenericCase from './GenericCase.svelte';
  import NoteItem from './NoteItem.svelte';
  import { FRAMEWORK_LABEL, caseLinks } from './links';

  let { id }: { id: CaseId } = $props();

  const info = $derived(galleryCase(id));
  const category = $derived(categoryOf(id));
  const notes = $derived(notesForCase(id));
  const neighbours = $derived(caseNeighbours(id));
  const links = $derived(caseLinks(id));
  const load = $derived(CASE_COMPONENTS[id]);
</script>

<header class="gs-page-head">
  <div>
    <p class="gs-eyebrow">Example · {category.label}</p>
    <h1 class="gs-title">{info.title}</h1>
    <p class="gs-lead">{info.summary}</p>
  </div>
  <a class="gs-btn gs-btn--sm" href={galleryHash()}>
    <span class="gl-back" aria-hidden="true"><Icon name="arrowRight" /></span>
    All examples
  </a>
</header>

<section aria-labelledby="case-live-title">
  <h2 class="gs-sr-only" id="case-live-title">Live example in {FRAMEWORK_LABEL}</h2>
  {#if load}
    {#await load()}
      <p class="gs-case-hint">Loading the example…</p>
    {:then { default: Case }}
      <Case />
    {/await}
  {:else}
    <GenericCase {id} />
  {/if}
  <nav class="gs-case-live" aria-label="This example in every framework">
    <p>Live in</p>
    <ul class="gs-gallery-links">
      {#each links as link (link.fw)}
        <li>
          <a class="gs-gallery-link" href={link.href} aria-current={link.current ? 'page' : undefined}>{link.label}</a>
        </li>
      {/each}
    </ul>
  </nav>
  <ul class="gs-gallery-tags gl-tags" aria-label="Options and APIs">
    {#each info.tags as tag (tag)}
      <li class="gs-tag">{tag}</li>
    {/each}
  </ul>
</section>

<section class="gs-case-section" aria-labelledby="case-code-title">
  <h2 class="gs-h2" id="case-code-title">Code</h2>
  <CodeTabs {id} />
</section>

{#if notes.length}
  <section class="gs-case-section" aria-labelledby="case-notes-title">
    <h2 class="gs-h2" id="case-notes-title">Framework differences</h2>
    <ul class="gs-case-notes">
      {#each notes as note (note.id)}
        <NoteItem {note} />
      {/each}
    </ul>
  </section>
{/if}

<nav class="gs-case-pager" aria-label="More examples">
  {#if neighbours.previous}
    <a class="gs-case-pager-link" href={galleryHash(neighbours.previous.id)}>
      <span>Previous</span>
      {neighbours.previous.title}
    </a>
  {/if}
  {#if neighbours.next}
    <a class="gs-case-pager-link gs-case-pager-link--next" href={galleryHash(neighbours.next.id)}>
      <span>Next</span>
      {neighbours.next.title}
    </a>
  {/if}
</nav>

<style>
  .gl-back {
    display: inline-flex;
    transform: scaleX(-1);
  }
  .gl-tags {
    margin-top: 12px;
  }
</style>

<!--
  The gallery's pages, `#/examples` (the index) and `#/examples/<id>` (a case), in the site shell:
  skip link, header with the Home / Examples nav and the theme switch, footer. After a navigation
  the page starts at the top with focus on its content; the tab title names the page.
-->
<script lang="ts">
  import { galleryCase, galleryHash, type CaseId } from 'demo-kit/gallery';
  import { PACKAGES, SITE } from 'demo-kit/site';
  import { toggleTheme } from 'demo-kit/theme';
  import Icon from '../Icon.svelte';
  import CasePage from './CasePage.svelte';
  import GalleryIndex from './GalleryIndex.svelte';
  import { FRAMEWORK_LABEL } from './links';
  import { siteTheme } from './site-theme.svelte';

  const PKG = PACKAGES.svelte;

  let { caseId, navigated }: { caseId: CaseId | null; navigated: boolean } = $props();
  let mainEl = $state<HTMLElement>();

  $effect(() => {
    document.title = `${caseId ? `${galleryCase(caseId).title} · ` : ''}Examples · Gantry ${FRAMEWORK_LABEL}`;
    if (!navigated) return;
    window.scrollTo(0, 0);
    mainEl?.focus({ preventScroll: true });
  });

  /** The skip link moves focus to the content without touching the URL (the hash is the route). */
  function skip(e: MouseEvent) {
    e.preventDefault();
    mainEl?.focus();
    mainEl?.scrollIntoView();
  }
</script>

<div class="gs-app">
  <a class="gs-skip" href="#main" onclick={skip}>Skip to content</a>
  <header class="gs-header">
    <div class="gs-container gs-header-inner">
      <a class="gs-brand" href="#/">
        <span class="gs-logo" aria-hidden="true"></span>
        <span>{SITE.name}</span>
        <span class="gs-version">v{SITE.version}</span>
        <span class="gs-badge">{FRAMEWORK_LABEL}</span>
      </a>
      <nav class="gs-nav" aria-label="Primary">
        <ul class="gs-nav-list">
          <li>
            <a class="gs-nav-link" href="#/"><Icon name="home" /><span>Home</span></a>
          </li>
          <li>
            <a class="gs-nav-link" href={galleryHash()} aria-current={caseId ? 'true' : 'page'}
              ><Icon name="examples" /><span>Examples</span></a
            >
          </li>
        </ul>
      </nav>
      <div class="gs-header-actions">
        <button
          type="button"
          class="gs-icon-btn"
          aria-label="Dark theme"
          aria-pressed={siteTheme.dark}
          onclick={toggleTheme}
        >
          <Icon name={siteTheme.dark ? 'sun' : 'moon'} />
        </button>
        <a class="gs-icon-btn" href={SITE.repoUrl} aria-label="Source code on GitHub">
          <Icon name="github" />
        </a>
      </div>
    </div>
  </header>

  <main id="main" bind:this={mainEl} class="gs-main" tabindex="-1">
    <div class="gs-container">
      {#if caseId}
        <!-- A new case is a new page: its charts and controls start fresh -->
        {#key caseId}
          <CasePage id={caseId} />
        {/key}
      {:else}
        <GalleryIndex />
      {/if}
    </div>
  </main>

  <footer class="gs-footer">
    <div class="gs-container">
      <p>
        <strong>{SITE.name}</strong> v{SITE.version} · {SITE.license} · <a href={SITE.repoUrl}>GitHub</a> ·
        <a href={PKG.npmUrl}>npm</a> · made by <a href={SITE.authorUrl}>{SITE.author}</a>
      </p>
      <p>{SITE.tagline}</p>
    </div>
  </footer>
</div>

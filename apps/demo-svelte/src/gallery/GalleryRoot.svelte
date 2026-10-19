<!--
  The app's pages by the location hash (demo-kit's router): `#/examples` and `#/examples/<id>` are
  the gallery, anything else is the home page (App.svelte, at `/`). In-page anchors such as `#main`
  are not routes and change nothing. The gallery loads when first shown.
-->
<script lang="ts">
  import { currentGalleryRoute, onHashChange } from 'demo-kit/gallery';
  import App from '../App.svelte';

  const HOME_TITLE = document.title;
  const importPages = () => import('./GalleryPages.svelte');
  let pages: ReturnType<typeof importPages> | undefined;
  /** The gallery's pages, imported once, when first shown */
  const loadPages = () => (pages ??= importPages());

  let route = $state.raw(currentGalleryRoute());
  let navigated = $state(false);
  $effect(() =>
    onHashChange(next => {
      route = next;
      navigated = true;
    }),
  );

  const caseId = $derived(route.page === 'case' ? route.id : null);
  const home = $derived(route.page === 'home');

  // Back home: its title, the top of the page and focus on its content
  $effect(() => {
    if (!home) return;
    document.title = HOME_TITLE;
    if (!navigated) return;
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  });
</script>

{#if home}
  <App />
{:else}
  {#await loadPages() then { default: GalleryPages }}
    <GalleryPages {caseId} {navigated} />
  {/await}
{/if}

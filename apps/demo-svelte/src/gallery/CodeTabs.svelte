<!--
  The code of a case: this app's own files of the case (read with `?raw`) and the shared data and
  options (`demo-kit/gallery/cases/<id>.ts`, from the generated sources). A tab list with automatic
  activation: one tab stop, ←/→ and Home/End move and select.
-->
<script lang="ts">
  import type { CaseId } from 'demo-kit/gallery';
  import { CASE_SOURCES, type SourceFile } from 'demo-kit/gallery/sources';
  import CodeBlock from './CodeBlock.svelte';
  import { ownSources } from './cases';
  import { FRAMEWORK, FRAMEWORK_LABEL } from './links';

  type Tab = typeof FRAMEWORK | 'shared';

  const TABS: readonly { id: Tab; label: string }[] = [
    { id: FRAMEWORK, label: FRAMEWORK_LABEL },
    { id: 'shared', label: 'Shared data' },
  ];

  let { id }: { id: CaseId } = $props();

  let tab = $state<Tab>(FRAMEWORK);
  const sources = $derived(
    Promise.all([ownSources(id), CASE_SOURCES[id]()]).then(([own, all]) => ({ own, shared: all.shared })),
  );
  const label = $derived(TABS.find(t => t.id === tab)!.label);
  const tabEls: HTMLButtonElement[] = $state([]);

  function onkeydown(e: KeyboardEvent) {
    const from = TABS.findIndex(t => t.id === tab);
    const to = new Map([
      ['ArrowRight', from + 1],
      ['ArrowLeft', from - 1],
      ['Home', 0],
      ['End', TABS.length - 1],
    ]).get(e.key);
    if (to === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const i = (to + TABS.length) % TABS.length;
    tab = TABS[i].id;
    tabEls[i]?.focus();
  }
</script>

{#snippet panel(files: SourceFile[] | null, message: string)}
  <!-- Without a code block (each one a tab stop) the panel itself is one -->
  <div
    id="case-code-panel"
    class="gs-stack"
    role="tabpanel"
    aria-labelledby="case-tab-{tab}"
    tabindex={files?.length ? undefined : 0}
  >
    {#if files?.length}
      {#each files as f (f.file)}
        <CodeBlock file={f} />
      {/each}
    {:else}
      <p class="gs-case-hint">{message}</p>
    {/if}
  </div>
{/snippet}

<div class="gs-tabs" role="tablist" aria-label="Code">
  {#each TABS as t, i (t.id)}
    <button
      bind:this={tabEls[i]}
      type="button"
      role="tab"
      class="gs-tab"
      id="case-tab-{t.id}"
      aria-selected={t.id === tab}
      aria-controls={t.id === tab ? 'case-code-panel' : undefined}
      tabindex={t.id === tab ? 0 : -1}
      onclick={() => (tab = t.id)}
      {onkeydown}
    >
      {t.label}
    </button>
  {/each}
</div>
{#await sources}
  {@render panel(null, 'Loading the code…')}
{:then loaded}
  {@render panel(
    tab === 'shared' ? loaded.shared : loaded.own,
    `This example has no ${label} file yet: this page draws the shared data and options of the Shared data tab.`,
  )}
{:catch}
  {@render panel(null, 'The code could not be loaded. Reload the page to try again.')}
{/await}

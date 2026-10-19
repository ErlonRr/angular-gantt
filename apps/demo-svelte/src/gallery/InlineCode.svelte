<!-- Text with Markdown code spans: `like this` becomes a `<code>` (split on backticks, no HTML parsing). -->
<script lang="ts">
  let { text }: { text: string } = $props();

  const parts = $derived(
    text
      .split('`')
      .map((part, i) => ({ part, code: i % 2 === 1, key: i }))
      .filter(p => p.part !== ''),
  );
</script>

{#each parts as p (p.key)}{#if p.code}<code class="gs-code-inline">{p.part}</code>{:else}{p.part}{/if}{/each}

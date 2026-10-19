<!-- A dark code block with its file name and a Copy button that says "Copied" for a moment and announces it. -->
<script lang="ts">
  import type { SourceFile } from 'demo-kit/gallery/sources';
  import Icon from '../Icon.svelte';

  let { file }: { file: SourceFile } = $props();

  let copied = $state(false);
  let status = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));

  function done(ok: boolean) {
    copied = ok;
    status = ok ? 'Copied to the clipboard' : 'Copy failed: select the text and copy it';
    clearTimeout(timer);
    timer = setTimeout(() => {
      copied = false;
      status = '';
    }, 1600);
  }

  function copy() {
    if (!navigator.clipboard) return done(false);
    navigator.clipboard.writeText(file.code).then(
      () => done(true),
      () => done(false),
    );
  }
</script>

<div class="gs-code gs-code--scroll">
  <div class="gs-code-head">
    <span>{file.file}</span>
    <button type="button" class="gs-copy" aria-label="Copy {file.file}" onclick={copy}>
      <Icon name={copied ? 'check' : 'copy'} />
      <span aria-hidden="true">{copied ? 'Copied' : 'Copy'}</span>
    </button>
    <span class="gs-sr-only" role="status">{status}</span>
  </div>
  <!-- A scrolling code block takes focus, so the keyboard can scroll it (axe scrollable-region-focusable) -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <pre tabindex="0" aria-label="{file.file} code"><code>{file.code}</code></pre>
</div>

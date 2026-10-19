<!-- One known framework difference (`FRAMEWORK_NOTES`): topic, bindings, text, what to do, until when. -->
<script lang="ts">
  import { GALLERY_FRAMEWORKS, GALLERY_FRAMEWORK_LABELS, type FrameworkNote } from 'demo-kit/gallery';
  import InlineCode from './InlineCode.svelte';

  let { note }: { note: FrameworkNote } = $props();

  const frameworks = $derived(
    note.frameworks.length === GALLERY_FRAMEWORKS.length
      ? 'All bindings'
      : note.frameworks.map(f => GALLERY_FRAMEWORK_LABELS[f]).join(', '),
  );
</script>

<li class="gs-case-note">
  <p class="gs-case-note-meta">
    <span class="gs-tag">{note.area}</span>
    <span>{frameworks}</span>
  </p>
  <p><InlineCode text={note.text} /></p>
  {#if note.workaround}
    <p><strong>What to do: </strong><InlineCode text={note.workaround} /></p>
  {/if}
  {#if note.until}
    <p><strong>Until</strong> {note.until}.</p>
  {/if}
</li>

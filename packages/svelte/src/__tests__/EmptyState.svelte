<!-- Test harness: empty-state content as the `empty` snippet, next to other light-DOM children. -->
<script lang="ts">
  import { Gantry } from '../index';

  let { text }: { text: string } = $props();
</script>

<Gantry tasks={[]}>
  {#snippet empty()}
    {text}
  {/snippet}
  <span class="note">Plan</span>
</Gantry>

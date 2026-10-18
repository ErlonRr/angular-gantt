<!-- A site icon (`demo-kit/icons`), decorative: label the control that holds it. -->
<script lang="ts">
  import { ICONS, type IconName, type SiteIcon } from 'demo-kit/icons';

  let { name }: { name: IconName } = $props();
  const icon: SiteIcon = $derived(ICONS[name]);
</script>

<svg
  aria-hidden="true"
  focusable="false"
  viewBox={icon.viewBox}
  fill={icon.fill ? 'currentColor' : 'none'}
  stroke={icon.fill ? undefined : 'currentColor'}
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#each icon.paths as d (d)}<path {d} />{/each}
</svg>

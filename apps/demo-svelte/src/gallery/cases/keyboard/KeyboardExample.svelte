<!--
  The whole chart from the keyboard: the key map next to it, and an echo of what the chart says in
  its polite live region (`.gantt-sr-live` in its shadow root), watched by an attachment.
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import { KEYBOARD_KEYS, KEYBOARD_LIVE_SELECTOR, KEYBOARD_OPTIONS, keyboardTasks } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = keyboardTasks(new Date());
  let announced = $state('');

  // An attachment: Gantry spreads it onto `<gantry-element>`; its cleanup runs when the chart goes
  function echoAnnouncements(chart: HTMLElement) {
    const live = chart.shadowRoot?.querySelector(KEYBOARD_LIVE_SELECTOR);
    if (!live) return;
    const observer = new MutationObserver(() => {
      const text = live.textContent?.trim();
      if (text) announced = text;
    });
    observer.observe(live, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }
</script>

<div class="gs-case">
  <Gantry
    {@attach echoAnnouncements}
    class="gs-chart gs-case-chart"
    {tasks}
    options={KEYBOARD_OPTIONS}
    darkMode={siteTheme.dark}
  />

  <!-- A plain paragraph, not a live region: screen readers already hear the chart's own -->
  <p class="gs-case-hint">
    Announced: {announced || 'nothing yet. Tab into the chart, then select a row or zoom.'}
  </p>

  <dl class="gs-case-keys">
    {#each KEYBOARD_KEYS as entry (entry.area + entry.keys.join())}
      <dt>
        {#each entry.keys as key (key)}<kbd class="gs-kbd">{key}</kbd>{/each}
      </dt>
      <dd>{entry.area}: {entry.action}</dd>
    {/each}
  </dl>
</div>

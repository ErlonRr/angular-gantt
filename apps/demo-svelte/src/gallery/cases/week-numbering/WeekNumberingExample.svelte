<!--
  Week numbers in the header: the numbering rule (`weekNumbering`: ISO, US or the locale's), the first
  day of the week (`weekStart`) and the `locale`, on two zoom levels of its own (`WEEK_FORMATS`).
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import {
    WEEK_LOCALES,
    WEEK_NUMBERINGS,
    WEEK_NUMBERING_INITIAL,
    WEEK_STARTS,
    weekNumberingOptions,
    weekNumberingTasks,
    type WeekNumberingChoice,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = weekNumberingTasks(new Date());
  // The three selects edit this object (`bind:value` keeps the week starts as numbers)
  const choice = $state<WeekNumberingChoice>({ ...WEEK_NUMBERING_INITIAL });
  // Its own zoom levels, `weekNumbering`, `weekStart` (unless "From the rule") and `locale`
  const options = $derived(weekNumberingOptions(choice));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <label for="week-numbering-numbering">Numbering</label>
      <select id="week-numbering-numbering" class="gs-select" bind:value={choice.numbering}>
        {#each WEEK_NUMBERINGS as c (c.value)}
          <option value={c.value}>{c.label}</option>
        {/each}
      </select>
    </div>
    <div class="gs-case-control">
      <label for="week-numbering-week-start">Week starts on</label>
      <select id="week-numbering-week-start" class="gs-select" bind:value={choice.weekStart}>
        {#each WEEK_STARTS as c (c.value)}
          <option value={c.value}>{c.label}</option>
        {/each}
      </select>
    </div>
    <div class="gs-case-control">
      <label for="week-numbering-locale">Locale</label>
      <select id="week-numbering-locale" class="gs-select" bind:value={choice.locale}>
        {#each WEEK_LOCALES as c (c.value)}
          <option value={c.value}>{c.label}</option>
        {/each}
      </select>
    </div>
  </div>

  <Gantry class="gs-chart gs-case-chart" {tasks} {options} darkMode={siteTheme.dark} />
</div>

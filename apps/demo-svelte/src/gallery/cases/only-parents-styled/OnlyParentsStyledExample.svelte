<!--
  Collapsed parents painted from their children: `rollup.color` is `'status'` (the summary status of
  the children) or a callback (`mainTeamColor`), and `rollup.segments` draws each child inside the bar.
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import {
    ONLY_PARENTS_STYLED_COLORS,
    ONLY_PARENTS_STYLED_INITIAL,
    ONLY_PARENTS_STYLED_TEAMS,
    onlyParentsStyledOptions,
    onlyParentsStyledTasks,
    type OnlyParentsColor,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  // The tree, every task in its team's colour (what the segments show)
  const tasks = onlyParentsStyledTasks(new Date());
  let color = $state<OnlyParentsColor>(ONLY_PARENTS_STYLED_INITIAL.color);
  let segments = $state(ONLY_PARENTS_STYLED_INITIAL.segments);
  const options = $derived(onlyParentsStyledOptions(color, segments));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <label for="only-parents-styled-color">Parent colour</label>
      <select id="only-parents-styled-color" class="gs-select" bind:value={color}>
        {#each ONLY_PARENTS_STYLED_COLORS as choice (choice.value)}
          <option value={choice.value}>{choice.label}</option>
        {/each}
      </select>
    </div>
    <label class="gs-switch gs-case-control">
      <span>Child segments</span>
      <input type="checkbox" role="switch" bind:checked={segments} />
    </label>
  </div>

  <Gantry class="gs-chart gs-case-chart" {tasks} {options} darkMode={siteTheme.dark} />
  <ul class="gs-case-legend" aria-label="Team colours">
    {#each ONLY_PARENTS_STYLED_TEAMS as team (team.label)}
      <li><span class="gs-case-swatch" style:background-color={team.color} aria-hidden="true"></span>{team.label}</li>
    {/each}
  </ul>
</div>

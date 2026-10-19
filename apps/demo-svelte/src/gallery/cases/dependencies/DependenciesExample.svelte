<!--
  The four dependency types with lag and lead (`task.dependency`), the critical path
  (`criticalPath`) and orthogonal or straight arrows (`arrows.routing`).
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import {
    DEPENDENCIES_INITIAL,
    DEPENDENCIES_ROUTINGS,
    DEPENDENCY_LEGEND,
    dependenciesOptions,
    dependenciesTasks,
    type ArrowRouting,
  } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = dependenciesTasks(new Date());
  let routing = $state<ArrowRouting>(DEPENDENCIES_INITIAL.routing);
  let criticalPath = $state(DEPENDENCIES_INITIAL.criticalPath);
  const options = $derived(dependenciesOptions(routing, criticalPath));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="dependencies-arrows-label">Arrows</span>
      <div class="gs-seg" role="group" aria-labelledby="dependencies-arrows-label">
        {#each DEPENDENCIES_ROUTINGS as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            aria-pressed={routing === choice.value}
            onclick={() => (routing = choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
    <label class="gs-switch gs-case-control">
      <span>Critical path</span>
      <input type="checkbox" role="switch" bind:checked={criticalPath} />
    </label>
  </div>

  <Gantry class="gs-chart gs-case-chart" {tasks} {options} darkMode={siteTheme.dark} />
  <!-- The link types of this plan -->
  <dl class="gs-case-keys">
    {#each DEPENDENCY_LEGEND as link (link.type)}
      <dt><code class="gs-code-inline">{link.type}</code> {link.label}</dt>
      <dd>{link.example}</dd>
    {/each}
  </dl>
</div>

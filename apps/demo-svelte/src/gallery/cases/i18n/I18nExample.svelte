<!--
  One chart in four languages: `locale` names the months and days (through `Intl`), `formats` gives
  the date format of the task list and the tooltip, and `labels` every UI string. The chart's
  `lang` attribute tells screen readers which language its strings are in.
-->
<script lang="ts">
  import { Gantry } from '@gantryjs/svelte';
  import { I18N_INITIAL, I18N_LOCALES, i18nOptions, i18nTasks } from 'demo-kit/gallery';
  import { siteTheme } from '../../site-theme.svelte';

  const tasks = i18nTasks(new Date());
  let locale = $state(I18N_INITIAL);
  const options = $derived(i18nOptions(locale));
</script>

<div class="gs-case">
  <div class="gs-case-controls">
    <div class="gs-case-control">
      <span id="i18n-language-label">Language</span>
      <div class="gs-seg" role="group" aria-labelledby="i18n-language-label">
        {#each I18N_LOCALES as choice (choice.value)}
          <button
            type="button"
            class="gs-seg-btn"
            lang={choice.value}
            aria-pressed={locale === choice.value}
            onclick={() => (locale = choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <Gantry class="gs-chart gs-case-chart" lang={locale} {tasks} {options} darkMode={siteTheme.dark} />

  <p class="gs-case-hint">Task names are your data and stay as they are; every string of the chart changes.</p>
</div>

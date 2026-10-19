// The generic renderer: a case's shared data and options (`CASE_DATA[id]` of demo-kit/gallery)
// drawn with `<gantry-element>`, without the case's own controls. A case uses it until its Web
// Component file exists (`cases/<id>/<id>.ts`).
import { GanttDataSource, createGanttSyncGroup, type GantryElement } from '@gantryjs/vanilla';
import { CASE_DATA, type CaseId, type GalleryChart } from 'demo-kit/gallery';
import { h } from '../dom';
import { followSiteTheme } from './site-theme';

function chart(c: GalleryChart, group: ReturnType<typeof createGanttSyncGroup> | null): GantryElement {
  const el = h('gantry-element', { class: 'gs-chart gs-case-chart' });
  if (c.dataSource) el.dataSource = new GanttDataSource(c.dataSource);
  else el.tasks = c.tasks;
  el.options = c.options;
  if (c.annotations) el.annotations = c.annotations;
  el.showToolbar = c.showToolbar ?? true;
  el.showLegend = c.showLegend ?? false;
  el.loading = c.loading ?? false;
  el.errorMessage = c.errorMessage ?? null;
  el.syncGroup = group;
  return el;
}

/** Draws case `id` from its shared data into `host`; returns the function that takes it down. */
export function mountGeneric(host: HTMLElement, id: CaseId): () => void {
  const data = CASE_DATA[id];
  // The charts for this page's `now`: a synced case shares one group between its charts
  const group = data.sync ? createGanttSyncGroup(data.sync === true ? {} : data.sync) : null;
  const charts = data.charts(new Date()).map(c => ({ caption: c.caption, el: chart(c, group) }));
  const stopTheme = followSiteTheme(...charts.map(c => c.el));

  const root = h(
    'div',
    { class: 'gs-case' },
    charts.length === 1
      ? charts[0].el
      : h(
          'div',
          { class: 'gs-case-stack' },
          ...charts.map(c =>
            h('div', {}, ...(c.caption ? [h('p', { class: 'gs-case-caption' }, c.caption)] : []), c.el),
          ),
        ),
    h(
      'p',
      { class: 'gs-case-hint' },
      'The shared data and options of this case; the Shared data tab below shows them.',
    ),
  );
  host.append(root);
  return () => {
    stopTheme();
    root.remove();
  };
}

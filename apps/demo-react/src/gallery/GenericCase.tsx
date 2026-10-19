import { useState } from 'react';
import { Gantry, GanttDataSource, createGanttSyncGroup } from '@gantryjs/react';
import { CASE_DATA, type CaseId, type GalleryChart } from 'demo-kit/gallery';
import { useDarkMode } from './site-theme';

/** The charts of a case for this page's `now`: a paged source becomes a data source, a synced case one group. */
function setup(id: CaseId) {
  const data = CASE_DATA[id];
  const charts = data.charts(new Date()).map(chart => ({
    ...chart,
    source: chart.dataSource ? new GanttDataSource(chart.dataSource) : undefined,
  }));
  const group = data.sync ? createGanttSyncGroup(data.sync === true ? {} : data.sync) : undefined;
  return { charts, group };
}

/**
 * The generic renderer: a case's shared data and options (`CASE_DATA[id]` of demo-kit/gallery)
 * drawn with `<Gantry>`, without the case's own controls. A case uses it until its React file
 * exists (`cases/<id>/<Pascal>Example.tsx`).
 */
export function GenericCase({ id }: { id: CaseId }) {
  const dark = useDarkMode();
  const [{ charts, group }] = useState(() => setup(id));

  const chart = (c: GalleryChart & { source: GanttDataSource | undefined }) => (
    <Gantry
      className="gs-chart gs-case-chart"
      tasks={c.source ? undefined : c.tasks}
      dataSource={c.source}
      options={c.options}
      annotations={c.annotations}
      darkMode={dark}
      showToolbar={c.showToolbar ?? true}
      showLegend={c.showLegend ?? false}
      loading={c.loading ?? false}
      errorMessage={c.errorMessage ?? null}
      syncGroup={group}
    />
  );

  return (
    <div className="gs-case">
      {charts.length === 1 ? (
        chart(charts[0])
      ) : (
        <div className="gs-case-stack">
          {charts.map((c, i) => (
            <div key={i}>
              {c.caption && <p className="gs-case-caption">{c.caption}</p>}
              {chart(c)}
            </div>
          ))}
        </div>
      )}
      <p className="gs-case-hint">The shared data and options of this case; the Shared data tab below shows them.</p>
    </div>
  );
}

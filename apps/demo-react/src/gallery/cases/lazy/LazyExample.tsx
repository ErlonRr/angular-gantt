// Tasks that arrive page by page from a slow fake API: a `GanttDataSource` passed as `dataSource`.
// A failed page is retried on its own, then the chart offers Retry; `reset()` starts again from page
// one. `useSyncExternalStore(source.subscribe)` drives the status line.
import { useCallback, useState, useSyncExternalStore } from 'react';
import { Gantry, GanttDataSource } from '@gantryjs/react';
import { LAZY_OPTIONS, createLazyApi, lazySource, lazyStatus } from 'demo-kit/gallery';
import { useDarkMode } from '../../site-theme';

export default function LazyExample() {
  const darkMode = useDarkMode();
  // One fake server and one data source per mount: a new source object would load from scratch
  const [{ api, source }] = useState(() => {
    // The fake server: `api.setFail(true)` makes its next answers fail
    const api = createLazyApi(new Date());
    // `fetcher`, `pageSize`, `retries` and `retryDelay` (`lazySource`)
    return { api, source: new GanttDataSource(lazySource(api)) };
  });

  const subscribe = useCallback((onChange: () => void) => source.subscribe(onChange), [source]);
  const status = useSyncExternalStore(subscribe, () => lazyStatus(source));

  return (
    <div className="gs-case">
      <div className="gs-case-controls">
        <label className="gs-switch gs-case-control">
          <span>Fail requests</span>
          <input
            type="checkbox"
            role="switch"
            defaultChecked={api.fail}
            onChange={e => api.setFail(e.target.checked)}
          />
        </label>
        <button type="button" className="gs-btn gs-btn--sm" onClick={() => void source.reset()}>
          Reset
        </button>
      </div>

      <Gantry className="gs-chart gs-case-chart" dataSource={source} options={LAZY_OPTIONS} darkMode={darkMode} />
      <p className="gs-case-hint">{status}</p>
    </div>
  );
}
